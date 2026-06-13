# Mapa del Sistema Actual — SCI-LB (LuceBien ERP interno)

> **Propósito:** retrato fiel del ERP interno tal como existe hoy, para guiar la migración a
> la plataforma unificada (Next.js + Supabase). Es el entregable "análisis del sistema anterior"
> de la Semana 1.
>
> **Fuente:** derivado de la lectura del código (`server.js`, `middleware/`, `routes/`,
> `public/js/`). NO se inspeccionó la BD viva. **Fecha:** 2026-06-08 · rama `feat/w1-analisis`.

---

## 1. Stack confirmado

- **Backend:** Node.js + Express 4 (`server.js`). Banner interno: **"LUCEBIEN v5.4"**.
  Escucha en `0.0.0.0:${PORT||3000}`.
- **Persistencia:** **better-sqlite3** (acceso síncrono vía `getDB()` de `database/db.js`).
- **Auth:** JWT (`jsonwebtoken`, HS256) + `bcryptjs`. Secret con **fallback hardcoded** en cada
  route file: `process.env.JWT_SECRET || 'lucebien-secret-2026-...'` → **deuda de seguridad**
  (se resuelve con Supabase Auth en la migración).
- **Frontend:** un único `public/index.html` (~2040 líneas) + JS vanilla imperativo (`innerHTML`).
  **Un solo componente React** (`almacen-kanban.jsx`) transpilado en el navegador con
  `@babel/standalone` (`<script type="text/babel">`). El resto NO usa React.
- **Servido por:** `express.static('public')` con `Cache-Control: no-store`. Catch-all
  `GET *` devuelve `index.html` (SPA-like). Cache-busting manual con `?v=...` en los `<script>`.

---

## 2. Arranque (`server.js`)

**Middlewares globales (en orden):**
`cors()` → `express.json()` → `express.static('public', no-cache)` → **middleware de auditoría**
sobre `/api` (intercepta `res.json` y registra todo `POST/PUT/DELETE` con respuesta 2xx en la
tabla `audit_log`; decodifica el JWT sin bloquear).

**Init de BD:** `initDB()` → `seed-config` (`ensureTables`, `seedConfig`, `ensureAsistencias`,
`ensureColumnasExtra`, `ensureIndexes`).

**Tareas programadas (`setInterval`):**

| Tarea | Frecuencia | Detalle |
|---|---|---|
| Auto-envío de reportes FR-01 | cada 5 min | `reportes.autoEnviarPendientes()`; valida deadlines (turno M ≥ 15:00, T/C ≥ 23:00) |
| Backup automático de BD | scheduler propio | `_backup-bd.iniciarSchedulerBackup(getDB)` |
| SSE heartbeat del pipeline | cada 25 s | `ssePing` (definido dentro de `routes/pipeline.js`) |

**Endpoints en el propio `server.js`:**
- `GET /api/audit` — log de auditoría con filtros (fecha, sede, usuario, módulo, rango, limit). Solo `admin`/`dueno`.
- `GET /api/audit/stats` — totales del día por módulo/usuario/sede. Solo `admin`/`dueno`.
- `GET /api/test` — healthcheck `{ok:true}`.
- `ALL /api/*` → 404 JSON · `GET *` → sirve `index.html`.

---

## 3. Autenticación y roles (`middleware/auth.js`)

> ⚠️ **Hallazgo:** el login real es por **NOMBRE + contraseña + sede** (`POST /api/auth/login`),
> NO por código de 4 dígitos. El `cod` solo se usa en operaciones internas y en el alias
> `POST /api/auth/login-code` (usado por el kanban de almacén). Esto matiza la pregunta P5.

- `verifyToken(req,res,next)` — exige `Authorization: Bearer <jwt>`; setea `req.user`. 401 si falta/inválido.
- `requireAdmin` — `verifyToken` + `rol ∈ {admin, dueno}`. 403 si no.
- **JWT payload:** `{id, cod, nombre, iniciales, rol, tiendas[], sede}`, `expiresIn: 12h`.

