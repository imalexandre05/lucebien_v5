# Auditoría del pipeline de prendas — LUCEBIEN SCI

**Fecha inicial:** 2026-04-28
**Última actualización:** 2026-04-29 — incorpora fixes de las branches `fix/pipeline-quick-wins` y `feat/pipeline-sse-y-fixes`.
**Alcance:** flujo end-to-end de prendas y accesorios desde la entrada al almacén hasta la calificación en tienda. Auditoría a ciegas — no se reportaron incidentes previos por el usuario; el objetivo es detectar "cosas al aire" (código muerto, endpoints sin consumidor, inconsistencias, riesgos) y dejar un mapa íntegro del subsistema.

> **Estado actual de los hallazgos:** ver tabla resumen al final ("8. Estado actualizado").

---

## 1. Resumen ejecutivo

El subsistema funciona y está en producción con datos reales. La estructura de datos es coherente y la trazabilidad por `prenda_historial` permite reconstruir cualquier movimiento. Sin embargo, hay **3 áreas críticas** que conviene resolver:

1. **Código muerto considerable** — la página `page-pipeline` y ~210 líneas de `pipeline-ui.js` son una versión legacy del kanban que fue reemplazada por el componente React, pero quedaron cableadas al routing aunque ningún `nav-item` las invoca. Esto confunde mantenimiento y duplica la superficie de bugs.
2. **El flujo "rechazar en tienda" no respeta etapa de retorno** — el modal `calEnvio` solo manda `aceptada/obs`, así que toda prenda observada vuelve a `recepcion` aunque el bug haya sido en `planchado`. Operacionalmente esto obliga a re-trabajar todas las etapas, no solo la fallida.
3. **Riesgo de seguridad en autoría de puntos** — el endpoint `PUT /pipeline/:id/avanzar` acepta `cod_responsable` desde el body sin validarlo contra el JWT. Un operario que conoce el código de otro puede atribuirle puntos (positivos o negativos vía rechazos). El JWT se valida, pero el `cod` que termina en `pipeline_puntos` viene del body. Para contexto de PC compartida con varios operarios, conviene endurecerlo.

Más allá de eso, hay 20+ hallazgos de menor criticidad listados en la sección 6, ordenados por severidad y esfuerzo.

---

## 2. Diagrama del flujo end-to-end

```
                  ┌────────────────────────────────────────┐
                  │            ENTRADA AL PIPELINE         │
                  └────────────────────────────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
       ┌──────────────┐   ┌──────────────────┐  ┌──────────────────┐
       │ Lista        │   │ POST /pipeline/  │  │ POST /pipeline/  │
       │ lavandería   │   │ registrar-local  │  │ (raíz, batch)    │
       │ (tienda → AL)│   │ (almacén)        │  │ ⚠ sin consumidor │
       └──────┬───────┘   └────────┬─────────┘  └──────────────────┘
              │                    │
              ▼                    ▼
        ┌─────────────────────────────────┐
        │       prendas (etapa)           │
        │  recepcion → lavado → empatado  │
        │  → refaccion ↘                  │
        │              compostura         │
        │              ↓                  │
        │  → planchado → control_calidad  │
        │  → listo                        │
        │                                 │
        │  Encargado/admin: puede entrar  │
        │  a codificacion desde recepcion │
        │  empatado o refaccion.          │
        └─────────────────────────────────┘
              │  PUT /pipeline/:id/avanzar
              │  PUT /pipeline/:id/rechazar
              │  POST /pipeline/:id/dividir
              │  PUT /pipeline/:id/deshacer (5 seg)
              ▼
        ┌─────────────────────────────────┐
        │            etapa='listo'        │
        └────────────────┬────────────────┘
                         │  POST /pipeline/enviar
                         ▼
        ┌─────────────────────────────────┐
        │  envios_prendas (almacén → ST)  │
        │  prendas.etapa='enviado'        │
        │  prendas.envio_id=N             │
        └────────────────┬────────────────┘
                         │  GET /pipeline/envios?sede_destino=
                         ▼
        ┌─────────────────────────────────┐
        │     TIENDA — califica envío     │
        │  PUT /pipeline/envios/:id/      │
        │           calificar             │
        │  → prenda_calificacion          │
        │  → si !aceptada: vuelve a       │
        │    'recepcion' (siempre)        │
        └─────────────────────────────────┘
```

