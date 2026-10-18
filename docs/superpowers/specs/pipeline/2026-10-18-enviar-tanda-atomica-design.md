# Envío por tanda atómico (lucebien-tablero #39, bloque «Envíos»)

Sesión 5A · Zona crítica (no-negociable 2) · Migración 0153

## Problema
`enviarTandaPrendas` lanza un `pipeline_enviar` por prenda con `Promise.all`. Si una falla (por
ejemplo una ya no está en «listo»), las demás sí se envían: la tanda queda a medias y la pantalla
no sabe cuáles.

## Reglas
1. **R1.** Nueva RPC `pipeline_enviar_tanda(p_ids uuid[], p_sede text, p_operador uuid default null)`
   que llama a `pipeline_enviar` por cada prenda **dentro de una sola transacción**: o salen todas o
   no sale ninguna, y el error dice cuál prenda falló (`TRANSICION`/permiso se conservan).
2. **R2.** Cada prenda conserva su propio envío (`envios_prendas`) como hoy; no se inventa un
   envío por tanda. El código de operador (0112) se valida una vez al inicio de cada llamada.
3. **R3.** Lista vacía o repetida → se ignoran los repetidos; lista vacía → error claro.
4. **R4.** La acción del servidor usa la RPC nueva en vez de `Promise.all`.

## Defaults inventados
Ninguno.

## Pruebas (0153_enviar_tanda.prueba.sql)
1. Tanda de 3 prendas en `listo` → las 3 pasan a `enviado`, cada una con envío.
2. Tanda con una prenda que no está en `listo` → error y NINGUNA cambia (atomicidad).
3. Tanda con una prenda de otra sede sin permiso → "Prenda no encontrada" y ninguna cambia.
4. Lista vacía → error. IDs repetidos → se envía una vez.
5. Cuenta compartida sin token → `CODIGO:` y nada cambia.
