# Seguridad en producción — cierre de H1, H14, H-2, datos_personas y Next.js

**Fecha:** 06-oct-2026 · **Rigor:** spec completa (pipeline, permisos, aislamiento, cadena del sueldo)
· **Migración:** 0122 (número asignado por la sesión maestra) · **Origen:**
`docs/auditorias/2026-10-06-seguridad.md` (rama `audit/2026-10-06-seguridad`) y
`docs/auditorias/2026-10-06-pipeline.md` (rama `audit/2026-10-06-pipeline`).

Todo lo de abajo está hoy en producción (main + 0001..0109). La migración no se aplica a
producción desde esta rama: se prueba en `tools/postgres-local.sh` con los ataques reales.

## 1. H1 — sólo las RPC escriben el pipeline (no-negociable 2)

**Hoy.** `pasada_rw`, `hist_rw` y `puntos_rw` son `FOR ALL`. Un confeccionista puede
`update prenda_pasada set etapa='recepcion'` y volver a avanzar sumando puntos; puede insertar una
prenda en `control_calidad` y llevarla a `listo`; y puede insertar filas en `pipeline_puntos` a su
nombre (`empleado_id = auth.uid()` pasa la policy). Las RPC del pipeline son `security invoker` y
dependen de esa misma policy para escribir.

**Regla nueva.**
- `prenda_pasada`: sin `update` ni `delete` para `anon`/`authenticated`. La lectura queda igual que
  hoy (admin, almacén o sede propia). El `insert` directo se conserva **sólo** para una prenda que
  entra limpia: `etapa = 'recepcion'`, sin envío, sin división, sin aprobar, y con sede propia (o
  almacén/admin). Motivo: `pedido_crear` y `pedido_devolver` (módulo comercial, fuera del menú) son
  invoker e insertan así; entrar a recepción no da puntos (los puntos salen de avanzar, que es RPC).
- `prenda_historial` y `pipeline_puntos`: sólo lectura para `anon`/`authenticated`. Lectura igual que hoy.
- Las RPC que modifican prendas (`pipeline_avanzar`, `_rechazar`, `_deshacer`, `_enviar`,
  `_dividir`, `_deshacer_division`, `_calificar`) pasan a `security definer` con `search_path`
  fijo y **mismas firmas**. Antes de tocar nada llaman a `private.pipeline_exigir_acceso(p_id)`,
  que reproduce lo que daba la RLS (admin, almacén o `sede_origen_cod` en mis sedes) y responde
  «Prenda no encontrada» si no, igual que hoy.
- `lavanderia_enviar` (en uso por las tiendas) inserta prendas en `recepcion` **o `compostura`** y
  escribe historial: pasa a `security definer` con el mismo control de sede que le daba
  `listas_rw` (admin, almacén o `p_sede` en mis sedes).
- Alta manual (pestaña Registrar): RPC nueva `pipeline_registrar_prenda` (definer, mismas reglas
  que el insert directo). `registrarPasada` deja de hacer `insert` plano.

- **Rechazos (H-7 de la auditoría del pipeline, misma vía de fraude que H1).** Hoy `pipeline_rechazar`
  y `pipeline_calificar` aceptan cualquier origen y cualquier destino: rechazar una prenda en
  `listo` a `recepcion` y volver a avanzarla da +6 al que avanza y −1 a otra persona. Regla nueva,
  igual a lo que ya ofrece la pantalla:
  - `pipeline_rechazar` sólo desde `control_calidad`, y sólo hacia `recepcion`, `lavado`,
    `empatado`, `refaccion`, `compostura` o `planchado`. Si no → `TRANSICION:`.
  - `pipeline_calificar` sólo sobre una prenda en `enviado`; si se observa, el destino debe ser
    una de esas mismas seis etapas. Si no → `TRANSICION:`.

**No cambia:** quién ve qué en el tablero, los puntos por etapa, las transiciones de avance.

## 2. H14 — `reportes_crear` no fabrica reportes a nombre de otro

**Hoy.** `p_encargado` es libre y el almacén crea reportes de cualquier sede. c1 (almacén) crea un
reporte de S2 a nombre de f2, no figura como trabajador y lo evalúa con 0.

**Regla nueva.**
- No admin: el encargado es **siempre** `auth.uid()`. Si manda `p_encargado` distinto →
  `PERMISO: el encargado del turno es quien registra el reporte`.