**Roles descentralizados (cada módulo reimplementa lo suyo):**
- `admin` / `dueno` = acceso total.
- `esSupervisor(u)` = `admin | dueno | encargado_almacen | encargado_tienda` (en pipeline solo `encargado_almacen`).
- `sedesPermitidas(u)` (helper clave de dashboard): admin → `null` (sin filtro); encargado → `u.tiendas` o `[u.sede]`. Fuerza a encargados a ver solo sus sedes.

> Deuda: la mitad de los módulos importa `middleware/auth.js`; la otra mitad **redefine `auth`/`admin`
> inline** con el mismo secret hardcoded. No hay una única fuente de verdad de roles. → candidato a
> `packages/core/permisos` en la migración.

---

## 4. Módulos backend (`routes/`) — 20 módulos

Montaje vía `app.use('/api/<x>', require('./routes/<x>'))`.

### `/api/auth` — Autenticación
Tablas: `empleados`, `empleado_tiendas`.
- `POST /login` — login nombre+password+sede (bcrypt contra `password_hash`, fallback `cod_hash`).
- `POST /login-code` — login solo por código (kanban de almacén).
- `GET /me` — refresca info del usuario (verifyToken).

### `/api/empleados` — Colaboradores + desempeño
Tablas: `empleados`, `empleado_tiendas`, `reportes`, `reporte_trabajadores`, `reporte_actividades`,
`evaluaciones_mensuales`, `incidencias`, `pipeline_puntos`, `reporte_extras`, `horarios`.
- `GET /` (sanitizado) · `GET /by-sede/:sede` (`{propios, otros}`) · `GET /:id/desempeno` ·
  `GET /:id/checklists` · `GET /:id/checklists2` (insumo Evaluación Mensual).
- `POST /` (admin) · `PUT /:id` (admin; **cascade de rename** a 6 tablas pseudo-FK en transacción) ·
  `PUT /:id/estado` (admin) · `DELETE /:id` (admin; soft delete).
- Patrón: `sanitizeEmp()` borra `cod_hash/password_hash/cod_plain/pass_plain` y oculta datos
  personales a no-admin. `ensureEmpCols()` agrega columnas idempotentemente.

### `/api/reportes` — Reportes diarios FR-01
Tablas: `reportes`, `reporte_trabajadores`, `reporte_actividades`, `reporte_extras`,
`reporte_drafts`, `incidencias`, `incidencia_tipos`, `asistencias`, `empleados`.
- `GET /` · `GET /alertas/:sede` · `POST /` (id `DD-MM-YY_TURNO-SEDE`; genera incidencias y auto-asistencias) ·
  `GET /:id/detalle` (defensa cross-sede) · `PUT /:id/evaluar` (impide autoevaluarse) ·
  `DELETE /:id/anular` (admin) · `DELETE /:id/anular-eval` (admin).
- Drafts: `GET|POST|DELETE /drafts/...` (PK `sede,fecha,turno`).
- `POST /permitir-reenvio` (admin) · `POST /auto-envio/run` (admin, debug).
- Exporta `autoEnviarPendientes()` (consumido por el cron).

### `/api/lavanderia` — Envío tienda→lavandería
Tablas: `listas_lavanderia`, `lista_items`, `lista_counters`, `prendas`, `prenda_historial`.
- `GET /` · `POST /` (crea lista + items y **auto-inserta prendas al pipeline**) ·
  `PUT /:id/estado` · `PUT /:id/validar`.

