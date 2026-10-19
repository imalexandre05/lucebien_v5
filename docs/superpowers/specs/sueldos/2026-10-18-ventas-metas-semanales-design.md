# SPEC — Ventas y metas manuales rápidas, por semana

> Spec completa · cadena del sueldo · sesión 7 · 18-oct-2026 · migración **0166**.
> Decisión del dueño n.º 8 (18-oct-2026). Temporal: hasta conectar el sistema de punto de venta por API.

## 1. Lo que decidió el dueño (18-oct-2026)

> **8. VENTAS Y METAS MANUALES RÁPIDAS** «(hasta conectar con el sistema de punto de venta por API).
> Nada de boleta por boleta: por semana, el admin pone «Total de boletas mayores a S/120» y «¿Cumplió
> la meta semanal? sí/no» (o el monto vendido). Con eso se calculan 1ª comisión (2%) y 2ª (S/30 por
> meta). Que se vea como referencia.»

## 2. Lo que hay hoy (verificado)

- Las ventas se cargan boleta por boleta en `sueldo_ventas` (`/sueldos/ventas`). El motor arma con
  ellas las semanas del período (`tramosSemanales`), la meta de cada una, la 2.ª comisión (bono
  S/30 por semana cumplida, RN-12) y la 1.ª (2 % de las boletas mayores a S/120, **sólo si el total
  del período llega a la meta del mes**, RN-13).

## 3. La regla

- Por cada **semana del pago** (las mismas de `tramosSemanales` del período del pago), el
  administrador carga en la ficha, pestaña «Ventas y metas»:
  - **Total de boletas mayores a S/120** (soles, ≥ 0).
  - **¿Cumplió la meta semanal?** Sí / No — **o** el **monto vendido** de la semana (si se pone el
    monto, el sistema decide si cumplió comparando con la meta de esa semana).
- **2.ª comisión**: S/30 (`bonoMetaSemanal`) por cada semana cumplida.
- **1.ª comisión**: 2 % (`pctComision`) de la suma de los totales de boletas mayores a S/120.
  - **Default a confirmar:** con la carga por semana no se sabe la venta total del mes, así que la
    condición de RN-13 («sólo si llega a la meta del mes») **se aplica sólo si se cargó el monto
    vendido de todas las semanas**; si no, la 1.ª comisión se paga sin esa condición. Anotado en
    `docs/pendientes-negocio.md`.
- **Que se vea como referencia:** al lado de cada semana, la pantalla muestra lo que esa semana
  aporta («+ S/30» y «2 % de S/1.200 = S/24») y, abajo, el total estimado de comisiones del pago.
- Si una semana tiene carga manual, **las boletas sueltas de esa semana no se usan** para estas dos
  comisiones (no se cuenta dos veces). Sin carga manual en ninguna semana del período, todo sigue
  como hoy.
- Una semana de un pago ya cerrado no se edita (como las ventas, 0144).

## 4. Datos (migración 0166)

- Tabla `sueldo_ventas_semana`: `id`, `empleado_id`, `desde`, `hasta`, `total_boletas_mayores
  numeric(12,2) not null default 0 check ≥ 0`, `meta_cumplida boolean null`, `monto_vendido
  numeric(12,2) null check ≥ 0`, `creado_por`, `creado_en`, `actualizado_en`; único
  `(empleado_id, desde)`; `hasta ≥ desde`, a lo sumo 10 días (default técnico: la última semana de
  un mes absorbe hasta 3 días más).
- RLS: el administrador lee y escribe todo; cada persona lee las suyas (aislamiento, regla 3).
- Trigger: no se inserta, cambia ni borra una semana cuyo `desde` cae en un pago cerrado
  (`private.sueldo_estado_fecha`), con mensaje `PERIODO_CERRADO:`.
- `sueldo_entrada` (cuerpo de la 0144) agrega `ventasSemanales` con las semanas cuyo `desde` cae en
  el rango, **sólo si hay alguna** (regresión: sin carga manual el jsonb es el mismo de hoy). Como
  el cierre compara `sueldo_entrada`, un cambio después de calcular responde DESACTUALIZADA.

## 5. Motor

- `EntradaLiquidacion.ventasSemanales?: { desde, hasta, totalBoletasMayores, metaCumplida,
  montoVendido }[]`.
- Semana del período con carga manual (la carga cuyo `desde` cae dentro de la semana): cumplida =
  `metaCumplida === true`, o, si `metaCumplida` es null, `montoVendido > meta de la semana`. Sus
  boletas sueltas no cuentan para la base de comisión ni para cumplir la meta.
- Base de la 1.ª comisión = boletas sueltas mayores a S/120 de las semanas sin carga + totales de
  las cargas manuales. Condición de RN-13 como en §3.
- Las líneas no cambian de nombre («Comisión 2%», «Bono por metas semanales»); el detalle dice
  «carga semanal» cuando la hay.

## 6. Tests (antes del código)

1. Dos semanas cargadas (S/1.000 y S/500 de boletas, una cumplida): 2.ª = S/30; 1.ª = 2 % de 1.500 =
   S/30 (sin monto vendido: sin condición de meta del mes).
2. Monto vendido mayor a la meta sin sí/no → cumplida; menor → no.
3. Monto vendido en todas las semanas y la suma no llega a la meta del mes → sin 1.ª comisión.
4. Una semana con carga y boletas sueltas en la misma semana: las sueltas no suman.
5. Sin cargas: liquidación idéntica a hoy (regresión).
6. SQL 0166: el admin carga; un empleado ve sólo las suyas y no escribe; una semana de un pago
   cerrado no se edita; `sueldo_entrada` emite `ventasSemanales` sólo si hay; cambiar una semana
   después del cálculo hace que el cierre responda DESACTUALIZADA.

## 7. Defaults inventados

- RN-13 con carga semanal (§3). Semana de a lo sumo 10 días.
