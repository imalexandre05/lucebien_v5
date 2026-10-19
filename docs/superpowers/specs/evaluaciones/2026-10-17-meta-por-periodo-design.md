# Spec — La nota se mide contra la meta del período de pago

> Escrita el 17-oct-2026, **antes** del código y de las pruebas (Zone Guard). Zona crítica
> (puntos → evaluación → pago): spec completa, tests y verificador antes de mergear.
> **Estado: borrador para la sesión maestra.** Sale de la conversación con Alexander del 17-oct-2026
> (ocho rondas). Lo marcado «por confirmar» es un default mío, no una decisión del dueño
> (no-negociable 5).

## 1. Qué se quiere

Hoy la nota es absoluta: `notaDesdePuntos` compara los puntos del ciclo con una escala fija
(`eval_puntos_promedio` = 5000 → 16, `eval_puntos_excelente` = 7500 → 20). Esa escala está sin calibrar:
el mejor mes-persona medido fue 126,45 puntos, que da 0,40/20 (`pendientes-negocio.md`, §«LA ESCALA ESTÁ
SIN CALIBRAR»).

El modelo de Alexander la reemplaza por una **meta propia de cada persona en cada período**:

> Cada período se evalúa lo hecho contra lo que esa persona **podía** hacer en ese período, según
> cuándo trabaja y dónde.

## 2. Decisiones ya tomadas por Alexander (17-oct-2026)

1. **El período de evaluación es el tramo de pago**, no el mes calendario ni la duración del contrato.
   Contrato = estadía (p. ej. 6 meses); modalidad de pago = cada cuánto se cobra. Un contrato de 6 meses
   pagado cada quincena tiene 12 tramos y cada uno se evalúa aparte. Alex, quincenal: del 1 al 15 y del
   16 al 1 del mes siguiente.
2. **La meta de reportes sale del horario contratado** dentro del tramo.
3. **La meta de pipeline se prorratea por turnos en almacén**, no sólo por días, y se mide **por horas**
   (un turno tiene una cantidad de horas definida; se prefiere la hora).
4. **Por ahora la nota sólo informa.** El pago sigue siendo el pactado «hasta tener todo parametrado».
5. La cifra de la meta de pipeline se define después; ahora va un aproximado provisional (§6). **Sigue
   flexible**: podría depender de la demanda de ternos.
6. **Las actividades de reporte son por sede y cuentan igual para todos** los que están en esa sede y turno.
7. **La asignación a almacén es por días fijos.** Cuando no hay demanda y de dos personas en tienda una pasa
   a almacén, eso es un **extra**: suma puntos pero no agrega meta.
8. **El /20 es sólo una referencia** para que el administrador la compare con la nota de puntos de Perú.
9. **Un feriado no lo paga el administrador.** Él decide, persona por persona, que un día es libre; si alguien
   va a trabajar ese día, se considera. El día sale del contrato de esa persona, así que el período tiene
   menos días y la meta baja (§5). **El pago baja en un día completo**: las horas de ese día por el valor
   normal de la hora (en el ejemplo, 11 h × S/4,55 = S/50), sin suavizarlo.
10. La empresa es muy flexible: habrá muchas casuísticas. El diseño debe tener **un solo lugar** donde el
    administrador registre las excepciones, no una regla por caso.
11. **En reportes, la meta es cumplir todas las tareas del reporte.** Está definida y no se flexibiliza.
    Los puntos de reportes y de pipeline **no están al mismo nivel de esfuerzo** y no se suman en una sola
    bolsa mientras no se calibren (§4).
12. **Un día que el administrador declara no trabajado deja de contar para el total**, tanto sus actividades
    como sus horas de pipeline: es como un día libre.
13. **El reporte es igual en toda sede; la productividad depende del lugar** (18-oct): en almacén se mide con el
    pipeline y en tienda con las ventas. Un turno de almacén tiene su reporte de actividades y además se mide por
    pipeline; ninguna hora se reparte ni se cuenta dos veces.
14. **Los extras del reporte suben el cumplimiento por encima de 100 % y las incidencias lo bajan.**
15. **Hay personas con más de una sede en el mismo tramo**: la sede se guarda en cada turno, no en la persona.
16. **Cumplir la meta vale 16** (decidido el 18-oct-2026, tras dudar entre 20 y 16): deja espacio hasta 20 para
    quien rinde más. Ver «De cumplimiento a nota».
