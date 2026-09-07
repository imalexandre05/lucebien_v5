# SPEC — Identidades duplicadas en empleados (Mary/Marylin, Yessi/Yessica, Elthom/Elthon)

> **Zona de rigor:** nivel 3 (migración de base + tabla que alimenta la nota mensual y el pago,
> `docs/rigor-por-zona.md`). Spec y migración van en commits separados (Zone Guard).

## 1. El problema, medido contra `scilb` el 07-sep-2026

Tres personas reales están representadas por **dos filas** cada una en `empleados`, con el
historial partido entre las dos:

| Persona | Fila con el historial del pipeline (ETL SQLite) | Fila con la operación en vivo (huellero) |
|---|---|---|
| — | `Mary` (cod `7158`) — 1.819 eventos de `pipeline_puntos` (2.832,5 pts), 86 reportes, 4.760 filas de `prenda_historial`, 1.026 de `prenda_pasada`, 693 de `envios_prendas` | `Marylin` (cod `7073`) — 210 `asistencias`, 1 `huellero_mapeos`, 1 `evaluaciones_mensuales`, **1 `sueldo_acuerdos`** |
| — | `Yessi` (cod `8888`) — 1.450 eventos (2.336,4 pts), 104 reportes, 3.624 de `prenda_historial`, 594 de `prenda_pasada`, 217 de `prenda_calificacion`, 84 de `envios_prendas` | `Yessica` (cod `6510`) — 206 `asistencias`, 1 `huellero_mapeos` |
| — | `Elthon` (cod `1021`) — 1 reporte, 4 `reporte_trabajadores`, 8 `prenda_historial`, 3 `envios_prendas` | `Elthom` (cod `6660`) — 57 `asistencias`, 1 `huellero_mapeos` |

Ninguna tabla tiene datos de **las dos** filas de un mismo par a la vez — se verificó columna por
columna antes de escribir la migración, ver §4. Eso es lo que hace que el merge no choque contra
ningún `unique`.

**Por qué importa — corregido el 07-sep-2026 después de que el subagente verificador revisara esta
misma spec contra el código y encontrara la afirmación de abajo invertida.** La primera versión de
este párrafo decía que la nota cruza puntos con asistencia y que por eso `Mary`/`Yessi` (con el
historial) saldrían en 0. Verificado contra `packages/core/src/evaluaciones.ts:219-224` y
`0095_puntos_como_moneda.sql:175-215`: el método `'puntos'` **no lee `asistencias` en absoluto**
—la nota sale sólo de `pipeline_puntos` + extras + actividades + ventas − incidencias— y **hoy son
`Marylin`/`Yessica`/`Elthom` las que tienen 0 puntos**, no al revés. Es la fila que se conserva la
que saldría en 0 si se evaluara tal cual, no la que se desactiva.

Verificado también que el efecto no es inmediato: `pipeline_puntos` no tiene ninguna fila posterior
al 2026-08-21, y el ciclo vigente de cada canónica (Marylin: 22-ago→21-sep por `fecha_ingreso`;
Yessica: mes calendario, sin `fecha_ingreso`) arranca después de eso — fusionar hoy no cambia
ninguna nota que ya se haya calculado ni la que está por calcularse este mes.

**La razón real para fusionar no es una nota que se está pagando mal ahora mismo — es que dos filas
para una persona es un error de identidad que tarde o temprano lo produce**, apenas alguien mire el
historial completo de Marylin/Yessica/Elthom (evaluación anual, un reclamo de un colaborador sobre
"cuánto hice", un reporte gerencial) y no encuentre ahí el 80% de los puntos que existen en el
sistema (5.169 de 6.472, hoy atrapados en `Mary`/`Yessi`). Corregirlo ahora, con el efecto medido y
documentado, cuesta una migración; corregirlo después de que alguien tome una decisión (un despido,
un bono) basada en el historial incompleto, no.

## 2. Cómo se originó (para que no vuelva a pasar)

