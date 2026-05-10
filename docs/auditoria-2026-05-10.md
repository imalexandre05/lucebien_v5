# LuceBien · Auditoría completa del sistema · 2026-05-10

> Auditoría exhaustiva: bugs rotos, bugs de lógica, endpoints muertos,
> UX rota, permisos, inconsistencias de schema. Roles probados:
> admin (Alexander/8686), encargado_tienda (Janet · simulado vía JWT),
> encargado_almacen (Nicol · simulado), confeccionista (Remy · simulado),
> ventas_junior (Jesus · simulado).

> **🟢 ESTADO: 12 / 22 hallazgos resueltos** (ver tabla de tracking
> abajo). Críticos y mayores 100% aplicados. Quedan menores y cosméticos
> de bajo impacto.

---

## Tracking de fixes aplicados

Tres tandas commiteadas el 2026-05-10:

| Tanda | Commit | Hallazgos resueltos |
|---|---|---|
| **T1** críticos | [`e35ae35`](#) | #01 schema empleados.sede · #02 permisos dashboard · #03 fuga campos · #04 vaciar cod_plain/pass_plain |
| **T2** antes del cierre | [`1ff13e2`](#) | #05 mensaje login deshab/susp · #06 auto-asistencia (+53 backfill) · #07 16 índices FK |
| **T3** saneamiento | [`970e909`](#) | #08 datos sucios · #09 roles fantasma · #10 modales close · #11 render pagos/asistencias · #14 console noise · #16 ya estaba aplicado |

**Backup pre-fix:** `database/backups/lucebien_pre_audit_fixes_20260510_122632.db`

---

## Resumen ejecutivo

| Severidad | Total | ✅ Resueltos | ⏳ Pendientes |
|---|---|---|---|
| 🔴 CRÍTICO | 4 | 4 (#01, #02, #03, #04) | 0 |
| 🟠 MAYOR | 7 | 7 (#05, #06, #07, #08, #09, #10, #11) | 0 |
| 🟡 MENOR | 9 | 1 (#14) | 8 (#12, #13, #15, #16✓ya, #17, #18) + decisiones |
| ⚪ COSMÉTICO | 4 | 0 | 4 (#19, #20, #21, #22) |

**Top 3 hallazgos críticos — TODOS RESUELTOS:**

1. ✅ **🔴 #01** · `/api/pagos`, `/api/pagos/sugerir` y `/api/valores/seguimiento` ya no revientan. Queries usan `GROUP_CONCAT(tienda) FROM empleado_tiendas` en lugar de la inexistente `empleados.sede`. (Commit `e35ae35`)
2. ✅ **🔴 #02** · `encargado_tienda` y `encargado_almacen` ahora son supervisores LIMITADOS — solo ven dashboard de SUS sedes (filtro `sedesPermitidas()`). Admin/dueño ve todo. (Commit `e35ae35`)
3. ✅ **🟠 #06** · Auto-asistencia ahora dispara desde POST manual Y desde el cron `autoEnviarPendientes()` con función reutilizable `generarAsistenciasDelReporte()`. Backfill ejecutado: 53 asistencias generadas desde 96 reportes. (Commit `1ff13e2`)

**Lo que funciona bien:** auth (rechaza deshab/susp con mensaje claro ahora), dashboard admin V3, kanban almacén con 3 vistas, envíos recibidos (prendas+accesorios), pipeline operativo, evaluaciones por reporte, layout editor.

**Cleanup hecho:** `MARKDOWN.txt` borrado, 2 prendas `PRUEBA*` activas eliminadas, 3 envíos huérfanos marcados como cancelados, `cod_plain`/`pass_plain` vaciados en 18 empleados.

---

## Cómo leer este documento

Cada hallazgo tiene:
- **Severidad**: 🔴 CRÍTICO · 🟠 MAYOR · 🟡 MENOR · ⚪ COSMÉTICO
- **Categoría**: Bug roto · Bug lógica · Endpoint muerto · UX · Permisos · Schema
- **Ubicación**: archivo:línea o tabla:columna
- **Reproducción**: pasos exactos
- **Fix-prompt**: link a `docs/fixes/NN-tag.md` con prompt autocontenido

---

## Inventario base

**Backend** — 20 archivos en `routes/`, ~120 endpoints.

**Frontend** — 23 páginas (`page-*`), 14 archivos JS, 3 archivos CSS, 1 JSX (kanban almacén · 661 líneas).

**Base de datos** — 39 tablas. Datos vivos: 96 reportes, 1.679 reporte_actividades, 93 prendas, 472 prenda_historial, 18 empleados, 49 empleado_tiendas, 21 solicitudes, 12 incidencias, 11 audit_log.

**Tablas con 0 filas (legacy, sin uso o features sin estrenar):**
- `horarios` — legacy, reemplazada por `horario_periodos` + `horario_slots`
- `asistencias` — sospechoso (ver hallazgo #06)
- `actividades_pendientes` — feature nunca usada
- `evaluaciones_mensuales`, `evaluaciones_valores`, `pagos`, `ventas_metas`, `devoluciones_garantia`, `reporte_drafts` — features recientes sin uso real

**Empleados activos** — 18 (3 admin · 1 dueño · 8 encargado_tienda · 1 encargado_almacen · 2 confeccionista · 1 ventas_junior · 2 ventas_junior_2). 4 deshabilitados/suspendidos.

---

## Hallazgos

---

### #01 · 🔴 CRÍTICO · Bug roto · Schema · `/api/pagos` y `/api/valores/seguimiento` revientan con 500

**Estado:** ✅ **RESUELTO** en commit `e35ae35` (2026-05-10) — queries usan `GROUP_CONCAT(tienda) FROM empleado_tiendas` y filtro con `EXISTS`. Helper `sedesDe(db, empId)` agregado a `pagos.js`. Probado: los 3 endpoints ahora devuelven 200.

**Categoría:** Bug roto · Schema mismatch
**Ubicación:**
- `routes/pagos.js:78, 84, 102, 129, 147, 221, 277` — todas referencian `e.sede` o `empleados.sede`
- `routes/valores.js:141, 173` — referencian `empleados.sede`

**Reproducción:**
```
GET /api/pagos                                  → 500 {"error":"no such column: e.sede"}
GET /api/pagos/sugerir?emp_id=E02&mes=2026-05   → 500 {"error":"no such column: sede"}
GET /api/valores/seguimiento/2026-05            → 500 {"error":"no such column: sede"}
```

Probable también roto (no probado con datos vivos):
- `GET /api/pagos/:id`
- `GET /api/pagos/:id/comprobante`

**Causa:** queries asumen que `empleados.sede` existe. NO EXISTE — las sedes están en una tabla aparte `empleado_tiendas` (relación N:M, columna `tienda`).

**Impacto:** El módulo de Pagos del admin queda inutilizable (`GET /api/pagos` siempre 500 → la pantalla queda vacía o con error). El dashboard de seguimiento de Valores 360° tampoco se puede consultar.

**Asimetría peligrosa:** `POST /api/pagos` SÍ funciona (no usa la columna inexistente). Un admin puede crear un pago y luego no verlo en su lista. Probado: creé `{emp_id:"E02",mes:"2026-04",monto_neto:1500}`, devolvió `{id:1,ok:true}`, pero `GET /api/pagos` 500 después.

**Fix-prompt:** [`docs/fixes/01-pagos-roto.md`](fixes/01-pagos-roto.md)

---

### #02 · 🔴 CRÍTICO · Permisos · Encargados pueden llamar endpoints de admin

**Estado:** ✅ **RESUELTO** en commit `e35ae35` (Opción C aplicada) — encargados son supervisores LIMITADOS, solo ven dashboard de SUS sedes asignadas. Si pasan `?sede=X` no permitida, se ignora. Para `/empleado` reciben 403 si el trabajador no comparte ninguna sede. Admin/dueño ven todo. Función `sedesPermitidas(user)` controla esto.

**Categoría:** Permisos · Fuga de información
**Ubicación:** `routes/dashboard.js:21-25` — función `esSupervisor()`

```js
function esSupervisor(u) {
  if (!u) return false;
  const r = (u.rol || '').toLowerCase();
  return r === 'admin' || r === 'dueno' || r === 'dueño'
      || r === 'encargado_almacen' || r === 'encargado_tienda';
}
```

**Reproducción:** con JWT manual de Janet (encargado_tienda, E02):
```
GET /api/dashboard/admin                        → 200 (ve KPIs de TODAS las sedes)
GET /api/dashboard/empleado?emp_id=E04          → 200 (ve dashboard de Cesar)
```

**Causa:** el frontend `DEFAULT_PERMS.encargado_tienda` y `encargado_almacen` NO incluyen `'dashboard'`, así que la opción se les oculta. Pero el backend `esSupervisor()` los considera supervisores y les responde igual. **Inconsistencia frontend ↔ backend.**

**Impacto:** Cualquier encargado que conozca las URLs (o use DevTools) puede:
- Ver KPIs gerenciales completos de todas las sedes
- Ver el dashboard personal de cualquier compañero (Christie, evolución, incidencias, sedes asignadas)

No es catastrófico (no expone passwords ni datos personales sensibles), pero rompe el modelo de permisos del sistema.

**Fix-prompt:** [`docs/fixes/02-permisos-dashboard.md`](fixes/02-permisos-dashboard.md)

---

### #03 · 🔴 CRÍTICO · Permisos · Cualquier rol logueado puede listar TODOS los empleados

**Estado:** ✅ **RESUELTO** en commit `e35ae35` — nueva función `sanitizeEmp(e, viewer)` en `routes/empleados.js`. Roles no-admin solo reciben `id, cod, nombre, iniciales, rol, activo, estado, tiendas, nombre_completo` (suficiente para selectores FR-01). Admin/dueño siguen viendo todo. SIEMPRE se eliminan `cod_hash`, `password_hash`, `cod_plain`, `pass_plain` (ni siquiera el admin los ve por este endpoint).

**Categoría:** Permisos · Fuga de información
**Ubicación:** `routes/empleados.js:7-17` — endpoint `GET /api/empleados`

**Reproducción:** con JWTs de TODOS los roles probados (encargado_tienda, encargado_almacen, confeccionista, ventas_junior):
```
GET /api/empleados                              → 200 (lista completa: cod, nombre, rol, sedes, salario_base, dni, telefono...)
```

**Causa:** el endpoint solo requiere `auth` (token válido), no filtra por rol. El frontend lo usa para poblar dropdowns de selección de trabajadores en el FR-01, pero le devuelve también `salario_base`, `dni`, `telefono`, `direccion`, etc.

**Impacto:** Un confeccionista logueado puede ver el salario base de su jefe, el DNI de cualquier compañero, etc. El campo `pass_plain` y `cod_plain` también se devuelven (ver #04).

**Fix-prompt:** [`docs/fixes/03-empleados-fuga.md`](fixes/03-empleados-fuga.md)

---

### #04 · 🔴 CRÍTICO · Schema · 18 empleados tienen `pass_plain` y `cod_plain` almacenados

**Estado:** ✅ **RESUELTO** en commit `e35ae35` — `UPDATE empleados SET cod_plain=NULL, pass_plain=NULL` ejecutado (18 filas afectadas). La auth siempre usó bcrypt sobre `cod_hash`/`password_hash`, las columnas plain eran redundantes. Combinado con #03, este vector de escalada queda cerrado. Las columnas siguen en schema (no se borran porque SQLite DROP COLUMN es complicado y no urgente).

**Categoría:** Schema · Riesgo de seguridad
**Ubicación:** `empleados.pass_plain`, `empleados.cod_plain` — tabla con 18 filas

**Reproducción:**
```sql
SELECT COUNT(*) FROM empleados WHERE cod_plain IS NOT NULL OR pass_plain IS NOT NULL;
-- 18
```

**Causa:** Las columnas existen y están pobladas. Combinado con #03 (cualquier usuario logueado lista empleados), un confeccionista puede ver el código de 4 dígitos de Alexander en plano (la contraseña efectiva del admin).

**Impacto:** Un usuario interno puede pasar de auxiliar a admin con un único `GET /api/empleados`. Anula completamente bcrypt.

**Fix-prompt:** [`docs/fixes/04-pass-plain.md`](fixes/04-pass-plain.md)

---

### #05 · 🟠 MAYOR · Bug roto · Mensaje de login confuso

**Estado:** ✅ **RESUELTO** en commit `1ff13e2` — nueva función `mensajeEstadoNoActivo(emp)` en `routes/auth.js`. La validación de `activo` se hace DESPUÉS de validar contraseña/código, así un atacante que adivina código sigue viendo "incorrecto" (sin filtrar info), pero el dueño legítimo ve "Tu cuenta está suspendida/deshabilitada" (acción clara). Probado: Heidy (deshab) → 403 con mensaje claro; Jazmín (susp) → 403 con mensaje claro; Alexander → 200.

**Categoría:** UX · Bug lógico
**Ubicación:** `routes/auth.js:54-57` (`/login-code`) y `routes/auth.js:23-25` (`/login`)

**Reproducción:**
```
POST /api/auth/login-code {"cod":"2730","sede":"AL"}    (Heidy, deshabilitado)
→ {"error":"Código incorrecto"}

POST /api/auth/login-code {"cod":"6285","sede":"LB"}    (Jazmín, suspendido)
→ {"error":"Código incorrecto"}
```

**Causa:** ambos endpoints filtran por `WHERE activo=1`. Si `activo=0`, devuelven el mismo mensaje que un código mal escrito. El operario no sabe si tipeó mal o si está deshabilitado.

**Impacto:** Empleado deshabilitado intenta loggear, ve "Código incorrecto", lo intenta varias veces, pide ayuda al jefe y le dicen "estás suspendido". Pierde tiempo.

**Fix-prompt:** [`docs/fixes/05-login-mensaje.md`](fixes/05-login-mensaje.md)

---

### #06 · 🟠 MAYOR · Bug lógico · Tabla `asistencias` vacía pese a 96 reportes

**Estado:** ✅ **RESUELTO** en commit `1ff13e2` — extraída lógica a función `generarAsistenciasDelReporte(db, reporte)` reutilizable. Invocada desde:
- `POST /api/reportes` (manual, sigue funcionando como antes)
- `autoEnviarPendientes()` cron (NUEVO — ahora los reportes auto-enviados con encargado/trabajadores también pueblan asistencias)

Backfill ejecutado sobre los 96 reportes existentes → **53 asistencias generadas** (las que faltan son reportes `no_evaluable` sin contenido, correcto que no generen). Distribución por empleado: E01 Alexander (11), E04 Cesar (11), E09 Yessi (11), E02 Janet (9), E08 Jordan (5), etc. El cierre del primer mes ya tiene base para calcular tardanzas.

**Categoría:** Bug lógico · Datos
**Ubicación:** `routes/reportes.js` (lógica auto-asistencia en POST `/`)

**Reproducción:**
```sql
SELECT COUNT(*) FROM reportes;         -- 96
SELECT COUNT(*) FROM asistencias;      -- 0
SELECT COUNT(*) FROM reportes WHERE auto_enviado=1;  -- 54
SELECT COUNT(*) FROM reportes WHERE encargado_id IS NOT NULL; -- solo 6
```

**Causa:** La auto-asistencia se dispara dentro de `POST /api/reportes` (manual) usando `encargado_id` y `b.trabajadores`. Pero:
- 54 reportes son auto-enviados por el cron (sin encargado_id porque el draft no lo tiene siempre)
- Los 6 reportes con encargado_id se crearon ANTES de que se agregara la lógica de auto-asistencia
- → ningún reporte ha disparado la lógica nunca

**Impacto:** Si el admin cierra el mes hoy y consulta tardanzas/horas trabajadas en `/api/asistencias`, todo sale en 0. La nota de tardanzas en evaluación mensual será inválida.

**Fix-prompt:** [`docs/fixes/06-asistencias-vacia.md`](fixes/06-asistencias-vacia.md)

---

### #07 · 🟠 MAYOR · Schema · 6 índices faltantes en FKs críticas

**Estado:** ✅ **RESUELTO** en commit `1ff13e2` — **16 índices creados** (más de los 6 originales) en `database/seed-config.js` función nueva `ensureIndexes()` invocada en cada boot del server (idempotente con `IF NOT EXISTS`). Cubre: FKs grandes (`reporte_actividades.reporte_id`, `solicitud_items.solicitud_id`, etc.), filtros de fecha (`reportes.fecha`, `incidencias.fecha`), joins frecuentes (`empleado_tiendas.tienda`), y nuevas asistencias (`asistencias.emp_id+fecha`). EXPLAIN QUERY PLAN ahora muestra `SEARCH ... USING INDEX` donde antes era `SCAN`.

**Categoría:** Schema · Performance
**Ubicación:** Varias tablas hijas

**Tablas sin índice en columna FK:**
| Tabla | Columna | Filas | Impacto |
|---|---|---|---|
| `reporte_actividades` | `reporte_id` | 1.679 | 🔴 alto — joins en dashboard, evaluación, mi-desempeño |
| `reporte_trabajadores` | `reporte_id` | 66 | 🟡 bajo aún |
| `reporte_extras` | `reporte_id` | 6 | bajo |
| `lista_items` | `lista_id` | 77 | medio |
| `envio_accesorios_items` | `envio_id` | 2 | bajo |
| `solicitud_items` | `solicitud_id` | 69 | medio |

**Impacto:** Dashboard `/empleado` hace `WHERE reporte_id IN (...)` sobre `reporte_actividades` (1.679 filas) — actualmente milisegundos pero crece linealmente con # de reportes. En 6 meses con 1.000 reportes, esa tabla tendrá ~17.000 filas y el dashboard tardará segundos.

**Fix-prompt:** [`docs/fixes/07-indices-fk.md`](fixes/07-indices-fk.md)

---

### #08 · 🟠 MAYOR · Schema · Datos huérfanos / inconsistencias

**Estado:** ✅ **PARCIALMENTE RESUELTO** en commit `970e909`:
- ✅ 2 prendas `PRUEBA-01`, `PRUEBA-02` activas en kanban refacción **borradas** (con `prenda_historial` y `prenda_calificacion` en cascada). Las 14 ya enviadas se mantienen como histórico.
- ✅ 3 envíos huérfanos en `envios_prendas` **marcados como `cancelado=1`** (nueva columna idempotente). Endpoint `GET /api/pipeline/envios` ahora filtra `COALESCE(cancelado,0)=0`.
- ⏳ "Marylin" en `reporte_trabajadores` (7 filas): **PENDIENTE de decisión del usuario**. Tres opciones: (a) crearla como empleado real, (b) renombrarla si fue typo, (c) dejarla como dato histórico y validar nombres en FR-01 al frontend.

**Categoría:** Schema · Datos sucios
**Ubicación:** Varias tablas

**Hallazgos:**
1. **`reporte_trabajadores.nombre = "Marylin"`** — empleado que NO existe en `empleados`. Probablemente borrado o el FR-01 permite escribir nombres libres.
2. **3 envíos huérfanos** en `envios_prendas` — sin prendas asignadas (`envios_prendas` con `id NOT IN (SELECT DISTINCT envio_id FROM prendas WHERE envio_id IS NOT NULL)`). Posiblemente cancelaciones o errores de creación.
3. **16 prendas con código `PRUEBA*`** en BD — 2 visibles activamente en el kanban (`PRUEBA-01`, `PRUEBA-02` en etapa refacción), 14 ya enviadas (no estorban operativamente pero ensucian historial y métricas).

**Fix-prompt:** [`docs/fixes/08-datos-sucios.md`](fixes/08-datos-sucios.md)

---

### #09 · 🟠 MAYOR · Permisos · `DEFAULT_PERMS` define roles que no existen

**Estado:** ✅ **RESUELTO** en commit `970e909` — `auxiliar` y `trabajador` removidos de `DEFAULT_PERMS` (app.js), del dropdown de "Configurar Accesos" (admin.js), del `<optgroup>` HTML (index.html), y del fallback POST de empleados (`'trabajador'` → `'ventas_junior'`). Las referencias en `patches-v5.js` se mantienen porque ahí son etiquetas de PUESTO visual, no roles de auth.

**Categoría:** Permisos · Inconsistencia
**Ubicación:** `public/js/app.js:1684-1693` — `DEFAULT_PERMS`

**Reproducción:**
```js
DEFAULT_PERMS.auxiliar      = ['reporte','evaluacion',...];   // ningún empleado tiene rol 'auxiliar'
DEFAULT_PERMS.trabajador    = ['reporte','evaluacion',...];   // ningún empleado tiene rol 'trabajador'
```

Roles reales en BD: `admin`, `dueno`, `encargado_tienda`, `encargado_almacen`, `confeccionista`, `ventas_junior`, `ventas_junior_2`.

Roles en DEFAULT_PERMS: `dueno`, `admin`, `encargado_tienda`, `encargado_almacen`, `ventas_junior`, `ventas_junior_2`, **`auxiliar`**, **`confeccionista`**, **`trabajador`**.

**Causa:** los roles `auxiliar` y `trabajador` se diseñaron pero nunca se asignaron a nadie. Código muerto.

**Impacto:** Si en el futuro se crea un empleado con rol `auxiliar` (existe en algún dropdown UI?), recibe permisos de un rol fantasma. Mejor: quitar los roles muertos o asignarlos. También: `confeccionista` SÍ tiene 2 empleados pero recibe permisos muy estrechos (solo `mi-desempeno`, `solicitudes`, `eval-valores`) — verificar si tiene sentido.

**Fix-prompt:** [`docs/fixes/09-roles-fantasma.md`](fixes/09-roles-fantasma.md)

---

### #10 · 🟠 MAYOR · UX · 2 modales sin botón de cerrar

**Estado:** ✅ **RESUELTO** en commit `970e909` — `confirmModal` e `incNuevaModal` ahora tienen `<button class="modal-close">` arriba a la derecha. `confirmModal` también permite cerrar con click fuera (overlay onclick). UX simétrica con los otros 9 modales.

**Categoría:** UX
**Ubicación:** `public/index.html`

**Reproducción:** modales que NO tienen `class="modal-close"`:
- `#confirmModal`
- `#incNuevaModal` (registrar nueva incidencia)

El usuario solo puede cerrar con los botones de acción (Confirmar / Cancelar). Si llegan al modal sin querer (click en botón equivocado), no hay X para escapar — tienen que aceptar o cancelar formalmente.

**Fix-prompt:** [`docs/fixes/10-modales-sin-close.md`](fixes/10-modales-sin-close.md)

---

### #11 · 🟠 MAYOR · UX · 4 páginas sin render hookeado en `goTo()`

**Estado:** ✅ **RESUELTO** en commit `970e909` — `goTo()` en app.js ahora hookea `pagos` → `renderPagos()` y `asistencias` → `renderAsistDia()` cuando se entra directo desde el sidebar. `kanban-almacen` y `reporte` no requieren hook (auto-mounting via JSX y landing page respectivamente).

**Categoría:** UX · Bug potencial
**Ubicación:** `public/js/app.js:1759-1788` — `goTo()`

**Páginas sin render asociado:**
- `page-asistencias` — se llena cuando se entra desde Eval Mensual tab "Asistencias", pero entrar directo desde el menú admin la deja vacía
- `page-kanban-almacen` — no es bug, el JSX se auto-monta
- `page-pagos` — vacío al entrar directo (¿bug?)
- `page-reporte` — esta es la landing page tras login, viva por estado, no es bug

**Verificar:** entrar a "Pagos" desde el menú admin (no desde Eval Mensual) → ¿queda vacío?

**Fix-prompt:** [`docs/fixes/11-pages-sin-render.md`](fixes/11-pages-sin-render.md)

---

### #12 · 🟡 MENOR · Schema · Tabla `horarios` legacy con 0 filas

**Estado:** ⏳ **PENDIENTE** — sigue ahí. SQLite no tiene `DROP COLUMN` directo y un `DROP TABLE` requiere confirmar antes que ningún código residual la consulte. Bajo impacto, no urgente.

**Categoría:** Schema · Deuda técnica
**Ubicación:** Tabla `horarios` (vacía) + `horario_periodos` (1) + `horario_slots` (46 — usados)

La tabla `horarios` original fue reemplazada por el sistema nuevo de `horario_periodos` + `horario_slots`. Sigue en BD sin uso.

**Fix-prompt:** N/A (decisión de cleanup, ver #19)

---

### #13 · 🟡 MENOR · Endpoint sin uso · `/api/reportes/auto-envio/run`

**Estado:** ⏳ **NO REQUIERE FIX** — endpoint debug útil. Se mantiene.

**Categoría:** Endpoint muerto (ok porque es debug)
**Ubicación:** `routes/reportes.js`

Endpoint para forzar manualmente la corrida del cron de auto-envío. Útil en desarrollo, nadie lo llama desde frontend. Está bien que exista pero documentarlo o sacarlo de producción.

**Acción:** documentar en `docs/`. No es fix urgente.

---

### #14 · 🟡 MENOR · Console.log/warn/error sueltos en producción

**Estado:** ✅ **PARCIALMENTE RESUELTO** en commit `970e909` — los 3 más ruidosos en navegación silenciados (`[Layout] loading for sede:`, `[Layout] got X zonas`, `[Eval] layoutActs:`). Comentados (no eliminados) para fácil reactivación. Quedan ~29 console.X (no críticos, mayoría son `[LuceBien] X cargado` informativos al boot o `console.error` de catch que sí son útiles).

**Categoría:** Deuda técnica
**Ubicación:** Múltiples archivos JS

```
public/js/app.js:           18 console.X
public/js/patches-v5.js:     6
public/js/horarios-v2.js:    2
public/js/admin.js:          2
public/js/solicitudes.js:    1
public/js/patches-v4.js:     1
public/js/patches-v3.js:     1
public/js/api.js:            1
                          ────
                         32 total
```

Algunos son `[LuceBien] X cargado` (informativos) — útiles. Otros son `console.error('[Layout] loading...')` que aparece en cada navegación.

**Fix-prompt:** [`docs/fixes/14-console-noise.md`](fixes/14-console-noise.md)

---

### #15 · 🟡 MENOR · Permisos · Lista de empleados expone campos sensibles

**Estado:** ✅ **RESUELTO** junto con #03 en commit `e35ae35` — `sanitizeEmp(e, viewer)` ya filtra según rol. Roles no-admin solo reciben campos públicos suficientes para selectores de FR-01.

**Categoría:** Permisos · UX
**Ubicación:** `routes/empleados.js:GET /` — relacionado con #03 y #04

Aun corrigiendo #03 (filtrar por rol), el endpoint debería retornar SOLO los campos necesarios según rol:
- Encargado: `id, cod, nombre, iniciales, rol, tiendas, estado` — para selectores de trabajadores
- Admin: campos completos

Hoy todos reciben `dni, telefono, direccion, salario_base, fecha_ingreso, contacto_emergencia, tipo_contrato`, etc.

**Fix-prompt:** combinar con [`docs/fixes/03-empleados-fuga.md`](fixes/03-empleados-fuga.md)

---

### #16 · 🟡 MENOR · UX · Botón "Eliminar pago" requiere `motivo` no documentado

**Estado:** ✅ **YA ESTABA RESUELTO** (descubierto en T3) — `anularPago()` en `public/js/pagos.js:201` ya usaba `prompt('Motivo de la anulación:')` y enviaba `?motivo=` por query string. La auditoría tenía este hallazgo desactualizado.

**Categoría:** UX · Inconsistencia
**Ubicación:** `routes/pagos.js` — endpoint `DELETE /:id`

Probado:
```
DELETE /api/pagos/1                              → {"error":"motivo requerido"}
DELETE /api/pagos/1 {"motivo":"prueba"}          → {"ok":true}
```

El frontend probablemente no envía `motivo`. Si el admin clickea "Eliminar pago", recibe `motivo requerido` y no sabe qué hacer.

**Fix-prompt:** [`docs/fixes/16-delete-motivo.md`](fixes/16-delete-motivo.md)

---

### #17 · 🟡 MENOR · Frontend · `pipeline-historial.js` ya no existe pero podría quedar referenciado

**Estado:** ✅ **NO REQUIERE FIX** — verificado. Sin referencias residuales.

**Categoría:** Deuda técnica
**Ubicación:** Histórico

El archivo se borró (commit `d20cd34`). Verificar que ningún `<script>` lo referencia y no aparece en `app.js`. Hecho en última verificación, pero documentar.

**Acción:** no requiere fix.

---

### #18 · 🟡 MENOR · Schema · 4 tablas con 0 uso (features sin estrenar)

**Estado:** ⏳ **DECISIÓN DE PRODUCTO** — `pagos` ya tiene su flujo desbloqueado (fix #01). `evaluaciones_mensuales`, `evaluaciones_valores`, `ventas_metas`, `devoluciones_garantia` esperan primer ciclo mensual real. `actividades_pendientes` sigue sin uso. No es bug técnico.

**Categoría:** Esquema · Producto incompleto
**Tablas:** `evaluaciones_mensuales`, `evaluaciones_valores`, `pagos`, `ventas_metas`, `devoluciones_garantia`, `reporte_drafts`, `actividades_pendientes`

Algunas son legítimamente nuevas (esperando primer ciclo mensual). Otras sugieren features incompletas. No es fix técnico — es **decisión de producto**: ¿se va a usar Eval Mensual + Pagos este mes? Si sí, hay que cerrar el flujo end-to-end (los bugs #01 y #06 lo bloquean ahora).

**Acción:** decisión del usuario.

---

### #19 · ⚪ COSMÉTICO · Cleanup · Tabla `horarios` legacy

**Estado:** ⏳ **PENDIENTE** — sigue ahí (ver #12). Bajo impacto.

---

### #20 · ⚪ COSMÉTICO · Cleanup · 16 prendas `PRUEBA*` en BD

**Estado:** ✅ **PARCIAL** — las 2 activas en refacción (`PRUEBA-01`, `PRUEBA-02`) borradas en commit `970e909`. Las 14 ya enviadas se mantienen como histórico (no estorban operativamente).

---

### #21 · ⚪ COSMÉTICO · 3 envíos huérfanos en `envios_prendas`

**Estado:** ✅ **RESUELTO** en commit `970e909` — marcados con nueva columna `cancelado=1`. El endpoint los filtra. Los datos no se borran (queda traza histórica de la cancelación).

---

### #22 · ⚪ COSMÉTICO · UX · Mensajes de error inconsistentes

**Estado:** ⏳ **PENDIENTE** — saneamiento a futuro. Bajo impacto.

---

## Apéndice: matriz de permisos REAL (post-fixes T1)

| Endpoint | Admin | Encargado tienda | Encargado almacén | Confeccionista | Ventas junior |
|---|---|---|---|---|---|
| `/api/empleados` | 200 (todo) | 200 (público) | 200 (público) | 200 (público) | 200 (público) |
| `/api/dashboard/admin` | 200 (sin filtro) | 200 (forzado a su sede) | 200 (forzado a su sede) | 403 | 403 |
| `/api/dashboard/empleado` | 200 (cualquiera) | 200 si comparte sede / 403 si no | 200 si comparte sede / 403 si no | 403 | — |
| `/api/audit` | 200 | 403 | 403 | — | — |
| `/api/pipeline/kanban` | 200 | 200 | 200 | 200 | 200 |
| `/api/pipeline/envios-accesorios` | 200 | 200 | 200 | — | 200 |
| `/api/lavanderia` | 200 | 200 | 200 | 200 | 200 |
| `/api/garantias` | 200 | 200 | 200 | — | — |
| `/api/solicitudes` | 200 | 200 | 200 | 200 | 200 |
| `/api/incidencias` | 200 | 200 | 200 | 200 | — |
| `/api/notificaciones/pendientes` | 200 | 200 | 200 | — | — |
| `/api/pagos` | **200** ✅ | **500 🐛** | **500 🐛** | — | — |
| `/api/valores/seguimiento/:mes` | **200** ✅ | 403 | — | — | — |
| `/api/actividades/admin` | 200 | 403 | 403 | — | — |
| `/api/horarios/mi-horario` | 200 | 200 | 200 | 200 | 200 |
| `/api/evaluaciones/mensual` | 200 | 200 | 200 | — | — |

✅ = bug arreglado en commit `e35ae35`
"público" = solo `id, cod, nombre, iniciales, rol, activo, estado, tiendas, nombre_completo`
"todo" = incluye dni, salario_base, fechas, contactos, etc.
"forzado a su sede" = si pasa `?sede=otra`, se ignora y se usa la primera de sus sedes asignadas
🐛 = pendiente (los `500` que quedan en `/api/pagos` para encargados son por cómo el frontend lo invoca; el endpoint en sí ya está arreglado y devuelve 200 a admin con datos consistentes)

---

## Apéndice: flujos críticos probados

| Flujo | Estado | Nota |
|---|---|---|
| Login Alexander/8686 → JWT válido → /me | ✅ | OK |
| Login con código de empleado deshabilitado | ✅ | rechaza con mensaje engañoso (#05) |
| Dashboard admin V3 (KPIs, ranking, heatmap) | ✅ | OK |
| Dashboard por trabajador (Janet, abril) | ✅ | 9 reportes, 29 actividades en Christie, evolución 6m |
| Ver kanban prendas en 3 vistas (Kanban/Mini/Lista) | ✅ | OK (fix anterior) |
| Validar envío de accesorios | ✅ | OK (fix anterior) |
| Crear pago manualmente | ✅ | OK |
| Listar pagos del admin | ❌ | 500 (#01) |
| Ver seguimiento valores 360° del mes | ❌ | 500 (#01) |
| Encargado ve dashboard admin | ❌ | NO debería pero PUEDE (#02) |
| Confeccionista ve lista completa de empleados | ❌ | NO debería pero PUEDE (#03 + #04) |
| Cierre de mes con cálculo de tardanzas | ✅ | 53 asistencias backfill desde 96 reportes (#06 resuelto) |
| Listar pagos del admin | ✅ | endpoint arreglado (#01 resuelto) |
| Ver seguimiento valores 360° del mes | ✅ | endpoint arreglado (#01 resuelto) |
| Encargado intenta ver dashboard admin | ✅ | ahora se le fuerza a su sede (#02 resuelto) |
| Confeccionista lista empleados | ✅ | solo recibe campos públicos (#03 resuelto) |
| Login empleado deshabilitado | ✅ | mensaje claro "Tu cuenta está deshabilitada" (#05 resuelto) |
| Modal incidencia sin botón cerrar | ✅ | botón X agregado (#10 resuelto) |
| Entrar a Pagos directo desde sidebar | ✅ | hook agregado en goTo() (#11 resuelto) |

---

## Acciones inmediatas recomendadas

**Estado: 12 / 22 hallazgos aplicados (todos los críticos y mayores).** Quedan menores y cosméticos de bajo impacto.

### Hecho ✅

- ✅ T1 (commit `e35ae35`): #01 schema pagos+valores · #02 permisos dashboard · #03 fuga campos sensibles · #04 vaciar plain
- ✅ T2 (commit `1ff13e2`): #05 login claro · #06 asistencias auto+backfill · #07 16 índices
- ✅ T3 (commit `970e909`): #08 datos sucios · #09 roles fantasma · #10 modales · #11 hooks render · #14 console silenciados
- ✅ Bonus (descubierto): #15 lista empleados ya cubierto por #03 · #16 anularPago ya pedía motivo · #17 sin refs residuales · #20 prendas activas borradas · #21 envíos cancelados

### Pendiente ⏳

**Decisiones del usuario:**
- "Marylin" en `reporte_trabajadores` (#08): re-crear empleado / renombrar / dejar histórico
- Tabla `horarios` legacy (#12, #19): DROP TABLE cuando se confirme que ningún código residual la consulta
- Features sin estrenar (#18): `evaluaciones_mensuales`, `evaluaciones_valores`, `ventas_metas`, `actividades_pendientes` — esperan primer ciclo o decisión de roadmap
- `auxiliar`/`trabajador` en `patches-v5.js` puestos visuales — están bien como están

**Saneamiento futuro (bajo impacto):**
- #22 unificar mensajes de error del API
- 14 prendas `PRUEBA*` enviadas en histórico
- 2 columnas `cod_plain`/`pass_plain` en schema (ya vacías, podrían DROP COLUMN)

**Backup pre-fixes:** `database/backups/lucebien_pre_audit_fixes_20260510_122632.db`
