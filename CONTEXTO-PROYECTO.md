# LuceBien · Contexto del proyecto para nuevas conversaciones

> Documento autocontenido. Si abres este archivo en un nuevo chat con Claude
> (u otro asistente), debería tener todo el contexto necesario para retomar
> el trabajo sin pedir aclaraciones básicas.

---

## 1. La empresa

**LuceBien** — alquiler, venta y confección de trajes formales (ternos).
Operación multi-sede:

- **Sucursales activas (3):** "LuceBien" (LB), "Stand 101-102" (ST), "Trece" (TR).
- **Almacén Central (AL):** procesa todas las prendas. Tiene también un almacén secundario en la sede "13" (TR).
- **Modelo operativo:** las prendas físicas transitan por estados (recepción → lavado → empatado → refacción → compostura → planchado → control de calidad → listo → enviado a tienda → cliente). Se asignan puntos y evaluaciones a los operarios según su eficiencia.

**Visión a futuro:** evolucionar el sistema interno hacia un **ERP + e-commerce omnicanal** ("LuceBien 360"), con vitrina pública (compra + reserva), trazabilidad por QR/Barras por prenda, y migración SQLite → PostgreSQL/Supabase.

---

## 2. El sistema actual

### Stack técnico

- **Backend:** Node.js + Express + better-sqlite3 (SQLite local).
- **Frontend:** HTML + JS clásico + un componente React vía Babel standalone (`almacen-kanban.jsx`) para el módulo de Almacén.
- **BD:** `database/lucebien.db`. La BD viva está en otra computadora (la del almacén); aquí en local se usa una restaurada de backup.
- **Servidor de desarrollo:** PM2 en producción, `node server.js` en desarrollo.
- **Puerto:** 7000 en local (3000 está bloqueado por Chrome `ERR_UNSAFE_PORT` para puerto 6000).
- **Auth:** JWT en `Authorization: Bearer ...`. El secret se carga desde `.env` (con default hardcodeado de fallback).
- **Live updates:** SSE (Server-Sent Events) en el módulo de almacén para reflejar cambios entre operarios en tiempo real.

### Estructura de carpetas relevante

```
C:\Users\ASUS\Downloads\Lucebien\          (folder principal, donde corre el server)
├── .env                   (no commiteado: JWT_SECRET, PORT, BACKUP_*)
├── .env.example
├── .gitignore
├── _env-loader.js         (carga .env sin dependencia)
├── _backup-bd.js          (scheduler de backup automático cada 24h)
├── server.js              (Express, registro de rutas, middlewares de auditoría)
├── database/
│   ├── lucebien.db        (BD viva)
│   ├── db.js
│   ├── seed-config.js
│   └── backups/           (lucebien_auto_YYYYMMDD_*.db rotando los últimos 14)
├── routes/
│   ├── auth.js            empleados.js   reportes.js   evaluaciones.js
│   ├── pipeline.js        valores.js     incidencias.js   asistencias.js
│   ├── lavanderia.js      prestamos.js   garantias.js   solicitudes.js
│   ├── horarios.js        actividades.js   ventas.js   layout.js   config.js
│   ├── notificaciones.js  dashboard.js   pagos.js
├── public/
│   ├── index.html
│   ├── css/  (style.css, enhancements.css, kanban-almacen.css)
│   └── js/   (app.js, admin.js, header.js, asistencia-dia.js, pagos.js,
│              almacen-kanban.jsx, solicitudes.js, pipeline-historial.js,
│              pipeline-ui.js, patches-v3/v4/v5.js, horarios-v2.js, etc.)
├── docs/
│   ├── auditoria-pipeline-prendas.md
│   └── hoja-de-ruta-sistema.md   ← lectura recomendada
└── .claude/worktrees/awesome-blackburn-9763c4/   ← worktree donde se trabaja en git
```

### Módulos del frontend (páginas)