**Flujo paralelo: accesorios**

```
   Lista lavandería (tienda → AL)        Origen local con sustento
             │                                       │
             ▼                                       ▼
   POST /pipeline/accesorios            POST /pipeline/accesorios-extra
   (valida balance disponible)          (queda 'pendiente_aprobacion')
             │                                       │
             ▼                                       ▼
        accesorios_log                  GET /pipeline/aprobaciones-locales
                                        PUT .../aprobar  → +pts
                                        PUT .../rechazar → 0 pts
                                                 │
             ┌───────────────────────────────────┘
             ▼
   POST /pipeline/envios-accesorios
   → envios_accesorios + envio_accesorios_items
             │
             ▼
   PUT /pipeline/envios-accesorios/:id/validar (tienda)
```

---

## 3. Inventario de endpoints (`routes/pipeline.js`, 879 líneas)

| Método | Ruta | Auth | Consumidor frontend | Estado |
|---|---|---|---|---|
| GET | `/` | público | — | **huérfano** (solo backend tools) |
| GET | `/kanban` | público | `almacen-kanban.jsx` (cada 5 s) | activo |
| GET | `/stats` | público | `pipeline-ui.js` (legacy) | **muerto** |
| GET | `/:id/historial` | público | — | huérfano |
| GET | `/envios` | público | `pipeline-ui.js`, modal calEnvio | activo |
| GET | `/accesorios` | público | — | **huérfano** |
| GET | `/ranking` | público | `admin.js` + JSX (métricas) | activo |
| GET | `/bitacora` | público | JSX (métricas) | activo |
| GET | `/config-puntos` | público | JSX (config) | activo |
| PUT | `/config-puntos` | auth | JSX (config) | activo |
| POST | `/` | auth | — | **muerto** (lo invocaba `pipeline-ui.js` legacy) |
| POST | `/batch` | auth | — | **muerto** |
| PUT | `/:id/avanzar` | auth | JSX | activo |
| PUT | `/:id/deshacer` | auth | JSX (toast undo) | activo |
| PUT | `/:id/rechazar` | auth | JSX | activo |
| POST | `/enviar` | auth | JSX, `pipeline-ui.js` (legacy) | activo |
| PUT | `/envios/:id/calificar` | auth | `pipeline-ui.js` (Tienda) | activo |
| POST | `/accesorios` | auth | JSX | activo |
| GET | `/accesorios/balance` | público | JSX (cada 5 s) | activo |
| POST | `/:id/dividir` | auth | JSX | activo |
| GET | `/diario` | público | JSX (admin diario) | activo |
| POST | `/registrar-local` | auth | JSX | activo |
| POST | `/accesorios-extra` | auth | JSX | activo |
| GET | `/aprobaciones-locales` | auth | JSX (badge cada 30 s) | activo |
| PUT | `/aprobaciones-locales/:id/aprobar` | auth | JSX | activo |
| PUT | `/aprobaciones-locales/:id/rechazar` | auth | JSX | activo |
| GET | `/mi-avance` | público | JSX (header pts hoy) | activo |
| GET | `/metricas/operarios` | público | JSX (métricas) | activo |
| GET | `/metricas/productividad` | público | JSX (métricas) | activo |
| GET | `/metricas/rechazos` | público | JSX (métricas) | activo |
| GET | `/metricas/tiempo-etapa` | público | JSX (métricas) | activo |
| GET | `/pts-mes/:cod` | público | (¿`mi-desempeno`?) | revisar |
| GET | `/historial` | auth | JSX (tab historial) | activo |
| GET | `/lista/:id/trazabilidad` | auth | (¿lavandería?) | revisar |
| POST | `/envios-accesorios` | auth | JSX | activo |
| GET | `/envios-accesorios` | auth | JSX | activo |
| PUT | `/envios-accesorios/:id/validar` | auth | (Tienda) | revisar |

**Endpoints sin consumidor frontend confirmado: 5** (filas marcadas como muerto/huérfano arriba).

---

## 4. Tablas de BD involucradas

