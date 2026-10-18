# `sueldo_acuerdo_guardar` guarda la tarifa por hora (0167)

Origen: verificador sobre la integración de la tanda 7. La RPC atómica de la 0157 lista las columnas a mano y se escribió antes de la 0164, así que descarta `p_fila.tarifa_hora`: un contrato por horas nuevo queda como sueldo fijo de S/ 0 (paga 0 de base) y la tarifa editada se pierde.

Regla: `sueldo_acuerdo_guardar` escribe `tarifa_hora = nullif(p_fila->>'tarifa_hora','')::numeric` al crear y al actualizar (nulo en la fila = contrato de sueldo fijo, limpia la tarifa). El resto de la función no cambia. Los `check` de la 0164 siguen validando la tarifa.

Prueba (`packages/db/pruebas/0167_...`): crear con tarifa la guarda; actualizar la tarifa la cambia; actualizar con tarifa nula la limpia; un contrato fijo sigue guardando `sueldo_pactado`.
