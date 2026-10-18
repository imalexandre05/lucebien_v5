# Asistencia, liquidaciones, movimientos y pago: pulido (tablero #34)

Nivel: spec corta. Sin migraciones, sin tocar el core ni el pipeline. Cada hallazgo se verificó
contra el código antes de tocarlo.

## 1. «Declarar todos» deja la pantalla en «Sin declarar»
`sueldos/asistencia/cliente.tsx` siembra los borradores con `useState` una sola vez. Al llegar filas
nuevas del servidor no se resincronizaban. Se resincronizan cuando cambian las filas, conservando
los borradores con cambios sin guardar (`sucio`).

## 2. Días con dos tramos (mañana y tarde)
La pantalla elegía una sola fila por día y mostraba sus horas como las del día (4 h) cuando el
motor suma todas (10 h). Además el tramo abierto no se podía tocar. `declararDia()` ya sabe
declarar por tramo (parámetro `turno`), así que el arreglo es de pantalla: una fila editable por
tramo, y la suma real de las horas en la columna Contrato. «Declarar los días hasta hoy» no incluye
días partidos en tramos: repartir las horas del contrato entre tramos sería inventar qué hizo cada
uno. No cambia ninguna regla de pago.

## 3. Error `DATO` en liquidaciones
El texto «Faltan días por declarar» salía con cualquier `DATO`. Ahora sale sólo cuando el mensaje
real dice «falta declarar la asistencia»; en los demás casos se muestra únicamente el mensaje real.

## 4. Borrar un adelanto o descuento
Pasa por el diálogo `useConfirmacion` / `DialogoConfirmar`, igual que borrar un documento.

## 5. Registrar un abono
Confirmación antes de registrar y botón «Pagar el saldo» que rellena el monto con el saldo
pendiente (total menos pagado, aritmética que la pantalla ya mostraba). El monto pasa a texto
mientras se escribe, para que «1.50» no se reescriba. La RPC sigue siendo la que impide el
sobrepago.

## 6. Voseo
Se pasa a español neutral en esas pantallas y en los mensajes de error que ellas muestran.

## Pruebas
Typecheck y la suite existente (`tools/verificar-local.sh`). Los cambios son de pantalla; no hay
lógica pura nueva que extraer.
