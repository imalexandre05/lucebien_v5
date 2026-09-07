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

**Por qué importa ahora y no antes.** La migración `0095` (puntos como moneda, aplicada el
25-ago-2026) empezó a leer `pipeline_puntos` para calcular la nota mensual. Con el historial en
`Mary`/`Yessi` y la asistencia en `Marylin`/`Yessica`, ninguna de las cuatro filas tiene los dos
datos juntos:

- `Mary` y `Yessi` concentran **el 80% de todos los puntos que existen en el sistema** (5.169 de
  6.472) y **cero asistencias** — cualquier cálculo de nota que cruce puntos con período de
  asistencia les da 0.
- `Marylin` y `Yessica` tienen la asistencia y el `huellero_mapeos` en vivo, y **cero puntos**.

Las dos personas más productivas del pipeline saldrían con la nota más baja del sistema, todos los
meses, hasta que esto se corrija. Es una violación directa del no-negociable 1.

## 2. Cómo se originó (para que no vuelva a pasar)

`packages/db/etl/migra-pipeline.mjs` resolvía empleados por nombre contra el SQLite legacy. El
alias `marylin → mary` que ese script ya trae (ver commit de esta misma tarea) corrige la
resolución **hacia adelante** en futuras corridas del ETL, pero no mueve lo que ya se insertó con
la resolución vieja. `Elthom`/`Elthon` no tiene alias porque ninguno de los dos scripts los conocía
como variante del mismo nombre — es una persona con dos altas independientes, probablemente una
manual (Supabase) y otra por el ETL.

Esta migración corrige el pasado. El alias en el ETL evita que un futuro re-run del `migra-pipeline`
vuelva a partir a Marylin.

## 3. Decisión: la fila canónica es la que recibe datos en vivo hoy

Se conserva `Marylin`, `Yessica` y `Elthom` — son las filas que el huellero ya está alimentando
todos los días (`huellero_mapeos` apunta a ellas) y, en el caso de Marylin, la que ya tiene un
`sueldo_acuerdos` real cargado. Mover la operación en vivo a la fila vieja habría exigido reescribir
`huellero_mapeos`, que es justamente la pieza que hoy funciona sola.

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

**No se toca:**

- `empleado_tiendas` — las dos filas de cada par ya tienen las cuatro sedes asignadas
  (`PRIMARY KEY (empleado_id, sede_cod)`). Mover las de la fila vieja chocaría contra esa clave. La
  fila vieja se queda con sus propias filas de `empleado_tiendas`, sin efecto porque queda inactiva.
- `sueldo_acuerdos`, `sueldo_liquidaciones`, `sueldo_movimientos`, `evaluaciones_mensuales` — sólo
  `Marylin` tiene filas ahí (1 acuerdo, 1 evaluación), y ninguna fila vieja tiene nada que mover.
  Estas tablas llevan trigger de inmutabilidad (`0072`); esta migración no las toca en absoluto,
  ni con `update` ni con `delete`.

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

`packages/db/pruebas/0102_identidades_duplicadas_empleados.prueba.sql` seguí el patrón del repo: un
bloque que monta lo necesario, ejecuta la migración lógica contra datos de prueba propios (no toca
las filas reales) y verifica por síntoma exacto — no por "no tiró error". Antes de aplicar contra
`scilb`, se corrió además una lectura de control (sin escritura) confirmando los conteos de la
tabla de §4 letra por letra.

Después de aplicar contra `scilb`, se vuelve a leer: la fila canónica de cada par debe sumar
exactamente los puntos de las dos filas originales, cero filas deben seguir apuntando al `id` viejo
en ninguna de las columnas de §4, y las tres filas viejas deben quedar `activo = false`.
