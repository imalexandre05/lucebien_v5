# SPEC — Los puntos del turno son de todo el equipo, y la puntualidad se mide sola

> **Qué es.** Dos correcciones a `evaluacion_componentes()`, la función que arma automáticamente
> tres de los siete componentes de la nota mensual: limpieza, software, operaciones y puntualidad.
>
> **De dónde salen.** Alexander respondió dos de las preguntas pendientes de la auditoría del
> 23-ago (24-ago-2026):
>
> 1. *«de todo el equipo, a todo el equipo se le suma los puntos. lo único individual en los
>    reportes son los puntos extras»*
> 2. *(la puntualidad de la nota) «se calcula sola, definido por los horarios»*
>
> **Zona de rigor:** spec completa. Toca `packages/db/migrations` y la cadena evaluación → nota →
> pago (no-negociable 1). Exige migración numerada, prueba de ataque y verificador antes de
> aplicar.

---

## 1. Lo que pasa hoy

```sql
with reps as (
  select id from reportes
  where encargado_id = p_empleado and evaluado and fecha between p_desde and p_hasta
),
```

Los tres componentes automáticos que salen de los reportes —`limpieza`, `software`,
`operaciones`— sólo cuentan los turnos donde la persona fue **encargada**. Verificado contra la
base: los únicos dos encargados que existen son Alexander y Jordan, los dos administradores. Para
las nueve personas de ventas, esos tres componentes —30 % de la nota— **salen en cero siempre**, y
un cero calculado no se distingue de un cero merecido.

```sql
tard as (
  select coalesce(sum(minutos_tardanza), 0) as min
  from asistencias where empleado_id = p_empleado and fecha between p_desde and p_hasta
),
```

`minutos_tardanza` es una columna que nadie escribe: vale `0` en las 1.118 filas de la base. La
puntualidad de la nota, entonces, también sale siempre igual —perfecta— sin que nadie haya medido
nada.

## 2. El diseño

### C-1 — Los puntos del turno se acreditan a todo el equipo

`reps` deja de mirar sólo `encargado_id` y pasa a incluir a cualquiera que haya trabajado ese
turno, según `reporte_trabajadores`:

```sql
reps as (
  select r.id
  from reportes r
  where r.evaluado
    and r.fecha between p_desde and p_hasta
    and (
      r.encargado_id = p_empleado
      or exists (
        select 1 from reporte_trabajadores rt
        where rt.reporte_id = r.id and rt.empleado_id = p_empleado
      )
    )
),
```

El resto de la función no cambia: `acts` sigue promediando las calificaciones de esos reportes por
categoría, igual que hoy.

**Lo que NO se toca, a propósito.** `extr` —los puntos extras de `reporte_extras`— sigue filtrando
por `registrado_por_id = p_empleado`: son individuales porque Alexander lo confirmó así
explícitamente («lo único individual son los puntos extras»). No hay ambigüedad que resolver ahí.

**Un efecto secundario correcto, no un bug nuevo.** Con este cambio, un turno con un encargado y
tres trabajadores les da el mismo puntaje de limpieza/software/operaciones a los cuatro. Es
exactamente lo que se pidió: el turno se evalúa como equipo, no por persona.

### C-2 — La puntualidad se calcula del horario, no de una columna que nadie llena

Se reemplaza el CTE `tard` por un cálculo día por día, con el mismo criterio que ya usa el motor
de sueldos para decidir si un día es tardanza (`packages/core/src/sueldos.ts`, RN-08), adaptado a
SQL porque acá no hay tramos que fusionar —basta con la hora de entrada más temprana del día—:

1. Para cada día del período con una fila de asistencia en `condicion = 'trabajado'`, se busca el
   acuerdo de esa persona que cubre esa fecha (a lo sumo uno, gracias a la restricción de exclusión
   `sueldo_acuerdos_sin_solape` verificada el 24-ago) y, dentro de él, la hora de inicio **más
   temprana** entre los turnos contratados para ese día de la semana.
