# Spec — La nota se mide contra la meta del período de pago

> Escrita el 17-oct-2026, **antes** del código y de las pruebas (Zone Guard). Zona crítica
> (puntos → evaluación → pago): spec completa, tests y verificador antes de mergear.
> **Estado: borrador para la sesión maestra.** Sale de la conversación con Alexander del 17-oct-2026.
> Los puntos marcados «por confirmar» son defaults míos, no decisiones del dueño (no-negociable 5).

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
3. **La meta de pipeline se prorratea por turnos en almacén**, no sólo por días: alguien puede estar la
   mañana en tienda y la tarde en almacén.
4. **Por ahora la nota sólo informa.** El pago sigue siendo el pactado «hasta tener todo parametrado».
5. La cifra de la meta de pipeline se define después; ahora va un aproximado provisional (§6).
6. Los días de descanso son pocos y los decide el administrador (§5).

## 3. Qué ya existe (verificado en el código, no se reescribe)

| Pieza | Dónde |
|---|---|
| Tramos de pago por contrato, con cambios de modalidad | `calendarioDePagos(contrato, cambios)` en `packages/core/src/sueldos.ts`; tabla `sueldo_acuerdos` (`fecha_inicio`, `fecha_fin`, `modalidad`) |
| Horario contratado: plantilla semanal | `sueldo_acuerdo_turnos` (`dia_semana`, `hora_inicio`, `hora_fin`, `lugar`), migración 0072. `lugar` es **texto informativo**: hoy no distingue tienda de almacén de forma que el sistema pueda usarla |
| Licencia = falta que el administrador marca justificada | `asistencias.condicion = 'falta'` + `falta_justificada` (`pendientes-negocio.md`, 14-ago-2026). El descanso semanal no es día contratado y no tiene fila |
| Puntos del ciclo | RPC `private.evaluacion_componentes_datos` (pipeline + extras + actividades − incidencias) |
| Curva puntos → nota | `notaDesdePuntos(puntos, escala)` en `evaluaciones.ts`; parámetros `eval_*` |
| Actividades que aplican a una fecha y turno | `actAplicaHoy` en `reportes.ts` (turnos M/T/C) |

No existe: calendario de feriados, ni forma de decir «este turno es de almacén» que el motor pueda leer.

## 4. El modelo

Para una persona y un rango `[desde, hasta]` (por defecto, su tramo de pago):

```
puntosPosibles = metaReportes + metaPipeline
puntosHechos   = lo que la RPC ya calcula (pipeline + extras + actividades − incidencias)
cumplimiento   = puntosHechos / puntosPosibles
```

**metaReportes** = por cada día del rango, dentro del contrato, con turno contratado de tienda y que no
sea día sin meta (§5): las actividades que aplican en ese turno (`actAplicaHoy`) × `pts_actividad_cumplida`.
*Por confirmar con el código:* si las actividades cuelgan de la sede/turno o de la persona; si cuelgan de
la sede, hay que definir cuáles le tocan a cada quien.

**metaPipeline** = horas contratadas en almacén dentro del rango × `pipeline_meta_puntos_por_hora` (§6).
Se mide en **horas** y no en «turnos» a propósito: el horario real es 09:00–13:00 y 13:00–20:00, turnos
de 4 y 7 horas, y contar cada uno como uno solo pagaría igual la mañana corta que la tarde larga. Un
turno es un bloque de horas, así que la hora generaliza lo que pidió Alexander. *Por confirmar.*

**Turno de almacén sin meta de reportes** (*por confirmar*): un turno de almacén se mide sólo por
pipeline, para no contar el mismo turno dos veces.

**Qué pesa más sale solo.** Más horas en almacén significan más peso del pipeline en `puntosPosibles`.
Se guardan y muestran además las dos razones por separado (reportes hechos / meta de reportes, pipeline
hecho / meta de pipeline), porque el administrador pidió ver «dónde flaquea».

**Puntos hechos fuera de lo asignado cuentan.** Quien procesa prendas en un turno que no es de almacén
suma puntos igual: sube el cumplimiento, no se descarta nada.

