# Cambios a las reglas del sueldo — 17-ago-2026

**Estado:** spec escrita, **sin implementar**. Este documento existe para que el código venga
después y en un commit aparte (Zone Guard, no-negociable 6).

Origen: las respuestas de Alexander del 16 y 17-ago-2026. Cada cambio dice qué hace el motor hoy,
qué tiene que hacer, y qué cuesta si se implementa mal.

Regla de fondo que atraviesa todo, dicha por Alexander tantas veces que conviene escribirla una
vez: **«todo debe tener el enfoque de poder modificarse a gusto por el admin»**. Ningún cambio de
acá introduce una constante nueva: los cinco entran como parámetro editable, y el default elegido
es el que reproduce la conducta que se acordó.

---

## C-01 🔴 Las pausas no se pagan (cambia RN-05)

### Qué dice hoy la regla

> **RN-05 — Horas trabajadas por día.** `hora_salida − hora_ingreso`.

Y la RPC `sueldo_entrada` colapsa el día con `min(hora_entrada)` / `max(hora_salida)`
(`0073_sueldos_rpc.sql:167-168`). O sea: **de la primera entrada a la última salida**, sin mirar
lo que pasó en el medio.

### Qué dijo Alexander

> *"usualmente la manera de trabajo es seguida, de 8 a 8, o de 8 a 2, no hay «descansos» o
> «salidas»... pero en caso de que sí pase (que alguien marque su huella y vuelva otra vez), en
> esos casos **no debería contarse por nada del mundo esas horas en las que no está**, porque se
> supone que no trabaja: se cuentan las horas de seguido que están, no esas pausas."*

### Qué pasa a decir la regla

> **RN-05 — Horas trabajadas por día.** La suma de los **tramos continuos** del día:
> `Σ (salida_del_tramo − entrada_del_tramo)`. Un día con un solo tramo se comporta exactamente
> como antes. Una pausa —salir y volver— **no se paga**.

### Por qué esto es más grande que cambiar una resta

Con el horario real de LuceBien (09:00–13:00 + 13:00–20:00, contiguo) **el resultado no cambia**:
la suma de los tramos y el `min`/`max` dan las mismas 11 horas. El cambio sólo se nota cuando hay
un hueco de verdad. Pero para poder sumar tramos hay que **tenerlos**, y hoy no se guardan:
`asistencias` conserva una `hora_entrada` y una `hora_salida` por fila, y la spec del huellero
colapsa el día a una sola fila antes de escribir.

**Si esto se implementa sin resolver dónde viven los tramos, no cambia nada y parece que sí.**

Tres caminos, con su costo:

| Camino | Qué implica | Riesgo |
|---|---|---|
| **A. Una fila de `asistencias` por tramo** | El huellero empareja las marcas de a dos (1ª con 2ª, 3ª con 4ª) y escribe una fila por par. `sueldo_entrada` **suma** las filas del día en vez de colapsarlas | Hay que ampliar el vocabulario de `turno`, hoy `M \| T \| C` |
| **B. Un `jsonb` de tramos en la fila del día** | Una sola fila por día con `tramos: [{entrada, salida}]` | Duplica el dato con las columnas que ya existen; dos fuentes de verdad para lo mismo |
| **C. La liquidación lee `marcas_huellero`** | El motor deja de depender de `asistencias` para las horas | Rompe el aislamiento del diseño y deja fuera lo que el administrador carga a mano |

**Recomendado: A.** Es el único que trata igual a las horas cargadas a mano y a las del huellero, y
no inventa una segunda fuente de verdad. Es además el modelo que el huellero tenía al principio —
lo que estaba mal ahí no era la fila por tramo, era **partir por una hora de corte fija**.

### Qué se toca

1. **`packages/core/src/sueldos.ts`** — `RegistroAsistencia` acepta `tramos?: {ingreso, salida}[]`.
   Con `tramos` presente, `horasDelRegistro()` los suma; sin `tramos`, se comporta como hoy. La
   tardanza se sigue midiendo contra el **primer** ingreso del día.