2. Si `hora_entrada` (la más temprana del día, para contemplar un día partido en tramos) es
   posterior a esa hora de inicio más la tolerancia (`sueldo_tolerancia_minutos`, la misma que ya
   usa el motor de sueldos — no se inventa una tolerancia distinta para la evaluación), el día
   cuenta como tardanza.
3. Los minutos que se acumulan son la diferencia entre `hora_entrada` y la hora de inicio
   **pactada** (no la ajustada por tolerancia): es la lectura natural de «cuántos minutos llegó
   tarde», y la tolerancia decide si cuenta, no cuánto pesa.
4. Un día con `tardanza_justificada` no suma minutos. Mismo criterio que ya tiene el motor de
   sueldos para no cobrarle a alguien una tardanza que el administrador ya perdonó — la evaluación
   no puede penalizar lo que el sueldo ya decidió no penalizar.
5. Un día sin acuerdo vigente que lo cubra, o sin turnos contratados ese día de la semana, no
   aporta minutos: no se puede medir tardanza contra un horario que no existe.

El resultado reemplaza a `(select min from tard)` en la fórmula que ya existe y no cambia:
`greatest(0, 20 - floor(minutos_totales / eval_tardanza_min_por_punto))`.

**Por qué es una medida más simple que la del motor de sueldos, y por qué está bien que lo sea.**
El motor de sueldos cuenta *instancias* de tardanza y perdona las primeras tres
(`sueldo_tardanzas_libres`) antes de descontar plata. La evaluación acumula *minutos* directamente,
sin ese perdón inicial — es la fórmula que `notaTardanza()` ya tenía escrita, sólo que nunca recibía
un número real. Sumar minutos sin exención tiene sentido acá: la nota no le paga de menos a nadie
por una tardanza aislada, sólo la refleja.

## 3. Lo que esta spec NO hace

- **No** toca `packages/core`: todo el cambio vive en la función SQL `evaluacion_componentes`.
- **No** cambia `bonusVentas` (sigue en `0`, fuera de alcance — módulo de ventas de otro sistema).
- **No** resuelve si la nota debe modificar el pago: eso es la decisión 3, contestada aparte
  («no, es un indicador» — ver `docs/pendientes-negocio.md`).
- **No** inventa una tolerancia nueva para la evaluación: reusa `sueldo_tolerancia_minutos`.

## 4. Cómo se comprueba

`packages/db/pruebas/0091_evaluacion_equipo_y_puntualidad.prueba.sql`, con la forma de las demás:
monta el escenario, ataca cada promesa, termina lanzando una excepción con el resultado.

| Caso | Esperado |
|---|---|
| Encargado de un turno evaluado | Sigue sumando limpieza/software/operaciones (no se rompe lo que ya andaba) |
| Trabajador (no encargado) del mismo turno | Ahora también suma los mismos puntos que el encargado |
| Persona que no trabajó ese turno | No suma nada de ese reporte |
| Puntos extras de `reporte_extras` | Siguen siendo del que los registró, no de todo el equipo |
| Día puntual (entrada antes de tolerancia) | 0 minutos de tardanza |
| Día con 20 minutos de tardanza real, sin justificar | Cuenta esos minutos |
| Mismo día, con `tardanza_justificada = true` | 0 minutos — no penaliza lo que el sueldo ya perdonó |
| Día sin acuerdo vigente ese mes | 0 minutos, sin error |
| Día partido en dos tramos, el segundo con tardanza | Mide contra la entrada más temprana del día, como el motor de sueldos |

## 5. Lo que queda anotado

- Este cambio hace que la nota de las nueve personas de ventas deje de tener tres componentes en
  cero por diseño. Eso va a **subir** su nota mensual respecto de lo que hubiera salido con la
  fórmula vieja — es la corrección de un error, no una decisión de subirles la nota.