| ID | Label | Para quién |
|---|---|---|
| `reporte` | Reporte de Actividades | Todos |
| `evaluacion` | Evaluación de Reporte | Todos |
| `mi-desempeno` | Mi Desempeño | Todos (atajo en header) |
| `eval-valores` | Evaluar Compañeros (Valores 360°) | Todos cuando admin habilita |
| `lavanderia` | Envío a Lavandería | Tienda |
| `pipeline-envios` | Envíos Recibidos | Tienda |
| `prestamos` | Préstamo de Prendas | Todos |
| `solicitudes` | Solicitudes inter-tiendas | Todos |
| `kanban-almacen` | Prendas Recibidas (kanban React) | Almacén |
| `retorno`, `garantias` | Retorno y Garantías | Almacén |
| `dashboard` | Dashboard Administrativo | Admin/dueño |
| `empleados` | Gestión de Colaboradores | Admin/dueño |
| `incidencias-admin` | Incidencias | Admin (atajo en header) |
| `evaluacion-mensual` | Evaluación Mensual (HUB) | Admin/dueño |
| `pagos`, `asistencias` | Páginas accesibles desde tabs de Eval Mensual | (no en sidebar) |
| `gestion-actividades` | Gestionar Actividades (rúbricas por sede) | Admin |
| `admin-reportes` | Reportes de Actividad | Admin |
| `horarios-admin` | Horarios | Admin |
| `audit-log` | Auditoría del Sistema | Admin |

---

## 3. Reglas de operación (mandatorias)

Las dio el usuario al inicio del proyecto. Aplican a todo lo que se haga:

1. **Estabilidad del servidor es prioridad absoluta.** Toda ruta nueva en `try/catch`. No romper el boot.
2. **Gestión de Git/Stash con cuidado.** Antes de merge/stash pop verificar que no haya bloqueos de archivo (BD en uso por PM2). Detener si hay riesgo de conflicto severo.
3. **No inventar reglas de negocio.** Si la lógica involucra cálculo de puntos, permisos por rol o flujo de prendas entre sedes — DETENER y preguntar.
4. **Limpieza.** Avisar de worktrees y archivos seed creados para limpieza posterior.
5. **Comunicación.** Directo, objetivo, analítico. Presentar opciones estructuradas con archivos afectados y nivel de riesgo.

### Preferencias del usuario

- **Estética corporativa navy/gold**, sin elementos infantiles. Paleta:
  - `--navy:#2e3e6e` `--navy-l:#3a4f8a` `--navy-d:#1e2a4a` `--navy-xd:#141c33`
  - `--gold:#b8a515` `--gold-l:#d4bf1e` `--gold-d:#8a7c10` `--gold-pale:rgba(184,165,21,.1)`
  - Fuentes: **Inter** (body), **Cormorant Garamond** (solo el logo y display especiales), **JetBrains Mono** (código/números).
- **Sin confeti, sin rebotes exagerados.** Animaciones sobrias (fade, slide, scale, pulse).
- **Emojis al mínimo.** Conservar solo los funcionales del pipeline. Eliminar decorativos.
- **Lenguaje claro en español** para todo lo visible al usuario.
- **PRs separados** uno por uno. Backups antes de tocar BD. Documentación en español.
- **Auto mode activo**: ejecutar autónomamente, minimizar interrupciones. Solo pedir confirmación en acciones destructivas.

### Ambiente del usuario

- Trabaja en una computadora de **desarrollo local** (Windows 11). Usa Brave/Chrome.
- La **PC de producción** está físicamente en el almacén — diferente máquina.
- El plan es: **terminar todo en local primero**, luego copiar al almacén.
- En el almacén hay operarios trabajando en este momento sobre la BD viva — **no se reemplaza la BD**, solo se aplican migraciones idempotentes con `ALTER TABLE ... ADD COLUMN` y `CREATE INDEX IF NOT EXISTS`.

---

## 4. Estado actual del sistema (qué está hecho)

### Módulo "Prendas Recibidas" (Almacén — kanban)