17. **Los demás factores de la evaluación entran a la nota** (19-oct): competencias, exámenes y puntualidad, con
    peso editable desde `/configuracion`. Los valores 360° siguen como hoy (*por confirmar*). Ver «Nota final».
18. **El exceso de un componente no tapa la falta del otro** (19-oct, se sigue la recomendación): cada componente
    cuenta hasta su 100 % en la base y lo que pase suma aparte, con un tope (§4).
19. **Las ventas las carga el administrador a mano por ahora**; más adelante se conectarán con el nuevo sistema de
    inventario y POS (19-oct).
21. **La meta de pipeline se medirá después** (19-oct): `pipeline_meta_puntos_por_hora` queda **sin valor** (vacío =
    sin meta) hasta que se mida; mientras tanto el pipeline no entra a la nota (§4, §6).
22. **Los pesos se dejan como están** (19-oct) y deben poder editarse; se exige comprobar que cada parámetro editable
    de verdad cambia el resultado (§7, «Los parámetros deben tener efecto»).
20. **El sistema aún está en desarrollo y no se usa** (19-oct): por eso no hay reportes recientes; las cifras de
    calibración son marcadores hasta que haya datos reales.

## 3. Qué ya existe (verificado en el código, no se reescribe)

| Pieza | Dónde |
|---|---|
| Tramos de pago por contrato, con cambios de modalidad | `calendarioDePagos(contrato, cambios)` en `packages/core/src/sueldos.ts`; tabla `sueldo_acuerdos` (`fecha_inicio`, `fecha_fin`, `modalidad`) |
| Horario contratado: plantilla semanal | `sueldo_acuerdo_turnos` (`dia_semana`, `hora_inicio`, `hora_fin`, `lugar`), migración 0072. `lugar` es **texto informativo**: no distingue tienda de almacén ni dice la sede de forma que el sistema pueda usarla |
| Sede de la persona | `empleados.sede_cod` y `empleado_tiendas` (varias sedes por persona) |
| **Los puntos de actividades se acreditan a cada persona del reporte**, no sólo a quien lo envía | `private.evaluacion_componentes_datos` (0110): suma `calificacion` (0 a 1) de las actividades de los reportes `evaluado` donde la persona es `encargado_id` o figura en `reporte_trabajadores`. Un reporte por sede y turno (`idReporte`) |
| El sueldo es un monto fijo del período y la hora se deriva de él | `sueldos.ts`: `valorPorHora = sueldoPactado / horasContratadas` (línea 975); «Sueldo — Pactado para el periodo» (RN-19); falta = horas faltadas × valor × castigo (RN-09); horas fuera de contrato (RN-17) |
| Licencia = falta que el administrador marca justificada | `asistencias.condicion = 'falta'` + `falta_justificada` (`pendientes-negocio.md`, 14-ago-2026) |
| Trabajo fuera del horario pactado (RN-17) | Se deriva de que ese día no tenga turno en la plantilla (`pendientes-negocio.md`, §«Lo que la capa de datos dejó abierto»); ahí mismo queda anotado «confirmar que ese criterio alcanza» |
| **Actividades de reporte por sede (verificado en la base `scilb`, 18-oct-2026)** | `actividades_config`: `AL` Almacén Central y Taller tiene 20 activas, de las cuales **9 obligatorias** (6 de limpieza y 3 de operación) y 11 extras `por_puntos`. Las tiendas tienen 27 a 29 obligatorias cada una (`LB`, `ST`, `TR`). `LV` Lavandería–Recepción (perfil almacén) tiene **0**. En `reportes` hay ~270 por sede desde abril, de ellos 64 evaluados en `AL`; el más reciente de cualquier sede es del 23-ago-2026 |
| **Ventas y su meta ya existen en el motor** | `sueldo_ventas` (monto, fecha, `empleado_id` del vendedor; hoy se cargan a mano, `origen = 'manual'`). La meta de ventas se pacta por contrato (`parametros.metaSemanal`, RN-10) y la del período es la suma de las semanales (RN-11): `metaPeriodo` en `liquidarPeriodo()` (`sueldos.ts` ~1348–1391). Si el contrato no la pacta, el motor la sugiere por horas |
| Curva puntos → nota | `notaDesdePuntos(puntos, escala)` en `evaluaciones.ts` |
| Actividades que aplican a una fecha y turno | `actAplicaHoy` en `reportes.ts` (turnos M/T/C) |