| Tabla | Filas (estimado) | Índices | Notas |
|---|---|---|---|
| `prendas` | núcleo | sin índice en `etapa` ni `envio_id` | la consulta de kanban escanea siempre `WHERE etapa!='enviado'` |
| `prenda_historial` | 1:N por prenda | `idx_prenda_hist_fecha`, `idx_prenda_hist_resp` | falta índice en `prenda_id` (queries por prenda) |
| `envios_prendas` | 1 por envío | sin índices | filtro por `sede_destino` sin índice |
| `prenda_calificacion` | 1 por prenda calificada | sin índices | FK a `prendas` pero al dividir terno la prenda original se borra → registros huérfanos |
| `accesorios_log` | núcleo accesorios | `idx_acc_log_fecha` | columnas añadidas vía ALTER (sustento, origen, estado_aprobacion, responsable_cod) |
| `envios_accesorios` + `envio_accesorios_items` | 1:N | sin índices | flujo paralelo de prendas |
| `pipeline_puntos` | 1 por movimiento puntuable | sin índices documentados | usa `emp_cod` directo del body |
| `listas_lavanderia` + `lista_items` | 1:N | — | fuente legacy de prendas |

---

## 5. Auditoría de "cosas al aire"

### 5.1 Código muerto

| # | Archivo / línea | Qué es | Acción recomendada |
|---|---|---|---|
| C1 | `public/index.html` 1397-1416 | `<div id="page-pipeline">` con kanban+tabla+envíos antiguos | **Eliminar** (PR 2 de la planificación) |
| C2 | `public/index.html` 1418-1447 | `pipeIngresoModal` y `envioModal` legacy | **Eliminar** |
| C3 | `public/js/pipeline-ui.js` 1-209 | `renderPipeline*`, `togglePipelineView`, `abrirIngresoPipeline`, `prepararEnvio`, `ingresarPrendaPipeline`, `ejecutarEnvio`, `getAvanzarBtns`, constantes `ETAPA_COLORS`/`ETAPA_ICONS`/`TIPO_LAV_BADGE` | **Eliminar** y renombrar el archivo a `pipeline-envios.js` (solo queda lógica de Tienda) |
| C4 | `public/js/app.js` 1712 | `if(pageId==='pipeline')renderPipeline()` | **Eliminar** rama del switch |
| C5 | `routes/pipeline.js` 132 (`GET /`) | listar prendas con filtros | sin consumidor — confirmar con admin si conviene removerlo o mantenerlo como API |
| C6 | `routes/pipeline.js` 148 (`GET /stats`) | conteos por etapa | redundante con `/kanban` que también devuelve `stats`. Eliminar |
| C7 | `routes/pipeline.js` 154 (`GET /accesorios`) | lista plana de `accesorios_log` | sin consumidor — el frontend usa `/historial` con filtros. Eliminar |
| C8 | `routes/pipeline.js` 186 (`POST /`) | crear prenda individual | era usado por `pipeIngresoModal` (legacy). Eliminar |
| C9 | `routes/pipeline.js` 193 (`POST /batch`) | crear prendas en lote | sin consumidor frontend. Eliminar o documentar como API admin |
| C10 | `routes/pipeline.js` 150 (`GET /:id/historial`) | historial por prenda | no se invoca desde UI; útil como API. Mantener pero documentar |

### 5.2 Bugs e inconsistencias funcionales