### `/api/evaluaciones` — Evaluación mensual + pesos
Tablas: `evaluaciones_mensuales`, `config` (`peso_*`), `reportes`, `reporte_actividades`,
`horario_slots`, `horario_periodos`, `asistencias`, `incidencias`, `ventas`, `evaluaciones_valores`, `empleados`.
- `GET|POST /mensual` (POST admin) · `GET|PUT /pesos` (PUT admin) ·
  `GET /ciclo-actual?emp_id=` (ciclo por aniversario de `fecha_ingreso`) ·
  `GET /calcular?...` (autopuebla notas ops/sw/limpieza/tardanza/cumplimiento/bonus/valores).
- Mapeo de categorías: `IND`→limpieza, `AS/BS`→software, `AT/BT`→operaciones, `EXT`→ignora.

### `/api/incidencias` — Incidencias + catálogo
Tablas: `incidencias`, `incidencia_tipos`.
- `GET /` · `POST /` (auto-registra reportante; puntos del catálogo o por nivel) ·
  `DELETE /:id` (admin) · `GET /tipos/list` · `PUT /tipos/list` (admin).
- Seed automático de ~21 tipos al primer arranque.

### `/api/valores` — Evaluación de Valores 360 (peer review)
Tablas: `evaluaciones_valores`, `config` (`eval_valores_*`), `empleados`, `empleado_tiendas`.
- `GET|PUT /config` (PUT admin) · `GET /pendientes/:mes` · `GET /resumen/:emp_id/:mes` (admin) ·
  `POST /` (impide autoevaluarse) · `GET /mis-pendientes/:mes` · `GET /mi-resumen/:mes` ·
  `GET /seguimiento/:mes` (admin).
- 6 valores: integridad, respeto, honestidad, amabilidad, relacion, actitud (escala /5 → nota /20).

### `/api/actividades` — Catálogo por sede + pendientes
Tablas: `actividades_config`, `actividades_pendientes`.
- `GET /?sede=&fecha=&turno=` (aplica lógica de frecuencia) · `GET /admin` (admin) ·
  `POST|PUT|DELETE` (admin; PUT NO toca `sede`) · `POST /duplicar` · `POST /sync-sedes` ·
  `POST /pendiente` · `POST /resolver` · `GET /pendientes`.

### `/api/prestamos` — Préstamos de prendas por lote + bajas
Tablas: `prestamos_lotes`, `prestamo_items`, `prendas_baja`.
- `GET /bajas/list` · `PUT /bajas/:id/procesar` (admin/encargado_almacen) ·
  `PUT /item/:itemId/estado` (vendida/perdida → `prendas_baja`) · `GET /` · `POST /` · `GET /:id`.

### `/api/garantias` — Devoluciones de garantía Yape
Tabla: `devoluciones_garantia`.
- `GET /` · `GET /resumen` · `POST /` · `PUT /:id` (marca devuelto).

### `/api/pipeline` — Núcleo de lavandería (kanban 9 pasos) + puntos + SSE
Tablas: `prendas`, `prenda_historial`, `pipeline_puntos`, `config`, `envios_prendas`,
`prenda_calificacion`, `accesorios_log`, `envios_accesorios`, `envio_accesorios_items`,
`listas_lavanderia`, `lista_items`.
- `GET /stream` — **SSE** (token por query; broadcast de eventos).
- Lecturas: `GET / /kanban /stats /:id/historial /envios /accesorios /ranking /bitacora /diario /mi-avance /config-puntos`.
- `PUT /config-puntos` (pesos en `config`).
- `POST / /batch /registrar-local` (registrar prendas).
- `PUT /:id/avanzar /deshacer /rechazar` (asigna/descuenta puntos; **½ punto** para piezas no-terno).
- `POST /enviar` (solo prendas en `listo`) · `PUT /envios/:id/calificar` (defensa cross-sede).
- `POST /:id/dividir` (terno → saco+pantalón; marca `dividida=1`, no DELETE).
- `GET /historial` (solo supervisor) · `GET /lista/:id/trazabilidad` · `*/envios-accesorios[...]`.
- Patrón: `actor(q)` extrae identidad del JWT y previene suplantación; `broadcast()` emite por SSE en cada escritura.

