# Cambios a las reglas del sueldo — 17-ago-2026

**Estado al 17-ago-2026:** los cinco cambios **cerrados**. C-01 quedó implementado con
`pausaMinimaMinutos = 15` como default elegido; si Alexander dice otro número se cambia desde
/configuración, sin tocar código. Este documento se escribió antes que el código y en commits aparte (Zone Guard,
no-negociable 6).

| | Qué es | Estado |
|---|---|---|
| C-01 🔴 | Las pausas no se pagan | ✅ Implementado — core, RPC y migración 0078. Falta que el huellero empareje, y que la pantalla de asistencia sepa declarar un día con pausa |
| C-02 🟠 | La semana larga sube su meta | ✅ Implementado — core, catálogo y migración 0076 |
| C-03 🟡 | Factor de la hora fuera de contrato | ✅ Implementado — core, catálogo y migración 0077 |
| C-04 ✅ | RN-13 no cambia | Nada que hacer |
| C-05 🟡 | Marcaje astuto, regla A | ✅ Implementada en pantalla. Reglas B y C sin implementar |

**Ninguna de las tres migraciones (0076, 0077, 0078) está aplicada todavía**, y sus pruebas están
escritas pero **sin correr**: la sesión que las escribió no tenía acceso a la base. Antes de
aplicar nada:

```bash
bash tools/probar-migracion.sh 0077
bash tools/probar-migracion.sh 0078
```

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

### Decisiones de implementación (17-ago-2026)

**Camino A, confirmado.** Y con una sorpresa que conviene decir de entrada: **la tabla ya lo
soporta**. `asistencias` tiene clave `(empleado_id, fecha, turno)` desde la `0001`, así que un día
con dos filas —una de turno `M` y otra de turno `T`— ya es representable hoy. Lo que colapsa el día
no es el esquema, es **la lectura**: `sueldo_entrada` hace `min(hora_entrada)` / `max(hora_salida)`
(`0073:167-168`). Camino A no necesita tabla nueva ni columna nueva: necesita cambiar esa
agregación por una suma y que quien escribe deje de colapsar.

**La fusión de tramos vive en el core, en un solo lugar.** No en la RPC ni en el colector. Ésa es
la única forma de que un día cargado a mano por el administrador y un día derivado del huellero se
paguen exactamente igual. El algoritmo, en orden:

1. Se arma la lista de tramos del día. Sin `tramos`, el par `horaIngreso`/`horaSalida` **es** un
   tramo: un día de una sola entrada y una sola salida se comporta igual que siempre.
2. Un tramo con un solo lado (entrada sin salida) sigue valiendo 0 y sigue avisando, como hoy.
3. Se ordenan por hora de ingreso.
4. **Se fusionan** los que se pisan o los separados por menos de `pausaMinimaMinutos`.
5. Se suman las duraciones.

**El paso 4 no es un detalle, es la parte que evita cobrar de menos y de más a la vez.** Fusionar
lo que se pisa protege de un caso real: si una fila quedó con 09:00–20:00 (cargada a mano) y otra
con 13:00–20:00 (dejada por un reporte), sumar a ciegas da 18 horas de un día de 11. Con `min`/`max`
eso daba 11 y estaba bien; una suma ingenua sería una **regresión que paga de más**. Y fusionar lo
que está pegado protege del caso contrario: dos marcas a las 09:00 y 09:02 no son una pausa de dos
minutos.

**`pausaMinimaMinutos`, default 15 — elegido, no confirmado.** Es el umbral que separa «se fue» de
«marcó dos veces». Queda editable desde /configuración como todos los demás, y anotado en
`docs/pendientes-negocio.md`. **Si Alexander dice otro número, se cambia ahí y no en el código.**

**La tardanza se sigue midiendo contra el primer ingreso del día** (RN-08). Una pausa no vuelve a
generar tardanza: quien salió a las 13:00 y volvió 13:40 no llegó tarde dos veces, trabajó menos.

### Lo que esto le cambia a la sesión del huellero

Su `huellero_derivar_asistencia` escribe hoy **una fila por día**, con la primera entrada y la
última salida (`0075:212`). Con camino A tiene que escribir **una fila por par de marcas**, cada
una con su propio `turno` para no chocar contra `uq_asistencia_emp_fecha_turno`.

Vale decir por qué su diseño de una fila por día era razonable y aun así hay que cambiarlo: lo que
estaba mal en su **primer** diseño no era la fila por tramo, era **partir el día por una hora de
corte fija** —eso dejaba los dos turnos sin salida cuando alguien cruzaba el corte. Emparejar
marcas de a dos no tiene ese problema, porque el corte lo pone la marca y no el reloj del sistema.

Mientras no lo cambien, el motor los lee igual y sin romperse: una fila por día es un tramo, y un
tramo se suma solo. **Simplemente no descuenta la pausa** — o sea, C-01 no ocurre para los días que
vengan del huellero hasta que ellos emparejen.

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