| # | Severidad | Hallazgo | Ubicación | Detalle |
|---|---|---|---|---|
| B1 | **Alta** | Calificación siempre regresa a `recepcion` | `routes/pipeline.js:293` | El modal `calEnvio` no manda `etapa_destino`, así que `c.etapa_destino \|\| 'recepcion'` siempre es `recepcion`. Una prenda que falló en planchado vuelve a empezar todo el proceso |
| B2 | Media | `POST /enviar` no informa prendas no enviadas | `routes/pipeline.js:272-282` | El `UPDATE ... WHERE id=? AND etapa='listo'` se salta prendas que no estén listas. El backend responde `ok:true, count: N` con el count del cliente, no con las realmente enviadas |
| B3 | **Alta** (seguridad) | `cod_responsable` en body sin validar | `routes/pipeline.js:217-218,231` | El JWT identifica al usuario, pero `b.cod_operario` viene del body y se acepta a ciegas. Operario A puede atribuir puntos al código de B (positivo o negativo vía rechazo) |
| B4 | Media | `Deshacer` puede borrar puntos del operario equivocado | `routes/pipeline.js:244` | `DELETE FROM pipeline_puntos WHERE id=(SELECT MAX(id) ... AND emp_cod=?)`. Si dos operarios trabajaron secuencialmente la misma prenda, el deshacer puede aplicar al equivocado |
| B5 | Media | `Dividir terno` deja datos huérfanos | `routes/pipeline.js:347-363` | `DELETE FROM prendas WHERE id=?` pero `prenda_historial`, `prenda_calificacion` y `pipeline_puntos` siguen referenciando ese ID. JOINs futuros caen a NULL |
| B6 | Baja | Historial no guarda `cod_responsable` | `routes/pipeline.js:225,242,254,295` | Solo `responsable` (nombre). Dos empleados con mismo nombre se mezclan en métricas |
| B7 | Media (seguridad) | `PUT /envios/:id/calificar` no valida sede | `routes/pipeline.js:285` | Cualquier usuario auth puede calificar cualquier envío. Falta `if(envio.sede_destino !== q.user.sede && !esSupervisor) return 403` |
| B8 | Baja | `GET /envios` sin filtro de tiempo | `routes/pipeline.js:152` | LIMIT 50 sin filtro por `validado_tienda`. Si los últimos 50 ya están todos validados, los pendientes no salen en la respuesta |
| B9 | Baja | `INSERT INTO prendas` con `obs_general` | `routes/pipeline.js:188,196,352,356,377` | Columna añadida vía `ALTER TABLE` migración (`db.js:370`). Funciona, pero no está en el schema base; cualquier rebuild de BD desde el `CREATE TABLE` original falla hasta que corra la migración |
| B10 | Baja | El frontend modal de calificar no permite "obs sin rechazo" | `pipeline-ui.js renderEnviosRecibidos` | Solo binario Bien/Observado. Si la prenda está bien pero quieres dejar nota, no se puede |
| B11 | Media | Logs PM2 muestran `[Pipeline] no such column: AL` (varias ocurrencias) | logs PM2 al arrancar | El handler `safe()` lo captura sin tirar 500, pero indica un query SQL con un valor literal donde debería ir un parámetro. Aparece justo después de iniciar el cron de auto-envío — investigar qué endpoint del pipeline lo lanza al consumirse |
| B12 | Baja | `routes/ventas` referenciado en `server.js` pero no existe | log: `[ventas route skipped] Cannot find module './routes/ventas'` | Archivo aparece como untracked en git. O se añade el archivo o se elimina la referencia en `server.js` |

### 5.3 Concurrencia (1 PC compartida)

| # | Severidad | Hallazgo | Detalle |
|---|---|---|---|
| R1 | **Alta** | Sin lock optimista | Operario A selecciona prenda X, B la mueve antes que A → la siguiente acción de A puede sobreescribir o duplicar historial. El backend tampoco rechaza (acepta cualquier `etapa_destino`) |
| R2 | Alta | Polling cada 5 s vs SSE | Cada operario abierto = 12 RPS de polling al backend. Con 4-5 operarios = ~60 RPS innecesarios. SSE elimina el polling y resuelve además R1 (eventos en tiempo real avisan a B que A movió X) |
| R3 | Media | Sesión de operario expira a 60 s | `almacen-kanban.jsx:57` borra el código local cada 60 s si no es supervisor. Funciona como autosalida (bien para PC compartida) pero molesto. Confirmar UX deseado |

### 5.4 Performance

| # | Severidad | Hallazgo | Solución |
|---|---|---|---|
| P1 | Media | Sin índice en `prendas(etapa)` | `CREATE INDEX idx_prendas_etapa ON prendas(etapa)` |
| P2 | Media | Sin índice en `prendas(envio_id)` | `CREATE INDEX idx_prendas_envio ON prendas(envio_id)` — clave para `/envios` que hace N queries |
| P3 | Baja | Sin índice en `prenda_historial(prenda_id)` | `CREATE INDEX idx_prenda_hist_pid ON prenda_historial(prenda_id)` |
| P4 | Baja | Sin índice en `envios_prendas(sede_destino)` | `CREATE INDEX idx_envios_sede ON envios_prendas(sede_destino, validado_tienda)` |
| P5 | Baja | `kanban` retorna prendas completas sin paginar | con miles de prendas activas se hace pesado. Aceptable mientras volumen sea ~5/día |

### 5.5 UX / proceso

