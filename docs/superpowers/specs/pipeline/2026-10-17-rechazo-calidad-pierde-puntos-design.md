# Spec 0140 — un trabajo rechazado por calidad pierde todos sus puntos

> 17-oct-2026, **antes** del código y de la prueba (Zone Guard). Zona crítica: pipeline → puntos →
> nota → pago. Decisión del dueño (sesión 4B). Cierra la duda que la spec 0130 dejó abierta
> («extender la regla al rechazo es una decisión pendiente de Alexander»).

## Regla

Cuando control de calidad **rechaza** una prenda hacia una etapa anterior (`pipeline_rechazar`):

1. **El culpable pierde TODOS los puntos de ese trabajo**: los puntos positivos que esa persona cobró en
   esa etapa para esa prenda (y, si es hija de una división, para su madre). Se registra una fila
   negativa `<etapa>_rechazo` por exactamente esa suma (menos lo ya descontado por rechazos previos de
   la misma etapa), de modo que el neto de ese trabajo queda en **0**, nunca por debajo.
   Antes se descontaba el *peso actual* de la etapa (`pts_*`, con la mitad para media prenda): si el peso
   cambió o la prenda era media, no coincidía con lo cobrado.
2. **El retrabajo no paga.** El rechazo ya no «reabre» la etapa: la etapa queda como ya pagada, así que
   quien la rehace tampoco cobra. (Se quita de `private.pipeline_registrar_punto` la excepción de la 0130
   por la que un `<etapa>_rechazo` reabría el pago.)
3. Si el culpable nunca cobró esa etapa (retrabajo previo, sin rol de pipeline, clave en 0), no hay nada
   que quitar: no se escribe ninguna fila.

## Qué NO cambia

Firmas, grants, `security definer`, portero, H-4, H-7, el cálculo del culpable (última persona que sacó
la prenda de esa etapa), `pipeline_deshacer` (deshacer sigue borrando el punto de su movimiento). Todo
avance sigue siendo por RPC (0115); la fila queda en `pipeline_puntos` con detalle auditable
(`Rechazo: <código> de control_calidad → <etapa>; pierde N pts`). Los puntos ya registrados no se corrigen.

## Defaults inventados

Ninguno.

## Dudas para el dueño

- «Todos sus puntos» se entendió como los de **esa etapa y esa prenda**, no los de todas las etapas
  que la persona haya hecho en la prenda.
- Con esta regla nadie cobra la etapa rechazada (ni el culpable ni quien la rehace). Confirmar que es lo
  que se quiere y no que quien rehace sí cobre.

## Pruebas (`0140_rechazo_calidad.prueba.sql`; el caso 3 de la 0130 se actualiza)

1. Rechazo con peso cambiado: el culpable cobró 1, el peso sube a 3, el rechazo descuenta 1 (neto 0).
2. Rehacer la etapa tras el rechazo paga 0; el neto de la prenda en esa etapa es 0.
3. Rechazo cuando el culpable nunca cobró la etapa: no escribe fila negativa.
4. Un segundo rechazo de la misma etapa no descuenta de más (neto sigue en 0).
5. El detalle de la fila negativa nombra la etapa y los puntos perdidos.
