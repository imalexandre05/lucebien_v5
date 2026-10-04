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
- El placeholder de los parámetros del contrato **no muestra un número**: dice «Si lo dejas vacío se
  usa el valor de Configuración». Antes mostraba `PARAMETROS_SUELDO_DEFAULT` del core, que no es el
  global real: si el global es 3 %, se leía «2». La pantalla no recibe el global y no se agrega una
  consulta nueva para eso (ajuste del 4-oct-2026). `metaSemanal` mantiene «sin meta pactada».
- `/configuracion` muestra y edita `sueldo_pct_comision` en porcentaje (etiqueta «Comisión sobre
  ventas (%)», default visible `2`), y guarda la fracción. La validación del servidor de
  `/configuracion` sigue mirando la fracción contra `min 0`/`max 1`.
- La validación del servidor del contrato (`validar()`) **sigue** exigiendo `0 ≤ fracción ≤ 1`;
  sólo cambia el mensaje, que pasa a hablar en porcentaje.

## Aviso por comisión muy baja (decidido el 4-oct-2026)

Quien escriba `0.02` por costumbre de la unidad vieja pacta 0,02 %, cien veces menos. Decisión del
usuario, que llegó por la sesión maestra el 4-oct-2026:

- **No hay mínimo de comisión.** Todo valor entre 0 y 100 % sigue siendo válido.
- **Se pide confirmación** cuando la comisión escrita es **mayor que 0 y menor que 0,5 %**, es
  decir, cuando la fracción está en `0 < f < 0.005`. **0 no pide confirmación.** Exactamente 0,5 %
  tampoco.
- El aviso se ve bajo el campo mientras se escribe: «¿Seguro? 0,02 % es muy bajo. Si quisiste 2 %,
  escribe 2». Al guardar se abre un diálogo de confirmación (`DialogoConfirmar`, tono `aviso`), y
  sólo se guarda si la persona confirma.
- Aplica al contrato (`sueldos/acuerdos`) y a `/configuracion` (`sueldo_pct_comision`).
- **Sólo pregunta si el valor cambió** (ajuste del 4-oct-2026, verificación de la sesión maestra).
  En `/configuracion`, contra el valor guardado. En un contrato existente, contra la comisión que
  ya tenía guardada. Un contrato nuevo pregunta siempre que la comisión esté en el rango del aviso.
  Una comisión ya guardada en ese rango no vuelve a preguntar en cada guardado.
- **El umbral 0,5 % es un default de interfaz**, no una regla de negocio. Vive como constante
  comentada (`UMBRAL_AVISO_COMISION` en `lib/porcentaje.ts`) y figura en
  `docs/pendientes-negocio.md` como «umbral de aviso, confirmar con el cliente». El servidor no lo
  aplica: sólo avisa, no rechaza.
- Función pura y probada: `comisionRequiereConfirmacion(fraccion)` → `fraccion > 0 && fraccion < 0.005`.

## Fuera de alcance

- Ningún cambio de esquema ni migración; ningún valor guardado se reescribe.
- No se cambia la unidad de ningún otro parámetro.

## Decisiones de negocio

El rango 0–100 % es el mismo 0–1 que ya existía, expresado en otra unidad. El umbral del aviso
(0,5 %) es un default de interfaz y está pendiente de confirmar con el cliente.
