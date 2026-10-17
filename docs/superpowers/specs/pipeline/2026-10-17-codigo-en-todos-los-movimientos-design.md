# Código personal en todos los movimientos del pipeline + código de movimiento

Ticket: lucebien-tablero #16 · Zona crítica (no-negociable 2) · Migración 0135

## Problema
El código personal (0112/0115/0127/0128) cubre los avances de etapa. Quedan tres acciones que
atribuyen trabajo a una persona y que en un equipo compartido siguen saliendo a nombre de la
cuenta del equipo: **registrar/codificar una prenda** (`pipeline_registrar_prenda`), **enviar a
lavandería** (`lavanderia_enviar`) y **validar el retorno** (`lavanderia_validar_retorno`).
Además, ningún movimiento tiene un código propio: sólo existe el `codigo` de la prenda.

## Reglas
1. **R1 — token en las tres acciones.** Cada una recibe `p_operador uuid default null` y lo
   resuelve con `private.actor_pipeline` (igual que `pipeline_avanzar`): sin token en una cuenta
   de equipo compartido → `CODIGO:`; token ajeno o vencido → `CODIGO:` y no se escribe nada;
   cuenta personal → el actor es la sesión. Se elimina la firma vieja (sin sobrecargas, 0127).
2. **R2 — quién queda registrado.** El alta de prenda deja una fila en `prenda_historial`
   (`etapa_anterior` null → `recepcion`, obs «Alta / codificación») con el actor. El envío usa el
   actor resuelto en el historial por prenda. La validación de retorno guarda
   `listas_lavanderia.validado_por`.
3. **R3 — código de movimiento.** Toda fila nueva de `prenda_historial` recibe `codigo_mov` con el
   formato `<prefijo>-AAMMDD-NNNNN`: fecha en hora Perú tomada de la propia fila (`fecha`, nunca
   `now()` suelto en el core) y un correlativo global. Lo asigna un trigger `before insert`, así
   cubre las 9 RPC actuales y las futuras sin reescribirlas. Es único (índice parcial).
4. **R4 — lo existente no se inventa.** Las filas anteriores a 0135 quedan con `codigo_mov` nulo
   (la pantalla muestra «—»). No se retrocodifica.
5. **R5 — apartado de codificación.** Pantalla `/pipeline/codificacion`: lista los últimos
   movimientos con su código, prenda, etapa, quién y cuándo, con búsqueda por código de movimiento
   o de prenda. Sólo lectura, bajo RLS (cada sede ve lo suyo). Las tres acciones de R1 piden el
   código personal en equipos compartidos con el mismo chip de operador del tablero.

## Defaults inventados (editables en /configuracion, anotados en pendientes-negocio.md)
- `pipeline_mov_prefijo` = `MOV`. El dueño no definió formato: prefijo editable, resto fijo.

## Pruebas (packages/db/pruebas/0135_codigo_todos_los_movimientos.prueba.sql)
1. Cuenta compartida sin token: las tres acciones fallan con `CODIGO:` y no dejan fila.
2. Con token válido: el historial/validación queda a nombre del operador, no de la sesión.
3. Token de otra sesión o vencido: falla, sin escritura.
4. Cuenta personal sin token: funciona como antes (actor = sesión).
5. `codigo_mov`: formato, fecha Perú en el borde de medianoche, correlativo creciente, único;
   las filas insertadas por `pipeline_avanzar` también lo reciben.
6. Una sola firma por función; grants sólo a `authenticated`.
7. Reaplicar la migración es inocuo.
