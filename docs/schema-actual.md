# Schema Actual SQLite — SCI-LB (LuceBien ERP interno)

> **Propósito:** retrato fiel del esquema de datos actual, base para diseñar el schema unificado
> en Postgres (W4) y resolver las 7 relaciones pseudo-FK.
>
> **Fuente:** derivado **100% del código** (`database/db.js`, `database/seed-config.js`,
> `database/seed.js`, `database/seed-layout.js`, `database/repair.js` y los `CREATE/ALTER` inline
> en `routes/*.js`). ⛔ NO se leyó `database/lucebien.db*` (prohibido). **Fecha:** 2026-06-08.

---

## 0. Conexión y PRAGMAs (`database/db.js::initDB()`)

```js
const DB_PATH = path.join(__dirname, 'lucebien.db');
d.pragma('journal_mode = WAL');
d.pragma('foreign_keys = ON');
```

- **`journal_mode = WAL`** · **`foreign_keys = ON`** (mismos PRAGMAs en `migracion_produccion.js`).
- **DQS desactivado** — comportamiento default de better-sqlite3; **no hay PRAGMA explícito**.
  Regla dura: **literales string SIEMPRE con comillas simples** (`WHERE etapa='recepcion'`).
  Confirmado por el bug B11 (auditoría pipeline): comillas dobles se interpretaban como columna.

> ⚠️ **Divergencia crítica de definiciones.** Varias tablas se crean en **más de un archivo** con
> definiciones DISTINTAS (tipos, defaults, constraints). **Gana el primer `CREATE IF NOT EXISTS`
> que corre al boot** — en producción es `db.js` (se requiere desde `server.js` al arranque), no
> `seed-config.js` (que solo corre completo si se invoca el módulo explícitamente). Abajo se marca
> la versión vigente y la divergente. Esto es **deuda a unificar en la migración a Postgres**.

---

## 1. Tablas por dominio (DDL efectivo)

### RRHH / colaboradores

**`empleados`** — `db.js`
```
id TEXT PRIMARY KEY · cod TEXT UNIQUE NOT NULL · nombre TEXT NOT NULL · iniciales TEXT NOT NULL
rol TEXT NOT NULL DEFAULT 'trabajador' · activo INTEGER NOT NULL DEFAULT 1 · cod_hash TEXT NOT NULL
estado TEXT DEFAULT 'activo' · dni · telefono · direccion · fecha_nacimiento · fecha_ingreso
contacto_emergencia · tel_emergencia · notas   (todos TEXT DEFAULT '')
```
+ por ALTER/ensure (§2): `nombre_completo`, `password_hash`, `salario_base`, `tipo_jornada`,
  `tipo_contrato`, `vencimiento_contrato`.

**`empleado_tiendas`** — `db.js`
```
emp_id TEXT NOT NULL · tienda TEXT NOT NULL
PRIMARY KEY (emp_id, tienda) · FK emp_id → empleados(id)
```

### Reportes diarios FR-01

**`reportes`** — `db.js` (versión vigente)
```
id TEXT PRIMARY KEY · sede TEXT NOT NULL · turno TEXT NOT NULL · fecha TEXT NOT NULL
encargado TEXT                        ← pseudo-FK #1
puntaje INTEGER DEFAULT 0 · puntaje_eval INTEGER · act_total INTEGER DEFAULT 0
act_done INTEGER DEFAULT 0 · evaluado INTEGER DEFAULT 0 · evaluador TEXT
bloqueado INTEGER DEFAULT 0 · created_at TEXT DEFAULT (datetime('now','localtime'))
```
+ ALTER (`reportes.js`): `auto_enviado`, `auto_enviado_razon`, `no_evaluable`, `encargado_id`.
*Divergencia `seed-config.js`:* `bloqueado DEFAULT 1`, sin `NOT NULL` en sede/turno/fecha.