### `/api/notificaciones` — Campana del header
Tablas: `solicitudes`, `prendas`, `envios_prendas`, `envios_accesorios`, `config`, `empleados`,
`evaluaciones_valores`, `incidencias`, `reportes`.
- `GET /pendientes` → `{mis, sistema, total_mis, total_sistema}` (`sistema` solo si supervisor).

### `/api/dashboard` — Agregaciones
Tablas: casi todas.
- `GET /admin?sede=` — KPIs + alertas + estado pipeline + próximas evaluaciones + salud del sistema +
  tendencia 7d + resumen por sede (supervisor; sede forzada a las permitidas).
- `GET /empleado?...` — dashboard personal: matriz Christie [actividad×día], heatmap, evolución 6 meses.

### `/api/pagos` — Cierre evaluación→pago
Tablas: `pagos`, `empleados`, `empleado_tiendas`, `evaluaciones_mensuales`.
- `GET /` · `GET /sugerir?...` (`salario_base × nota/20 + bonus − descuentos`) · `GET /:id` ·
  `POST /` (admin) · `PUT /:id` (admin) · `DELETE /:id` (admin; soft) ·
  `GET /:id/comprobante` (**HTML imprimible** A4 navy/gold).

### `/api/solicitudes` — Pedidos tienda→almacén (BPMN)
Tablas: `solicitudes`, `solicitud_items`.
- `GET /` · `POST /` · `PUT /:id/aprobar /entregar /rechazar` (admin/dueno/encargado_almacen) ·
  `PUT /:id/confirmar` · `PUT /:id/deshacer` · `PUT /:id/marcar-impreso`.
- Estados: pendiente→aprobada→entregada→confirmada (+ rechazada).

### `/api/layout` — Mapa de zonas físicas por sede
Tabla: `layout_zonas`.
- `GET /?sede=` (**sin auth** — los workers lo necesitan) · `PUT /bulk` (admin) ·
  `POST /zona` · `DELETE /zona/:id` (admin).

### `/api/config` — Clave/valor global + permisos + puestos + grupos
Tabla: `config`.
- `GET|PUT /` (PUT admin/dueno) · `GET|PUT /permisos` · `GET|PUT /puestos` · `GET|PUT /grupos-rangos` ·
  `GET|PUT /layout-tooltips` · `GET|PUT /eval-pesos`.

### `/api/ventas` — Metas de venta + bonos
Tablas: `ventas_metas`, `empleados`, `config`, `prenda_historial`, `prendas`.
- `GET /` · `POST /` (admin; bonus por % cumplimiento) · `GET /bonus/:emp_id/:mes` ·
  `GET /pipeline-bonus/:emp_id/:mes` (bonificación monetaria por puntos de pipeline).

### `/api/asistencias` — Asistencia diaria + horarios legacy
Tablas: `asistencias`, `empleados`, `empleado_tiendas`, `horarios`, `config`.
- `GET /del-dia?fecha=&sede=` · `GET /` · `GET /resumen?emp_id=`
  (`notaTardanza = max(0, 20 − floor(min/15))`) · `POST / /bulk` (admin) · `DELETE /:id` (admin) ·
  `GET|PUT /horarios/:emp_id` · `POST /horarios/bulk` (horario plano legacy, tabla `horarios`).

### `/api/horarios` — Horarios v2 versionados (periodos + slots)
Tablas: `horario_periodos`, `horario_slots`, `empleados`.
- Lecturas: `GET /periodos /periodos/:id /vigente /mi-horario /empleado/:id /del-dia /encargado /horas-mes`.
- `POST|PUT|DELETE /periodos[...]` (admin) + `/activar` + `/duplicar` ·
  `POST /periodos/:id/slots /slots/bulk`, `PUT|DELETE /slots/:id` (admin).
