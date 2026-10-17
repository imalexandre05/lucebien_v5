# Resumen de liquidación (como la hoja RESUMEN del Excel) y «Mi pago»

Tablero lucebien-tablero#9 (resumen) y #32 (el colaborador ve su liquidación). Spec corta.

## Qué se construye

1. **Función pura** `resumenLiquidacion()` en `packages/core/src/resumen-liquidacion.ts`. Recibe lo que
   el sistema YA guardó: el snapshot `resultado` de la liquidación (líneas y ventas), el total
   congelado y los abonos. No recalcula nada del motor: reagrupa las líneas por concepto.
2. **Componente** `ResumenLiquidacion` (tarjeta, legible en celular, imprimible) usado en:
   - el comprobante del administrador (`/sueldos/liquidaciones/[id]/comprobante`);
   - la pantalla nueva **`/mi-pago`**, donde cada persona ve SÓLO sus liquidaciones cerradas.

## Mapa Excel → sistema (sin fórmulas nuevas)

| Fila del Excel | Fuente |
|---|---|
| Total de ventas acordado | `resultado.ventas.metaPeriodo` |
| Total de ventas logrado | `resultado.ventas.total` |
| Mínimo de ventas para continuar / ¿continúa? | **No existe en el sistema** → «No configurado» (pendiente de negocio) |
| Horas extras (+/−) | líneas «Diferencia de horas» + «Horas fuera de contrato» |
| 1ª comisión | línea «Comisión …%». La 2ª comisión **no existe** → «No configurado» |
| Adicional por capacitación | línea «Apoyo en capacitación» |
| Otros beneficios | bono por metas semanales, bono por puntos, bonos extras (el Excel no los separa; se muestran para que el total cuadre) |
| Penalidad por tardanzas / faltas / reportes | líneas «Descuento por tardanzas», «Faltas injustificadas», «Reportes con descuento» |
| Sueldo | línea «Sueldo» |
| Total beneficios / descuentos | suma de las filas anteriores |
| Total final por pagar | `total congelado + adelantos` (el motor ya descontó los adelantos; el Excel los resta después) |
| Total de adelantos | línea «Adelantos» (en positivo) |
| Restante | `total congelado − abonos no anulados` (mismo saldo que la pestaña de pago) |
| ¿Cancelado? | Sí si el restante es 0 y el total es mayor que 0 |
| Suma de almuerzos | línea «Almuerzos» |
| Total invertido ADM | `total congelado + almuerzos` (como pidió el Excel) |

**Invariante:** sueldo + horas extras + beneficios − descuentos = total final por pagar. Si una línea
nueva del motor no se reconoce, cae en «Otros» y el invariante se mantiene.

## Aislamiento (no-negociable 3)

Sin migración. `sueldo_liquidaciones`, `_lineas` y `_pagos` ya tienen RLS de lectura
`empleado_id = auth.uid()` (0072, 0080). `/mi-pago` usa el cliente de sesión (`getServerClient`),
filtra además por el id de la sesión y por `estado = 'cerrada'`, y pide la reautenticación como
`/mi-desempeno`. Nunca `getAdminClient`.

## Defaults inventados

Ninguno: lo que falta se muestra «No configurado» y se anota en `docs/pendientes-negocio.md`.
