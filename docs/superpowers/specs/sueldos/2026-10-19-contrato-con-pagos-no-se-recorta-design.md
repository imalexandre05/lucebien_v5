# Un contrato con liquidaciones no se recorta, y la renovación hereda la tarifa vigente

Auditoría 1 · Zona crítica (cadena del sueldo, no-negociable 1) · Migración 0172 · Corrige
`sueldo_acuerdos` (0167, edición) y `sueldo_acuerdo_renovar` (0170)

## Problema (comprobado en Postgres local)
1. **Doble pago al acortar un contrato ya liquidado.** Contrato A 1–31 oct, liquidación 1–31 oct
   cerrada y pagada. El admin edita A a 1–15 oct: `sueldo_acuerdo_guardar` lo acepta. Se crea el
   contrato B 16 oct–15 nov y su liquidación 16–31 oct se cierra sin error: del 16 al 31 de octubre
   se paga dos veces (≈ S/774 con S/1500 al mes). `sueldo_liq_periodo_sin_solape` compara por
   contrato, no por persona, y nada revisa las liquidaciones al editar el contrato. La 0149
   (suspender) ya bloquea este caso; la edición normal no.
2. **La renovación copia una tarifa vieja.** Contrato por horas a 5,00; cambio desde 1-feb a 6,50;
   cambio desde 1-mar sólo de frecuencia (tarifa nula = «sigue la anterior»). `sueldo_acuerdo_renovar`
   toma sólo el último cambio y, al ver tarifa nula, vuelve a la del contrato: renueva a 5,00 en vez
   de 6,50. El core (`packages/core/src/sueldos.ts`, arrastre de tarifa) sí usa la última no nula.

## Reglas
1. **R1 — Las liquidaciones no anuladas quedan dentro de su contrato.** Un `update` de
   `sueldo_acuerdos` (por la RPC o directo) que deje alguna liquidación no anulada del contrato con
   `desde < fecha_inicio` o `hasta > fecha_fin` → `PERIODO:` con la fecha y qué hacer («anula esa
   liquidación primero o deja el contrato hasta el …»). Lo hace un trigger, así cubre todos los caminos.
2. **R2 — El dueño del contrato no cambia si ya tiene liquidaciones.** Cambiar `empleado_id` con
   alguna liquidación no anulada → `PERIODO:`.
3. **R3 — Renovar hereda la última tarifa no nula** de los cambios con `desde <= fecha_fin`; si
   ninguno la tiene, la del contrato. Frecuencia y cuota siguen como en la 0170.
4. Nada más cambia: crear, suspender (0149) y renovar sin cambios funcionan igual.

## Defaults inventados
Ninguno.

## Pruebas (packages/db/pruebas/0172_contrato_con_pagos.prueba.sql, escrita antes que la migración)
1. Contrato con liquidación cerrada 1–31 oct: recortar a 1–15 oct → `PERIODO:`, el contrato no cambia.
2. Mismo caso por `update` directo (como admin) → `PERIODO:`.
3. Correr el inicio a 5-oct → `PERIODO:`.
4. Alargar el fin (1-oct a 30-nov) → se acepta.
5. Con la liquidación anulada, recortar → se acepta.
6. Cambiar `empleado_id` con liquidación no anulada → `PERIODO:`.
7. `empleado_suspender` con p_hoy después del fin de lo liquidado sigue funcionando.
8. Renovar contrato por horas 5,00 → cambio 6,50 → cambio sólo de frecuencia: el nuevo sale con 6,50.
9. Renovar sin cambios: sale con la tarifa del contrato (como hoy).
