# Endurecer: almacén inactivo, aviso de calidad y estado del activo al anular

Sesión 5A · Zona crítica (permisos y no-negociable 2) · Migración 0158 · Decidido por el dueño (18-oct-2026)

## Problema (hallado por el verificador en 0151–0156)
1. `private.app_es_almacen()` no mira `empleados.activo`: un encargado de almacén o confeccionista
   suspendido sigue viendo (y operando) lo de todas las sedes.
2. `prenda_pasada.obs_calidad` (el motivo del rechazo) no se limpia al re-aprobar: la tarjeta sigue
   mostrando «mancha» en una prenda ya corregida.
3. Anular un envío (0156) deja el activo siempre en `en_pipeline`, aunque antes del envío estuviera
   en `en_compostura` o `codificando`.

## Reglas
1. **R1 — Almacén activo.** `private.app_es_almacen()` exige `e.activo`. Un almacén/confeccionista
   suspendido o inactivo no ve ni opera nada por esa vía (policies, RPC y vista de despachos que la usan).
2. **R2 — Aviso de calidad.** `pipeline_avanzar` pone `obs_calidad = null` cuando la prenda se aprueba
   (destino `listo`, desde control de calidad). Avanzar a otras etapas no lo toca. El motivo del
   rechazo queda siempre en el historial.
3. **R3 — Activo al anular.** `prenda_pasada.activo_estado_previo` (columna nueva, texto, nula).
   `pipeline_enviar` guarda ahí el estado del activo antes de pasarlo a `disponible`.
   `pipeline_anular_envio` lo devuelve a ese estado (solo si el activo sigue `disponible`) y limpia la
   columna; si no hay estado guardado (envíos hechos antes de la 0158) vuelve a `en_pipeline` como hoy.
4. **R4 — Nada más cambia.** Mismo cuerpo que las versiones vivas (`pipeline_avanzar` de la 0147,
   `pipeline_enviar` de la 0128, `pipeline_anular_envio` de la 0156) más lo descrito.

## Defaults inventados
Ninguno.

## Pruebas (0158_endurecer.prueba.sql)
1. Un almacén inactivo ve 0 prendas; el mismo activo ve las suyas. `app_es_almacen()` es false si inactivo.
2. Aprobar (control_calidad → listo) limpia `obs_calidad`; planchado → control_calidad no.
3. Activo `en_compostura` → enviar → `disponible` con `activo_estado_previo='en_compostura'` → anular →
   vuelve a `en_compostura` y la columna queda nula.
4. Activo ya `alquilado` tras el envío: anular no lo toca. Sin estado guardado: vuelve a `en_pipeline`.
5. Una sola firma por función y sin `execute` para anon.

## Orden de merge
Depende de #93 (0147, `pipeline_avanzar`) y #103 (0156, `pipeline_anular_envio`): se mergea después de ambas.
