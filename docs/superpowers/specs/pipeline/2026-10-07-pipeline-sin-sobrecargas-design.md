# Spec — Las RPC del pipeline sin sobrecargas (0127)

**Fecha:** 07-oct-2026 · **Origen:** integración de la rama `release/2026-10-07` · **Zona:** pipeline (RPC de avance).

## Problema (verificado en Postgres local aplicando 0001→0126)

La 0112 y la 0115 (código personal, #42 y #51) reemplazan las RPC del pipeline por una versión con
un tercer parámetro `p_operador uuid default null`. La 0122 (#59) escribe las mismas RPC con la firma
**antigua** de dos parámetros, sin `drop`. En orden numérico (0112, 0115, 0122) quedan las dos firmas:

- `pipeline_avanzar(uuid, text)` y `pipeline_avanzar(uuid, text, uuid)` (y lo mismo con `avanzar_tanda`,
  `enviar`, `rechazar`, `deshacer`, `dividir`, `deshacer_division` y `calificar`).
- Una llamada sin operador es **ambigua** (`function pipeline_avanzar(uuid, unknown) is not unique`).
  Falla en pruebas 0086, 0112, 0115 y 0122.
- Peor: la firma de dos parámetros no pasa por `private.actor_pipeline(p_operador)`. Un equipo
  compartido podría llamarla y saltarse el token de operador (no-negociable 3: la atribución).

## Decisión

Una migración 0127 elimina las ocho firmas antiguas. Queda sólo la versión con `p_operador default null`,
que ya trae `private.pipeline_exigir_acceso` y los arreglos H-7 de la 0122 (la 0115 los repite, spec
`2026-10-05-puntos-solo-rpc-design.md` §12 y §13). Las llamadas sin operador siguen funcionando
(`null` = el actor es la sesión). No se cambia ninguna regla de negocio.

## Criterios de aceptación

1. Tras 0001→0127 existe una sola firma por cada RPC `pipeline_*` pública de avance.
2. Una llamada de dos argumentos resuelve a la versión con operador y no es ambigua.
3. `private.pipeline_exigir_acceso(uuid)` sigue existiendo; `anon` no ejecuta ninguna de las ocho.
4. Reaplicar 0110–0127 no falla (idempotente: `drop function if exists`).

Default inventado: ninguno.
