# Tanda: resultado honesto y «Deshacer» (lucebien-tablero #39, bloque «Tanda equivocada»)

Sesión 5A · Zona crítica (puntos y no-negociable 2) · Migración 0155

## Problema
- `pipeline_avanzar_tanda` omite en silencio las prendas que no se pueden avanzar y el aviso dice
  «N prendas movidas» aunque haya omitido algunas.
- Una tanda equivocada no tiene «Deshacer»; el deshacer simple dura 5 segundos.

## Reglas
1. **R1 — Resultado detallado.** Nueva RPC `pipeline_avanzar_tanda_resultado(p_ids, p_destino,
   p_operador)` que devuelve `{puntos, movidas, omitidas}` (omitidas = cuántas no se pudieron
   mover). Mismo recorrido que hoy (omite sin abortar; el token inválido aborta todo, como hoy).
2. **R2 — Compatibilidad.** `pipeline_avanzar_tanda` conserva firma y retorno numérico (las pruebas
   0112/0115 dependen de ellos) y pasa a delegar en la nueva (`puntos`). Sin sobrecargas.
3. **R3 — Deshacer tanda atómico.** Nueva RPC `pipeline_deshacer_tanda(p_items jsonb, p_operador)`,
   con `p_items = [{"id": uuid, "etapa_anterior": text}, ...]`, que llama a `pipeline_deshacer` por
   prenda en una sola transacción y en orden fijo: si una no se puede deshacer, no se deshace
   ninguna y el error nombra la prenda. Devuelve cuántas deshizo. Lista vacía → error.
4. **R4 — Pantalla.** Tras una tanda el aviso dice «N de M prendas → Etapa» (y cuántas se omitieron)
   y ofrece «Deshacer» (llama a la RPC de R3 con la misma etapa de origen). El aviso con «Deshacer»
   dura 10 segundos en vez de 5 (default de pantalla, no regla de negocio).
5. Los puntos que se quitan al deshacer son los de ese movimiento (0128), sin cambios.

## Defaults inventados
- Duración del aviso con «Deshacer»: 10 s (pantalla).

## Pruebas (0155_tanda_deshacer.prueba.sql)
1. `resultado` con una prenda que no se puede avanzar: `movidas`=2, `omitidas`=1, `puntos` = suma.
2. `pipeline_avanzar_tanda` sigue devolviendo el mismo número de puntos.
3. `deshacer_tanda` de dos prendas recién avanzadas → vuelven a su etapa, se quitan sus puntos.
4. `deshacer_tanda` con una prenda que ya no está en la etapa esperada → error con su código y NINGUNA
   se deshace (atomicidad).
5. Lista vacía → error. Token de otra sesión → `CODIGO:` y nada cambia.
6. Una sola firma por función y sin `execute` para anon.
