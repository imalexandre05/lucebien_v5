# El tablero no trae las prendas ya recibidas (lucebien-tablero #39, «desaparecen del tablero»)

Sesión 5A · Sin migración · Cambio de lectura

## Problema
`listarPasadas` trae todo el historial de `prenda_pasada` sin filtro. PostgREST corta a 1000 filas
y, como se ordena por fecha de ingreso descendente, las prendas más antiguas que **siguen en
proceso** dejan de verse en el tablero cuando el historial crece.

## Reglas
1. `listarPasadas({ soloActivas: true })` excluye las prendas en etapa `recibido` (viaje terminado).
   Se conservan las `dividido` porque el tablero las usa para ofrecer «Deshacer división».
2. El tablero (`/pipeline`) usa `soloActivas`. Las métricas y el panel de inicio siguen contando
   todo (muestran «Recibidas»), sin cambios.
3. Sin tope nuevo: con las recibidas fuera, lo que queda es lo que está en proceso o en camino.

## Defaults inventados
Ninguno.