- Componente React JSX (`public/js/almacen-kanban.jsx`) reescrito con paleta navy/gold + clases CSS (`public/css/kanban-almacen.css`).
- Tabs internos: **Kanban / Registrar / Accesorios / Envíos a tienda / Métricas / Diario / Historial / Config**.
- Buscador por código, color o tipo con highlight visual.
- Toolbar de acción sticky bajo el nav (resuelve queja UX previa).
- Live updates por SSE (`/api/pipeline/stream`).
- Backend `routes/pipeline.js` con endpoints completos + validación JWT en `cod_responsable` + fix DQS comillas + dividir terno preserva historial (no DELETE).

### Módulo "Solicitudes"

- Versión v8 cargada desde `solicitudes.js`. Bug previo de `undefined` en columnas resuelto (faltaba el `<script>` tag y había una versión vieja en `pipeline-ui.js`).

### Sistema de evaluación mensual completo

- **Backend `routes/evaluaciones.js`:** GET/POST `/mensual`, GET/PUT `/pesos`, GET `/ciclo-actual`, GET `/calcular`.
  - Migración idempotente con 8 columnas nuevas: `nota_software`, `nota_limpieza`, `nota_examenes`, `bonus_ventas`, `ciclo_desde`, `ciclo_hasta`, `pesos_usados` (JSON snapshot), `cumplimiento`.
  - Pesos default 25/25/10/10/10/15/5 = 100% editables desde Configuración.
  - **Mapeo de categorías** (REGLA del usuario):
    - `cat='IND'` → LIMPIEZA (incluye AT01 "Limpieza de almacén" aunque su prefijo sea AT)
    - `cod` empieza con `AS` o `BS` → SOFTWARE
    - `cod` empieza con `AT` o `BT` → OPERACIONES
    - `cat='EXT'` (prefijos XT*) → no se cuenta
- **Frontend Evaluación Mensual** con tabs: Evaluar, Asistencias, Pagos, Valores 360°, Configuración.
- Cierre del ciclo + registro de pago + comprobante PDF imprimible con un solo flujo (botón "Cerrar y registrar pago →").
- Cada evaluación guarda `pesos_usados` JSON al cierre — futuras ediciones de pesos NO recalculan retroactivamente (regla del usuario).

### Módulo Pagos

- Tabla `pagos` con migración idempotente (21 columnas).
- Endpoints CRUD admin + sugerencia de monto (`salario_base × nota/20 + bonus − descuentos`) + comprobante imprimible HTML A4 navy/gold.
- Página standalone `/pagos` + tab dentro de Evaluación Mensual.
- Migración: empleados ahora tienen `salario_base`, `tipo_contrato`, `vencimiento_contrato`, `fecha_nacimiento`, `dni`, `telefono`.

### Módulo Asistencia diaria

- Backend `routes/asistencias.js` ampliado con `GET /del-dia?fecha=&sede=` que cruza horario esperado + asistencia real.
- Página standalone (en PAGES_CONFIG, no en sidebar) accesible desde Eval Mensual.
- Auto-asistencia: cuando un operario envía su reporte de turno, queda marcado presente con `fuente='reporte'`. Cuando llegue el huellero, será `fuente='huellero'` con tardanza real.
- El admin puede marcar manualmente con `fuente='manual'`.

### Módulo Valores 360° (peer review)

- Backend `routes/valores.js` con tabla `evaluaciones_valores` + endpoint seguimiento del mes.
- Frontend con badge de pendientes + vista admin.
- **Configuración programada**: GET/PUT `/api/valores/config` con `modo='manual'|'auto'` y `dias=[25,26,27,28]` (configurable desde Colaboradores → "🎲 Eval. Valores 360°"). En modo `auto` el módulo se habilita automáticamente solo en los días configurados del mes.
- Card "Mi resumen del mes" para que el colaborador vea qué opinaron de él (anónimo).

### Header global fijo

