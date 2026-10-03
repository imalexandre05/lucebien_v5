# Comisión: se escribe en porcentaje, se guarda en fracción

**Fecha:** 3-oct-2026 · **Ticket:** imalexandre05/lucebien-tablero#1 · **Zona:** parámetros del
sueldo (crítica) · **Nivel:** spec + tests + verificador.

## Problema (verificado contra el código, 3-oct-2026)

1. `apps/erp-web/app/sueldos/acuerdos/cliente.tsx` pide la comisión del contrato como **fracción**
   (`max 1`, `step 0.005`, ayuda «0,02 = 2%»). Quien escribe `1.50` pensando en 1,5 % recibe
   «Tiene que estar entre 0 y 1» de `validar()` en `acuerdos/actions.ts`.
2. Los 13 campos del modal de parámetros son `<input type="number">` controlados: el `onChange`
   guarda `Number(texto)` y el `value` vuelve como `String(número)`. `1.50` se reescribe a `1.5`,
   `2.0` a `2` y `0.0` a `0` mientras se tipea, así que el cursor salta y el texto no se puede
   escribir tal cual.
3. `/configuracion` muestra el mismo parámetro global (`sueldo_pct_comision`) también como
   fracción, con la etiqueta «(fracción)». Ahí el campo guarda el texto crudo (no reformatea),
   pero la unidad es distinta de la que pide este ticket.

## Regla (lo que cambia)

- **En pantalla la comisión es un porcentaje.** `1.5` significa 1,5 %. Se acepta coma o punto
  decimal (`1,5` = `1.5`). Rango permitido en pantalla: **0 a 100** (inclusive).
- **Lo que se guarda no cambia de unidad:** sigue siendo la fracción (`0.015`) en
  `parametros.pctComision` del contrato y en `config.sueldo_pct_comision`. El motor
  (`packages/core/src/sueldos.ts`) no se toca.
- **Conversión pura y probada** en `apps/erp-web/lib/porcentaje.ts`:
  - `porcentajeAFraccion(texto)` → `{ ok: true, valor: number | null } | { ok: false, error }`.
    Texto vacío (o sólo espacios) → `valor: null` (= «usa el global» en el contrato).
    `1.5`→`0.015`, `1.50`→`0.015`, `2`→`0.02`, `2.0`→`0.02`, `0`→`0`, `100`→`1`, `1,5`→`0.015`.
    Negativo, mayor a 100, o no numérico → `ok: false`.
    El resultado no arrastra ruido de coma flotante: `1.1` da exactamente `0.011`, no
    `0.011000000000000001`.
  - `fraccionAPorcentaje(fraccion)` → texto: `0.015`→`"1.5"`, `0.02`→`"2"`, `0`→`"0"`, `1`→`"100"`.
- **Texto libre:** los campos del modal de parámetros del contrato (los 13, no sólo la comisión)
  pasan a `type="text"` con `inputMode="decimal"` y conservan lo que la persona escribe; el número
  se deriva del texto, nunca al revés mientras se edita. Un texto inválido muestra el error bajo el
  campo y **bloquea guardar el contrato** (no se guarda un valor viejo en silencio).
- El resumen de parámetros propios muestra la comisión como `1,5 %`.
- `/configuracion` muestra y edita `sueldo_pct_comision` en porcentaje (etiqueta «Comisión sobre
  ventas (%)», default visible `2`), y guarda la fracción. La validación del servidor de
  `/configuracion` sigue mirando la fracción contra `min 0`/`max 1`.
- La validación del servidor del contrato (`validar()`) **sigue** exigiendo `0 ≤ fracción ≤ 1`;
  sólo cambia el mensaje, que pasa a hablar en porcentaje.

## Fuera de alcance

- Ningún cambio de esquema ni migración; ningún valor guardado se reescribe.
- No se cambia la unidad de ningún otro parámetro.

## Decisiones de negocio

Ninguna nueva: el rango 0–100 % es el mismo 0–1 que ya existía, expresado en otra unidad.
