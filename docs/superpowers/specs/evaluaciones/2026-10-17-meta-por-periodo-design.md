# Spec — La nota se mide contra la meta del período de pago

> Escrita el 17-oct-2026, **antes** del código y de las pruebas (Zone Guard). Zona crítica
> (puntos → evaluación → pago): spec completa, tests y verificador antes de mergear.
> **Estado: borrador para la sesión maestra.** Sale de la conversación con Alexander del 17-oct-2026
> (dos rondas). Lo marcado «por confirmar» es un default mío, no una decisión del dueño
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
5. La cifra de la meta de pipeline se define después; ahora va un aproximado provisional (§6).
6. **Las actividades de reporte son por sede y cuentan igual para todos** los que están en esa sede y turno.
7. **La asignación a almacén es por días fijos.** Cuando no hay demanda y de dos personas en tienda una pasa
   a almacén, eso es un **extra**: suma puntos pero no agrega meta.
8. **El /20 es sólo una referencia** para que el administrador la compare con la nota de puntos de Perú.
9. **Un feriado no lo paga el administrador.** Él decide, persona por persona, que un día es libre; si alguien
   va a trabajar ese día, se considera. El día sale del contrato de esa persona, así que el período tiene
   menos días y la meta baja (§5).
10. La empresa es muy flexible: habrá muchas casuísticas. El diseño debe tener **un solo lugar** donde el
    administrador registre las excepciones, no una regla por caso.

## 3. Qué ya existe (verificado en el código, no se reescribe)

| Pieza | Dónde |
|---|---|
| Tramos de pago por contrato, con cambios de modalidad | `calendarioDePagos(contrato, cambios)` en `packages/core/src/sueldos.ts`; tabla `sueldo_acuerdos` (`fecha_inicio`, `fecha_fin`, `modalidad`) |
| Horario contratado: plantilla semanal | `sueldo_acuerdo_turnos` (`dia_semana`, `hora_inicio`, `hora_fin`, `lugar`), migración 0072. `lugar` es **texto informativo**: no distingue tienda de almacén ni dice la sede de forma que el sistema pueda usarla |
| Sede de la persona | `empleados.sede_cod` y `empleado_tiendas` (varias sedes por persona) |
| **Los puntos de actividades se acreditan a cada persona del reporte**, no sólo a quien lo envía | `private.evaluacion_componentes_datos` (0110): suma `calificacion` de las actividades de los reportes `evaluado` donde la persona es `encargado_id` o figura en `reporte_trabajadores`. Un reporte por sede y turno (`idReporte`) |
| Licencia = falta que el administrador marca justificada | `asistencias.condicion = 'falta'` + `falta_justificada` (`pendientes-negocio.md`, 14-ago-2026) |
| Trabajo fuera del horario pactado (RN-17) | Se deriva de que ese día no tenga turno en la plantilla (`pendientes-negocio.md`, §«Lo que la capa de datos dejó abierto»); ahí mismo queda anotado «confirmar que ese criterio alcanza» |
| Curva puntos → nota | `notaDesdePuntos(puntos, escala)` en `evaluaciones.ts` |
| Actividades que aplican a una fecha y turno | `actAplicaHoy` en `reportes.ts` (turnos M/T/C) |

No existe: calendario de feriados, excepciones de calendario por persona, ni forma de decir «este turno es de
almacén» o «de esta sede» que el motor pueda leer.

## 4. El modelo

Para una persona y un rango `[desde, hasta]` (por defecto, su tramo de pago):

```
puntosPosibles = metaReportes + metaPipeline
puntosHechos   = lo que la RPC ya calcula (pipeline + extras + actividades − incidencias)
cumplimiento   = puntosHechos / puntosPosibles
```

**metaReportes.** Por cada día del rango, dentro del contrato, que no sea día libre (§5), y por cada turno
contratado de **tienda**: las actividades que aplican en esa **sede** y turno (`actAplicaHoy`) ×
`pts_actividad_cumplida`. Es la misma para todos los que comparten sede y turno. Como el puntaje de un
reporte se acredita a cada persona de su lista, la meta de cada una es el reporte completo.

**metaPipeline.** Horas contratadas en **almacén** dentro del rango × `pipeline_meta_puntos_por_hora` (§6).
Se mide por hora porque los turnos reales son de 4 y 7 horas (09:00–13:00 y 13:00–20:00). Si Alexander
define después la meta «por turno», se convierte dividiéndola por las horas del turno.

**Turno de almacén sin meta de reportes** (*por confirmar*): un turno de almacén se mide sólo por pipeline,
para no contar el mismo turno dos veces.

**Qué pesa más sale solo.** Más horas en almacén significan más peso del pipeline en `puntosPosibles`. Se
guardan y muestran además las dos razones por separado (reportes hechos / meta de reportes, pipeline hecho /
meta de pipeline), porque el administrador pidió ver «dónde flaquea».