`packages/db/etl/migra-pipeline.mjs` resolvía empleados por nombre contra el SQLite legacy. El
alias `marylin → mary` que ese script ya trae (ver commit de esta misma tarea) corrige la
resolución **hacia adelante** en futuras corridas del ETL, pero no mueve lo que ya se insertó con
la resolución vieja. `Elthom`/`Elthon` no tiene alias porque ninguno de los dos scripts los conocía
como variante del mismo nombre — es una persona con dos altas independientes, probablemente una
manual (Supabase) y otra por el ETL.

Esta migración corrige el pasado. **El alias por sí solo no alcanza — corregido el 07-sep-2026.**
El subagente verificador encontró que `ALIASES = { marylin: 'mary' }` resuelve hacia el uuid vivo
en `_idmap.json` bajo la clave `'mary'`, que **sigue siendo la fila de Mary que esta misma
migración desactiva** (`_idmap.json: E06 → 3a88b828…`). Un re-run de `migra-pipeline.mjs` o
`migra-reportes.mjs` después de aplicar la 0102 volvería a escribir el historial nuevo bajo la fila
muerta; y `provision-empleados.mjs` (con la reconciliación por nombre que esta misma rama le
agregó) reactivaría a Mary y le borraría la nota de fusión, porque el SQLite legacy la sigue
mostrando activa. Se agregó una guarda a los tres scripts, en el mismo commit de código que esta
migración: los dos ETL de historial filtran del mapa de resolución cualquier uuid que hoy esté
`activo = false` (tratándolo como huérfano, con el mismo mecanismo que ya usaban para datos sin
resolver), y `provision-empleados.mjs` salta explícitamente cualquier fila cuyo destino ya esté
desactivado a mano, en vez de reactivarla.

## 3. Decisión: la fila canónica es la que recibe datos en vivo hoy

Se conserva `Marylin`, `Yessica` y `Elthom` — son las filas que el huellero ya está alimentando
todos los días: `huellero_mapeos` apunta a ellas, con 408, 401 y 82 `marcas_huellero`
respectivamente y la última marca del 07-sep-2026 (medido por el subagente verificador). Mover la
operación en vivo a la fila vieja habría exigido reescribir `huellero_mapeos`, que es justamente la
pieza que hoy funciona sola.

**Corrección del 07-sep-2026:** la primera versión de este párrafo citaba también el
`sueldo_acuerdos` de Marylin como señal de que su fila era la "real". El verificador encontró que
ese acuerdo lo creó `Prueba Admin` (cod `9901`, `notas = "CUENTA DE PRUEBA E2E - borrar al
terminar"`) el 24-ago-2026, en la misma ventana que el resto de las filas de prueba de esta rama —
o sea que no es evidencia confiable de nada. La decisión de fila canónica no depende de esa
columna: se sostiene sola con el huellero en vivo. Si ese acuerdo y su `evaluaciones_mensuales`
(17,9, método `ponderado`, componentes de aspecto sembrado) son en sí mismos datos de prueba que
hay que limpiar, es una pregunta separada para quien tenga el contexto del E2E que los creó — no
se toca en esta migración.

Se migra el historial de `Mary`, `Yessi` y `Elthon` (pipeline, reportes, envíos) hacia la fila
canónica, y la fila vieja pasa a `activo = false` con una nota — **no se borra**: es exactamente el
mismo criterio que F-3 ya fijó el 14-ago para no perder historia de la empresa, aplicado acá a una
fila duplicada en vez de a una persona que se fue.

## 4. Qué se mueve y qué no

**Se mueve** (columna por columna, verificado que sólo la fila vieja tiene datos ahí):

| Tabla.columna | Mary→Marylin | Yessi→Yessica | Elthon→Elthom |
|---|---|---|---|
| `pipeline_puntos.empleado_id` | 1.819 | 1.450 | 0 |
| `reportes.encargado_id` / `.evaluador_id` | 86 (combinado) | 104 | 1 |
| `reporte_trabajadores.empleado_id` | 70 | 45 | 4 |
| `prenda_historial.empleado_id` | 4.760 | 3.624 | 8 |
| `prenda_pasada.lavador_id` / `.planchador_id` | 1.026 (combinado) | 594 (combinado) | 0 |
| `prenda_calificacion.calificador_id` | 0 | 217 | 0 |
| `envios_prendas.responsable_id` | 693 | 84 | 3 |
| `reporte_extras.registrado_por_id` | 1 | 0 | 0 |

