# Extras sin tope por ahora (spec corta)

**Decisión del dueño (19-oct-2026).** Los puntos extra son ilimitados por ahora. El tope de la 0171
(`reporte_extra_cantidad_max`, provisional en 50) pasa a «sin tope» por defecto, sigue configurable.

## Reglas
1. `reporte_extra_cantidad_max` = `0` significa «sin tope». Vacío también.
2. La 0178 deja en `0` el valor sólo si todavía es el provisional `50` (no pisa un valor puesto a mano).
3. `reportes_crear` sigue exigiendo cantidad entera ≥ 1; solo se omite la comparación con el tope.
4. Pantalla: sin tope no se limita la cantidad.
5. Los puntos de un extra suman a la PERSONA que lo hizo (`registrado_por_id`), no a la nota del
   reporte. Verificado en `evaluacion_componentes` (0168): `extr` filtra por `registrado_por_id = p_empleado`.
6. Decisión pendiente (anotada en `docs/pendientes-negocio.md`): qué tope poner, si alguno.

## Pruebas
- Cantidad 5000 con tope `0` → entra. Con tope `50` → `CANTIDAD:`.
- Cantidad 0 o −1 siguen rechazadas.
- Los puntos del extra aparecen en `evaluacion_componentes` de quien lo hizo y no en el de otra persona del turno.