**De cumplimiento a nota: se reutiliza `notaDesdePuntos` sin tocarla.** Sólo cambia la escala que recibe:

```
puntosPromedio  = puntosPosibles
puntosExcelente = puntosPosibles × (eval_puntos_excelente / eval_puntos_promedio)   // 1,5× con los defaults
```

Con los defaults vigentes: 100 % de la meta = 16, 150 % = 20, más de 150 % = sobresaliente. Es lo que
Alexander dijo el 25-ago; **por confirmar** si 100 % debe valer 16 (recomendado, no cambia lo ya
confirmado) o 20. Las bandas (`eval_banda_riesgo` 13, `eval_banda_ideal` 18) no cambian.

**Sin meta no hay nota.** Si `puntosPosibles = 0` (rango sin turnos, todo justificado, fuera del
contrato) no se calcula nota y la pantalla dice «sin meta en este período». `notaDesdePuntos` lanza con
`puntosPromedio = 0`; el llamador debe evitar esa llamada, no capturarla.

**Rango.** El tramo es sólo el rango por defecto. El cálculo vale para cualquier `[desde, hasta]`, recortado
por `fecha_inicio`/`fecha_fin` del contrato; el primer y el último tramo, si el contrato los corta, tienen
meta proporcional a lo que cae dentro. Si cambia la modalidad a mitad de contrato, `calendarioDePagos` ya
parte los tramos.

## 5. Días sin meta

Regla general: **la meta es lo que la persona podía hacer**, así que un día en que no podía o no debía
trabajar sale de `puntosPosibles`. Una falta injustificada **no** sale: cuenta como cero puntos hechos.

| Caso | Cómo se trata | Dato nuevo |
|---|---|---|
| Descanso semanal | No es día contratado, no tiene turno → no entra a la meta | Ninguno |
| **Licencia** | Falta marcada `falta_justificada` por el administrador → ese día sale de la meta. Si no la marca, es falta y cuenta | Ninguno (usa el campo existente) |
| **Feriado, cierre o descanso extraordinario** decidido por el administrador | Día sin meta, **pagado como siempre**. No se puede usar `falta_justificada`: esa pierde el día de sueldo | Sí: tabla pequeña `dias_sin_meta` |

`dias_sin_meta`: `fecha`, `empleado_id` (nulo = toda la empresa), `motivo` (obligatorio), `creado_por`,
`creado_en`. Sólo el administrador la escribe (RPC con guard, no policy abierta). Un feriado no se asume:
si el administrador no lo marca, la meta cuenta normal. Esto no toca el motor de sueldos ni
`RegistroAsistencia`, porque la nota no mueve el pago (§2.4).

## 6. Parámetros nuevos (provisionales, editables desde `/configuracion`)

| Clave | Default | De dónde sale |
|---|---|---|
| `pipeline_meta_puntos_por_hora` | **0,5** | **Elegido por mí, no por Alexander.** El mejor mes-persona medido (126,45 puntos, abril 2026) dividido en ~21 días de 11 horas da ~0,55 por hora. Es el techo de un módulo con poca adopción (2 de 11 personas registraron avances), así que probablemente subestima la capacidad real. A recalibrar tras un mes de uso |

*Antes de dar por buena la cifra*, la sesión maestra debe contrastarla con la base (no-negociable 7): las
cifras de arriba vienen de `pendientes-negocio.md`, no de una consulta de este día.

Sin otros parámetros nuevos. Hay que anotar el default en `docs/pendientes-negocio.md` (ya anotado en esta
rama) y sembrarlo, comentado como provisional, en la migración.

## 7. Qué hay que construir (para la sesión maestra)

1. **Estructurar «almacén».** `sueldo_acuerdo_turnos.lugar` es texto libre. Hace falta una columna que el
   motor pueda leer, p. ej. `area` con valores `tienda` | `almacen`, **default `tienda`**: así ningún
   contrato existente gana meta de pipeline hasta que el administrador lo marque. Pantalla de horario del
   contrato: un selector por turno.