No existe: calendario de feriados, excepciones de calendario por persona, ni forma de decir «este turno es de
almacén» o «de esta sede» que el motor pueda leer.

## 4. El modelo: reportes y productividad

Alexander (18-oct): *«una cosa son los reportes independientemente de la sede; en almacén se mide la
productividad con el pipeline, y en tienda con las ventas»*. Son dos componentes:

- **Reportes**: iguales para todos, en cualquier sede, sobre todas las horas contratadas.
- **Productividad**: depende de dónde trabaja. Pipeline en las horas de almacén, ventas en las de tienda.

**No se suman unidades distintas.** Reportes y pipeline son puntos de esfuerzo desigual y las ventas son soles:
cada medida se compara con su propia meta y se convierte en un porcentaje. Con una sola bolsa de puntos, el área
con más puntos por hora dominaría el resultado.

Para una persona y un rango `[desde, hasta]` (por defecto, su tramo de pago), sin contar los días libres (§5):

```
-- Reportes: igual en toda sede
horasReportes = horas contratadas (tienda y almacén) en turnos con al menos una actividad obligatoria que aplique
metaReportes  = actividades obligatorias que aplican × pts_actividad_cumplida          (todas cumplidas = 100 %)
rReportes     = (puntos de actividades + puntos de extras − puntos de incidencias) / metaReportes

-- Productividad: según el lugar
horasAlmacen  = horas contratadas en turnos de almacén
horasTienda   = horas contratadas en turnos de tienda
pipelineEquivalente = puntosPipeline / pipeline_meta_puntos_por_hora      (horas de pipeline «al ritmo de la meta»)
rVentas       = ventas del rango / metaVentas del rango                   (la misma meta que usa el motor, RN-10/RN-11)
rProductividad = (pipelineEquivalente + horasTienda × rVentas) / (horasAlmacen + horasTienda)

base          = eval_peso_reportes × min(rReportes, 1) + (1 − eval_peso_reportes) × min(rProductividad, 1)
exceso        = eval_peso_reportes × max(rReportes − 1, 0) + (1 − eval_peso_reportes) × max(rProductividad − 1, 0)
cumplimiento  = base + min(exceso, eval_tope_exceso)
```

- **Reportes.** La meta es completa: todas las actividades **obligatorias** (`tipo_act = 'obligatoria'`; las
  `por_puntos` de categoría EXT son extras y no forman parte de la meta) que aplican en la **sede** y el turno
  (`actAplicaHoy`), iguales para todos los que comparten sede y turno. Como el puntaje de un reporte se acredita a
  cada persona de su lista, la meta de cada una es el reporte completo. Los extras suben este cociente por encima
  de 1 y las incidencias lo bajan (decisión 14). Verificado en la base (18-oct, ver §3): la sede de almacén sí
  tiene actividades de reporte; la de lavandería no, y sus horas no entran a `horasReportes`.
- **Pipeline (almacén).** La meta son las horas en **almacén** por `pipeline_meta_puntos_por_hora` (§6). Se mide
  por hora porque los turnos reales son de 4 y 7 horas (09:00–13:00 y 13:00–20:00). Si Alexander define después la
  meta «por turno», se convierte dividiéndola por las horas del turno. **Mientras la meta no tenga valor, el pipeline
  no entra al cálculo**: las horas de almacén salen de `horasAlmacen` y de `pipelineEquivalente`, y la persona se
  evalúa con reportes (y con ventas, si tiene horas de tienda). La pantalla lo dice con todas las letras: «La meta
  de pipeline aún no está definida».
- **Ventas (tienda).** Se miden contra la meta de ventas del contrato de esa persona, la que ya calcula el motor.
  No se inventa ninguna meta nueva ni hace falta definir «cuántos puntos vale un sol vendido»
  (`pts_por_sol_vendido` sigue vacío y no se usa aquí). Hoy las ventas se cargan a mano y por vendedor; una venta
  sin vendedor asignado no cuenta para nadie (cola de sin asignar de la 0072).
- **Una hora pesa una vez.** Un turno de almacén pesa en `horasReportes` por su reporte y en `horasAlmacen` por
  su pipeline, pero cada área se promedia por separado y luego se combinan con `eval_peso_reportes`: nada se
  reparte ni se cuenta doble.
