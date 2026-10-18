# No se divide una prenda ya enviada (lucebien-tablero #39, bloque «Dividir»)

Sesión 5A · Zona crítica (no-negociable 2) · Migración 0152

## Problema
`pipeline_dividir` no mira la etapa. Si la prenda ya está `enviado` (o `recibido`), las dos hijas
nacen sin `envio_id`: la tienda no las ve y quedan huérfanas, y la madre queda `dividido` con un
envío colgando.

## Reglas
1. **R1.** `pipeline_dividir` solo divide prendas en el proceso: `recepcion`, `codificacion`,
   `lavado`, `empatado`, `refaccion`, `compostura`, `planchado`, `control_calidad` y `listo`
   (aún no despachada). En `enviado`, `recibido` o cualquier otra etapa → `TRANSICION:` y no se
   escribe nada (ni hijas, ni historial).
2. **R2.** Nada más cambia: mismo cuerpo que la 0128 (código de operador, `for update`, historial con
   código de movimiento).

## Defaults inventados
Ninguno. Decisión: `listo` sigue permitido (el ticket solo pide bloquear lo enviado); queda por
confirmar con Alexander si también debe bloquearse.

## Pruebas (0152_no_dividir_enviada.prueba.sql)
1. Dividir una prenda `enviado` → `TRANSICION:`, sin hijas ni historial nuevo.
2. Dividir una `recibido` → `TRANSICION:`.
3. Dividir una prenda en `lavado` → ok, dos hijas en `lavado`, madre `dividido`.
4. Dividir una `listo` → ok (comportamiento actual conservado).
5. Dividir una ya dividida → "ya fue dividida" (sin cambios).