2. **Tabla `dias_sin_meta`** + RPC de alta/baja solo administrador + su pantalla mínima.
3. **Core, función pura** (p. ej. en `evaluaciones.ts`): `puntosPosiblesDelRango(turnos, diasSinMeta,
   licencias, actividades, contrato, rango, params)`. **Recibe `hoyPeru()` y las fechas de quien la llama,
   nunca `new Date()`** (no-negociable 4). Devuelve `{ metaReportes, metaPipeline, puntosPosibles }`.
4. **RPC `private.evaluacion_componentes_datos`:** agregar las claves del cálculo de arriba. Conserva
   firma, `security definer`, `search_path` y permisos. Sin `getAdminClient()` nuevo (no-negociable 3).
5. **Escala por período** en el llamador de `notaDesdePuntos`, y las dos razones por separado en la
   evaluación guardada (`componentes` jsonb ya admite claves nuevas).
6. **Pantalla `/evaluaciones` y «Mi desempeño»:** mostrar meta, hechos, % de cumplimiento y las dos
   razones; el mismo aislamiento de hoy (nadie ve la nota ni el sueldo de otro).
7. **Evaluaciones ya cerradas no se recalculan.** Conservan su escala absoluta; la pantalla las rotula como
   «escala anterior».

## 8. Relación con lo que ya está

- **Pago por puntos** (`sueldo_puntos_meta_mensual`, `sueldo_soles_por_punto`, spec del 05-oct): sigue
  apagado y **no se toca**. La nota no mueve el pago. Cuando se pare el pago por puntos, decidir si su meta
  mensual pasa a derivarse de `puntosPosibles`; hoy son dos metas distintas y la segunda es manual.
- **`sugerirMontoPago`** (`pagos.ts`): sin cambios; sigue siendo una sugerencia que el administrador decide.
- **Puntos como moneda** (spec del 25-ago): esta spec la modifica en un solo punto, la escala. Los
  `eval_puntos_promedio`/`eval_puntos_excelente` pasan a usarse sólo como **razón** 1,5, no como cifras
  absolutas.

## 9. Pruebas que debe tener el código (escribirlas primero)

- Quincenal anclado al día 1: el tramo 16–30/31 toma sus propios días; contrato que termina el día 20
  recorta el último tramo.
- Mañana en tienda y tarde en almacén el mismo día: la mañana suma meta de reportes y la tarde meta de
  pipeline, y ninguna se cuenta dos veces.
- Turnos de 4 y 7 horas en almacén: la meta de pipeline es proporcional a las horas, no al número de turnos.
- Licencia justificada: baja `puntosPosibles`; falta injustificada: no baja y cuenta cero.
- Feriado en `dias_sin_meta` para toda la empresa y para una persona; el pago de ese día no cambia.
- `puntosPosibles = 0` no lanza ni devuelve `NaN`: devuelve «sin meta».
- Puntos hechos en un turno que no es de almacén: suman al cumplimiento.
- 100 % da exactamente `eval_nota_promedio`; 150 % da 20; puntos negativos por incidencias dan 0,00.
- Contrato con cambio de mensual a quincenal el 10-nov: los tramos y sus metas coinciden con
  `calendarioDePagos` (ya probado en `sueldos.test.ts`).
- Aislamiento: un encargado no ve la meta ni la nota de otra sede; el empleado sólo las suyas.
- Fechas en hora Perú: un avance registrado a las 23:30 Perú del último día del tramo cae en ese tramo.

## 10. Preguntas abiertas para Alexander

1. ¿100 % de la meta equivale a 16 (recomendado) o a 20?
2. ¿Un turno de almacén se mide sólo por pipeline, sin reporte de actividades (recomendado)?
3. ¿La meta de pipeline se mide por hora (recomendado) o por turno entero?
4. ¿Cómo se asigna hoy una persona a almacén: plantilla semanal fija, o cambia por día según la demanda?
   Si cambia por día, la plantilla semanal no alcanza y hace falta una asignación por fecha.
5. ¿Las actividades de reporte son por sede y turno, o se asignan a cada persona?
