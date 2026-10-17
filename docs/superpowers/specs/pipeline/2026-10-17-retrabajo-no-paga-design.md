# Spec 0130 — el retrabajo no vuelve a pagar una etapa ya pagada

> Escrita el 17-oct-2026, **antes** del código y de la prueba (Zone Guard). Zona crítica:
> pipeline → puntos → nota → pago. Decisión del dueño (13-oct-2026) sobre la pregunta abierta en
> `pendientes-negocio.md` («Seguridad 06-oct-2026 — retrabajo tras observación de tienda»).
> Va con prueba SQL y subagente verificador antes de mergear.

## Regla de negocio

**Una etapa ya pagada para esa prenda no vuelve a pagarse en el retrabajo.**

Hoy una prenda enviada que la tienda califica como *observada* vuelve a una etapa del proceso, y al
re-avanzarla `pipeline_avanzar` paga de nuevo cada etapa (+7 por ciclo con pesos de 1). Con la regla:
`pipeline_avanzar` sólo registra el punto de una etapa si la prenda **no tiene ya un punto positivo
vigente** en esa etapa. El avance se hace igual; sólo se omite el pago (devuelve 0).

## Qué cuenta como «ya pagada»

Una fila de `pipeline_puntos` con `pasada_id` = la prenda, `etapa` = la etapa que se abandona y
`puntos > 0`. Consecuencias, todas deliberadas:

- **Deshacer** borra el punto de ese movimiento (`private.pipeline_borrar_punto`), así que la etapa
  deja de estar pagada y volver a avanzarla paga una vez. Es una corrección, no un retrabajo.
- **Rechazo de calidad** (enmienda tras la verificación): el dueño decidió sólo sobre la observación de
  tienda, no sobre el rechazo de calidad, así que **el rechazo queda como hoy**: el culpable pierde su
  punto (fila negativa `<etapa>_rechazo`) y quien rehace la etapa cobra. Un punto positivo anterior a un
  `<etapa>_rechazo` de esa etapa **no** cuenta como «ya pagada». Extender la regla al rechazo es una
  decisión pendiente de Alexander (`pendientes-negocio.md`).
- **Observación de tienda** (`pipeline_calificar`) no escribe puntos y no se toca: no penaliza a nadie.
  Sólo queda cerrada la vía de cobrar el retrabajo.
- **Prenda dividida** (enmienda tras la verificación): dividir creaba dos hijas con id nuevo que volvían
  a cobrar todo el ciclo. Una hija cuenta también los pagos positivos de su **madre** (la prenda cuyo
  `dividida_en` contiene el id de la hija). Una madre dividida no se vuelve a avanzar.

## Qué NO cambia

- Firmas, grants, `security definer`, portero, token de operador, H-4 (sin rol de pipeline no se
  registra nada), H-7, historial por prenda. `create or replace` con las firmas finales de la 0127.
- `pipeline_avanzar_tanda` hereda la regla porque llama a `pipeline_avanzar`.
- Quién califica (propuesta 2 del pendiente) **sigue sin decidirse**; esta spec no la toca.
- Los puntos ya pagados en producción no se corrigen ni se borran.

## Dónde se implementa

En `private.pipeline_registrar_punto` (el único camino de escritura de puntos positivos del avance):
si `p_puntos > 0` y ya existe un positivo para esa prenda y etapa, devuelve `null` sin insertar.
`pipeline_avanzar` ya trata `null` como «la prenda avanza pero no cobra» (pone `v_pts = 0`). No hace
falta tocar `pipeline_avanzar`.

## Pruebas (`packages/db/pruebas/0130_retrabajo_no_paga.prueba.sql`)

1. **Antes (0128): +7 por ciclo.** Avanzar recepción→…→listo, enviar, calificar observada a
   recepción, re-avanzar hasta listo: el segundo ciclo suma otros 7. Con la 0130: 0.
2. Deshacer + re-avanzar la misma etapa paga una sola vez (el punto borrado se repone).
3. Rechazo de calidad: el culpable queda penalizado y quien rehace la etapa SÍ cobra (como antes).
3b. Dividir tras una observación: las hijas no vuelven a cobrar las etapas que la madre ya cobró.
4. Una etapa nunca pagada (clave `pts_*` en 0 que luego sube, o prenda sin rol de pipeline) paga la
   primera vez que corresponde.
5. Los pagos del primer ciclo (7 filas, 7 puntos) quedan intactos; la suma total tras el ciclo de
   retrabajo es 7, no 14.
6. Una sola firma por RPC del pipeline; las pruebas 0112, 0115, 0122, 0127 y 0128 siguen pasando.

## Default inventado

Ninguno nuevo: la regla es de negocio (decisión del dueño). Si el dueño pide después penalizar a
quien hizo la etapa observada, es otra spec.
