# Declarar en bloque los días partidos en tramos (spec corta)

**Fecha:** 18-oct-2026 · **Pantalla:** `/sueldos/asistencia` · **Decide:** el dueño (18-oct-2026)

## Problema
«Declarar los días hasta hoy» excluía los días con varios tramos de huella: repartir las horas del
contrato entre tramos sería inventar. El dueño decidió que sí se declaren en bloque, con
confirmación y resumen previo.

## Regla (default conservador, editable; ver `docs/pendientes-negocio.md`)
Para cada día partido (más de una fila) con algún tramo `sin_dato`, hasta hoy (hora Perú) y dentro de la vista:
1. **Tramo cerrado** (tiene entrada y salida marcadas por el huellero, ninguna estimada): se declara
   `trabajado` con **sus horas reales de huella**. No se reparte ni se completa nada.
2. **Tramo abierto** (falta entrada o salida, o alguna hora es estimada): **no se declara**. Queda
   `sin_dato`, y el resumen avisa que sigue bloqueando la liquidación hasta cerrarlo o editarlo a mano.
3. Tramos ya declarados: no se tocan.
4. Cada tramo se declara con su `turno` (una fila por tramo; no se crean filas nuevas).

## Pantalla
Un solo paso de confirmación (`useConfirmacion`) que lista: días de un tramo (con horas del contrato),
y por cada día partido sus tramos con horas por tramo, y aparte los tramos abiertos que quedan sin declarar.
El botón cuenta los días de un tramo más los tramos cerrados de días partidos.

## Fuera de alcance
Sin migraciones ni cambios en core/RPC: se reutiliza `accionDeclararVarios`/`declararDia` con `turno`.
