# La tienda ve las prendas que le despachan (lucebien-tablero #43)

Sesión 5A · **Spec completa**: cambia RLS (no-negociable 3) · Migración 0151

## Problema
`pasada_select` (0122) deja ver una prenda solo por su **sede de origen**. Si entró por la sede A y
se despachó a la tienda B, B no la ve en la base aunque el envío sí le llega. `pipeline_calificar`
ya reconoce a la tienda destino (versión viva en 0115; 0112 la conserva); lo que falla es la **lectura** (listas y tableros).

## Decisión del dueño (resuelta, 18-oct-2026)
La tienda ve **toda prenda que le fue enviada, sin importar por qué sede entró, y solo esas**: cada
tienda solo ve sus envíos (el documento del cliente pide «prohibir accesos por tienda» y «filtrar
por tiendas en los envíos de almacén a tiendas»). La duda-cliente del ticket queda **resuelta**.
Además: nada de exponer la fila completa de `prenda_pasada`; se entrega una **vista con columnas
limitadas**.

## Reglas
1. **R1 — Vista `public.prendas_despachadas`.** Una fila por prenda con envío, con solo: `id`,
   `codigo`, `tipo`, `color`, `talla`, `sede_origen_cod`, `etapa`, `fecha_actualizado` y los datos
   del envío (`envio_id`, `sede_destino_cod`, `fecha_envio`, `estado_envio`). Corre con los
   privilegios del dueño de la vista, así que la visibilidad la fija su propio `where`: admin,
   almacén o `sede_destino_cod` en `app_sedes()` (la misma regla que `envios_rw`).
2. **R2 — La tabla no cambia.** `pasada_select` queda como en la 0122 (solo sede de origen). La
   tienda destino **no** gana lectura de la fila completa: no ve `lavador_id`, `planchador_id`,
   `pedido_id` ni las observaciones internas.
3. **R3 — Solo lectura y solo lo despachado.** Una prenda observada en tienda vuelve al proceso con
   `envio_id = null` y sale de la vista; una recibida conserva su envío. La tienda destino califica
   con `pipeline_calificar` (versión viva en 0115), sin ganar permisos de avanzar, rechazar,
   deshacer ni dividir (`pipeline_exigir_acceso` sigue por sede de origen).
4. **R4 — Aislamiento intacto.** `prenda_historial` y `pipeline_puntos` no se amplían (no-negociable 3).
5. **R5 — La pantalla de envíos lee la vista.** `listarEnviosEnCamino` y `listarEnviosRecibidos`
   consultan `prendas_despachadas`. El filtro por tienda de «Envíos a tienda» (`?sede`) ya existe
   y se conserva: quien ve más de una sede elige tienda; una tienda solo ve la suya.
6. Una tienda ajena (ni destino) no ve nada; `anon` no tiene acceso a la vista.

## Defaults inventados
Ninguno.

## Pruebas (packages/db/pruebas/0151_tienda_ve_despachos.prueba.sql)
1. Tienda destino B ve en la vista la prenda de A enviada a B; el origen A no la ve en la vista
   (la vista es de destino) y sigue viendo su fila en la tabla.
2. B no ve prendas en proceso ni enviadas a otra tienda C; C no ve A→B.
3. Una prenda observada (envio_id null) sale de la vista; una recibida sigue.
4. La tabla `prenda_pasada` sigue sin dejar a B leer la fila completa (0 filas).
5. La vista no tiene columnas `lavador_id`, `planchador_id`, `pedido_id` ni `obs_*`.
6. B no puede avanzar/dividir/actualizar la prenda y no ve historial ni puntos.
7. B califica con `pipeline_calificar` y la prenda recibida sigue en la vista.
8. `anon` no puede leer la vista. Reaplicar la migración es inocuo.
