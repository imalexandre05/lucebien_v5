# Recepción en tienda (solo la tienda destino)

Sesión 10A · Zona crítica (permisos y aislamiento por sede) · Migración 0181

## Problema
La sección «Envíos a tienda» (aceptar / observar lo que llegó) es de la TIENDA, pero hoy la ve y
puede calificar el almacén (vista `prendas_despachadas`, `envios_sel`, `pipeline_calificar`), y la
tienda sólo puede devolver a 3 etapas y de una en una.

## Reglas (decisión del dueño, 19-oct-2026)
1. **R1 — Almacén solo despacha.** Enviar a tienda (por tanda) sigue en el kanban. Almacén ya no
   lee `envios_prendas`/`prendas_despachadas`/`prenda_calificacion` ni puede calificar; la pantalla
   `/pipeline/envios` y su entrada de menú no existen para él. El admin ve todo.
2. **R2 — Solo la tienda destino califica.** `pipeline_calificar` exige admin o sede destino del
   envío en `app_sedes()` (y no ser rol de almacén). Con código personal; la calificación y el
   historial quedan a nombre del dueño del código.
3. **R3 — Devolver a cualquier etapa.** Observar permite recepción, codificación, lavado, empatado,
   refacción, compostura, planchado y control de calidad. La observación es obligatoria
   (3–500 letras, `MOTIVO:`; default anotado en `pendientes-negocio.md`) y queda en el historial y
   como aviso de calidad (`obs_calidad`).
4. **R4 — Varias a la vez.** `pipeline_calificar_tanda(ids, aceptada, destino, obs, operador)`
   acepta o devuelve todas juntas en una sola transacción: si una falla, ninguna cambia.
5. **R5 — Pantalla.** Selección múltiple con barra «Aceptar» / «Devolver a…» + observación;
   el kanban deja de enlazar a Envíos desde «Enviadas».

## Pruebas
SQL `0181_recepcion_en_tienda.prueba.sql`: almacén no lee la vista ni califica; otra tienda no
califica; destino acepta; devuelve a codificación/lavado con nota; sin nota → `MOTIVO:`; tanda
atómica (una ajena aborta todas); calificación a nombre del dueño del código; admin sí.