**`reporte_trabajadores`** — `db.js`
```
reporte_id TEXT NOT NULL · nombre TEXT NOT NULL   ← pseudo-FK #6
FK reporte_id → reportes(id)
```
*Divergencia `seed-config.js`:* añade `id INTEGER PRIMARY KEY AUTOINCREMENT`.

**`reporte_actividades`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · reporte_id TEXT NOT NULL · cod TEXT NOT NULL · nombre TEXT NOT NULL
cat TEXT · peso INTEGER DEFAULT 0 · realizada INTEGER DEFAULT 0 · obs TEXT
calificacion REAL DEFAULT 1 · (+obs_eval TEXT por ALTER) · FK reporte_id → reportes(id)
```

**`reporte_extras`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · reporte_id TEXT NOT NULL · tipo TEXT NOT NULL · nombre TEXT NOT NULL
cantidad INTEGER DEFAULT 1 · precio_unitario REAL DEFAULT 0 · monto_total REAL DEFAULT 0 · detalle TEXT
registrado_por TEXT                   ← pseudo-FK #7   · FK reporte_id → reportes(id)
```

**`reporte_drafts`** — `routes/reportes.js`
```
sede · fecha · turno (NOT NULL) · encargado_id · encargado_nombre · payload TEXT
updated_at · PRIMARY KEY (sede, fecha, turno)
```

### Pipeline de lavandería

**`prendas`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · codigo TEXT NOT NULL · tipo · color · talla
sede_origen TEXT NOT NULL · etapa TEXT DEFAULT 'recepcion' · tipo_lavado · cod_lavador · cod_planchador
necesita_compostura INTEGER DEFAULT 0 · obs_refaccion · obs_compostura · obs_calidad
aprobada INTEGER DEFAULT 0 · envio_id INTEGER · lista_lavanderia_id TEXT
fecha_ingreso TEXT NOT NULL · fecha_actualizado · created_at
```
+ ALTER (`pipeline.js`): `obs_general`, `dividida INTEGER DEFAULT 0`, `dividida_en`.

**`prenda_historial`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · prenda_id INTEGER NOT NULL · etapa_anterior · etapa_nueva TEXT NOT NULL
responsable TEXT                      ← pseudo-FK #5   · obs · fecha · FK prenda_id → prendas(id)
```
+ ALTER (`pipeline.js`): `cod_responsable TEXT` (desambigua homónimos, auditoría B6).

**`pipeline_puntos`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · emp_cod TEXT NOT NULL · emp_nombre TEXT NOT NULL   ← pseudo-FK #4
prenda_id INTEGER · etapa TEXT NOT NULL · puntos REAL NOT NULL DEFAULT 0 · detalle · fecha · created_at
```

**`envios_prendas`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · sede_destino TEXT NOT NULL · fecha TEXT NOT NULL · responsable
estado TEXT DEFAULT 'enviado' · validado_tienda INTEGER DEFAULT 0 · obs_tienda · created_at
```
+ `cancelado INTEGER DEFAULT 0` (`seed-config.js::ensureColumnasExtra()`).

**`prenda_calificacion`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · prenda_id INTEGER NOT NULL · envio_id INTEGER · aceptada INTEGER DEFAULT 1
obs · calificador · fecha · FK prenda_id → prendas(id)
```

**`accesorios_log`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · tipo TEXT NOT NULL · cantidad INTEGER DEFAULT 0 · responsable · fecha NOT NULL · created_at
```
+ ALTER (`pipeline.js`): `sede_origen DEFAULT 'AL'`, `enviado DEFAULT 0`, `envio_id`, `sustento`, `origen DEFAULT 'almacen'`.

**`envios_accesorios`** / **`envio_accesorios_items`** — `routes/pipeline.js`
```
envios_accesorios:        id PK · sede_destino NOT NULL · fecha NOT NULL · responsable · responsable_cod
                          validado_tienda DEFAULT 0 · validado_por · fecha_validado · obs · created_at
envio_accesorios_items:   id PK · envio_id NOT NULL · tipo NOT NULL · cantidad DEFAULT 0 · obs
                          FK envio_id → envios_accesorios(id)
```

