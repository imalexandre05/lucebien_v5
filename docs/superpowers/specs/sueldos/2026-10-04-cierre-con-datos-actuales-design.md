# Cerrar una liquidación sólo con los datos actuales

> Spec completa (cadena del sueldo). Ticket: imalexandre05/lucebien-tablero#28. 04-oct-2026.

## 1. El problema (verificado en el código)

`sueldo_cerrar` (última definición: `packages/db/migrations/0093_liquidacion_por_tramos.sql`,
bloque «La carrera», ~l. 355-395) detecta que los datos cambiaron desde el cálculo **contando
filas**: adelantos + reportes + bonos extra, ventas, y suma de cantidad de almuerzos y
capacitaciones. No compara **montos** ni **asistencia**.

- Se guarda el borrador con un adelanto de S/100; se borra y se carga uno de S/300 → mismo conteo →
  cierra pagando con S/100 y **sella** el de S/300, que no se descuenta nunca.
- Se guarda el borrador y después se corrige un día de asistencia → cierra con la asistencia vieja.

## 2. La regla

**Una liquidación sólo se cierra si su entrada guardada es idéntica a la que se calcularía ahora.**

- Dentro de `sueldo_cerrar`, antes de sellar: recalcular la entrada con **la misma función** que la
  armó (`sueldo_entrada(...)`, última definición vigente — hoy `0098`) para el mismo empleado,
  acuerdo y rango, y compararla con `l.entrada`.
- Si difieren → `raise exception 'DESACTUALIZADA: los datos cambiaron desde que se calculó
  (<qué cambió>); vuelve a calcular antes de cerrar'`. Nada se sella.
- `<qué cambió>`: lista corta y legible de las claves de primer nivel que difieren (p. ej.
  «adelantos, asistencia»), no un volcado del jsonb.
- Si la entrada tiene campos **no deterministas** (marca de tiempo del cálculo, «hoy», orden no
  garantizado de arreglos), se excluyen o normalizan antes de comparar. El plan debe listarlos
  verificándolos contra el cuerpo real de `sueldo_entrada`; si un arreglo no tiene `order by`
  estable, se agrega en la función (sin cambiar su contenido) o se compara ordenado.
- El conteo actual se **conserva** como primera barrera barata; la comparación completa va después.
- El texto de los mensajes en español neutral (el actual dice «volvé»: corregirlo).

## 3. Interfaz

- Cuando el cierre falla por `DESACTUALIZADA`, la pantalla de liquidaciones muestra el motivo y un
  botón **«Recalcular borrador»** que vuelve a calcular el mismo contrato y rango y reemplaza el
  borrador (la acción de calcular ya existe; reutilizarla).

## 4. Tests (antes del código)

1. Adelanto borrado y recargado con otro monto (mismo conteo) → cierre rechazado.
2. Día de asistencia cambiado después del cálculo → cierre rechazado.
3. Nada cambió → cierre exitoso, mismo resultado que hoy (regresión).
4. Datos cambiados, recalcular, cerrar → exitoso con los montos nuevos.
5. La comparación ignora sólo los campos no deterministas listados en el plan (test que lo fije).

## 5. Fuera de alcance

Movimientos con fecha en períodos ya cerrados (#29) y corrección con abonos (#30): tickets aparte.