- **Componente sin meta.** Si la persona no tiene meta de productividad (sin horas de almacén y sin meta de
  ventas) o de reportes (sin actividades que apliquen), el cumplimiento es el otro componente. Si no tiene
  ninguno, no hay nota.
- **El exceso no tapa faltas.** Cada componente cuenta como máximo su 100 % en la base. Lo que pase de 100 % se
  suma aparte como extra, con un tope (`eval_tope_exceso`, default 0,25 = 25 puntos de cumplimiento). Ejemplo: 0 %
  en reportes y 250 % en productividad dan base 50 % + extra 25 % = 75 % (nota 12, en banda de riesgo), no 125 %.
  Quien cumple todo y además rinde más llega a 125 %, que con el anclaje de 16 es la nota 20.
- **Lo no asignado es extra.** El pipeline hecho fuera de las horas de almacén (alguien pasa a almacén un día de
  poca demanda) entra en `pipelineEquivalente` pero no agrega horas al denominador: sube el cumplimiento y nunca se
  descarta nada. Lo mismo quien trabaja un día libre.
- **Se muestran las razones por separado** (reportes y productividad, y dentro de ésta pipeline y ventas), porque
  el administrador pidió ver «dónde flaquea».

**Límite conocido.** Quien está contratado en almacén pero ese día se queda en tienda conserva la meta de
pipeline y no la cumple. Es consistente con el punto 7 de §2 y con la plantilla fija; si se vuelve frecuente,
el administrador lo resuelve con un día libre parcial (fuera de esta spec).

### De cumplimiento a nota

La medida principal es el **porcentaje de cumplimiento**. La nota /20 se deriva de él sólo como referencia:

```
nota = 20 × cumplimiento / eval_cumplimiento_para_20        (sin techo en 20; bandas sobre esta nota)
```

Con el default (`eval_cumplimiento_para_20` = 1,25, o sea `nota = 16 × cumplimiento`): cumplir toda la meta es
16, 112,5 % es 18, 125 % es 20 y 81,25 % es 13. Las bandas del 25-ago (`eval_banda_riesgo` 13,
`eval_banda_ideal` 18) no cambian, y pasar de 20 (extras, pipeline fuera de plantilla) es «sobresaliente».

**Por qué 16 y no 20.** Alexander respondió 20 el 17-oct y a la vez preguntó cómo se vería a quien rinde mejor;
con 20 el buen desempeño sólo se vería por encima de 20, y una nota de referencia peruana no pasa de 20. El
18-oct decidió 16, la idea original: cumplir la meta es «promedio» (como en la reunión del 25-ago) y el 20 exige
125 %. Cambiar de una a otra sigue siendo un solo parámetro, sin tocar código.

Se agrega una función pura `notaDesdeCumplimiento` en `evaluaciones.ts`. `notaDesdePuntos` y sus
parámetros `eval_puntos_*` **no se tocan**: siguen leyendo las evaluaciones ya cerradas.

**Sin meta no hay nota.** Si ni los reportes ni la productividad tienen meta (rango sin turnos, todos los días
libres, fuera del contrato) no se calcula nada y la pantalla dice «sin meta en este período». El llamador evita
la división, no la captura.

**Rango.** El tramo es sólo el rango por defecto. El cálculo vale para cualquier `[desde, hasta]`, recortado
por `fecha_inicio`/`fecha_fin` del contrato; el primer y el último tramo, si el contrato los corta, tienen
meta proporcional a lo que cae dentro. Si cambia la modalidad a mitad de contrato, `calendarioDePagos` ya
parte los tramos.

### Verificación de los parámetros de evaluación (19-oct-2026, contra el código)

Alexander pidió comprobar que los pesos puedan editarse y que editarlos cambie algo. Resultado:

| Parámetro | ¿Se puede editar? | ¿Cambia algo hoy? |
|---|---|---|
| `peso_competencias`, `peso_valores`, `peso_operaciones`, `peso_software`, `peso_limpieza`, `peso_examenes`, `peso_tardanza` | **Sí.** Están en el catálogo (sección «Evaluación mensual»), `/configuracion` los guarda con la acción `guardarConfig` (sólo admin o dueño) y refresca las pantallas (`revalidatePath`) | **No afectan la nota.** `leerPesosEval()` los lee, pero `armarEvaluacionAGuardar` calcula `notaFinal` con `notaDesdePuntos(puntosTotal, escala)`; los pesos sólo se muestran junto a las barras del perfil y se guardan en el snapshot `pesos_usados`. `calcularNotaMensual()` ya no se usa |
| `eval_puntos_promedio`, `eval_nota_promedio`, `eval_puntos_excelente`, `eval_banda_riesgo`, `eval_banda_ideal` | Sí | **Sí afectan** (para evaluaciones nuevas): `leerEscalaPuntos()` los lee y `notaDesdePuntos` los usa |
| `pts_actividad_cumplida` | Sí | **Sí afecta**: la RPC `private.evaluacion_componentes_datos` lee `config` en cada cálculo |