### Listas de lavandería (envío tienda→almacén)

**`listas_lavanderia`** — `db.js`
```
id TEXT PK · sede NOT NULL · tipo NOT NULL · estado DEFAULT 'En proceso' · validado_tienda DEFAULT 0
obs_retorno · fecha NOT NULL · resp_inv · resp_traslado
camisas · corbatas · michis · corbatones (INTEGER DEFAULT 0) · created_at
```
+ ALTER (`lavanderia.js`): `porta_ternos`, `zapatos` (INTEGER DEFAULT 0).

**`lista_items`** — `db.js`
```
id INTEGER PK AUTOINCREMENT · lista_id TEXT NOT NULL · cod TEXT NOT NULL · tipo · color · talla
obs · motivo · devolver · estado_proceso · estado_retorno · FK lista_id → listas_lavanderia(id)
```

**`lista_counters`** — `db.js`
```
sede NOT NULL · tipo NOT NULL · contador INTEGER DEFAULT 0 · PRIMARY KEY (sede, tipo)
```

### Comercial interno (préstamos / bajas / garantías / ventas)

**`prestamos_lotes`** — `db.js`
```
id PK · fecha NOT NULL · sede_origen NOT NULL · sede_destino NOT NULL · quien_lleva NOT NULL
responsable_registro NOT NULL · obs · notificado INTEGER DEFAULT 0 · created_at
```

**`prestamo_items`** — `db.js`
```
id PK · lote_id INTEGER NOT NULL · codigo NOT NULL · descripcion · estado DEFAULT 'prestada'
fecha_estado · obs_estado · cambiado_por · cambiado_sede · created_at · FK lote_id → prestamos_lotes(id)
```

**`prendas_baja`** — `db.js`; ⚠️ **recreada** en `routes/prestamos.js` (rename a `_baja_old` + CREATE relajado sin NOT NULL)
```
id PK · codigo NOT NULL · descripcion · sede_origen NOT NULL · sede_destino · motivo DEFAULT 'vendida'
fecha NOT NULL · responsable · lote_id · item_id · procesada DEFAULT 0 · procesada_por · fecha_procesada · created_at
```

**`devoluciones_garantia`** — `db.js`
```
id PK · nombre_cliente NOT NULL · celular NOT NULL · num_boleta · monto REAL NOT NULL · tienda NOT NULL
responsable · estado DEFAULT 'pendiente' · fecha_registro NOT NULL · fecha_devolucion · obs · created_at
```

**`ventas_metas`** — `seed-config.js`
```
id PK · emp_id INTEGER NOT NULL · mes NOT NULL · meta_soles REAL DEFAULT 0 · vendido_soles REAL DEFAULT 0
bonus_nota REAL DEFAULT 0 · registrado_por · created_at · UNIQUE(emp_id, mes)
```

### Solicitudes (pedidos tienda→almacén)

**`solicitudes`** — `db.js`
```
id PK · sede NOT NULL · solicitante NOT NULL · fecha NOT NULL · urgencia DEFAULT 'media'
estado DEFAULT 'pendiente' · aprobado_por · fecha_respuesta · entregado_por · fecha_entrega
confirmado DEFAULT 0 · confirmado_por · fecha_confirmacion · obs · obs_respuesta · created_at
```
+ ALTER: `rechazado_por`, `motivo_rechazo`, `pedido_impreso`, `confirmacion_impresa`,
  `fecha_pedido_impreso`, `fecha_confirmacion_impresa`, `recibe_en_tienda`, `codigos_prenda`.