| # | Hallazgo | Detalle |
|---|---|---|
| U1 | El kanban exigía bajar la rueda para ver acciones | **Resuelto** en este PR (toolbar sticky bajo header) |
| U2 | Modal de calificar muy plano | **Resuelto** en este PR (nuevas clases `envios-rec-cal-row`) |
| U3 | No hay forma de cancelar un envío | Si almacén envió por error, solo se puede arreglar en BD. Considerar endpoint `DELETE /envios/:id` con auditoría |
| U4 | No hay alerta proactiva por estancamiento | Una prenda en `lavado` 3 días no genera alerta. Métricas la muestran pero no proactivamente |
| U5 | Trazabilidad cruzada manual | Para saber "qué pasó con la prenda X después de salir del almacén", hay que cruzar `prenda_historial` con `envios_prendas` y `prenda_calificacion` |

### 5.6 Seguridad

| # | Severidad | Hallazgo | Detalle |
|---|---|---|---|
| S1 | Media | JWT secret hardcoded con fallback público | `routes/pipeline.js:4` y similares. Mover a env var obligatoria |
| S2 | Baja | Sin rate limiting | `/auth/login-code` permite brute-force. Códigos son 4 dígitos = 10000 combinaciones |
| S3 | Media | `cod_responsable` no validado | (= B3) |
| S4 | Media | `calificar` no valida sede | (= B7) |

---

## 6. Recomendaciones priorizadas

### Quick wins (esfuerzo < 1 hora cada uno)

1. **C1-C4**: limpiar código muerto del kanban legacy (HTML + JS + app.js routing). Va en PR 2 del plan.
2. **B1**: añadir selector "Devolver a etapa" en modal `calEnvio` y mandar `etapa_destino`. Backend ya lo soporta.
3. **B7**: validar `envio.sede_destino === q.user.sede` en `/envios/:id/calificar`.
4. **B2**: hacer que `/enviar` retorne `enviadas: ids[]` y `omitidas: ids[]` para que el cliente sepa.
5. **P1, P2, P3, P4**: cuatro `CREATE INDEX IF NOT EXISTS` en la migración.

### Mediano plazo (PR 3 según plan)

6. **R2 + R1**: SSE en tiempo real (`/api/pipeline/stream`) con eventos `prenda-avanzada/rechazada/enviada` + payload de operario y timestamp. Toast efímero "X movió Y". Lock optimista visual en cliente.
7. **B3 / S3**: validar que `cod_responsable` coincida con `q.user.cod` (o quitar el campo del body y usar siempre el JWT).

### Refactor

8. **C3**: separar `pipeline-ui.js` → `pipeline-envios.js` (sólo Tienda). Renombrar y limpiar.
9. **B5**: `dividir` terno debería marcar la prenda original con flag `dividida=1` en lugar de `DELETE`, así el historial sigue navegable.
10. **B6**: agregar `cod_responsable` a `prenda_historial`. Migración + actualizar todos los `INSERT INTO prenda_historial`.
11. **U3**: endpoint `DELETE /pipeline/envios/:id` con confirmación admin y auditoría.
12. **U4**: alerta de estancamiento por etapa con umbral configurable.

### Largo plazo

13. **S1**: forzar `JWT_SECRET` desde env. Documentar en deploy.
14. **S2**: rate limit en `/auth/login-code`.
15. **U5**: vista unificada de trazabilidad por prenda (timeline visual completo, ya existe el endpoint `/:id/historial`).

---

## 7. Notas de implementación de PR 1 (este branch)

- Se creó `public/css/kanban-almacen.css` (~700 líneas) con paleta navy/gold del sistema y animaciones discretas (sin confeti ni rebotes).
- Se reescribió `public/js/almacen-kanban.jsx` para reemplazar todos los estilos inline por clases CSS. **Lógica intacta** — mismos `useState`, mismos endpoints, mismos payloads.
- **Fix UX kanban (rueda)**: la barra de acción se movió de `position:fixed bottom` a `position:sticky` justo bajo el header. Los operarios ya no necesitan scrollear para ver los botones de avanzar/rechazar/enviar.
- **Reducción de emojis**: se eliminaron todos los emojis decorativos (🏗 🏷 📜 📋 📊 ⚙️ 🥇 🥈 🥉 🐌 📍 🧺 🎀 💼 🔒 etc.). Se conservaron los **funcionales** del pipeline (📥 🧼 🔗 ✂️ 🏷 👔 ✅ 📦 📤 ❌ ✓) en una posición visual sutil porque los operarios ya los reconocen.
- **`pipeline-ui.js`**: solo se actualizaron `renderEnviosRecibidos` y `calificarEnvio` para usar clases consistentes. El código muerto NO se eliminó en este PR (queda para PR 2 según planificación).
- **`index.html`**: se enlazó la nueva hoja de estilos, se actualizó la página `pipeline-envios` con `page-header` consistente, y se mejoró el modal `calEnvioModal`. Se bumpearon las versiones de cache de `pipeline-ui.js` y `almacen-kanban.jsx`.
- **Backup BD**: `database/backups/lucebien_20260428_104446.db` (569 KB) por seguridad antes de tocar nada.
- Este PR **no toca BD** ni rutas backend. Todo es presentación.

