# Movimientos con fecha en un período cerrado: se pregunta, nunca se pierden

Ticket: lucebien-tablero #29 · Zona crítica (cadena del sueldo) · Migración 0136

## Problema
Un adelanto, descuento o bono con fecha dentro de un período ya **cerrado** (o fuera de todo
contrato) se acepta, pero ninguna liquidación lo toma nunca: el cierre sólo sella filas dentro de su
rango y el siguiente período ya no cubre esa fecha. El adelanto no se descuenta y la persona cobra
de más. Pasa también con la fecha por defecto «hoy» cuando el contrato terminó ayer.

## Decisión del dueño
Cuando la fecha cae en un período cerrado, el sistema **pregunta cada vez** a qué período cargarlo:
1. **Al siguiente período abierto**, o
2. **Anular el cierre** del período (y cargarlo con su fecha original).
Nunca se guarda en silencio ni queda huérfano.

## Reglas
1. **Estado de una fecha** para una persona: `cerrado` si una liquidación `cerrada` cubre la fecha;
   `abierto` si un contrato la cubre y ninguna cerrada; `sin_contrato` si nada la cubre.
2. **RPC `sueldo_movimiento_estado_fecha(empleado, fecha)`** devuelve el estado, el rango cerrado y
   la fecha del siguiente período abierto (o null si no existe).
3. **RPC `sueldo_movimiento_crear(..., p_decision)`** (solo administrador) es la única vía de alta:
   - fecha abierta → inserta tal cual;
   - fecha cerrada o sin contrato **sin decisión** → error `PERIODO:` (no escribe);
   - `siguiente` → inserta con la fecha del siguiente período abierto y conserva la original en
     `fecha_original`; el motivo queda anotado. Si no hay siguiente abierto → error `PERIODO:` que
     pide crear el contrato o anular el cierre; **no** se guarda;
   - `anular_cierre` → anula la liquidación cerrada que cubre la fecha (con motivo automático) y
     carga con la fecha original. Si la anulación falla (p. ej. tiene pagos), el error sube y no se
     carga nada. No aplica a `sin_contrato`.
4. **Red de seguridad:** un trigger rechaza con `PERIODO_CERRADO:` todo insert sin sello cuya fecha
   caiga en un período cerrado, venga de donde venga.
5. **Pantalla:** al guardar, si la fecha no está abierta se muestra una pregunta con las dos
   opciones y la fecha concreta de cada una. Sin decisión no se guarda nada.

## Alcance
Movimientos (`sueldo_movimientos`). La asistencia de períodos cerrados y las ventas quedan
anotadas en `docs/pendientes-negocio.md`: el dueño sólo decidió el caso de los movimientos.

## Pruebas (packages/db/pruebas/0136_movimientos_periodo_cerrado.prueba.sql)
1. Estado de fecha: abierto / cerrado / sin_contrato y siguiente abierto (con tramos consecutivos
   cerrados y con hueco entre contratos).
2. Alta en fecha abierta: inserta con la fecha dada, `fecha_original` null.
3. Alta en fecha cerrada sin decisión: `PERIODO:` y cero filas.
4. `siguiente`: fecha movida, `fecha_original` guardada, la fila queda tomable por el siguiente cierre.
5. `siguiente` sin período siguiente: error y cero filas.
6. `anular_cierre`: liquidación anulada, fila con fecha original y tomable al recerrar.
7. `anular_cierre` con pago registrado: falla y no carga nada ni anula.
8. Trigger: insert directo en período cerrado → `PERIODO_CERRADO:`.
9. Un no-administrador no puede llamar a la RPC; sin permisos para `anon`.
10. Reaplicar la migración es inocuo.