**`solicitud_items`** — `db.js`; ⚠️ **migración destructiva**: si falta `categoria`, `DROP TABLE` + recrea
```
id PK · solicitud_id INTEGER NOT NULL · categoria TEXT NOT NULL DEFAULT 'prenda' · tipo NOT NULL
cantidad DEFAULT 1 · color · talla · tela · modelo · detalle · obs · FK solicitud_id → solicitudes(id)
```
+ ALTER: `cantidad_enviada`, `cantidad_recibida`, `obs_recepcion`, `estado_item DEFAULT 'pendiente'`.

### Asistencias y horarios

**`asistencias`** — `db.js`
```
id PK · emp_id TEXT NOT NULL · fecha NOT NULL · hora_entrada · hora_salida
minutos_tardanza INTEGER DEFAULT 0 · fuente DEFAULT 'manual' · obs · created_at
UNIQUE(emp_id, fecha) · FK emp_id → empleados(id)
```
*Divergencia `seed-config.js::ensureAsistencias()`:* `emp_id INTEGER`, +`turno DEFAULT 'M'`,
+`tipo_jornada`, `UNIQUE(emp_id, fecha, turno)`, sin FK.

**`horarios`** (plano legacy) — `seed-config.js` + `routes/asistencias.js`
```
id PK · emp_id INTEGER NOT NULL · dia NOT NULL · turno DEFAULT 'M' · sede NOT NULL
hora_inicio · hora_fin · activo DEFAULT 1 · UNIQUE(emp_id, dia, turno)
```

**`horario_periodos`** / **`horario_slots`** (v2) — `routes/horarios.js`
```
horario_periodos:  id PK · nombre NOT NULL · fecha_desde NOT NULL · fecha_hasta · activo DEFAULT 0
                   notas · created_by · created_at
horario_slots:     id PK · periodo_id NOT NULL · emp_id INTEGER NOT NULL · sede NOT NULL · sector
                   dia NOT NULL · turno NOT NULL · rol · hora_inicio · hora_fin · minutos DEFAULT 0
                   notas · FK periodo_id → horario_periodos(id)
```

### Evaluaciones y pagos

**`evaluaciones_mensuales`** — `db.js`
```
id TEXT PK · emp_id TEXT NOT NULL · mes NOT NULL · evaluador
nota_competencias · nota_valores · nota_operaciones (REAL DEFAULT 0)
descuento_tardanzas · descuento_incidencias · nota_tardanza · nota_final (REAL DEFAULT 0)
recomendacion · obs_general · created_at · FK emp_id → empleados(id)
```
+ ALTER (`evaluaciones.js`): `nota_software`, `nota_limpieza`, `nota_examenes`, `bonus_ventas`,
  `ciclo_desde`, `ciclo_hasta`, `pesos_usados`, `cumplimiento`.
*Divergencia `seed-config.js`:* `emp_id INTEGER`, sin FK.

**`evaluaciones_valores`** — `db.js`
```
id PK · evaluador_id TEXT NOT NULL · evaluado_id TEXT NOT NULL · mes NOT NULL
integridad · respeto · honestidad · amabilidad · relacion · actitud (INTEGER DEFAULT 3)
created_at · UNIQUE(evaluador_id, evaluado_id, mes) · FK evaluador_id/evaluado_id → empleados(id)
```

**`pagos`** — `routes/pagos.js`
```
id PK · emp_id TEXT NOT NULL · evaluacion_id · ciclo_desde · ciclo_hasta · mes
monto · monto_base · bonus · descuentos (REAL DEFAULT 0) · nota_final · metodo DEFAULT 'efectivo'
comprobante_num · fecha_pago · estado DEFAULT 'pendiente' · observaciones · registrado_por
registrado_por_cod · anulado INTEGER DEFAULT 0 · anulado_motivo · created_at
```

### Configuración, catálogos y auditoría

**`config`** — `db.js` / `seed-config.js` → `clave TEXT PRIMARY KEY · valor TEXT` (ver §5).