Conclusión: hoy hay siete parámetros editables que **no hacen nada** sobre la nota. Esta spec los pone a trabajar (la
nota final pasa a ser la suma ponderada) y exige que ningún parámetro nuevo repita el problema (§7, 6 ter). Un
cambio de peso afecta sólo a las evaluaciones que se guarden después: las cerradas conservan su snapshot.

### Nota final: los puntos y los demás factores

Los demás factores se evalúan y **también entran a la nota**, con pesos editables. Cada uno es una nota sobre 20:

```
notaPuntos = 20 × cumplimiento / eval_cumplimiento_para_20                (16 al cumplir la meta)
notaFinal  = peso_puntos × notaPuntos + peso_competencias × competencias + peso_valores × valores
           + peso_examenes × examenes + peso_tardanza × puntualidad
```

- Todos los pesos viven en `/configuracion` y **deben sumar 1,00** (se valida al guardar). Se agrega la clave
  `peso_puntos`; reemplaza a `peso_operaciones`, `peso_software` y `peso_limpieza`, que medían el trabajo y ahora
  los cubre el bloque de puntos.
- **Defaults sin inventar nada:** se toman de los pesos que ya existen. `peso_puntos` = 0,10 + 0,10 + 0,10 = **0,30**;
  competencias 0,25; valores 360° 0,25; exámenes 0,15; puntualidad 0,05. Suman 1,00. Ojo: así los puntos pesan 30 %,
  menos de lo que el administrador describió el 25-ago; se sube editando el peso, sin tocar código.
- **Las incidencias no se restan otra vez:** ya bajan `rReportes` (decisión 14). El bono por ventas de la fórmula
  vieja tampoco aplica: las ventas ya están dentro de la productividad.
- Las barras del perfil de la pantalla se siguen mostrando como hoy. Las evaluaciones ya cerradas conservan su
  fórmula (se rotulan «escala anterior»).

## 5. Días sin obligación: un solo registro de excepciones

Regla general: **la meta es lo que la persona podía hacer**, así que un día en que no debía trabajar sale del
total: ni sus actividades ni sus horas de pipeline cuentan. Una falta injustificada **no** sale: cuenta como
cero puntos hechos.

| Caso | Cómo se trata | Dato nuevo |
|---|---|---|
| Descanso semanal | No es día contratado, no tiene turno → no entra a la meta | Ninguno |
| **Licencia** | Falta marcada `falta_justificada` por el administrador → ese día sale de la meta. Si no la marca, es falta y cuenta | Ninguno (usa el campo existente) |
| **Feriado o cierre decidido por el administrador, persona por persona** | **Día libre**: sale del contrato de esa persona, sale de la meta y **no se paga**. Si la persona trabaja ese día, se considera: sus puntos suman a los hechos y las horas son trabajo fuera de horario (RN-17) | Sí: tabla `dias_libres` |

`dias_libres`: `empleado_id` (obligatorio), `fecha`, `motivo` (obligatorio), `creado_por`, `creado_en`; única
por `(empleado_id, fecha)`. No hay «toda la empresa»: la pantalla permite marcar un día para **varias personas
a la vez** (un feriado = marcar a quienes no trabajan), porque a veces algunas sí trabajan. Sólo el
administrador la escribe, por RPC con guard, nunca con una policy abierta (no-negociable 3). Si el administrador
no marca el día, la meta cuenta normal: ningún feriado se asume.

**Esta tabla es el lugar de las excepciones** (decisión 10). Cualquier casuística nueva de «ese día esta persona
no debía» se resuelve con una fila, no con otra regla.

### El pago del día libre (decidido por Alexander, necesita spec propia del motor)

Alexander decidió que el día libre **se descuenta completo**, a la hora normal. Ejemplo ilustrativo: sueldo de
S/600, 12 días de 11 horas (132 h), hora a S/4,55, día libre = 11 h × S/4,55 = S/50 → cobra S/550. Si trabaja
ese día, las 11 h se pagan como horas fuera de contrato (RN-17) y vuelve a S/600.

