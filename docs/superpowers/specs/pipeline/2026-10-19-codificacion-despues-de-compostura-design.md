# Codificación después de Compostura

Sesión 10A · Zona crítica (no-negociable 2: avance solo por RPC) · Migración 0179 · Corrige la 0147

## Problema
La 0147 puso «Codificación» entre Recepción y Lavado. El dueño (19-oct-2026) indica que va
**después de Compostura**: la prenda se etiqueta cuando ya está arreglada, justo antes de planchar.

## Reglas
1. **R1 — Orden.** `ETAPAS_PIPELINE`: … refaccion, compostura, **codificacion**, planchado, …
   El tablero muestra las columnas en ese orden.
2. **R2 — Transiciones** (core `TRANSICIONES` y lista blanca de `pipeline_avanzar`, iguales):
   - `recepcion → lavado | refaccion` (ya no llega a codificación).
   - `refaccion → compostura | codificacion | planchado`.
   - `compostura → codificacion | planchado`.
   - `codificacion → planchado`.
   La etapa sigue siendo opcional (compostura y refacción pueden ir directo a planchado).
3. **R3 — Prendas que ya están en codificación con el orden viejo.** Entraron desde recepción y no
   se han lavado. Para no pagar dos veces la recepción ni perderlas, la RPC conserva para ellas la
   salida antigua (`lavado | refaccion`), sólo si su historial tiene `recepcion → codificacion`.
   No se mueve ningún dato.
4. **R4 — Código personal y puntos** sin cambio: `pipeline_avanzar` sigue pidiendo `actor_pipeline`;
   completar `codificacion` paga `pts_codificacion` (1, editable). Deshacer funciona igual.

## Pruebas
- SQL `0179_codificacion_despues_compostura.prueba.sql`: compostura→codificación y
  codificación→planchado funcionan; refacción→codificación funciona; recepción→codificación,
  codificación→lavado (sin historial viejo) y lavado→codificación → `TRANSICION:`; una prenda con
  historial recepción→codificación todavía sale a lavado; el avance deja historial con código.
- TS `pipeline.test.ts`: codificación queda entre compostura y planchado y las transiciones coinciden.