- Reloj + fecha + estado del turno con parpadeo si quedan ≤30 min.
- Indicador de conexión (verde/rojo) con ping a `/api/test` cada 20s.
- Atajos rápidos: **Mi Desempeño** + **Agregar Incidencia**.
- Campana con notificaciones (`/api/notificaciones/pendientes`) — separa "Mis pendientes" (todos) vs "Sistema" (solo supervisor). Filtrada por `canAccess()` para no mostrar lo que el usuario no tiene permiso.
- Avatar con menú: Mi desempeño / Evaluar valores / Cerrar sesión. (Cambiar sede ahora vive en el sidebar).
- `body.sb-collapsed` reactivo: cuando el sidebar colapsa, el header se ajusta a `left:60px`.
- Refresh automático del usuario desde `/api/auth/me` cada 30s para captar cambios (ej. nuevas sedes asignadas).

### Sidebar

- **LUCE** (blanco) **BIEN** (dorado) en logo, fuente Cormorant Garamond.
- Logo en caja con gradient gold sutil.
- **Sede clickeable** debajo del logo: abre popup elegante (toggle, click otra vez cierra) con las sedes asignadas + opción "Salir y elegir desde inicio". Cambiar de sede hace re-login con el cod actual y `location.reload()`.
- Botón "Colapsar" abajo.
- Eliminados del sidebar (vivían duplicados): Mi Desempeño, Agregar Incidencia (ahora en header), Pagos y Asistencia diaria (ahora tabs en Eval Mensual), bloque de avatar/nombre/rol/cerrar sesión (todo en header).

### Dashboard administrativo (V3)

- **Lenguaje claro y comprensible**, no técnico.
- **Banda de alertas críticas** arriba con goto al módulo.
- **8 KPIs ejecutivos clickeables** con delta vs ayer (▲/▼/•) en `reportes_hoy` e `incidencias_hoy`.
- **Pipeline almacén** con donut SVG (segmento por etapa con paleta del kanban) + leyenda con números absolutos y %.
- **Próximas evaluaciones y pagos** — colaboradores que cierran ciclo en los próximos 7 días.
- **Estado del sistema** (admin) con CTAs accionables: empleados sin fecha de ingreso, evaluaciones del mes pendientes, eventos de auditoría hoy, backups disponibles, slots de horario configurados.
- **Tendencia 7 días** con sparklines de Reportes / Incidencias / Acciones del pipeline + delta vs ayer.
- **Resumen por sede · hoy**.
- **Estado de Reportes Diarios** rehecho con grid de cards por sede (3 dots circulares M/T/Eval con estado claro).
- **Top operarios del almacén** (ranking pipeline).

### Auditoría

- `routes/audit-log` y `audit_log` table funcionando — bug previo de `usuario_id` vs `usuario_cod` resuelto. Cada POST/PUT/DELETE queda registrado con quién, cuándo, IP, módulo, acción, detalle.
- Vista admin con KPIs + filtros + tabla.

### Infraestructura de producción

- **`.env` cargado** automáticamente por `_env-loader.js` (sin dependencia dotenv).
- **Backup automático cada 24h** (`_backup-bd.js`) con `VACUUM INTO` (snapshot consistente con BD en uso) + rotación de los últimos 14.
- **`.gitignore`** protege `.env`, BD viva, backups, node_modules.
- **JWT_SECRET** centralizable en `.env` (cada router ya tenía el patrón `process.env.JWT_SECRET || '<default>'`).

### Export CSV

- Botones "📥 CSV" en Auditoría, Pagos y Asistencia. Generan archivos UTF-8 con BOM, separador `;` (Excel-ES amigable).

---

## 5. Cómo se calcula la nota mensual (regla del usuario)

```
nota_final = (nota_competencias × 0.25)
           + (nota_valores      × 0.25)
           + (nota_operaciones  × 0.10)
           + (nota_software     × 0.10)
           + (nota_limpieza     × 0.10)
           + (nota_examenes     × 0.15)
           + (nota_tardanza     × 0.05)
           − descuento_incidencias
           + bonus_ventas
```