**No basta con quitar el día del horario.** El sueldo es un monto fijo del período y `valorPorHora =
sueldoPactado / horasContratadas` (`sueldos.ts:975`): quitar el día dejaría el sueldo entero, subiría la hora
a S/4,96 y **el día quedaría pagado**. El motor debe (a) calcular el valor de la hora con el calendario
**normal** del período, sin los días libres, y (b) agregar una línea visible de descuento «Día libre» por las
horas de esos días. Así el valor de la hora, de las horas extra y del castigo por falta no se mueve.

Esto toca la cadena del sueldo: spec completa, tests y verificador **aparte** (§8).

## 6. Parámetros nuevos (provisionales, editables desde `/configuracion`)

| Clave | Default | De dónde sale |
|---|---|---|
| `pipeline_meta_puntos_por_hora` | **vacío (sin meta)** | **Decidido por Alexander (19-oct): la meta de pipeline se medirá después.** No se siembra ningún número: vacío significa «desactivado», con `permiteVacio` en el catálogo, igual que `sueldo_puntos_meta_mensual`. Podría depender de la demanda de ternos. Para orientar: el mejor mes-persona medido en el sistema antiguo fue 126,45 puntos (abril 2026), de un módulo con 2 de 11 personas registrando, así que no sirve como meta |
| `eval_peso_reportes` | **0,5** | **Elegido por mí:** reportes y productividad pesan igual en el cumplimiento. Se puede inclinar (p. ej. 0,4 da más peso a la productividad) sin tocar código |
| `eval_tope_exceso` | **0,25** | **Elegido por mí:** el exceso sobre 100 % suma como mucho 25 puntos de cumplimiento (125 % = nota 20 en la parte de puntos). Subirlo permite notas sobresalientes (>20) |
| `peso_puntos` | **0,30** | Tomado de los pesos existentes: `peso_operaciones` + `peso_software` + `peso_limpieza` (0,10 cada uno). Los demás pesos (`peso_competencias` 0,25, `peso_valores` 0,25, `peso_examenes` 0,15, `peso_tardanza` 0,05) no cambian |
| `eval_cumplimiento_para_20` | **1,25** | Decidido por Alexander (18-oct): cumplir toda la meta vale 16 y el 20 llega al 125 %. Ver §4 |

*Antes de dar por buena la cifra de pipeline*, la sesión maestra debe contrastarla con la base
(no-negociable 7): las cifras vienen de `pendientes-negocio.md`, no de una consulta de este día.

Hay que sembrar ambos con un comentario de «provisional» en la migración y anotarlos en
`docs/pendientes-negocio.md` (ya anotado en esta rama).

## 7. Qué hay que construir (para la sesión maestra)

1. **Estructurar el turno.** `sueldo_acuerdo_turnos.lugar` es texto libre. Hacen falta dos columnas que el
   motor pueda leer: `area` (`tienda` | `almacen`, **default `tienda`**, así ningún contrato existente gana meta
   de pipeline hasta que el administrador lo marque) y `sede_cod`. Como hay personas con más de una sede en el
   mismo tramo (decisión 15), la sede **se guarda en cada turno**; sólo cuando la persona tiene una única sede
   puede quedar nula y tomar `empleados.sede_cod`. Pantalla de horario del contrato: un selector de área y de
   sede por turno.
2. **Tabla `dias_libres`** + RPC de alta/baja sólo administrador + pantalla de marcado para varias personas.
3. **Core, funciones puras** (en `evaluaciones.ts`): `metaDelRango(turnos, diasLibres, licencias,
   actividadesPorSedeYTurno, contrato, rango, params)` que devuelve `{ horasReportes, horasAlmacen, horasTienda, metaReportes }`,
   y `cumplimientoDelRango` / `notaDesdeCumplimiento`. **Reciben las fechas de quien las llama, nunca
   `new Date()`** (no-negociable 4).
3 bis. **Meta de ventas reutilizada, no copiada.** Extraer del motor (`metaPeriodo` en `liquidarPeriodo()`, RN-10/RN-11) una
   función pura que calcule la meta de ventas de un rango, y que la usen el motor y la nota. Una segunda fórmula
   divergería con el tiempo (no-negociable 1: la cadena del sueldo no se duplica).
