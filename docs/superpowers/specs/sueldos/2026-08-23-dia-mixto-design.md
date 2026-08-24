# SPEC — El día a medio declarar no se paga a medias: se bloquea

> **Qué es.** Un solo cambio en `sueldo_entrada`, la función que arma la entrada de la liquidación.
> Hoy, cuando un día tiene un tramo declarado y otro sin cerrar, paga sólo el tramo declarado y no
> avisa. Después de este cambio, corta y nombra el día, como ya hace con todo lo demás que falta.
>
> **Zona de rigor:** spec completa. Es la cadena del sueldo (no-negociable 1). Migración numerada,
> prueba de ataque propia y verificación contra la base antes de aplicar.
>
> **Estado:** escrita el 23-ago-2026 a partir del hallazgo F45 de la auditoría, confirmado contra la
> base viva por un agente verificador.

---

## 1. Lo que pasa hoy

`sueldo_entrada` (versión vigente: migración 0078) hace dos cosas con la asistencia del periodo.

**Primero comprueba que no falte ningún día.** Recorre día por día el periodo del contrato y, para
cada uno que tenga turno contratado, exige que exista al menos una fila de asistencia declarada:

```sql
and not exists (
      select 1 from asistencias s
      where s.empleado_id = a.empleado_id
        and s.fecha = d.dia::date
        and s.condicion <> 'sin_dato'
    );
```

**Después arma los tramos del día**, agrupando las filas por fecha:

```sql
from asistencias s
where s.empleado_id = a.empleado_id
  and s.fecha between a.fecha_inicio and a.fecha_fin
  and s.condicion <> 'sin_dato'      -- ← este filtro es por FILA
group by s.fecha                      -- ← y el group by es por DÍA
```

Ese filtro está en el `where`, o sea que se aplica **antes** del `group by`: descarta filas, no días.

Mientras la tabla tuvo una fila por día, las dos cosas eran lo mismo. Desde la migración 0079 el
huellero escribe **una fila por tramo**, y deja en `'sin_dato'` el tramo que no pudo cerrar.

## 2. El día que se paga a medias

Marylin trabaja los dos turnos: 09:00–13:00 y 13:00–20:00.

1. Marca a las 08:02 y a las 13:05. El huellero empareja ese tramo y la fila queda `'trabajado'`.
2. Vuelve a las 14:00 y marca. A la salida se va sin marcar. La fila de la tarde queda con hora de
   entrada, sin hora de salida, en `'sin_dato'`.

Qué pasa entonces:

- El **primer control pasa**: el día tiene una fila declarada (la de la mañana), así que no aparece
  en la lista de días sin cargar.
- El **segundo descarta la fila de la tarde**, y el día llega al motor con un solo tramo de cuatro
  horas.
- El **corte de seguridad del core** (`packages/core/src/sueldos.ts:585-593`) sólo comprueba que la
  fecha exista en la entrada. La fecha está. No salta.

Resultado: se liquidan cuatro horas de un día de once, y **ninguna pantalla dice nada**. Medido en
la base el 23-ago-2026: 9 días con más de una fila y 146 filas con `hora_salida` en null.

Este es el único camino de todo el sistema que **paga de menos en silencio**. Todos los demás
cortan con `DATO:` y nombran las fechas para que alguien las resuelva.

## 3. El cambio

Se agrega un **segundo control**, hermano del que ya existe y con el mismo espíritu: antes de armar
nada, `sueldo_entrada` busca los días del periodo que tengan **a la vez** una fila declarada y una
fila en `'sin_dato'`, y corta nombrándolos.

```
DATO:hay tramos sin cerrar en <fechas>; ese día quedaría pagado a medias
```

### Por qué "mixto" y no "cualquier fila en sin_dato"

Un día cuyas filas son **todas** `'sin_dato'` ya lo atrapa el primer control, si es un día
contratado. Si no es un día contratado —una marca suelta un domingo, por ejemplo— hoy simplemente
no se paga, que es el mismo resultado que antes de esta spec: no se agrega un bloqueo nuevo por
algo que nadie estaba cobrando. Queda anotado en §5.

### Qué NO cambia

- **No** se toca el motor: `packages/core` queda igual. El cambio es dónde se corta, no cómo se
  calcula.
- **No** se toca cómo se arman los tramos: sigue siendo una fila, un tramo, y la fusión de pausas
  sigue viviendo entera en el core.
- **No** se cambia el mensaje ni el prefijo del control que ya existía.
- **No** se rellena nada automáticamente. Un tramo sin cerrar es una pregunta para una persona
  —¿a qué hora se fue?— y el sistema no la contesta por ella. Ese es el mismo criterio que separó
  desde el principio «falta» de «sin declarar»: confundirlos cuesta dos días de sueldo por día.

## 4. Cómo se comprueba

Prueba propia, `packages/db/pruebas/0085_sueldo_entrada_dia_mixto.prueba.sql`, con la forma de las
demás: monta el escenario, ataca cada promesa, y termina lanzando una excepción con el resultado
para que la transacción se aborte y no quede ni una fila.

Casos que tiene que cubrir:

| Caso | Esperado |
|---|---|
| Día con los dos tramos cerrados | Liquida; el día trae dos tramos |
| Día con un tramo cerrado y otro en `sin_dato` | Corta con `DATO:` y nombra la fecha |
| Día contratado sin ninguna fila | Corta con el mensaje de siempre (no cambia) |
| Día declarado `falta` | Liquida; una falta declarada no es un tramo sin cerrar |
| Día NO contratado con un tramo sin cerrar | No corta (§3) |

## 5. Lo que queda anotado

- **Marca suelta en un día no contratado.** Si alguien marca la entrada un día que no tenía turno y
  no marca la salida, esas horas no se pagan y nadie avisa. Es lo mismo que pasaba antes, y
  arreglarlo bien pide decidir primero si una marca sin salida en un día libre es trabajo o es un
  error de marcación. Va a `docs/pendientes-negocio.md`.
- **Las 146 filas sin cerrar que ya están en la base** no se tocan. Después de esta migración, el
  primer intento de liquidar un periodo que las contenga va a nombrarlas, que es exactamente lo que
  tiene que pasar.
