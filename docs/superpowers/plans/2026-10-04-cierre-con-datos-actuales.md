# Plan: cerrar una liquidación sólo con los datos actuales

> Ejecuta la spec `docs/superpowers/specs/sueldos/2026-10-04-cierre-con-datos-actuales-design.md`.
> Ticket imalexandre05/lucebien-tablero#28. Zona crítica (cadena del sueldo). 04-oct-2026.
> Todo lo de abajo está verificado contra el código de las migraciones, no contra otro documento.

## 1. Corrección a la spec: el nombre de la RPC

La spec dice `sueldo_cerrar`. **Esa función no existe.** La RPC se llama
`sueldo_liquidacion_cerrar(p_liquidacion uuid) returns jsonb`.

- Firma vigente: `sueldo_liquidacion_cerrar(uuid)`, `language plpgsql volatile security invoker`,
  `set search_path = public`. Última definición: `0093_liquidacion_por_tramos.sql` (bloque C-7,
  l. 328). Ninguna migración posterior (0094–0109) la redefine (`grep` sobre las 110 migraciones).
- `revoke ... from public, anon` y `grant ... to authenticated` los puso la 0073 (l. 406-407);
  `create or replace` los conserva.
- Quien la llama: `cerrarLiquidacion()` en `apps/erp-web/lib/sueldos-repo.ts`.

La intención de la spec no cambia; sólo se corrige el nombre en este plan y en la migración.

## 2. Entrada de `sueldo_entrada(uuid, date, date)` (última definición: 0098, l. 59)

Claves de primer nivel del `jsonb` que arma (y que `crearBorrador` guarda tal cual en
`sueldo_liquidaciones.entrada`, sin transformarlas: `entradaDeAcuerdo` devuelve el `data` de la RPC):

`acuerdoId, empleadoId, fechaInicio, fechaFin, modalidad, sueldoPactado, horario, asistencia,
horasFueraDeContrato, ventas, almuerzoHabilitadoPorAdmin, adelantos, reportes, bonosExtras,
almuerzosEntregados, personasCapacitadas, parametros`.

### Campos no deterministas: lista verificada

| Dónde | Hallazgo | Tratamiento |
|---|---|---|
| Marcas de tiempo / `now()` / «hoy» | **No hay ninguna** en el cuerpo de `sueldo_entrada`, ni en `sueldo_movimientos_lista/_conteo` (0073) ni en `sueldo_parametros_config` (0078). | Ninguna clave se excluye. |
| `adelantos`, `reportes`, `bonosExtras` | `private.sueldo_movimientos_lista` ordena sólo `order by m.fecha` (0073, l. 244). Dos movimientos del mismo día quedan en orden no garantizado. | Se comparan **ordenados** (multiconjunto). |
| `ventas` | `order by v.fecha` y nada más. Mismo problema. | Ídem. |
| `horario` | `order by t.dia_semana, t.hora_inicio`; sólo empata con turnos duplicados. | Ordenado por si acaso (inocuo). |
| `asistencia`, `horasFueraDeContrato` | `order by fecha`, una fila por fecha (`group by s.fecha`): estable. Dentro de cada día, `tramos` ordena por `hora_entrada nulls last, turno` y `(empleado, fecha, turno)` es único: estable. | Se comparan tal cual (ordenarlos el nivel superior no los altera). |
| `parametros` | `config` global `||` `a.parametros`; es un objeto, y `jsonb` ignora el orden de claves. | Sin tratamiento. |
| Números | `100` y `100.0` son iguales como `jsonb`. | Sin tratamiento. |

Decisión: **no se toca `sueldo_entrada`** (cambiarla es cambiar la entrada del sueldo). En su lugar
la comparación ordena los arreglos de primer nivel con `order by e` y lleva los números a doble precisión (hallazgo del verificador: la entrada guardada pasa por JavaScript y pierde dígitos más allá de ~16) (orden total de `jsonb`,
coherente con su igualdad) antes de comparar.

Consecuencias aceptadas, para que no sorprendan:
- Si el administrador cambia un parámetro en `/configuracion` después de calcular, `parametros`
  difiere y el cierre se rechaza. Es correcto: el `resultado` guardado se calculó con otros.
- Un borrador guardado antes de la 0098 no tiene `entradaEstimada`/`salidaEstimada`: difiere y
  pide recalcular. La base de producción tenía 0 liquidaciones al verificarlo; no hay borradores
  viejos que invalidar, pero el comportamiento es el correcto si aparecieran.
- Si al recalcular `sueldo_entrada` corta con `DATO:` (un día pasó a «sin dato»), esa excepción
  sube tal cual y no se sella nada.

## 3. Cambio en la RPC (migración nueva, número reservado por `tools/reservar-migracion.sh`)

- `create or replace function sueldo_liquidacion_cerrar(uuid)` con el cuerpo de la 0093 **íntegro**
  (permiso, `for update`, estado, líneas, conteo de la carrera, sellado de los cinco tipos,
  cierre, `update` condicionado de `sueldo_acuerdos`, `return`).
- Después del conteo (primera barrera barata, se conserva) y antes de «1) Las líneas»:
  `v_nueva := public.sueldo_entrada(l.acuerdo_id, l.periodo_desde, l.periodo_hasta)`, y se comparan
  las claves de primer nivel (unión de ambos lados) normalizando arreglos. Las que difieren se
  listan en el mensaje: `DESACTUALIZADA:los datos cambiaron desde que se calculó (adelantos,
  asistencia); vuelve a calcular antes de cerrar`.
- Helper `private.sueldo_entrada_normalizada(jsonb)` (ordena los arreglos de primer nivel),
  `stable`, con `revoke`/`grant` como los otros helpers de `private`.
- Español neutral: el mensaje del conteo pasa de «volvé» a «vuelve».
- Idempotente (`create or replace`). No agrega parámetros de negocio: no hay nada que anotar en
  `docs/pendientes-negocio.md`.

## 4. Pruebas (antes del código, commit propio)

El patrón vigente son las pruebas de migración: `packages/db/pruebas/NNNN_slug.prueba.sql`, que se
corren con `bash tools/probar-migracion.sh NNNN` y terminan en una excepción `RESULTADO` que aborta
la transacción (no dejan filas). `tools/pruebas/cadena-sueldo.test.ts` es el de punta a punta y
necesita credenciales de la base; no se usa acá. Casos: los cinco de la spec §4. Sin base ni `psql`
en este entorno no se pueden correr: se deja constancia en el PR.

## 5. Interfaz

`apps/erp-web/app/sueldos/liquidaciones/cliente.tsx`: ante `codigo === 'DESACTUALIZADA'` se muestra
el motivo y el botón **«Recalcular borrador»** sobre el borrador que se intentó cerrar. Encadena
las acciones que ya existen: `accionEliminarBorrador(id)` y `accionCrearBorrador(acuerdoId, desde,
hasta)` (que ya calcula en el servidor). Se corrige el voseo del texto de ayuda.
