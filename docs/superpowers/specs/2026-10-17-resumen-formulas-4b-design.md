# Fórmulas del resumen de liquidación (decisión del dueño)

Spec corta. Corrige `resumenLiquidacion()` (PR #68, `/mi-pago` y comprobante). No toca el motor.

## Las tres fórmulas confirmadas

- **Total final** = sueldo + beneficios − descuentos (sin contar adelantos). Ya es así: `total congelado + adelantos`.
- **Restante** = total final − adelantos (− abonos ya pagados, que es el saldo real por pagar). Ya es así.
- **Total invertido** = **total final** + almuerzos. **Hoy está mal**: usa `total congelado + almuerzos`,
  que ya restó los adelantos, y por eso sale menor de lo que la empresa invirtió.

## Cambio

Sólo `totalInvertido`: pasa de `total + almuerzos` a `totalFinalPorPagar + almuerzos`.
Ejemplo del test: total final 1.300 + almuerzos 24 = 1.324 (antes 1.024).

## Dudas para el dueño

Los almuerzos ya van dentro de «Otros beneficios» (y de Total final); sumarlos otra vez en el Total invertido
los cuenta dos veces. Se implementa tal cual lo pidió el dueño (como el Excel); queda anotado en
`docs/pendientes-negocio.md`.

## Defaults inventados

Ninguno.