Cada componente:
- **Competencias**: input manual del admin (0–4 por cada competencia, escala /20).
- **Valores 360°**: peer review entre colaboradores (1–5 promediado × 4 → /20).
- **Operaciones / Software / Limpieza**: promedio de calificaciones de actividades del periodo según el mapeo IND/AS/BS/AT/BT.
- **Conocimientos**: módulo de examen (futuro, hoy se ingresa manual).
- **Tardanza**: `max(0, 20 − floor(min_total/15))` desde tabla asistencias.
- **Descuento incidencias**: suma de `puntos_penalidad` de incidencias del periodo.
- **Bonus ventas**: si vendió ≥ meta, hasta +2 puntos.

### Tramos de recomendación

- ≥ 17 → "Excelente"
- 14–16.99 → "Buen desempeño"
- 11–13.99 → "Requiere mejorar"
- < 11 → "Bajo rendimiento" (riesgo de despido si < 14)

### Ciclo personal

- Cada colaborador tiene su **propio mes** (aniversario): si entró el 7, su ciclo va del 7 al 6 del siguiente mes.
- Si no tiene `fecha_ingreso`, fallback al mes calendario (con badge de advertencia "calendario").
- El admin no paga al final del mes calendario sino al cierre de cada ciclo personal.

---

## 6. Worktrees y branches

- **Folder principal**: `C:\Users\ASUS\Downloads\Lucebien\` (es donde corre el server con `PORT=7000 node server.js`).
- **Worktree de trabajo activa**: `.claude/worktrees/awesome-blackburn-9763c4/` (branch `claude/awesome-blackburn-9763c4`). Aquí están todos los commits del trabajo.
- Otras worktrees pueden existir (`objective-vaughan-203c86`, etc.) — son temporales de cada sesión de Claude.
- **`main` en el folder principal está en la rama `feat/pipeline-feedback-iter`** (no en `main` directo). Tiene cambios sin commit por trabajo previo.
- Branches viejas (`feat/prendas-recibidas-redisenio`, `chore/limpiar-pipeline-legacy`, etc.) están vacías — son refs huérfanos del trabajo de un agente anterior cuyo código se perdió y se rehízo.

---

## 7. Commits importantes (orden cronológico, en `claude/awesome-blackburn-9763c4`)

```
2fe93b5  fix(sidebar): sede sin serifa + toggle al click + quitar Pagos/Asistencia del sidebar
a7254c5  feat: header atajos + sidebar sede clickeable + Pagos en EvalMensual + horarios + hoja ruta
… (sede config, dashboard V3, header V2 …)
9261a43  fix(header,sidebar,notif): sidebar colapsado + sede dinámica + canAccess + avatar
9e0da81  feat(ui): sidebar sin duplicados + dashboard analítico (donut, deltas)
2992ce9  feat(dashboard): vista ejecutiva del admin con snapshot único
064fd19  feat(infra): .env loader + backup automático + export CSV
c3cf11d  fix(audit) + feat(empleados,asistencias): perfeccionar control interno
d2e9806  feat(pagos): cierre evaluación → pago + comprobante imprimible (S2)
24cee2c  feat(header): barra superior fija con reloj, turno, sede, conexión, campana
8d2b2f2  feat(almacen-kanban): buscador de prendas con highlight visual
cfc720f  feat(almacen-kanban): integrar Envíos Acc + Historial como tabs del kanban
b02bc91  feat(almacen-kanban): rediseño visual navy/gold + toolbar sticky
3eeec2a  fix(almacen-kanban): restaurar JSX desde backup
```

Total: ~25-30 commits incrementales, todos reversibles, todos con mensaje detallado.

---

## 8. Pendientes (lo que aún NO está conectado)

Documentado en `docs/hoja-de-ruta-sistema.md`. Resumen:

- **Examen de conocimientos** — alimentaría `nota_examenes`. Hoy se ingresa manual.
- **Huellero digital** — reemplazará `fuente='reporte'` por `'huellero'` con tardanza real.
- **E-commerce público** — Fase 2 del proyecto LuceBien 360.
- **Trazabilidad cliente-prenda** — vida útil de cada prenda alquilada.
- **Caja chica / gastos operativos** — control financiero operativo (S5 de la auditoría inicial).
- **Migración SQLite → PostgreSQL/Supabase** — Fase 1 del LuceBien 360.

### Datos críticos faltantes en producción

Antes de pasar a la PC del almacén, asegurar:
- [ ] Cada colaborador tiene `fecha_ingreso` (define ciclo personal)
- [ ] Cada colaborador tiene `salario_base` (define monto sugerido de pago)
- [ ] Cada colaborador tiene `dni` (aparece en comprobante)
- [ ] Horarios cargados con `horario_slots` (define reportes esperados)
- [ ] Pesos configurados al gusto del admin
- [ ] Tipificaciones de incidencias revisadas
- [ ] Ventas con metas mensuales (si se usa bonus)
- [ ] `JWT_SECRET` rotado en `.env` de producción
- [ ] Backup automático corriendo

### Deuda técnica documentada

- `routes/asistencias.js` tiene endpoints `/horarios/...` planos legacy + `routes/horarios.js` con `horario_slots` versionado. Hay duplicación. El frontend usa los planos. Migrar antes de borrar legacy.
- Tablas vacías a poblar: `asistencias` (0 → ya está la auto-asistencia), `evaluaciones_mensuales` (0), `evaluaciones_valores` (0), `audit_log` (ya se está poblando desde el fix), `pagos` (0).

---

## 9. Cómo continuar (instrucciones para el siguiente Claude)

### Para arrancar el servidor de desarrollo

```bash
cd "C:\Users\ASUS\Downloads\Lucebien"
PORT=7000 node server.js
```

URL: http://localhost:7000

### Para validar tras cambios

1. `node -c <archivo>` para sintaxis.
2. Sincronizar entre worktree y folder principal:
   ```bash
   cp .claude/worktrees/awesome-blackburn-9763c4/<file> ./<file>
   ```
3. Reiniciar server (matar el proceso y relanzar con `PORT=7000 node server.js`).
4. Verificar con `curl http://localhost:7000/` (HTTP 200).

