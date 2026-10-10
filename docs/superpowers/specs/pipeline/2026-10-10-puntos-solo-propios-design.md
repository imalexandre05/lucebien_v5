# Spec — los puntos del pipeline sólo los ven cada persona y el administrador

> Escrita el 10-oct-2026, **antes** del código (Zone Guard). Zona crítica: aislamiento de datos de
> personas (no-negociable 3) y la cadena puntos → nota → pago. Lleva prueba SQL, subagente
> verificador y número de migración reservado con `tools/reservar-migracion.sh` (la siguiente libre
> tras la 0128). Sale de la decisión 2 del dueño en
> [pendientes-negocio.md](../../../pendientes-negocio.md) y del
> [registro de verificación](2026-10-09-verificacion-release-0112-0127.md), hallazgo 7.

## La decisión

El dueño decidió el 10-oct-2026: **los puntos del pipeline los ven sólo cada persona (los suyos) y el
administrador.** No el encargado de sede ni el resto del almacén.
Los puntos **no son soles todavía**: sólo empiezan a valer desde una meta mensual que se definirá más
adelante (pago por puntos sobre la meta, `0117`/`0126`). Esta spec **no toca la meta ni el pago**.

## Estado verificado (10-oct-2026)

- **Producción** (`scilb`): `pipeline_puntos` y `prenda_historial` tienen cada una **dos políticas de
  lectura permisivas** (`puntos_sel` + `puntos_select`, `hist_sel` + `hist_select`). Se suman con OR:
  endurecer una sola no cierra nada.
- Quién lee hoy los puntos de todos, según esas políticas: administrador y dueño, **todo el almacén**
  (`app_es_almacen()`: encargado de almacén y confeccionista) y quien tiene la **sede de origen** de la
  prenda (encargado de tienda, ventas). En producción hay 2 encargados de almacén activos, 1
  confeccionista, 4 encargados de tienda y 9 de ventas: **la fuga es real hoy**.
- `pipeline_ranking_hoy()` es `security definer` sin revisar rol y se la puede llamar cualquier
  usuario autenticado: devuelve el top 10 del día de todos (nombre, total y acciones). Cerrar sólo la
  política **no** lo cierra.
- Las lecturas ajenas que alimentan la nota y el pago (`evaluacion_componentes_datos`,
  `sueldo_puntos_periodo`) son `security definer` y validan administrador o la misma persona: **no
  cambian**.
- Realtime no publica puntos (sólo `prenda_pasada`). Escribir puntos es por RPC `security definer`
  (0115), así que no depende de la política de lectura.

## Reglas de la migración

1. **`pipeline_puntos`**: se eliminan **las dos** políticas de lectura y se crea **una sola**: el
   administrador (con el helper vigente de administrador/dueño, siempre con el prefijo `private.`) o
   la propia persona. Después de la migración debe haber **exactamente una** política `SELECT` en esa
   tabla.
2. **`pipeline_ranking_hoy()`**: misma firma (**ninguna sobrecarga nueva**). El administrador sigue
   viendo a todos; **quien no es administrador recibe sólo su propia fila**, o ninguna si hoy no tiene
   puntos. Sigue siendo `security definer`, con `search_path` fijo y sin ejecución para `anon`.
3. **`est_productividad`** es `security invoker`: queda cubierta por la regla 1, sin cambio de código.
4. **No se toca**: `prenda_historial` (no son puntos: muestra quién movió cada prenda; ocultarlo es otra
   pregunta, abajo), la escritura de puntos, deshacer, la evaluación, el pago, realtime y el sistema
   viejo (congelado).
5. Idempotente; `create or replace` / `drop policy if exists`; cada función conserva todo lo que ya
   tenía (security definer, `search_path`, grants, token de operador) y se parte de su **definición
   vigente**, no de una anterior.

## Efecto en las pantallas (sin cambio de código en esta migración)

A quien no es administrador, estas vistas dejan de mostrar puntos ajenos y muestran sólo la fila propia:
«Puntos de hoy» del tablero (`app/pipeline/tablero.tsx:502-515`), la tabla y el KPI de
`/pipeline/metricas`, «Top operarios hoy» del dashboard (`app/page.tsx`) y `/estadisticas` (módulo
muerto, ruta aún viva). No cambia nada para el administrador, para la pantalla propia
(`/mi-desempeno`), ni para la evaluación y el pago. **Retirar o renombrar esos bloques en la interfaz
es una decisión posterior del dueño**: esta migración sólo deja de filtrar datos ajenos.

## Pruebas (se escriben antes que la migración y deben fallar sin ella)

1. Un encargado de almacén, un confeccionista, un encargado de tienda y alguien de ventas con la sede de
   origen de la prenda **no ven** puntos de otra persona en `pipeline_puntos`; sí ven los suyos.
2. El administrador y el dueño ven todos.
3. Hay **una** política `SELECT` en `pipeline_puntos` (consulta a `pg_policies`).
4. `pipeline_ranking_hoy()`: administrador → todos; no administrador → sólo su fila (o ninguna).
5. `est_productividad`: un no administrador no recibe filas ajenas.
6. **Escribir sigue funcionando**: avanzar una prenda como rol de pipeline registra el punto aunque ya
   no pueda leer los ajenos; deshacer borra los puntos del movimiento.
7. La evaluación y el pago no cambian: `evaluacion_componentes_datos` y `sueldo_puntos_periodo` siguen
   devolviendo lo mismo para el administrador y para la propia persona.
8. Una sola firma por RPC del pipeline y por `pipeline_ranking_hoy`; reaplicar la migración sola es
   inocua; siguen pasando las pruebas 0112, 0115, 0116, 0117, 0122, 0127 y 0128.

**Pruebas que afirmaban la regla vieja.** Si alguna prueba existente (0115, 0122) comprueba que el
almacén o la sede leen puntos ajenos, **la regla cambió por decisión del dueño** y esa prueba se
actualiza en un **commit propio**, citando esta spec, y se lista en el informe: no se afloja ninguna
otra.

## Preguntas que quedan para el dueño (no bloquean la migración)

- ¿Se oculta también **quién movió cada prenda** (`prenda_historial`)? Hoy lo ven el administrador, el
  almacén y la sede de origen. No son puntos, pero revela el trabajo de cada persona.
- ¿Se **retiran de la interfaz** los tres bloques de ranking, o se dejan mostrando sólo la fila propia?
- El comentario de la `0083` decía que nadie tenía rol de encargado de almacén ni confeccionista; hoy
  sí hay (2 y 1 activos).

## Despliegue

Se aplica **sola**, después de la 0128, con copia previa de las políticas y de la definición de
`pipeline_ranking_hoy()` para poder deshacerla. Una prueba de humo después: con un usuario de almacén
(no administrador), `select count(*) from pipeline_puntos` devuelve sólo lo suyo.