**`empleado_tiendas` — corregido el 07-sep-2026: SÍ se toca.** La primera versión de esta spec
asumía que las dos filas de cada par ya tenían las cuatro sedes, y por eso planeaba no tocar la
tabla. El verificador midió que **2 de los 3 pares no coinciden**: `Yessi`/`Elthon` (la fila vieja)
tienen la sede `TR` y `Yessica`/`Elthom` (la canónica) no. La migración copia, por cada par, las
sedes de la fila vieja que la canónica todavía no tiene (`insert ... where not exists`, nunca un
`update` — no hay forma de que choque contra la primary key `(empleado_id, sede_cod)` porque sólo
inserta la que falta). Sin este cambio, Yessica y Elthom habrían perdido acceso a la sede TR después
de la fusión.

**No se toca**, y sí se verificó fila por fila que ninguna de las tres viejas tiene datos ahí:
`sueldo_acuerdos`, `sueldo_liquidaciones`, `sueldo_movimientos`, `evaluaciones_mensuales`,
`evaluaciones_valores`. De esas cinco, sólo `sueldo_liquidaciones` y `sueldo_movimientos` llevan de
verdad el trigger de inmutabilidad de la `0072` (corregido: `evaluaciones_mensuales` sólo tiene el
trigger de auditoría de la `0058`, y `sueldo_acuerdos` sólo el de auditoría + un
`no_truncate`) — no importa para esta migración porque no las toca de ningún modo, pero la razón
correcta es "no hay nada que mover", no "están congeladas".

## 5. Fuera de alcance de esta migración

- **`Alexito` (cod `0000`)** — tiene un rastro chico (14 puntos, 50 `prenda_historial`, 3
  `envios_prendas`) pero ningún indicio de ser la misma persona que otra fila activa, y
  desactivarlo dejaría 17 activos contra los **18 empleados** que dice `CLAUDE.md`. Se deja como
  está. Si es una cuenta de prueba de Alexander, correspondería confirmarlo con él, no inventar la
  respuesta acá.
- **`Alexito prueba`, `Prueba Admin`, `Prueba Colaborador`** — son altas de prueba, no identidades
  duplicadas de una persona real (no tienen ninguna fila "hermana" con datos complementarios). Una
  sección paralela ya está construyendo el mecanismo general para deshacer un alta hecha por error
  (`docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-error-design.md`, migración `0099`
  reservada); estas tres filas son candidatas naturales para ese mecanismo cuando esté listo, no
  para esta migración.

## 6. Cómo se prueba

`packages/db/pruebas/0102_identidades_duplicadas_empleados.prueba.sql` **no sigue el patrón
sintético habitual** (montar un escenario de mentira, atacarlo, autodescartarse): esta migración no
es una policy ni una RPC reusable, es un arreglo puntual de tres personas reales, y no tiene sentido
inventar una "Mary" de mentira para probarlo. Es una prueba de sólo lectura que corre **después**
de aplicar la 0102 contra `scilb` y verifica, por síntoma exacto:

1. cero filas huérfanas en las diez columnas de §4, contra las tres filas viejas por igual (no sólo
   contra los pares que tenían datos en la medición original — el verificador encontró que una
   versión anterior de esta prueba dejaba pasar en silencio cualquier fila nueva de Elthon);
2. la canónica de cada par tiene la unión de sedes (nada de `empleado_tiendas` se perdió);
3. Marylin/Yessica tienen al menos los 1.819/1.450 eventos de `pipeline_puntos` medidos antes de
   aplicar, y Elthom al menos las 4 filas de `reporte_trabajadores` — nunca menos, aunque el sistema
   haya seguido operando entre la medición y el apply;
4. las tres filas viejas quedan `activo = false`.

Antes de aplicar, un subagente verificador revisó la migración, la spec y la prueba contra `scilb`
en vivo (sólo lectura) y encontró tres bloqueos reales — la justificación de §1 invertida, la
prueba con cobertura parcial, y el riesgo de que un re-run del ETL deshaga el merge (§2) — más
varias observaciones (§3, §4) que también se corrigieron antes de aplicar. Ninguno de los seis
códigos de empleado cambió de fila entre la medición y la corrección.