### Para commitear

Trabajar siempre en la worktree `.claude/worktrees/awesome-blackburn-9763c4/`. Commit messages descriptivos en español, mencionando el trade-off y el patrón.

### Reglas no negociables

- **Nunca tocar BD destructivamente**. Solo `ALTER TABLE ADD COLUMN` con try/catch, `CREATE INDEX IF NOT EXISTS`, `INSERT OR IGNORE`. Si necesitas cambiar schema, propón al usuario primero.
- **Siempre `try/catch`** en código que toca BD o I/O.
- **Sin emojis decorativos** ni serifas en texto normal (solo en logo "LUCEBIEN").
- **Lenguaje claro en español** en toda UI visible al usuario.
- **No reemplazar la BD viva** — siempre asumir que el usuario está trabajando en local con datos de prueba y la real está en otra PC.

### Si encuentras bugs

1. Buscar root cause, no parchar síntomas.
2. Try/catch defensivo si afecta el boot.
3. Documentar en commit message qué fallaba y cómo se arregló.

### Si el usuario pide algo nuevo

1. Confirmar reglas de negocio antes de inventar.
2. Acotar el alcance (S1, S2, etc. — el usuario aprecia plan numerado).
3. Hacer commits granulares y reversibles.
4. Reportar al final con lenguaje claro: qué cambió, dónde se ve, cómo probar.

---

## 10. Documentos relacionados

- **`docs/hoja-de-ruta-sistema.md`** — diagrama completo de cómo se conectan todos los módulos para llegar a la nota mensual automatizada. **Leer primero.**
- **`docs/auditoria-pipeline-prendas.md`** — auditoría técnica del módulo de almacén con bugs identificados (la mayoría ya resueltos).
- **`.env.example`** — qué variables hay que poner en `.env` real.

---

_Última actualización: el sistema queda en un estado coherente y listo para que el admin complete los datos faltantes y pase a la PC del almacén. La conversación previa cubrió desde la restauración inicial del módulo de almacén hasta el dashboard analítico, pasando por la integración del cierre evaluación → pago, asistencia editable, configuración programada de Valores 360°, y limpieza de duplicaciones UI._
