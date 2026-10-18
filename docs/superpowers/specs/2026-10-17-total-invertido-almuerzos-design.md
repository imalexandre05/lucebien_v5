# Total invertido: los almuerzos se cuentan una sola vez

Spec corta. Decisión del dueño (17-oct-2026), que corrige la spec 4B del resumen (`2026-10-17-resumen-formulas-4b-design.md`).

## Regla

**Total invertido = lo pagado a la persona + los almuerzos que puso la empresa.**

- «Lo pagado a la persona» es el **total final** (ya incluye la línea «Almuerzos»: los almuerzos con derecho que NO se
  entregaron en especie y se pagan en soles).
- «Almuerzos que puso la empresa» son los **entregados en especie**: `(días con derecho − almuerzos a pagar) × valor del
  almuerzo`, con el valor que usó esa liquidación (`parametros_usados.valorAlmuerzo`). Salen del snapshot congelado
  (`resultado.base.diasConDerechoAlmuerzo` y `almuerzosAPagar`), no de la configuración de hoy.
- Así cada día con derecho a almuerzo entra una sola vez: en soles si se pagó, en especie si se entregó.

## Cambio (sin migración)

- `resumenLiquidacion()` recibe `almuerzosEmpresa?: number` (soles de los entregados en especie; ausente = 0) y
  `totalInvertido = totalFinalPorPagar + almuerzosEmpresa`. Se deja de sumar la fila «Almuerzos» otra vez.
- `sueldos-repo.ts` calcula `almuerzosEmpresa` del snapshot. Si el snapshot no trae esos datos (liquidaciones muy viejas),
  queda en 0 y el Total invertido es el total final (no se inventa).
- Fila «Suma de almuerzos» de la pantalla: sin cambio (sigue mostrando lo pagado en soles).

## Defaults inventados

Ninguno.
