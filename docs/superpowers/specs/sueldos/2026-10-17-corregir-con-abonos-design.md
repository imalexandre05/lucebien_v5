# Corregir una liquidación que ya tiene abonos: lo pagado se descuenta solo

Ticket: lucebien-tablero #30 · Zona crítica (cadena del sueldo, pagos) · Migración 0137

## Problema
Con un abono registrado, «Corregir» falla («anúlalos con motivo antes de anularla»). Para seguir hay
que anular un pago que **sí se entregó**; después la liquidación anulada dice «No se le registra
ningún pago» y la nueva arranca en cero: hay riesgo de pagar dos veces.

## Decisión del dueño
Al corregir una liquidación con abonos, **lo ya entregado se descuenta solo** de la corregida y queda
el saldo. No se obliga a anular pagos reales.

## Reglas
1. **Los pagos no se mueven ni se anulan.** Siguen colgados de la liquidación original (anulada).
   La corregida apunta a ella con `sueldo_liquidaciones.corrige_a`.
2. **Lo pagado de una liquidación** = abonos vigentes propios + los de toda la cadena de
   liquidaciones que corrige (recursivo). Saldo = total − pagado. Una corrección encadenada
   (corregir lo ya corregido) arrastra todo.
3. **Vínculo automático.** Un trigger `before insert` enlaza la liquidación nueva con una anulada
   del mismo contrato y **exactamente el mismo período** que tenga abonos vigentes y no tenga ya
   sucesora viva. Así, aunque la creación del borrador falle y se reintente a mano, los pagos no
   quedan huérfanos.
4. **`sueldo_liquidacion_corregir_anular(liquidacion, motivo)`** (solo administrador) anula con abonos
   vigentes; es la **única** excepción a la regla de la 0080. La anulación común sigue bloqueada si
   hay abonos.
5. **Anti-sobrepago sobre la cadena:** `sueldo_liquidacion_pagar` y el trigger de pagos comparan
   (pagado de la cadena + abono) con el total de la liquidación nueva.
6. **`sueldo_pagos_de_cadena(ids)`** (invoker, bajo RLS) devuelve los abonos de la cadena de cada id,
   con la liquidación de origen, para que la pantalla los muestre siempre, incluso los de las anuladas.
7. **Pantalla.** En la liquidación corregida se ve «Ya pagado: S/X (de la liquidación anterior)»,
   «Saldo: S/Y» y la lista de abonos con su origen.

## Default inventado (pendientes-negocio.md)
Si lo ya pagado supera el nuevo total, el saldo queda **negativo** («pagado de más») y no se bloquea
el cierre: nadie devuelve plata automáticamente. Falta que el dueño decida cómo se compensa.

## Pruebas (packages/db/pruebas/0137_corregir_con_abonos.prueba.sql)
1. Anular común con abonos sigue fallando (ESTADO).
2. `corregir_anular` con abonos: anula, los abonos quedan vigentes y sin tocar.
3. La liquidación nueva (mismo contrato y período) queda enlazada sola; `pagos_de_cadena` ve los abonos.
4. Anti-sobrepago: abono que excede el saldo de la cadena → SALDO; abono dentro del saldo → ok.
5. Corrección encadenada arrastra los abonos de los dos eslabones.
6. Período distinto → no se enlaza.
7. Sin abonos: `corregir_anular` se comporta como la anulación común y no enlaza nada.
8. No administrador → PERMISO; anon sin execute.
9. Reaplicar es inocuo.

## Corrección tras la revisión adversarial
10. **Sin abonos huérfanos.** Si se crea una liquidación nueva que se solapa con una anulada (mismo
    empleado) cuya cadena tiene abonos vigentes y que nadie corrige todavía, y no hay coincidencia
    exacta de contrato y período, la creación falla con `PERIODO:` («corrige con el mismo contrato y
    período, o anula antes los pagos»). Nunca queda una liquidación sin enlace pagando de nuevo lo ya pagado.
11. **`corrige_a` validado** en insert y update: debe apuntar a una liquidación anulada del mismo
    empleado y contrato, distinta de sí misma y que ninguna otra corrija ya. Nadie puede colgarle los
    abonos de otra persona a una liquidación.