**`incidencias`** — `db.js`
```
id PK · sede NOT NULL · fecha NOT NULL · tipo NOT NULL · descripcion · nivel DEFAULT 'Medio'
responsable TEXT                      ← pseudo-FK #2 · reporte_id · created_at
```
+ ALTER: `reportado_por` ← **pseudo-FK #3**, `reportado_por_cod`, `origen DEFAULT 'manual'`, `puntos_penalidad REAL DEFAULT 0`.

**`incidencia_tipos`** — `routes/incidencias.js`
```
id PK · tipo TEXT UNIQUE NOT NULL · categoria · nivel_default DEFAULT 'Medio'
puntos_default REAL DEFAULT 2 · activo DEFAULT 1 · created_at
```

**`actividades_config`** — `db.js`
```
id PK · sede NOT NULL · cod NOT NULL · nombre NOT NULL · categoria DEFAULT 'PO' · tipo_act DEFAULT 'obligatoria'
peso REAL DEFAULT 5 · activa DEFAULT 1 · aparece_dia DEFAULT 0 · frecuencia_dias DEFAULT 0
turno DEFAULT 'ambos' · dia_semana · acumula DEFAULT 1 · precio_unitario DEFAULT 0 · unidad DEFAULT 'unidad'
orden DEFAULT 0 · UNIQUE(sede, cod) · (+descuento REAL DEFAULT 0 por ALTER)
```

**`actividades_pendientes`** — `db.js`
```
id PK · act_cod NOT NULL · sede NOT NULL · desde_fecha · desde_turno · resuelta DEFAULT 0 · resuelta_en
UNIQUE(act_cod, sede, desde_fecha, desde_turno)
```

**`layout_zonas`** — `seed-config.js` + `seed-layout.js` (⚠️ DROP+CREATE) + `routes/layout.js`
```
id PK · sede NOT NULL · cod · nombre · turno DEFAULT 'ambos' · tipo DEFAULT 'mueble' · peso DEFAULT 1
pos_x · pos_y · ancho DEFAULT 60 · alto DEFAULT 40 · color DEFAULT '#3b82f6' · forma DEFAULT 'rect' · orden DEFAULT 0
```
+ ALTER (`layout.js`): `nivel DEFAULT 'piso'`, `sobre_cod`, `frecuencia_dias`, `dia_semana`.
⚠️ `seed-layout.js` hace `DROP TABLE IF EXISTS layout_zonas` y recrea **sin** esas 4 columnas → ejecutarlo borra el layout.

**`audit_log`** — `db.js` (también `server.js`, `seed-config.js`)
```
id PK · fecha NOT NULL · hora NOT NULL · usuario_cod · usuario_nombre · sede
accion TEXT NOT NULL · modulo · detalle · ip · created_at
```
*Divergencia `seed-config.js`:* usa `usuario_id` en vez de `usuario_cod`; sin `NOT NULL`.

### Tablas legacy (ya no se crean; el código las borra)
`prestamos_prendas` (DELETE en `seed.js`) · `solicitudes_prendas` (dropeada por `db.js`, migrada → `solicitudes`) ·
`_baja_old` (respaldo temporal del rename de `prestamos.js`).

---

## 2. Columnas añadidas fuera del CREATE original (ALTER / ensure*)

Resumen de las más relevantes (origen entre paréntesis):

- **empleados:** `nombre_completo`, `password_hash`, `salario_base`, `tipo_jornada`, `tipo_contrato`,
  `vencimiento_contrato` (seed-config.js + empleados.js + pagos.js).