4. **RPC `private.evaluacion_componentes_datos`:** agregar las claves del cálculo. Conserva firma, `security
   definer`, `search_path` y permisos. Sin `getAdminClient()` nuevo (no-negociable 3).
5. **Guardar** en `evaluaciones_mensuales.componentes` (jsonb) el cumplimiento, las horas, la meta y las dos
   razones.
6. **Pantalla `/evaluaciones` y «Mi desempeño»:** mostrar el **porcentaje de cumplimiento** como lo principal,
   la nota /20 como referencia, y las dos razones; el mismo aislamiento de hoy (nadie ve la nota ni el sueldo de
   otro).
6 ter. **Los parámetros deben tener efecto** (verificado en el código el 19-oct, ver abajo). La construcción exige:
   (a) cada parámetro nuevo va al catálogo `config-catalogo.ts` con su tipo, mínimo, máximo y default (si no está,
   `/configuracion` no lo muestra con su control tipado); (b) cada uno se lee desde `config` con la lectura segura de
   `evaluaciones-repo.ts` (vacío o roto cae al default, nunca a 0); (c) **una prueba de efecto por parámetro**: cambiar
   el valor en `config` y comprobar que la nota o el porcentaje cambia; (d) retirar del catálogo, o rotular «sólo
   evaluaciones anteriores», los parámetros que dejen de usarse (`peso_operaciones`, `peso_software`, `peso_limpieza`,
   `eval_puntos_promedio`, `eval_puntos_excelente`), para que nadie edite algo que ya no hace nada; (e) recomendado: una
   regla del guard o una prueba que recorra el catálogo y falle si una clave editable no la lee ningún código.
6 bis. **Nota final ponderada:** función pura `calcularNotaFinal` en `evaluaciones.ts` (reutiliza `PesosEval` y agrega
   `peso_puntos`), validación de que los pesos sumen 1,00 y la pantalla de pesos en `/configuracion`.
7. **Evaluaciones ya cerradas no se recalculan.** Conservan su escala absoluta; la pantalla las rotula como
   «escala anterior».

## 8. Relación con lo que ya está

- **Pago por puntos** (`sueldo_puntos_meta_mensual`, `sueldo_soles_por_punto`, spec del 05-oct): sigue
  apagado y **no se toca**. La nota no mueve el pago. Cuando se prenda, decidir si su meta mensual pasa a
  derivarse de esta meta; hoy son dos metas distintas y la segunda es manual.
- **`sugerirMontoPago`** (`pagos.ts`): sin cambios; sigue siendo una sugerencia que el administrador decide.
- **Puntos como moneda** (spec del 25-ago): esta spec la modifica en un solo punto, la escala de la nota.
- **Motor de sueldos y `dias_libres`: dependencia con spec propia.** Para que «el día libre se descuenta» sea
  cierto, `sueldos.ts` debe leer `dias_libres` y aplicar lo descrito en §5. Mientras no exista, **la meta puede
  leer `dias_libres` pero el pago no**, y la pantalla de marcado debe decirlo con todas las letras, para que
  nadie crea que ya se descuenta. Esa spec se está trabajando en la sesión maestra (confirmado el 19-oct).

## 9. Pruebas que debe tener el código (escribirlas primero)

- Quincenal anclado al día 1: el tramo 16–30/31 toma sus propios días; contrato que termina el día 20
  recorta el último tramo.
- **Almacén con la meta definida** (ejemplo 0,5 puntos por hora): 12 días × 11 h, reporte 20/20 y pipeline 100 sobre
  una meta de 66: rReportes 1, rProductividad 1,515, cumplimiento 0,5×1 + 0,5×1,515 = 125,8 %.
- **Almacén con la meta vacía:** el pipeline no entra; el cumplimiento es `rReportes` y la pantalla avisa que la meta
  no está definida.
- **Tienda:** reportes al 100 % y ventas al 80 % de su meta: cumplimiento 0,5×1 + 0,5×0,8 = 90 %.
- **Mixta:** 8 días de tienda (88 h) y 4 de almacén (44 h): rProductividad = (pipelineEquivalente + 88 × rVentas) / 132.
- Mañana en tienda y tarde en almacén el mismo día: las 11 h cuentan para reportes; 4 h entran a la productividad
  por ventas y 7 h por pipeline.