2. **`sueldo_entrada`** — emite `tramos` en vez de colapsar, y sigue emitiendo `horaIngreso` (el
   primero) y `horaSalida` (la última) para que el snapshot viejo se siga leyendo igual.
3. **Nuevo parámetro `pausaMinimaMinutos`** — cuántos minutos entre una salida y la entrada
   siguiente cuentan como pausa. Sin umbral, dos marcas seguidas por error (09:00 y 09:02) parten
   el día en dos tramos y descuentan dos minutos a alguien. **Default propuesto: 15.** Pendiente de
   confirmar.
4. **La pantalla del contrato** deja de avisar que «el hueco se paga» y pasa a avisar lo contrario.

### Qué cuesta hacerlo mal

Si se suman tramos que en realidad son marcas duplicadas, se le descuentan minutos a alguien todos
los días. Si no se implementa el emparejamiento y se deja el `min`/`max`, el cambio queda escrito
en la spec y **no ocurre** — que es peor que no haberlo escrito.

---

## C-02 🟠 La semana que absorbe días sobrantes sube su meta (invierte RN-12)

### Qué dice hoy

> La meta es **la misma todas las semanas**. Una semana que absorbe días sobrantes **no** sube su
> meta *(decisión de Alexander, 13-ago-2026)*.

Implementado como `metaSemanalFija: true`, con `false` disponible y apagado.

### Qué dijo Alexander el 16-ago

Pregunta: *«la 4ta semana se extiende hasta completar el mes. Si dura 10 días en vez de 7, ¿su meta
sigue siendo S/1.500 o sube proporcionalmente?»* → **«exacto, sube, pero por si acaso construye
también la opción de que suba proporcionalmente»**.

### Qué cambia

**Sólo el default: `metaSemanalFija` pasa de `true` a `false`.** El parámetro ya existe, ya es
editable y ya está implementado en las dos direcciones (`sueldos.ts:712`), así que no hay lógica
nueva. Lo que cambia es cuál de las dos conductas es la de fábrica.

**Es una inversión de una decisión del 13-ago, no un descubrimiento.** Queda escrito así para que
nadie lo lea dentro de seis meses como si siempre hubiera sido así. El razonamiento de entonces
—*"el colaborador no elige que su mes tenga 31 días"*— sigue siendo válido; simplemente no es el
que se eligió.

**Impacto medido en el caso de prueba de la spec (§9.2):** con meta fija, 4 semanas cumplidas y
bono S/120. Con meta proporcional, la semana larga pide más y son **3 semanas cumplidas, bono
S/90**. Treinta soles por persona por mes.

---

## C-03 🟡 El valor de la hora fuera de contrato se puede pactar aparte (amplía RN-17)

### Qué dice hoy

Las horas de un día sin turno contratado se pagan a `valorPorHora`, el mismo que sale de dividir el
sueldo pactado entre las horas contratadas (`sueldos.ts:805-808`).

### Qué dijo Alexander

> *"se paga el mismo valor generalmente, pero como te digo, hazlo modificable por si acaso para que
> se ponga otro precio."*

### Qué cambia

**Nuevo parámetro `factorHoraFueraContrato`, default `1`.** Multiplica `valorPorHora` sólo en la
línea de RN-17. Con `1` el resultado es idéntico al de hoy, así que ninguna liquidación existente
cambia; con `1.5` esa hora se paga un 50% más, y con `0.8` menos.

Se elige un **factor** y no un monto por dos razones: el monto quedaría desactualizado cada vez que
cambie el sueldo pactado, y un factor se lee de un vistazo («la hora extra vale una vez y media»).

Es override por contrato, como los otros trece: se pacta con quien acordó venir un día más.

---

## C-04 ✅ RN-13 no cambia — se confirma lo que ya hace

Vale la pena escribirlo porque el 16-ago **se dio por hecho que había un error y no lo había**.

La primera respuesta decía *"la comisión se activa cuando se llegan todas las semanas a la meta"*,
que leído literal significaba: cuatro semanas cumplidas o no hay comisión. La aclaración del 17-ago
fue otra: **«cuando se cumple la meta del mes recién se activan las comisiones»**, y **«[la meta del
mes] sigue siendo al final la suma de las 4 semanas»**.

