# La tienda ve las prendas que le despachan (lucebien-tablero #43)

Sesión 5A · **Spec completa**: cambia RLS (no-negociable 3) · Migración 0151

## Problema
`pasada_select` (0122) deja ver una prenda solo por su **sede de origen**. Si entró por la sede A y
se despachó a la tienda B, B no la ve en la base aunque el envío sí le llega. `pipeline_calificar`
ya reconoce a la tienda destino (versión viva en 0115; 0112 la conserva); lo que falla es la **lectura** (listas y tableros).

## Pregunta al cliente (ticket «duda-cliente»)
¿Una tienda debe ver toda prenda que le fue enviada, sin importar por qué sede entró? Lo esperable
es que sí; esta spec lo asume y queda por confirmar con Alexander antes de mergear.

## Reglas
1. **R1 — Lectura por destino.** Un usuario ve una `prenda_pasada` si cumple lo de hoy
   (admin, almacén o sede de origen en `app_sedes()`) **o** si `envio_id` apunta a un envío cuya
   `sede_destino_cod` está en `app_sedes()`. Se resuelve con una función `security definer`
   (`private.envio_es_de_mi_sede`) para no depender de las políticas de `envios_prendas`.
2. **R2 — Solo lo despachado.** Una prenda observada en tienda vuelve al proceso con
   `envio_id = null` y deja de verse en la tienda destino; una recibida conserva su `envio_id`.
3. **R3 — Solo lectura.** No cambia insert, update ni delete. La tienda destino **no** gana permiso
   para avanzar, rechazar, deshacer ni dividir (`pipeline_exigir_acceso` sigue por sede de origen);
   califica con `pipeline_calificar`, que ya la admite.
4. **R4 — Aislamiento.** `prenda_historial` y `pipeline_puntos` **no** se amplían: la tienda destino
   no ve el historial ni los puntos (no-negociable 3). **Exposición declarada:** al leer la fila de
   `prenda_pasada` la tienda destino recibe también `lavador_id`, `planchador_id`, `pedido_id` y las
   observaciones internas. Los uuid de las personas **no se resuelven a nombre** (la RLS de `empleados`
   no deja a la tienda leerlos) y no son sueldo, nota ni puntuación 360°. Si el dueño quiere ocultarlos,
   el siguiente paso es una vista con columnas limitadas; queda como pendiente.
5. Una tienda ajena (ni origen ni destino) sigue sin ver la prenda.

## Defaults inventados
Ninguno.

## Pruebas (packages/db/pruebas/0151_tienda_ve_despachos.prueba.sql)
1. Tienda destino B ve la prenda de A enviada a B.
2. B no ve una prenda de A en proceso, ni una enviada a otra tienda C.
3. Prenda observada (envio_id null) deja de verse en B; recibida sigue visible.
4. Origen A sigue viendo lo suyo; C no ve nada de A→B.
5. B no puede avanzar/dividir/rechazar la prenda (Prenda no encontrada) y sigue sin update directo.
6. B no ve `prenda_historial` ni `pipeline_puntos` de esa prenda.
7. B califica con `pipeline_calificar` (recibida) y la ve después.
8. Reaplicar la migración es inocuo.