- **reportes:** `auto_enviado`, `auto_enviado_razon`, `no_evaluable`, `encargado_id` (reportes.js).
- **incidencias:** `reportado_por` (#3), `reportado_por_cod`, `origen`, `puntos_penalidad` (incidencias.js).
- **evaluaciones_mensuales:** `nota_software`, `nota_limpieza`, `nota_examenes`, `bonus_ventas`,
  `ciclo_desde`, `ciclo_hasta`, `pesos_usados`, `cumplimiento` (evaluaciones.js).
- **prendas:** `obs_general`, `dividida`, `dividida_en` (pipeline.js).
- **prenda_historial:** `cod_responsable` (pipeline.js).
- **accesorios_log:** `sede_origen`, `enviado`, `envio_id`, `sustento`, `origen` (pipeline.js).
- **listas_lavanderia:** `porta_ternos`, `zapatos` (lavanderia.js).
- **solicitudes / solicitud_items:** columnas de impresión/recepción/estado (solicitudes.js).
- **envios_prendas:** `cancelado` (seed-config.js).

> Patrón: todas se aplican con `try{db.exec('ALTER TABLE ... ADD COLUMN ...')}catch{}` al cargar
> el módulo (idempotente). Algunos ALTER son **no-op** (la columna ya está en el CREATE de db.js).

---

## 3. Índices (`CREATE INDEX ... IF NOT EXISTS`)

- **seed-config.js:** `idx_rep_act_repid`, `idx_rep_trab_repid`, `idx_rep_extras_repid`,
  `idx_lista_items_lid`, `idx_envio_acc_items_eid`, `idx_solic_items_sid`, `idx_reportes_fecha`,
  `idx_reportes_sede`, `idx_rep_trab_nombre`, `idx_incidencias_fecha`, `idx_incidencias_resp`,
  `idx_asist_emp_fecha`, `idx_asist_fecha`, `idx_emp_tiendas_emp`, `idx_emp_tiendas_tienda`, `idx_prenda_calif_pid`.
- **pipeline.js:** `idx_prenda_hist_fecha`, `idx_prenda_hist_resp`, `idx_prenda_hist_pid`,
  `idx_acc_log_fecha`, `idx_prendas_etapa`, `idx_prendas_envio`, `idx_envios_sede`.
- **horarios.js:** `idx_hs_periodo`, `idx_hs_emp`, `idx_hs_dt`.
- **pagos.js:** `idx_pagos_emp`, `idx_pagos_mes`, `idx_pagos_estado`.

---

## 4. Las 7 relaciones pseudo-FK por nombre TEXT

Estas columnas guardan el **nombre** (o `cod`) de un empleado en vez de un `id` con FK real. Es la
deuda central a resolver en Postgres (W4): reemplazar por `empleado_id` con FK. El sistema actual
las mantiene "sincronizadas" con un **cascade rename** en `PUT /api/empleados/:id`.

| # | Columna | Contexto | Debería apuntar a |
|---|---|---|---|
| 1 | `reportes.encargado` | nombre del encargado de turno; existe `encargado_id` (ALTER, sin FK) | `empleados.id` |
| 2 | `incidencias.responsable` | indexada `idx_incidencias_resp` | `empleados.id` |
| 3 | `incidencias.reportado_por` | ALTER; par `reportado_por_cod` (cod, no id) | `empleados.id` |
| 4 | `pipeline_puntos.emp_nombre` | par con `emp_cod`; productividad por operario | `empleados.id` |
| 5 | `prenda_historial.responsable` | indexada; par `cod_responsable` (desambigua homónimos, B6) | `empleados.id` |
| 6 | `reporte_trabajadores.nombre` | trabajadores presentes por reporte; indexada | `empleados.id` |
| 7 | `reporte_extras.registrado_por` | quién registró el extra | `empleados.id` |

> Existen **más** columnas-de-nombre sin FK fuera de las 7 canónicas (`reportes.evaluador`,
> `envios_prendas.responsable`, `prestamo_items.cambiado_por`, `pagos.registrado_por`, etc.); el
> set de 7 del `CLAUDE.md` es el listado arriba, pero el ETL deberá contemplar las demás.

---

## 5. Tabla `config` — claves seedeadas

`config (clave TEXT PRIMARY KEY, valor TEXT)`, seed con `INSERT OR IGNORE` (no pisa valores editados por admin).

**Pesos de puntos del pipeline (`pts_*`) — solo desde `db.js::initDB()`:**

| clave | default | clave | default |
|---|---|---|---|
| `pts_lavado_normal` | 1 | `pts_compostura` | 5 |
| `pts_lavado_seco` | 3 | `pts_planchado` | 3 |
| `pts_lavado_especializado` | 5 | `pts_control_calidad` | 2 |
| `pts_empatado` | 0.5 | `pts_accesorio` | 0.5 |
| `pts_refaccion` | 2 | | |

También en `db.js`: `eval_valores_habilitado='0'`, `precio_lavado_mano='5.00'`, `precio_michi='3.00'`.

**Pesos de evaluación / incidencias / horas (`peso_*`, `inc_*`, `hora_*`, `pipeline_*`) — solo desde `seed-config.js::seedConfig()`:**
`peso_operaciones=10`, `peso_limpieza=10`, `peso_software=10`, `peso_valores360=25`,
`peso_competencias=25`, `peso_conocimientos=15`, `peso_tardanzas=5`; `inc_uniforme=1`,
`inc_orden_limpieza=1`, `inc_documentacion=2`, `inc_equipos_electricos=3`, `inc_seguridad_cerrar=4`,
`inc_graves=8`, `inc_otros=2`; `hora_inicio_m=08:00`, `hora_inicio_t=14:00`, `hora_fin_m=14:00`,
`hora_fin_t=20:00`; `pipeline_meta_mensual=80`, `pipeline_meta_semanal=20`, `pipeline_precio_punto=0.05`.

> ⚠️ Las `pts_*` solo existen si corre `db.js::initDB()`; las `peso_*`/`inc_*`/`hora_*`/`pipeline_*`
> solo si corre `seed-config.js::seedConfig()`. Al portar a Postgres, **consolidar todas** en una
> sola fuente. (Pregunta P3 pendiente: confirmar si estos pesos son los vigentes en producción.)

---

## 6. Hallazgos clave para la migración

1. **Definiciones divergentes (mismo nombre, distinto DDL):** `reportes`, `reporte_*`,
   `actividades_config`, `actividades_pendientes`, `asistencias`, `evaluaciones_*`, `audit_log`,
   `solicitud_items`, `layout_zonas`, `solicitudes`. Destaca `emp_id TEXT` (db.js) vs `INTEGER`
   (seed-config.js). Gana la del primer `CREATE` al boot → **db.js**. Unificar en W4.
2. **`emp_id` inconsistente:** `empleados.id` es **TEXT**; varias tablas lo referencian como TEXT
   (correcto) y otras lo definen INTEGER (seed-config.js). El schema Postgres debe fijar un tipo único.
3. **Operaciones destructivas en runtime:** `seed-layout.js` (DROP+CREATE `layout_zonas`),
   `prestamos.js` (rename `prendas_baja`), `db.js` (DROP `solicitud_items` si falta `categoria`).
   No ejecutar estos paths sobre datos vivos sin backup.
4. **`foreign_keys = ON`** pero la mayoría de relaciones reales son pseudo-FK por TEXT (no declaradas).
   Las FKs declaradas sí están activas (empleado_tiendas, reporte_*, prenda_*, evaluaciones_*, etc.).
5. **~33 tablas vivas** (incluye las definidas solo en `routes/`: horarios, horario_periodos,
   horario_slots, ventas_metas, layout_zonas, incidencia_tipos, pagos, envios_accesorios,
   envio_accesorios_items, reporte_drafts).

> Próximo paso (W4): mapeo tabla-a-tabla SQLite→Postgres en `docs/mapeo-migracion.md`, FKs reales,
> y ETL idempotente que loguea huérfanos de los pseudo-FK sin fallar.