Eso es exactamente lo implementado:

```ts
// sueldos.ts:697  — "la meta del mes es la suma de las semanales, no un cálculo aparte"
metaPeriodo += meta;              // dentro del recorrido de las semanas
// sueldos.ts:734
const metaAlcanzada = ventasTotal >= metaPeriodo;
```

Y el bono también: **«solo por semana cumplida, no necesariamente tiene que cumplirse todas»** =
`bono_metas = semanas_cumplidas × bonoMetaSemanal`, que es la fórmula vigente.

> **El aprendizaje, y no es menor:** entre la primera respuesta y la aclaración hubo un aviso
> escrito diciendo que el motor tenía un error de comisión. No lo tenía. Una regla de negocio
> contada en una frase no alcanza para declarar un defecto: hay que reconstruir el caso numérico y
> contrastarlo contra el código **antes** de escribir que algo está mal.

---

## C-05 🟡 Marcaje astuto — regla A

Pedido de Alexander: *"plantea reglas para ello"*. De las tres propuestas eligió empezar por la
primera.

> **Regla A — el día rinde más horas de las contratadas.** Si las horas declaradas de un día
> superan a las contratadas por más de `margenHorasDiaMinutos`, el día se **marca para revisión**.

Con una advertencia importante que dio él mismo: *"a veces en la empresa se quedan 2 horas aprox
para terminar sus pendientes"*. Un umbral de 60 minutos marcaría esos días todo el tiempo y la
señal se volvería ruido. **Default propuesto: 120 minutos.** Pendiente de confirmar.

**No acusa a nadie ni descuenta nada.** Marca para que el administrador mire, que es lo que él
describió: *"si alguien marca eso y solo es medio turno obviamente es falso, o tiene que evidenciar
que sí estuvo todo el día"*.

**Dónde va, y por qué ahí.** En la pantalla de declarar asistencia, como señal visual, **no en el
motor**. El motor calcula plata; esto es una alerta de gestión. Meterla en `liquidarPeriodo()`
obligaría a spec y tests de la cadena del sueldo para algo que no mueve un sol, y dejaría la señal
enterrada en una liquidación que se mira una vez al mes en vez de en la pantalla que se mira todos
los días.

Las otras dos quedan planteadas, sin implementar:

- **Regla B — dos marcas separadas por más que el turno completo.** El patrón que él describió:
  *"te vas a las 9pm y vuelves a las 8am del día siguiente"*. Necesita las marcas crudas.
- **Regla C — contraste con lo que produjo ese día.** La más fuerte y la única que no se puede
  falsear con el huellero: si marcó once horas y no hay ni un reporte de actividad, ni una prenda
  avanzada, ni una venta a su nombre, el día se marca. **El dato ya existe** en el pipeline, en los
  reportes y en `sueldo_ventas`. Alexander la vinculó explícitamente con la evaluación de
  desempeño, y con la idea de **contrastar visualmente el horario contratado contra el real** —
  algo que ahora es posible porque el horario vive en el contrato.

---

## Lo que falta confirmar antes de codear

1. **`pausaMinimaMinutos` = 15?** Cuántos minutos entre una salida y la entrada siguiente cuentan
   como pausa de verdad. Debajo de eso son dos marcas del mismo momento.
2. **`margenHorasDiaMinutos` = 120?** El umbral de la regla A, dado que quedarse dos horas es
   normal.
3. **Camino A para los tramos** (una fila de `asistencias` por tramo continuo). Afecta a la spec del
   huellero, así que hay que avisarles antes de que escriban la derivación.

---

## Orden de implementación

1. **C-05 regla A** — pantalla, sin tocar el motor. No depende de nada.
2. **C-02** — cambiar un default, con el test que cubra las dos direcciones.
3. **C-03** — parámetro nuevo, línea de RN-17 multiplicada, default que no cambia nada.
4. **C-01** — lo último y lo más grande: core, RPC, migración y coordinación con el huellero.