- Exporta `router.helpers` (`getPeriodoVigente`, `getSlotsDelDia`, `getEncargadoTurno`,
  `getHorasMensuales`). **Coexiste** con la tabla plana legacy `horarios` de `asistencias.js`.

---

## 5. Frontend (`public/js/`)

Orden de carga real (de `index.html`):
`api.js → data.js → app.js → layout-map.js → admin.js → pagos.js → asistencia-dia.js →
header.js → patches-v3/v4/v5 → horarios-v2.js → reportes-autoenvio.js → modulos.js →
pipeline-envios.js → solicitudes.js`. Aparte: `@babel/standalone` + `almacen-kanban.jsx`.

| Archivo | Qué es |
|---|---|
| `api.js` | Cliente HTTP central (`API.get/post/put/del`); JWT en localStorage, 401→logout, toasts. |
| `data.js` | Constantes del frontend: `SEDES`, `hoyLocal()`/`mesLocal()`, catálogo de actividades. |
| `app.js` | Bootstrap de la SPA: pantalla de sede, login, `STATE` global, navegación. |
| `admin.js` | Panel admin: dashboard, contadores, evaluación mensual, colaboradores, config (el más grande). |
| `almacen-kanban.jsx` | **Único componente React**: kanban "Prendas Recibidas" (9 etapas, login por código, SSE). |
| `pipeline-envios.js` | Vista "Envíos Recibidos" en tienda + modal de calificación. |
| `pagos.js` | UI de Pagos: lista, KPIs, modal registro/edición, comprobante. |
| `asistencia-dia.js` | "Asistencia Diaria": marcar presentes, ajustar hora/tardanza, justificar. |
| `horarios-v2.js` | Horarios v2: parser de Excel (XLSX), importación, "Mi Horario", grilla imprimible. |
| `layout-map.js` | Renderizador del mapa de zonas físicas + tooltips. |
| `header.js` | Header fijo: reloj, campana de notificaciones, menú de usuario, badges. |
| `modulos.js` | UI de Préstamos por lote + Garantías Yape. |
| `solicitudes.js` | UI de Solicitudes (BPMN, undo, impresión, drafts). |
| `reportes-autoenvio.js` | FR-01: lock por encargado, autosave 45 s, alertas de deadline, pre-fill desde horario. |
| `patches-v3.js` `patches-v4.js` `patches-v5.js` | ⛔ **NO TOCAR** — parches acumulados de alto riesgo (confirmado que existen). |

---

## 6. Patrones globales y deuda técnica

- **Manejo de errores:** casi todo handler en `try{...}catch(e){res.status(500).json({error:e.message})}`.
  Pipeline usa wrapper `safe(fn)`. Algunos GET devuelven defaults vacíos en catch en vez de 500.
- **Auth descentralizada:** sin fuente única de verdad de roles; JWT_SECRET hardcoded repetido.
- **Migraciones en runtime:** cada módulo corre IIFEs de migración al cargar
  (`try{db.exec('ALTER...')}catch{}` + `CREATE ... IF NOT EXISTS` + seeds). No hay sistema formal de migraciones.
- **Pseudo-FK por nombre TEXT:** 7 relaciones (ver `docs/schema-actual.md`); el cascade rename de
  `PUT /empleados/:id` las mantiene sincronizadas.
- **SQLite DQS:** literales string SIEMPRE con comillas simples; flags con `COALESCE(...,0)=0`;
  fechas locales calculadas en JS (no `toISOString`) para evitar el corrimiento UTC-5.
- **Sin validación de esquema (Zod/Joi):** validación manual ad-hoc; whitelist solo en `empleados`.
- **SSE solo en pipeline;** el resto es polling/recarga manual.

> Estos patrones definen qué portar al `core` (lógica de puntos, permisos, evaluación) y qué dejar
> atrás (auth hardcoded, migraciones runtime, JS imperativo). Ver `docs/arquitectura-core-adapter.md`.