- No admin: `p_sede` debe estar en sus sedes (`app_sedes()`). El almacén ya no registra turnos de
  tiendas que no son suyas.
- Admin: puede indicar otro encargado; el encargado indicado debe estar activo.
- Quien registra queda en `reporte_trabajadores` (ya pasaba con el encargado), así que
  `reportes_evaluar` le impide evaluar su propio reporte.
- Pantalla `/reportes/nuevo`: para no admin el selector de encargado queda fijo en la persona de
  la sesión.

## 3. H-2 — deshacer sólo revierte el último avance real

**Hoy.** `pipeline_deshacer(p_id, p_etapa_anterior)` no valida la etapa: se puede «deshacer» una
prenda en `listo` a `recepcion` y volver a avanzar → +3 puntos sin trabajo, repetible. Además borra
el último punto **del que deshace**, no el del avance deshecho.

**Regla nueva.**
- Se toma el último `prenda_historial` de la prenda. Debe ser un **avance** (`obs is null`, que es lo
  que escribe `pipeline_avanzar`), con `etapa_nueva` = etapa actual y `etapa_anterior` =
  `p_etapa_anterior`. Si no → `TRANSICION: sólo se puede deshacer el último avance`.
- Una prenda `dividido` no se deshace por acá (tiene su propia RPC).
- Se borra el punto de **ese** avance: mismo `pasada_id`, `empleado_id` del historial,
  `etapa = etapa_anterior`, `puntos > 0` y misma `fecha` (avanzar escribe historial y punto con el
  mismo `now()`). Le quita los puntos a quien hizo el avance, no a quien deshace.
- Deshacer dos veces seguidas no se puede: después de deshacer, el último historial es el propio
  «Deshacer», que no es un avance.
- Si el avance deshecho llegó a `listo`, la prenda vuelve con `aprobada = false`.

## 4. Datos de personas — sólo el administrador ve lo de otros

**Decisión del dueño (06-oct-2026):** «cada persona sólo ve lo suyo, excepto los admins».

**Hoy.** `private.app_ve_datos_personas()` da lectura de `pagos`, `asistencias`,
`evaluaciones_mensuales` y `evaluaciones_valores` de **todas** las sedes a cualquier rol al que se
le marque `datos_personas = {ver}` en `/configuracion/permisos`.

**Regla nueva.** `app_ve_datos_personas()` es verdadero sólo para admin/dueño activo. El permiso
`datos_personas` deja de abrir datos ajenos aunque se marque. Las policies no cambian (siguen
siendo «admin, o datos_personas, o lo propio»), así que una persona sigue viendo lo suyo.

## 5. Next.js

`apps/erp-web` usa `next 14.2.35`. Se sube al último parche publicado de la misma versión mayor
que cierre los avisos; si los avisos críticos sólo se cierran en otra mayor, se documenta como
pendiente en el PR en vez de saltar de mayor en esta rama. Build y tests en verde.

## Pruebas (deben fallar antes y pasar después)

`packages/db/pruebas/0122_seguridad_produccion.prueba.sql`, con personas sembradas (admin,
confeccionista c1, encargada de tienda de S1, vendedora f2 de S2):

1. c1 `update prenda_pasada set etapa='recepcion'` → `permission denied`.
2. c1 `insert prenda_pasada(... etapa='control_calidad')` → rechazado; con `etapa='recepcion'` → ok.
3. c1 `insert/update/delete` en `pipeline_puntos` y `prenda_historial` → `permission denied`.
4. Las RPC siguen funcionando: recepción → … → listo da los mismos puntos que hoy; rechazar resta
   al culpable; enviar y calificar mueven la prenda.
5. Encargada de S1 no puede avanzar una prenda de S2 («Prenda no encontrada»).
6. Deshacer `listo → recepcion` → `TRANSICION`. Deshacer el último avance hecho por A cuando lo
   pide B → A pierde ese punto, B no pierde nada. Deshacer dos veces → `TRANSICION`.
7. c1 `reportes_crear(..., 'S2', ..., p_encargado => f2)` → `PERMISO`; c1 con sede ajena → `PERMISO`;
   admin con otro encargado → ok.
8. Con `datos_personas = {ver}` para `encargado_tienda`, la encargada no lee pagos, asistencias ni
   notas de f2; sí las suyas.
9. Rechazar una prenda en `listo` → `TRANSICION`; rechazar desde `control_calidad` a `listo` →
   `TRANSICION`; calificar una prenda que no está `enviado` → `TRANSICION`.
