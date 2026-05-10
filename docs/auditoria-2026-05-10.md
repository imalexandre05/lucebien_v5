# LuceBien · Auditoría completa del sistema · 2026-05-10

> Auditoría exhaustiva: bugs rotos, bugs de lógica, endpoints muertos,
> UX rota, permisos, inconsistencias de schema. Roles probados:
> admin (Alexander/8686), encargado_tienda (Janet · simulado vía JWT),
> encargado_almacen (Nicol · simulado), confeccionista (Remy · simulado),
> ventas_junior (Jesus · simulado).

---

## Resumen ejecutivo

| Severidad | # | Estado |
|---|---|---|
| 🔴 CRÍTICO | 4 | Requieren fix inmediato — funcionalidad rota o fuga de permisos |
| 🟠 MAYOR | 7 | Funcionalidad incompleta o incoherente — degradan confianza |
| 🟡 MENOR | 9 | Deuda técnica + UX subóptima |
| ⚪ COSMÉTICO | 4 | Limpieza |

**Top 3 bugs más urgentes:**

1. **🔴 [#01](fixes/01-pagos-roto.md)** · `/api/pagos`, `/api/pagos/sugerir` y otros 3 endpoints de `pagos.js` y `valores/seguimiento` revientan con `500: no such column: sede` — referencian una columna `empleados.sede` que NO EXISTE (las sedes están en `empleado_tiendas`). Bloquea el módulo de Pagos completo.
2. **🔴 [#02](fixes/02-permisos-dashboard.md)** · `encargado_tienda` y `encargado_almacen` pueden llamar `/api/dashboard/admin` y `/api/dashboard/empleado` (el backend los acepta) — el frontend les oculta la opción pero un usuario técnico puede leer KPIs gerenciales y dashboards de cualquier compañero. Fuga de permisos.
3. **🟠 [#06](fixes/06-asistencias-vacia.md)** · La tabla `asistencias` tiene 0 filas pese a 96 reportes en BD. La auto-asistencia solo dispara cuando el reporte llega con `encargado_id` vía POST manual; los 54 auto-enviados por cron no la generan. Si se piensa cerrar mes y calcular tardanzas/horas, esto va a quedar todo en cero.

**Lo que funciona bien:** auth (rechaza deshab/susp), dashboard admin V3, kanban almacén con 3 vistas, envíos recibidos (después del fix reciente), pipeline operativo, evaluaciones por reporte, layout editor.

**Cleanup ya hecho:** `MARKDOWN.txt` borrado (era transcript de sesión vieja).

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

**Categoría:** Schema · Datos sucios
**Ubicación:** Varias tablas

**Hallazgos:**
1. **`reporte_trabajadores.nombre = "Marylin"`** — empleado que NO existe en `empleados`. Probablemente borrado o el FR-01 permite escribir nombres libres.
2. **3 envíos huérfanos** en `envios_prendas` — sin prendas asignadas (`envios_prendas` con `id NOT IN (SELECT DISTINCT envio_id FROM prendas WHERE envio_id IS NOT NULL)`). Posiblemente cancelaciones o errores de creación.
3. **16 prendas con código `PRUEBA*`** en BD — 2 visibles activamente en el kanban (`PRUEBA-01`, `PRUEBA-02` en etapa refacción), 14 ya enviadas (no estorban operativamente pero ensucian historial y métricas).

**Fix-prompt:** [`docs/fixes/08-datos-sucios.md`](fixes/08-datos-sucios.md)

---

### #09 · 🟠 MAYOR · Permisos · `DEFAULT_PERMS` define roles que no existen

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

**Categoría:** UX
**Ubicación:** `public/index.html`

**Reproducción:** modales que NO tienen `class="modal-close"`:
- `#confirmModal`
- `#incNuevaModal` (registrar nueva incidencia)

El usuario solo puede cerrar con los botones de acción (Confirmar / Cancelar). Si llegan al modal sin querer (click en botón equivocado), no hay X para escapar — tienen que aceptar o cancelar formalmente.

**Fix-prompt:** [`docs/fixes/10-modales-sin-close.md`](fixes/10-modales-sin-close.md)

---

### #11 · 🟠 MAYOR · UX · 4 páginas sin render hookeado en `goTo()`

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

**Categoría:** Schema · Deuda técnica
**Ubicación:** Tabla `horarios` (vacía) + `horario_periodos` (1) + `horario_slots` (46 — usados)

La tabla `horarios` original fue reemplazada por el sistema nuevo de `horario_periodos` + `horario_slots`. Sigue en BD sin uso.

**Fix-prompt:** N/A (decisión de cleanup, ver #19)

---

### #13 · 🟡 MENOR · Endpoint sin uso · `/api/reportes/auto-envio/run`

**Categoría:** Endpoint muerto (ok porque es debug)
**Ubicación:** `routes/reportes.js`

Endpoint para forzar manualmente la corrida del cron de auto-envío. Útil en desarrollo, nadie lo llama desde frontend. Está bien que exista pero documentarlo o sacarlo de producción.

**Acción:** documentar en `docs/`. No es fix urgente.

---

### #14 · 🟡 MENOR · Console.log/warn/error sueltos en producción

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

**Categoría:** Permisos · UX
**Ubicación:** `routes/empleados.js:GET /` — relacionado con #03 y #04

Aun corrigiendo #03 (filtrar por rol), el endpoint debería retornar SOLO los campos necesarios según rol:
- Encargado: `id, cod, nombre, iniciales, rol, tiendas, estado` — para selectores de trabajadores
- Admin: campos completos

Hoy todos reciben `dni, telefono, direccion, salario_base, fecha_ingreso, contacto_emergencia, tipo_contrato`, etc.

**Fix-prompt:** combinar con [`docs/fixes/03-empleados-fuga.md`](fixes/03-empleados-fuga.md)

---

### #16 · 🟡 MENOR · UX · Botón "Eliminar pago" requiere `motivo` no documentado

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

**Categoría:** Deuda técnica
**Ubicación:** Histórico

El archivo se borró (commit `d20cd34`). Verificar que ningún `<script>` lo referencia y no aparece en `app.js`. Hecho en última verificación, pero documentar.

**Acción:** no requiere fix.

---

### #18 · 🟡 MENOR · Schema · 4 tablas con 0 uso (features sin estrenar)

**Categoría:** Esquema · Producto incompleto
**Tablas:** `evaluaciones_mensuales`, `evaluaciones_valores`, `pagos`, `ventas_metas`, `devoluciones_garantia`, `reporte_drafts`, `actividades_pendientes`

Algunas son legítimamente nuevas (esperando primer ciclo mensual). Otras sugieren features incompletas. No es fix técnico — es **decisión de producto**: ¿se va a usar Eval Mensual + Pagos este mes? Si sí, hay que cerrar el flujo end-to-end (los bugs #01 y #06 lo bloquean ahora).

**Acción:** decisión del usuario.

---

### #19 · ⚪ COSMÉTICO · Cleanup · Tabla `horarios` legacy

Borrar la tabla. SQL: `DROP TABLE horarios;`. Pero solo después de verificar que ningún código la consulta.

---

### #20 · ⚪ COSMÉTICO · Cleanup · 16 prendas `PRUEBA*` en BD

12 ya enviadas (histórico, no molesta), 2 activas en kanban refacción. Decisión: el admin puede borrar las 2 activas desde la UI o vía SQL una sola vez.

---

### #21 · ⚪ COSMÉTICO · 3 envíos huérfanos en `envios_prendas`

Sin prendas asociadas. Probable cancelación incompleta. Limpieza una vez.

---

### #22 · ⚪ COSMÉTICO · UX · Mensajes de error inconsistentes

A veces "Error de servidor", a veces "no such column: sede" (raw SQLite), a veces "Token invalido" (sin tilde), a veces "Token inválido o expirado" (con tilde). Unificar formato.

---

## Apéndice: matriz de permisos REAL (probada)

| Endpoint | Admin | Encargado tienda | Encargado almacén | Confeccionista | Ventas junior |
|---|---|---|---|---|---|
| `/api/empleados` | 200 | 200 ⚠ | 200 ⚠ | 200 ⚠ | 200 ⚠ |
| `/api/dashboard/admin` | 200 | **200 🐛** | **200 🐛** | 403 | 403 |
| `/api/dashboard/empleado` | 200 | **200 🐛** | **200 🐛** | 403 | — |
| `/api/audit` | 200 | 403 | 403 | — | — |
| `/api/pipeline/kanban` | 200 | 200 | 200 | 200 | 200 |
| `/api/pipeline/envios-accesorios` | 200 | 200 | 200 | — | 200 |
| `/api/lavanderia` | 200 | 200 | 200 | 200 | 200 |
| `/api/garantias` | 200 | 200 | 200 | — | — |
| `/api/solicitudes` | 200 | 200 | 200 | 200 | 200 |
| `/api/incidencias` | 200 | 200 | 200 | 200 | — |
| `/api/notificaciones/pendientes` | 200 | 200 | 200 | — | — |
| `/api/pagos` | **500 🐛** | **500 🐛** | **500 🐛** | — | — |
| `/api/valores/seguimiento/:mes` | **500 🐛** | 403 | — | — | — |
| `/api/actividades/admin` | 200 | 403 | 403 | — | — |
| `/api/horarios/mi-horario` | 200 | 200 | 200 | 200 | 200 |
| `/api/evaluaciones/mensual` | 200 | 200 | 200 | — | — |

⚠ = leak menor (lista de empleados con campos sensibles)
🐛 = bug crítico

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
| Cierre de mes con cálculo de tardanzas | ❌ | tabla `asistencias` vacía (#06) |

---

## Acciones inmediatas recomendadas

1. Aplicar fixes #01, #02, #03+#04 — todos en una sola sesión, son del mismo "tema schema/permisos" (~1 hora).
2. Decidir el destino del módulo Pagos: si se va a usar este mes, además de fix #01 hay que probar el ciclo completo (crear + listar + comprobante imprimible).
3. Implementar fix #06 (asistencias) **antes del cierre del primer mes**, si no las evaluaciones mensuales saldrán con notas de tardanza inválidas.
4. Aplicar índices del fix #07 — barato, sin riesgo, mejora performance que va a empeorar con el tiempo.

Los fixes 9-22 son saneamiento y pueden esperar.