- Una persona con turnos en dos sedes en el mismo tramo: cada turno toma las actividades de su propia sede.
- Turnos de 4 y 7 horas en almacén: la meta de pipeline es proporcional a las horas.
- Dos personas en la misma sede y turno: ambas tienen la misma meta de reportes.
- Turno de tienda sin actividades que apliquen: no entra al denominador.
- Pipeline hecho fuera de las horas de almacén: sube el cumplimiento y no cambia las horas.
- Persona sólo de almacén: productividad = pipeline. Persona sólo de tienda: productividad = ventas.
- Sin meta de ventas ni horas de almacén: el cumplimiento es `rReportes`. Sin actividades que apliquen: es
  `rProductividad`. Sin ninguna de las dos: «sin meta».
- Una venta sin vendedor asignado no cuenta para la nota de nadie.
- Extras suben `rReportes` por encima de 1 e incidencias lo bajan; los puntos netos negativos dan 0,00.
- Licencia justificada: baja las horas y la meta; falta injustificada: no baja y cuenta cero.
- Día libre para una persona y no para su compañera de sede: sólo la primera pierde meta y horas. Si trabaja
  ese día, sus puntos suman.
- `horasReportes + horasAlmacen = 0` no lanza ni devuelve `NaN`: devuelve «sin meta».
- Con el default 1,25: nota 16 con cumplimiento 1,00; 18 con 1,125; 20 con 1,25; 13 con 0,8125; más de 20
  sin techo; puntos netos negativos dan 0,00.
- `eval_cumplimiento_para_20` = 1,00 da 20 al cumplir el 100 %: el parámetro cambia la escala sin tocar código.
- La meta de reportes cuenta sólo actividades con `tipo_act = 'obligatoria'`: las `por_puntos` (categoría EXT) no
  suman a la meta, entran como extras.
- **El exceso no tapa faltas:** reportes 0 % y productividad 250 % dan base 50 % + extra 25 % = 75 % (nota 12);
  reportes 100 % y productividad 150 % dan 100 % + 25 % = 125 % (nota 20). `eval_tope_exceso` = 0,5 sube el techo.
- **Nota final:** puntos en 16, competencias 18, valores 17, exámenes 15, puntualidad 20, con los pesos por defecto,
  dan 0,30×16 + 0,25×18 + 0,25×17 + 0,15×15 + 0,05×20 = 16,8. Pesos que no suman 1,00 se rechazan al guardar.
- Las incidencias bajan `rReportes` una sola vez y no se restan de la nota final.
- Contrato con cambio de mensual a quincenal el 10-nov: los tramos y sus metas coinciden con
  `calendarioDePagos` (ya probado en `sueldos.test.ts`).
- Aislamiento: un encargado no ve la meta ni la nota de otra sede; el empleado sólo las suyas.
- Fechas en hora Perú: un avance registrado a las 23:30 Perú del último día del tramo cae en ese tramo.
- **Motor de sueldos (spec aparte):** con S/600, 12 días × 11 h y un día libre, la liquidación da S/550 y la hora
  sigue en S/4,55; trabajando ese día vuelve a S/600.

## 10. Preguntas

**Cerradas el 17-oct-2026:** asignación a almacén fija con extras eventuales; medición por hora; actividades
por sede y para todos igual; feriados por persona y no pagados, descontados completos a la hora normal;
reportes con meta completa; cada área contra su meta y promedio por horas; turno de almacén con reporte y
pipeline; extras suben e incidencias bajan; hay personas con más de una sede por tramo.

**Cerradas:** cumplir la meta vale 16 (`eval_cumplimiento_para_20` = 1,25); la sede de almacén sí tiene actividades de
reporte (9 obligatorias) y la de lavandería ninguna; el reporte es igual en toda sede y la productividad se mide con
pipeline en almacén y con ventas en tienda; los demás factores entran a la nota con pesos editables y se dejan los pesos
por defecto (`peso_puntos` 0,30 y los demás como están); el exceso no tapa faltas; las ventas las carga el administrador
a mano por ahora; el sistema aún no se usa, así que no hay reportes recientes; la meta de pipeline se medirá después
(parámetro vacío); el descuento del día libre se trabaja en la sesión maestra.

**Abiertas:**
1. ¿Reportes y productividad pesan 50/50 dentro de los puntos? Es editable (`eval_peso_reportes`); se deja así si no
   hay una preferencia.
2. Los valores 360° entran a la nota con su 25 % actual (editable). Confirmar que es lo que se quiere.