---

## 8. Estado actualizado (2026-04-29)

Tras dos PR adicionales (`fix/pipeline-quick-wins` y `feat/pipeline-sse-y-fixes`) el panorama queda así:

### 8.1 Resueltos

| # | Hallazgo | Cómo se resolvió | Branch |
|---|---|---|---|
| C1-C4 | Página `page-pipeline` y código JS legacy | Eliminados de `index.html`, `pipeline-ui.js` renombrado a `pipeline-envios.js` con sólo lógica viva, rama de routing limpia en `app.js` | `chore/limpiar-pipeline-legacy` |
| B1 | Calificación regresaba siempre a `recepcion` | Modal `calEnvio` ahora muestra selector de etapa de retorno por prenda observada; backend ya soportaba `etapa_destino` | `fix/pipeline-quick-wins` |
| B2 | `/enviar` no informaba prendas omitidas | Pre-chequeo separa `enviadas` de `omitidas` con razón; respuesta detallada; toast del kanban muestra códigos omitidos | `fix/pipeline-quick-wins` |
| B3 | `cod_responsable` aceptado del body sin validar | Operario no-supervisor sólo puede operar con su propio `cod` (validado contra JWT) | `feat/pipeline-sse-y-fixes` |
| B5 | `dividir terno` borraba la prenda original | Ahora marca `dividida=1` y `etapa='dividido'` (nuevas columnas), preservando historial y referencias | `feat/pipeline-sse-y-fixes` |
| B6 | Historial sin `cod_responsable` (sólo nombre) | Columna nueva `prenda_historial.cod_responsable` poblada en cada insert (`avanzar`, `rechazar`, `enviar`, `calificar`, `dividir`, `registrar-local`) | `feat/pipeline-sse-y-fixes` |
| B7 | `/calificar` no validaba sede del usuario | Ahora 403 si `q.user.sede !== envio.sede_destino` y no es supervisor; respuesta incluye `rechazos` count | `fix/pipeline-quick-wins` |
| **B11** | `[Pipeline] no such column` en logs | **Bug crítico encontrado**: `etapa="recepcion"` y `etapa="planchado"` con comillas dobles en `/avanzar`. SQLite con DQS desactivado las trataba como columnas, fallando el UPDATE. Cambiadas a comillas simples. Smoke-test confirmado | `feat/pipeline-sse-y-fixes` |
| P1 | Falta índice `prendas(etapa)` | `idx_prendas_etapa` creado | `fix/pipeline-quick-wins` |
| P2 | Falta índice `prendas(envio_id)` | `idx_prendas_envio` creado | `fix/pipeline-quick-wins` |
| P3 | Falta índice `prenda_historial(prenda_id)` | `idx_prenda_hist_pid` creado | `fix/pipeline-quick-wins` |
| P4 | Falta índice compuesto en `envios_prendas` | `idx_envios_sede` (sede_destino, validado_tienda) creado | `fix/pipeline-quick-wins` |
| R1 | Sin lock entre operarios concurrentes | SSE: cada acción emite evento broadcast → todos los operarios ven el cambio al instante con toast "X movió Y" | `feat/pipeline-sse-y-fixes` |
| R2 | Polling cada 5s era el agresivo | Reemplazado por `EventSource('/api/pipeline/stream')`. Polling residual de 30s sólo como fallback de red | `feat/pipeline-sse-y-fixes` |
| U1 | Toolbar de acción exigía scroll | Movido a `position: sticky` bajo el header — siempre visible | `feat/prendas-recibidas-redisenio` |
| U2 | Modal de calificar plano | Rediseño con clases `envios-rec-cal-row` + selector de etapa | `feat/prendas-recibidas-redisenio` + `fix/pipeline-quick-wins` |

