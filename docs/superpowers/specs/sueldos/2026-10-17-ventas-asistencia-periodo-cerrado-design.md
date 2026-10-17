# Ventas y tardanzas con fecha en un período cerrado — se suman al siguiente período abierto

> 17-oct-2026, **antes** del código y de la prueba (Zone Guard). Zona crítica: cadena del sueldo.
> Decisión del dueño (opción a): el sistema avisa («Septiembre ya está pagado») y la carga se suma al
> **próximo período abierto de esa persona**. Nunca queda huérfana y nunca modifica lo ya pagado.
> Reutiliza la lógica de la 0136 (`private.sueldo_estado_fecha`, `private.sueldo_siguiente_abierto`).

## Ventas (comisión)

- Única vía de alta: RPC `sueldo_venta_crear(fecha, monto, tipo, sede, empleado, vendedor_externo)` (administrador).
  - Fecha en período abierto → se guarda tal cual.
  - Fecha en período **cerrado** o sin contrato → se guarda con `fecha` = primer día del siguiente período abierto
    y `fecha_original` = la fecha tipeada. Devuelve `{id, fecha, fecha_original, aviso}`; el aviso dice
    «El período de <mes> ya está pagado: la venta se sumó al período que empieza el <fecha>».
  - Sin siguiente período abierto → error `PERIODO:` y no se guarda nada.
  - Sin vendedor asignado (cola) → se guarda tal cual; se resuelve al asignar.
- `sueldo_venta_asignar(venta, empleado)` aplica la misma regla a la fecha de la venta.
- Red de seguridad: un trigger rechaza (`PERIODO_CERRADO`) cualquier venta con vendedor y sin liquidación cuya fecha
  caiga en un período cerrado o sin contrato (como el de la 0136 para movimientos).
- La comisión de la venta movida entra en la liquidación del período destino por el motor de siempre (`sueldo_entrada`
  lee las ventas por `fecha`). No se toca el motor para ventas.

## Asistencia: tardanzas

- El motor calcula la tardanza desde la fila de asistencia del día **dentro del período**; una fila de un día ya
  cerrado no entra a ninguna liquidación. Para no dejarla huérfana:
- Tabla nueva `sueldo_tardanzas_diferidas` (empleado, `fecha_original`, `aplicada_en`, motivo). RPC
  `sueldo_tardanza_diferida_crear(empleado, fecha, motivo)` (administrador): sólo para fechas en período cerrado o
  sin contrato; `aplicada_en` = primer día del siguiente período abierto. Una fecha abierta se rechaza con
  `DATO:` («cárgala en la asistencia del día»).
- `sueldo_entrada` agrega `tardanzasDiferidas` = filas cuya `aplicada_en` cae en el tramo pedido. El motor las suma
  al conteo de tardanzas del período **antes** de aplicar las tardanzas libres: la penalidad y las libres son
  exactamente las de siempre (`penalidadTardanza`, `tardanzasLibres`). Ninguna regla nueva.
- Las filas con `aplicada_en` en un período cerrado quedan congeladas (trigger de update/delete).

## Fuera de alcance de esta spec (se avisa, no se carga)

Faltas y horas de un día en período cerrado **no** se trasladan: dependen del horario y del valor por hora del día
original. Para esos casos sigue valiendo anular el cierre o «Corregir» (0137). Ver «Dudas».

## Defaults inventados

Ninguno. La penalidad y las tardanzas libres son los parámetros existentes.

## Dudas para el dueño

- ¿Faltas y horas trabajadas de un día cerrado también deben pasar al siguiente período? Hoy no.
- La tardanza trasladada cuenta como una más del período destino (las 3 libres se reparten entre propias y trasladadas).

## Pruebas

SQL (`0144_ventas_asistencia_periodo_cerrado.prueba.sql`):
1. Venta del 28-sep registrada con septiembre cerrado → `fecha` = 1-oct, `fecha_original` = 28-sep, con aviso; la
   venta aparece en `sueldo_entrada` de octubre (la comisión entra en octubre).
2. Venta en fecha abierta: sin cambios. Sin siguiente período: error y no escribe.
3. Insert directo en período cerrado: lo rechaza el trigger.
4. Tardanza del 28-sep cargada con septiembre cerrado → `aplicada_en` = 1-oct; `sueldo_entrada` de octubre trae
   `tardanzasDiferidas = 1`; fecha abierta se rechaza; no-admin se rechaza.
Core (`tardanzas-diferidas.test.ts`): la tardanza trasladada se descuenta en octubre (con 0 libres: −penalidad) y
respeta las libres y no cambia nada si el campo falta.