**Lo no asignado es extra.** La meta sale sólo de la plantilla fija. Quien pasa a almacén un día de poca
demanda suma sus puntos de pipeline a `puntosHechos` sin agregar meta; lo mismo quien trabaja un día libre
(§5). Sube el cumplimiento y nunca se descarta nada.

**Límite conocido.** Lo contrario también ocurre: quien está contratado en almacén pero ese día se queda en
tienda conserva la meta de pipeline y no la cumple. Es consistente con el punto 7 de §2 y con la plantilla
fija; si se vuelve frecuente, el administrador lo resuelve con un día libre parcial (fuera de esta spec).

### De cumplimiento a nota

La medida principal es el **porcentaje de cumplimiento**. La nota /20 se deriva de él sólo como referencia:

```
nota = 20 × cumplimiento / eval_cumplimiento_para_20        (sin techo en 20; bandas sobre esta nota)
```

Con el default (`eval_cumplimiento_para_20` = 1,00): cumplir toda la meta es 20, 90 % es 18, 65 % es 13.
Las bandas del 25-ago (`eval_banda_riesgo` 13, `eval_banda_ideal` 18) no cambian, y pasar de 20
(extras, pipeline fuera de plantilla) es «sobresaliente».

**Esta es una recomendación que corrige la anterior.** Había propuesto que 100 % valiera 16 para conservar
el ancla del 25-ago. Ese 16 estaba atado a los 5000 puntos hipotéticos; con una meta por persona,
«cumplir todo» y «20» coinciden y la fórmula se explica sola. Se puede mover con el parámetro (p. ej. 1,25
exige 125 % de la meta para el 20). *Por confirmar.*

Se agrega una función pura `notaDesdeCumplimiento` en `evaluaciones.ts`. `notaDesdePuntos` y sus
parámetros `eval_puntos_*` **no se tocan**: siguen leyendo las evaluaciones ya cerradas.

**Sin meta no hay nota.** Si `puntosPosibles = 0` (rango sin turnos, todos los días libres, fuera del
contrato) no se calcula nada y la pantalla dice «sin meta en este período». El llamador evita la división,
no la captura.

**Rango.** El tramo es sólo el rango por defecto. El cálculo vale para cualquier `[desde, hasta]`, recortado
por `fecha_inicio`/`fecha_fin` del contrato; el primer y el último tramo, si el contrato los corta, tienen
meta proporcional a lo que cae dentro. Si cambia la modalidad a mitad de contrato, `calendarioDePagos` ya
parte los tramos.

## 5. Días sin obligación: un solo registro de excepciones

Regla general: **la meta es lo que la persona podía hacer**, así que un día en que no debía trabajar sale de
`puntosPosibles`. Una falta injustificada **no** sale: cuenta como cero puntos hechos.

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

**El pago.** Que el día libre **no se pague** es una decisión de Alexander, pero cómo se refleja en la
liquidación (descuento del día, cambio del valor por hora, tope de días contratados) es del motor de sueldos
(`sueldos.ts`), que hoy no conoce excepciones por fecha. Esta spec **no lo cambia**. El motor y la meta
deben leer la **misma** tabla para no divergir; ver §8.

## 6. Parámetros nuevos (provisionales, editables desde `/configuracion`)

| Clave | Default | De dónde sale |
|---|---|---|
| `pipeline_meta_puntos_por_hora` | **0,5** | **Elegido por mí, no por Alexander.** El mejor mes-persona medido (126,45 puntos, abril 2026) dividido en ~21 días de 11 horas da ~0,55 por hora. Es el techo de un módulo con poca adopción (2 de 11 personas registraron avances), así que probablemente subestima la capacidad real. A recalibrar tras un mes de uso |
| `eval_cumplimiento_para_20` | **1,00** | Elegido por mí: cumplir toda la meta equivale a 20. Ver §4 |

*Antes de dar por buena la cifra de pipeline*, la sesión maestra debe contrastarla con la base
(no-negociable 7): las cifras vienen de `pendientes-negocio.md`, no de una consulta de este día.

Hay que sembrar ambos con un comentario de «provisional» en la migración y anotarlos en
`docs/pendientes-negocio.md` (ya anotado en esta rama).

## 7. Qué hay que construir (para la sesión maestra)

1. **Estructurar el turno.** `sueldo_acuerdo_turnos.lugar` es texto libre. Hacen falta dos columnas que el
   motor pueda leer: `area` (`tienda` | `almacen`, **default `tienda`**, así ningún contrato existente gana meta
   de pipeline hasta que el administrador lo marque) y `sede_cod` (nulo = la `sede_cod` de la persona).
   Pantalla de horario del contrato: un selector de área y de sede por turno.