### 8.2 Pendientes

| # | Hallazgo | Por qué quedó pendiente |
|---|---|---|
| C5-C9 | Endpoints sin consumidor frontend (`POST /`, `POST /batch`, `GET /stats`, `GET /accesorios`, `GET /:id/historial`) | Podrían ser consumidos por scripts admin o herramientas externas. Requiere confirmación del usuario antes de eliminar |
| B4 | `Deshacer` puede borrar puntos del operario equivocado en escenario raro | El "deshacer" tiene 5 seg de ventana — riesgo bajo. Mejorable con `last_action_id` rastreado en cliente |
| B8 | `GET /envios` LIMIT 50 sin filtro temporal | Mejorable con paginación + filtro `?validado_tienda=0`. Volumen actual no lo amerita aún |
| B9 | `obs_general` sólo añadida vía ALTER (no en CREATE TABLE) | No es bug, pero un rebuild desde cero falla hasta correr migración. Bajo riesgo |
| B10 | Modal calEnvio no permite "obs sin rechazo" | UX feature, no urgente |
| B12 | `routes/ventas` referenciado pero no existe | El archivo aparece como untracked en git. Decisión del usuario si añadirlo o quitar la referencia en `server.js` |
| R3 | Sesión operario expira a 60s | Confirmar con usuario si es UX deseado para PC compartida |
| U3 | No se puede cancelar un envío después de creado | Feature nueva |
| U4 | Sin alerta proactiva de prendas estancadas | Feature nueva |
| U5 | Trazabilidad cruzada manual | Feature nueva (timeline visual por prenda) |
| S1 | JWT secret hardcoded con fallback público | Mover a env var obligatoria — requiere coordinación con deploy |
| S2 | Sin rate limit en `/auth/login-code` | Códigos 4-dígitos = 10 000 combinaciones. Requiere middleware nuevo |

### 8.3 Resumen de cambios técnicos en BD

Migraciones idempotentes añadidas a `(function migrarPipeline)()` en `routes/pipeline.js`:

```sql
-- Performance
CREATE INDEX IF NOT EXISTS idx_prendas_etapa     ON prendas(etapa);
CREATE INDEX IF NOT EXISTS idx_prendas_envio     ON prendas(envio_id);
CREATE INDEX IF NOT EXISTS idx_prenda_hist_pid   ON prenda_historial(prenda_id);
CREATE INDEX IF NOT EXISTS idx_envios_sede       ON envios_prendas(sede_destino, validado_tienda);

-- Trazabilidad
ALTER TABLE prenda_historial ADD COLUMN cod_responsable TEXT;
ALTER TABLE prendas          ADD COLUMN dividida        INTEGER DEFAULT 0;
ALTER TABLE prendas          ADD COLUMN dividida_en     TEXT;
```

### 8.4 Endpoint nuevo

`GET /api/pipeline/stream` — SSE (text/event-stream). Eventos emitidos:

| Evento | Cuándo |
|---|---|
| `prenda-avanzada` | `PUT /:id/avanzar` exitoso |
| `prenda-rechazada` | `PUT /:id/rechazar` exitoso |
| `prenda-deshecha` | `PUT /:id/deshacer` exitoso |
| `prenda-dividida` | `POST /:id/dividir` exitoso |
| `envio-creado` | `POST /enviar` exitoso |
| `envio-calificado` | `PUT /envios/:id/calificar` exitoso |
| `envio-accesorios-creado` | `POST /envios-accesorios` exitoso |
| `envio-accesorios-validado` | `PUT /envios-accesorios/:id/validar` exitoso |
| `accesorio-registrado` | `POST /accesorios` exitoso |
| `accesorio-extra-pendiente` | `POST /accesorios-extra` exitoso |
| `aprobacion-resuelta` | aprobar/rechazar locales |
| `prendas-registradas` | `POST /registrar-local` exitoso |

Cada evento lleva `responsable`, `cod` cuando aplica, `ts` ISO. El frontend (almacen-kanban) muestra toast efímero "{responsable}: {acción} {codigo}" y dispara `load()` para refrescar. Heartbeat cada 25s, retry de 5s configurado por `EventSource`.
