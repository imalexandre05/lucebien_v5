# Pasajes por llegar temprano (beneficio de la liquidación)

Spec corta. Regla confirmada por el dueño (17-oct-2026): hay un beneficio de pasajes para quien llega
**5 minutos antes** del inicio de su turno. El monto lo define Jordan en Configuración.

## Regla

- Por cada día contratado en que el ingreso (primer tramo) es **igual o anterior a `inicio del turno − N min`**,
  se paga el monto de pasaje. N = `sueldo_pasaje_minutos_antes`, default **5** (dato del dueño).
- Monto = `sueldo_monto_pasaje` (S/ por día). **Vacío por defecto = no se paga nada** y la liquidación no
  muestra la línea (igual que el pago por puntos). Un `0` sí es un valor.
- Los días sin turno contratado y las faltas no cuentan.
- Es un ingreso: línea «Pasajes por llegar temprano» (grupo `ingreso`, regla RN-22). Entra al total y al
  resumen en una fila propia «Pasajes».

## Supuesto a confirmar

El monto se entiende **por día puntual** (como un pasaje diario). Si Jordan lo quiere por semana o por mes,
se cambia la unidad. Anotado en `docs/pendientes-negocio.md`.

## Cambios

- Core: `ParametrosSueldo.montoPasaje` (nullable, default `null`) y `minutosAntesPasaje` (default 5); línea nueva.
- Migración `0139_pasajes_puntualidad`: claves `sueldo_monto_pasaje` (vacía) y `sueldo_pasaje_minutos_antes`
  ('5'); `private.sueldo_parametros_config()` las lee (misma función de la 0117 con 2 entradas más).
- Configuración (sección Sueldos): las dos claves son editables.
- Resumen: fila «Pasajes» dentro de Beneficios.

## Defaults inventados

Ninguno: el monto queda vacío (no paga); los 5 minutos los dijo el dueño.