2. **Tabla `dias_libres`** + RPC de alta/baja sólo administrador + pantalla de marcado para varias personas.
3. **Core, función pura** (en `evaluaciones.ts`): `puntosPosiblesDelRango(turnos, diasLibres, licencias,
   actividadesPorSedeYTurno, contrato, rango, params)` y `notaDesdeCumplimiento`. **Reciben las fechas de
   quien las llama, nunca `new Date()`** (no-negociable 4).
4. **RPC `private.evaluacion_componentes_datos`:** agregar las claves del cálculo. Conserva firma, `security
   definer`, `search_path` y permisos. Sin `getAdminClient()` nuevo (no-negociable 3).
5. **Guardar** en `evaluaciones_mensuales.componentes` (jsonb) el cumplimiento, la meta y las dos razones.
6. **Pantalla `/evaluaciones` y «Mi desempeño»:** mostrar el **porcentaje de cumplimiento** como lo principal,
   la nota /20 como referencia, y las dos razones; el mismo aislamiento de hoy (nadie ve la nota ni el sueldo de
   otro).
7. **Evaluaciones ya cerradas no se recalculan.** Conservan su escala absoluta; la pantalla las rotula como
   «escala anterior».

## 8. Relación con lo que ya está

- **Pago por puntos** (`sueldo_puntos_meta_mensual`, `sueldo_soles_por_punto`, spec del 05-oct): sigue
  apagado y **no se toca**. La nota no mueve el pago. Cuando se prenda, decidir si su meta mensual pasa a
  derivarse de `puntosPosibles`; hoy son dos metas distintas y la segunda es manual.
- **`sugerirMontoPago`** (`pagos.ts`): sin cambios; sigue siendo una sugerencia que el administrador decide.
- **Puntos como moneda** (spec del 25-ago): esta spec la modifica en un solo punto, la escala de la nota.
- **Motor de sueldos y `dias_libres`: dependencia con spec propia.** Para que «el feriado no se paga» sea
  cierto, `sueldos.ts` debe leer `dias_libres` y descontar el día. Es la cadena del sueldo: spec completa,
  tests y verificador aparte. Mientras no exista, **la meta puede leer `dias_libres` pero el pago no**, y
  la pantalla de marcado debe decirlo con todas las letras, para que nadie crea que ya se descuenta.

## 9. Pruebas que debe tener el código (escribirlas primero)

- Quincenal anclado al día 1: el tramo 16–30/31 toma sus propios días; contrato que termina el día 20
  recorta el último tramo.
- Mañana en tienda y tarde en almacén el mismo día: la mañana suma meta de reportes y la tarde meta de
  pipeline, y ninguna se cuenta dos veces.
- Turnos de 4 y 7 horas en almacén: la meta de pipeline es proporcional a las horas.
- Dos personas en la misma sede y turno: ambas tienen la misma meta de reportes.
- Persona que pasa un día a almacén sin tenerlo en la plantilla: sus puntos de pipeline suman a los hechos y
  la meta no cambia.
- Licencia justificada: baja `puntosPosibles`; falta injustificada: no baja y cuenta cero.
- Día libre para una persona y no para su compañera de sede: sólo la primera pierde meta. Si trabaja ese
  día, sus puntos suman a los hechos.
- `puntosPosibles = 0` no lanza ni devuelve `NaN`: devuelve «sin meta».
- `nota = 20` con cumplimiento 1,00 y `eval_cumplimiento_para_20` = 1; 18 con 0,90; 13 con 0,65; más de 20
  sin techo; puntos netos negativos dan 0,00.
- `eval_cumplimiento_para_20` = 1,25 exige 125 % para el 20.
- Contrato con cambio de mensual a quincenal el 10-nov: los tramos y sus metas coinciden con
  `calendarioDePagos` (ya probado en `sueldos.test.ts`).
- Aislamiento: un encargado no ve la meta ni la nota de otra sede; el empleado sólo las suyas.
- Fechas en hora Perú: un avance registrado a las 23:30 Perú del último día del tramo cae en ese tramo.

## 10. Preguntas

**Cerradas el 17-oct-2026:** asignación a almacén fija con extras eventuales; medición por hora; actividades
por sede y para todos igual; feriados por persona y no pagados.

**Abiertas:**
1. ¿Confirma Alexander que 100 % de la meta vale 20 (recomendado, nota de referencia) en vez de 16?
2. ¿Un turno de almacén se mide sólo por pipeline, sin reporte de actividades?
3. ¿Cómo se refleja en el sueldo un día libre no pagado: descuento del día, o el sueldo pactado de la
   quincena se prorratea? Necesita spec propia del motor de sueldos (§8).
4. ¿Hay personas con más de una sede en el mismo tramo (`empleado_tiendas`)? Si sí, el turno necesita `sede_cod`
   siempre, no sólo como excepción.