**Sólo el default: `metaSemanalFija` pasa de `true` a `false`.** ✅ Implementado (migración 0076). El parámetro ya existe, ya es
editable y ya está implementado en las dos direcciones (`sueldos.ts:712`), así que no hay lógica
nueva. Lo que cambia es cuál de las dos conductas es la de fábrica.

**Es una inversión de una decisión del 13-ago, no un descubrimiento.** Queda escrito así para que
nadie lo lea dentro de seis meses como si siempre hubiera sido así. El razonamiento de entonces
—*"el colaborador no elige que su mes tenga 31 días"*— sigue siendo válido; simplemente no es el
que se eligió.

**Impacto medido en el caso de prueba de la spec (§9.2): S/76,40, no S/30.** Esta cifra se
corrigió el 17-ago después de correr el motor con el default invertido; la estimación anterior
miraba sólo el bono y se quedaba corta a la mitad.

| | Meta fija (hasta el 17-ago) | Meta proporcional (nuevo default) |
|---|---|---|
| Metas de las 4 semanas | 1.500 · 1.500 · 1.500 · 1.500 | 1.500 · 1.500 · 1.500 · **3.000** |
| Semanas cumplidas | 4 | **3** |
| Bono semanal | S/120 | **S/90** |
| Meta del **mes** (RN-11 = suma de las semanales) | 6.000 | **7.500** |
| ¿Ventas 7.200 alcanzan la meta del mes? | sí | **no** |
| Comisión (RN-13) | S/46,40 | **S/0** |
| **Total a pagar** | S/751,70 | **S/675,30** |

**La consecuencia que no era obvia:** subir la meta de la semana larga sube también la meta del
**mes**, porque RN-11 la define como la suma de las semanales. En este caso de prueba eso deja las
ventas por debajo del umbral y **apaga la comisión entera**. O sea: el cambio no cuesta un bono
semanal, cuesta el bono **y** la comisión.

No es un error del cambio —es exactamente lo que pidió Alexander, y una meta más alta que no se
alcanza es justamente lo que significa no alcanzarla— pero conviene que esté escrito antes de que
aparezca en la primera planilla real. Si la intención era subir la exigencia de la semana larga
**sin** mover la meta del mes, eso es otro cambio y necesita su propia decisión.

---

## C-03 🟡 El valor de la hora fuera de contrato se puede pactar aparte (amplía RN-17)

### Qué dice hoy

Las horas de un día sin turno contratado se pagan a `valorPorHora`, el mismo que sale de dividir el
sueldo pactado entre las horas contratadas (`sueldos.ts:805-808`).

### Qué dijo Alexander

> *"se paga el mismo valor generalmente, pero como te digo, hazlo modificable por si acaso para que
> se ponga otro precio."*

### Qué cambia

**Nuevo parámetro `factorHoraFueraContrato`, default `1`.** ✅ Implementado. Multiplica
`valorPorHora` sólo en la línea de RN-17, y el detalle de la boleta sólo nombra el factor cuando
no es 1 — quien cobra la hora al precio de siempre no tiene por qué cargar con un «× 1» que no
explica nada. Con `1` el resultado es idéntico al de hoy, así que ninguna liquidación existente
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

Ninguno bloquea ya: los tres se sembraron como default editable en vez de esperar la respuesta.
Lo que sigue abierto es si el número elegido es el que Alexander quiere.

1. **`pausaMinimaMinutos` = 15?** Sembrado. Cuántos minutos entre una salida y la entrada siguiente
   cuentan como pausa de verdad. Debajo de eso son dos marcas del mismo momento.
2. **`margenHorasDiaMinutos` = 120?** Sembrado. El umbral de la regla A.
3. **Camino A para los tramos.** Tomado. **Hay que avisarle a la sesión del huellero**: su
   `huellero_derivar_asistencia` escribe una fila por día y tiene que pasar a escribir una por par
   de marcas. Mientras no lo haga, C-01 no ocurre para los días que vengan del huellero.

## Lo que quedó sin hacer

- **La pantalla de declarar asistencia no sabe declarar un día con pausa.** Escribe una fila por
  día, así que un día cargado a mano es siempre un tramo único. La tabla lo soporta —la clave
  incluye `turno`— y `declararDia()` ya acepta un turno distinto: falta la interfaz. Hoy el único
  que puede producir un día con pausa es el huellero, y todavía no empareja.
- **Reglas B y C del marcaje astuto** (C-05), y el contraste visual entre horario contratado y
  horario real.

---

## Orden de implementación

1. ✅ **C-05 regla A** — pantalla, sin tocar el motor. No depende de nada.
2. ✅ **C-02** — cambiar un default, con el test que cubre las dos direcciones.
3. ✅ **C-03** — parámetro nuevo, línea de RN-17 multiplicada, default que no cambia nada.
4. ✅ **C-01** — core, RPC y migración 0078. La coordinación con el huellero sigue pendiente.
