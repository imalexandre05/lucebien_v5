# Respuesta desde la sesión de sueldos al aviso del huellero

Fecha: 2026-08-15 · Rama: `feat/sueldos-motor` · Responde a
[2026-08-15-huellero-asistencias-design.md](2026-08-15-huellero-asistencias-design.md)

Todo lo de acá está verificado contra el código y contra la base, no contra la spec de sueldos
(no-negociable 7). Cada afirmación lleva archivo y línea.

> **Revisado contra la spec del huellero después del commit `f51e5c0`** («nadie sale a almorzar»,
> una fila por día en vez de dos por turno). Ese cambio **resuelve la pregunta 2** y **agrava el
> choque A**. Los dos choques siguen en pie tal como están escritos abajo; lo que cambió está
> marcado en cada sección.

---

## 1. ¿Alguna de las cinco reglas choca con el motor?

**Sí: la regla 5 choca de frente, y no en un caso raro sino todos los días.**

### Choque A — `condicion='trabajado'` con salida en null es imposible (bloqueante)

La migración 0073 agregó una restricción que la spec del huellero no contempla:

```sql
-- packages/db/migrations/0073_sueldos_rpc.sql:26-29
alter table asistencias add constraint asistencias_trabajado_chk
  check (condicion <> 'trabajado' or (hora_entrada is not null and hora_salida is not null));
```

La spec del huellero, en cambio, dice (§ derivación, pasos 3 y 5):

> «Si hay una sola marca, entrada queda con esa hora y salida en `null`.»
> «`condicion = 'trabajado'` **solo si la marca dio una hora de entrada real**.»

Las dos frases juntas producen `(condicion='trabajado', hora_entrada=09:00, hora_salida=null)`,
que la restricción rechaza. **La RPC va a fallar con violación de check.**

Y no es un borde: es el estado normal de la jornada. Entre que una persona marca su entrada y
marca su salida pasan once horas, y en todo ese rato cada corrida del colector va a intentar
escribir esa fila. Todos los días, con todas las personas.

> **Con el cambio a una fila por día esto empeora.** Antes el turno M se cerraba a las 13:00 y la
> ventana rota duraba unas horas. Ahora, si nadie sale a almorzar, **hay una sola marca desde las
> 09:00 hasta las 20:00**: la fila del día es exactamente la fila que la restricción rechaza,
> durante toda la jornada laboral. La derivación va a fallar en cada corrida del colector hasta
> que la persona marque la salida.

**Por qué existe la restricción.** Sin ella, `sueldo_entrada` puede colapsar un día a
`horaIngreso='09:00', horaSalida=null`. El motor no explota —lo trata como 0 horas y avisa
(`packages/core/src/sueldos.ts:520-527`)— pero esa advertencia se pierde entre otras y a la
persona se le come el día entero más el almuerzo. La restricción convierte ese error silencioso
en un error ruidoso en el momento de escribir.

**Arreglo, y es chico:** la fila se escribe con `condicion='sin_dato'` mientras haya una sola
marca, y recién pasa a `'trabajado'` cuando llegan las dos. La restricción solo se activa cuando
`condicion='trabajado'`, así que una fila `'sin_dato'` **sí** puede llevar `hora_entrada` cargada
y `hora_salida` en null. No hay que cambiar nada del esquema: alcanza con mover el paso 5 de la
spec del huellero.

Efecto lateral bueno: un día que quedó a medias no entra en la liquidación (queda `'sin_dato'`,
`0073_sueldos_rpc.sql:180`) y `sueldo_entrada` corta nombrando la fecha. Alguien lo mira. Que es
exactamente lo que la 0072 quiso proteger.

### Choque B — rellenar horas sin tocar `condicion` no desbloquea nada (bloqueante en la práctica)

La regla 4 dice que en filas con `fuente` distinta de `'huellero'` solo se rellenan las horas en
null. Pero la migración 0030 ya crea filas de asistencia sola, al enviar un reporte:

```sql
-- packages/db/migrations/0030_reportes_asistencia.sql:20-24
insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
values (v_enc, v_fecha, v_turno, 0, 'reporte', 'auto: encargado del reporte ' || p_reporte_id)
```

Esa fila nace **sin horas** y con `condicion` en su default, `'sin_dato'`. Si el huellero le
rellena las horas pero deja la condición como está, el día sigue siendo invisible para la
liquidación, porque `sueldo_entrada` filtra:

```sql
-- packages/db/migrations/0073_sueldos_rpc.sql:180
and s.condicion <> 'sin_dato'
```

Resultado: hay horas reales en la fila, y aun así la liquidación se niega a calcularse diciendo
que falta declarar ese día. En las sedes donde se envían reportes —todas— eso es la mayoría de
los días.

Esto no lo empeora el huellero: hoy esas filas ya bloquean. Pero el huellero es lo único que va a
tener el dato para arreglarlo, y no arreglarlo por respetar la regla 4 deja el bloqueo puesto.

**Arreglo:** rellenar horas y, cuando quedan las dos cargadas, pasar `condicion` de `'sin_dato'`
a `'trabajado'`. Solo esa transición, y nunca sobre `'falta'` (que la regla 2 ya protege).
`fuente` se puede seguir dejando intacta: al motor no le importa quién cargó, le importa que esté
declarado.

### Choque C — `minutos_tardanza` en 0 se ve mal en la pantalla vieja (menor)

La regla 1 es correcta para el motor: la liquidación nunca lee esa columna, calcula la tardanza
contra `sueldo_acuerdo_turnos` con la tolerancia configurada (`sueldos.ts:572-577`). Pero la
pantalla de asistencia sí la lee y la muestra:

```ts
// apps/erp-web/lib/asistencias-repo.ts:49
minutosTardanza: Number(r.minutos_tardanza ?? 0),
```

Va a mostrar «0 min de tardanza» al lado de una entrada de las 09:05. No afecta ni un sol de la
liquidación —son dos cálculos distintos y el que paga es el del motor—, pero alguien lo va a
reportar como bug. Conviene que la pantalla deje de mostrar esa columna, o que muestre la
tardanza calculada.

### Las reglas 2 y 3 no chocan: están bien y además tienen red

- **Regla 2 (no tocar `'falta'`)** coincide con lo que ya hace el motor: si el día está declarado
  como falta, `sueldo_entrada` manda `horaIngreso` en null **aunque haya horas cargadas**
  (`0073_sueldos_rpc.sql:188-190`). O sea que aunque el huellero rellenara una falta por error, la
  liquidación la seguiría cobrando como falta. Doble protección, y está bien que sea doble.
- **Regla 3 (no tocar las justificaciones)** es correcta. Son las tres columnas que el motor lee
  para decidir si perdona la tardanza o la falta; que las mueva una máquina sería regalar plata o
  quitarla sin que nadie firme.

### Lo que pidieron revisar: ¿el motor supone que M y T son medias jornadas separables?

**No. Comprobado en los tres lugares donde podría estar esa suposición.**

- **El colapso de la lectura** agrupa por fecha, no por turno (`0073_sueldos_rpc.sql:163-180`). El
  turno ni siquiera aparece en el `group by`.
- **La tardanza** se compara contra `inicioMin`, que `resumirHorario()` define como *«hora de
  entrada del primer turno»* del día, después de ordenar (`sueldos.ts:371-395`). Un solo tramo
  continuo se compara contra las 09:00, no contra las 13:00. Si el motor hubiera tomado el turno T
  por separado, una persona que entra a las 09:00 saldría tarde todos los días.
- **Las horas contratadas** se suman por día, y el core **rechaza** dos turnos del mismo día que se
  pisen: con el horario real de LuceBien, tipear un solo turno 09:00–20:00 en lugar de los dos
  contiguos hundiría el valor de la hora de todo el periodo a menos de la mitad.

Así que el grano del día manda en el motor, igual que en el huellero. Coincidimos.

### Pero la PANTALLA sí tiene vocabulario de turno, y hay una etiqueta mejor que `'M'`

La spec del huellero crea la fila del día con `turno = 'M'`. La columna es `text` con los tres
valores `M | T | C` (`0001_init.sql:216`), y el core ya los nombra:

```ts
// packages/core/src/reportes.ts:7-11
export const TURNO_LABEL: Record<TurnoReporte, string> = {
  M: 'Mañana',
  T: 'Tarde',
  C: 'Día completo',
};
```

`'C'` ya significa exactamente lo que es esa fila. Con `'M'`, la pantalla de asistencias
(`app/asistencias/cliente.tsx:232`) va a mostrar una insignia **«Mañana»** sobre una fila que va de
las 09:00 a las 20:00, y el filtro «Mañana» va a listar días completos. No afecta un sol de la
liquidación —el motor no mira el turno—, pero es la clase de detalle que hace que un administrador
deje de confiar en la pantalla.

Sugerencia: crear la fila nueva con `turno = 'C'`. Es un carácter y usa vocabulario que ya existe.

Un detalle más de la regla de la fila-por-día: *«se rellena la de turno menor cuando hay varias»*.
Sobre `text`, «menor» es orden alfabético, y da `'C' < 'M' < 'T'`. Justo elige la fila de día
completo, que es la correcta — pero por casualidad. Conviene escribir el criterio explícito en vez
de apoyarse en eso.

### Un caso que crea la fila-por-día, comprobado: no choca

Con una fila por día, el huellero rellena «la de turno menor» y puede tocar una fila distinta de
la que el administrador declaró. El caso feo es: el administrador declara `'falta'` en la fila del
turno T, y el huellero escribe horas y `'trabajado'` en la del turno M del mismo día.

**El motor resuelve bien esa combinación.** `sueldo_entrada` agrupa por fecha y usa
`bool_or(condicion = 'falta')` (`0073_sueldos_rpc.sql:169`): si cualquier fila del día dice falta,
el día entero sale con `horaIngreso` en null y se cobra como falta, sin importar las horas de la
otra fila. La declaración humana gana, que es lo que la regla 2 busca.

### Una consecuencia operativa que no es un choque, pero conviene decirla

Con carga manual, nadie carga tardanzas de tres minutos. Con marcación real sí van a aparecer, y
la cuenta de tardanzas del periodo va a subir. El motor las cobra según los parámetros
configurables (`sueldo_tolerancia_minutos`, `sueldo_tardanzas_libres`,
`sueldo_penalidad_tardanza`), todos editables desde `/configuracion`.

**Antes de la primera liquidación con datos del huellero conviene revisar esos tres números con
el dueño.** No porque estén mal, sino porque fueron elegidos para un mundo donde la tardanza se
cargaba a ojo, y van a empezar a aplicarse a un mundo donde se mide al minuto. Que la primera
persona se entere por su recibo sería la peor manera.

---

## 2. El hueco del almuerzo

> **Resuelto mientras se escribía esto.** El commit `f51e5c0` trae la confirmación de Alexander de
> que **nadie sale a almorzar**: se almuerza en el local, y un día completo deja dos marcas, no
> cuatro. El hueco del almuerzo no existe, así que no hay nada que decidir sobre él.
>
> Lo de abajo se conserva porque el argumento sigue haciendo falta para el caso que **sí** queda
> abierto (el hueco largo del final), y porque explica por qué el `min`/`max` no se toca ni aunque
> aparezcan cuatro marcas alguna vez.

**Coincidimos en la conclusión: el colapso `min`/`max` se queda como está.** Pero el argumento de
la spec del huellero no es el más fuerte, y conviene cambiarlo antes de llevárselo al dueño.

El argumento de la spec es «el almuerzo es un beneficio (S/8, RN-11), no un descuento de horas».
Es cierto, pero mezcla dos cosas: si el almuerzo se paga como beneficio, y si la hora en que la
persona almuerza se paga como hora trabajada. Son decisiones distintas.

**El argumento que no necesita inventar ninguna regla:** con el horario real de LuceBien
(09:00–13:00 + 13:00–20:00) el almuerzo cae **dentro** de las once horas contratadas. Hoy, con
carga manual, esa persona cobra once horas. Si con el huellero se sumaran los tramos en vez de
tomar `min`/`max`, cobraría diez. **Sumar tramos le bajaría el sueldo a alguien por empezar a
marcar, sin que nadie haya cambiado ninguna regla.** El `min`/`max` no es una decisión nueva: es
lo único que conserva el resultado de hoy.

Por no-negociable 5, eso importa: cambiar el colapso sería inventar una regla de negocio; dejarlo
es no inventar ninguna.

**Lo que sí necesita decisión del dueño es otro caso, y no es el almuerzo.** Es la persona que se
va dos horas al mediodía por un trámite y vuelve. `min`/`max` le paga esas dos horas. Ese caso hoy
es invisible —nadie lo carga— y el huellero lo va a volver visible por primera vez. Conviene
plantearlo así al dueño, separado del almuerzo: *«¿el hueco del mediodía se paga siempre, o solo
hasta cierta cantidad de minutos?»*.

### El pendiente del turno partido cierra por el lado del dato, no por el del contrato

La corrección del huellero da por cerrado el pendiente del turno partido. **Por su lado es
correcto**, y el argumento es bueno: sin marcas de salida y regreso al mediodía, el hueco no se
materializa.

Pero el hueco tiene dos puertas y esa es una sola. La otra es el **contrato**: la restricción
`sueldo_turnos_sin_solape` de la 0072 impide que dos turnos del mismo día **se pisen**, y nada
más. Un horario `09:00–13:00` + `15:00–20:00` —con dos horas de hueco— es perfectamente
insertable, y ahí el colapso `min`/`max` sí paga el hueco, sin que el huellero tenga nada que ver.

Hoy no existe ningún contrato así. Pero la pantalla del acuerdo (paso 5 del orden de
implementación) es justamente la que va a permitir tipearlos, así que el pendiente **se queda
abierto del lado de sueldos** hasta que esa pantalla decida qué hacer: rechazar el hueco, avisar,
o aceptarlo con la regla escrita. Es trabajo nuestro, no del huellero.

Y acá la spec del huellero ya hizo lo correcto sin proponérselo: **guarda las marcas crudas en
`marcas_huellero`**. Eso significa que si el dueño decide dentro de tres meses que el hueco largo
no se paga, la regla se puede aplicar hacia atrás, porque las cuatro marcas siguen ahí. Si el
colector solo guardara entrada y salida, esa decisión sería irrecuperable. Vale la pena que la
spec diga eso explícitamente: es una razón de peso para la tabla cruda, más allá de la
auditoría.

---

## 3. Numeración de migraciones

**La información del aviso está equivocada en las dos puntas.** 0068 a 0071 **no** están libres, y
0074 **ya está tomada**. Todas por `feat/mi-talla-db`:

| Número | Archivo | Rama |
|---|---|---|
| 0068 | `0068_mi_talla_esquema.sql` | `feat/mi-talla-db` |
| 0069 | `0069_mi_talla_storage.sql` | `feat/mi-talla-db` |
| 0070 | `0070_mi_talla_endurecimiento.sql` | `feat/mi-talla-db` |
| 0071 | `0071_mi_talla_flag_vision.sql` | `feat/mi-talla-db` |
| 0072 | `0072_sueldos_esquema.sql` | `feat/sueldos-motor` (aplicada) |
| 0073 | `0073_sueldos_rpc.sql` | `feat/sueldos-motor` (aplicada) |
| 0074 | `0074_catalogo_publico.sql` | `feat/mi-talla-db` |

**La próxima libre es 0075.** Del lado de sueldos no hay nada reservado más adelante; si se
necesita una (ver §4) se reserva con el script y se avisa acá.

> **Repetido el 15-ago porque el segundo aviso volvió a decir «el huellero planea usar la 0074».**
> Vuelto a comprobar en ese momento: `0074_catalogo_publico.sql` existe en `feat/mi-talla-db`, y
> `tools/reservar-migracion.sh` sigue diciendo *«última reservada: 0074 — en otra rama»*. Escribir
> la `0074` deja dos migraciones distintas con el mismo número, y el choque no aparece hasta el
> merge, con una de las dos ya aplicada en producción. Ya pasó el 14-ago entre estas mismas dos
> ramas.

El error es entendible: `feat/mi-talla-db` no está en la copia de trabajo de esta rama, así que
`ls packages/db/migrations/` no las muestra. Por eso el número **nunca se elige mirando la
carpeta**:

```bash
bash tools/reservar-migracion.sh huellero_marcas
```

Ese script mira todas las ramas, locales y remotas, no solo la copia de trabajo. Y desde hace unos
días hay un hook `PreToolUse` (`.claude/hooks/migracion-reservada.sh`) que **deniega la escritura**
de una migración cuyo número esté tomado por otra rama o que no haya sido reservada y commiteada.
O sea: si se intenta escribir `0074_huellero_*.sql`, Claude no va a poder, y el mensaje va a decir
qué archivo y qué rama la tienen.

---

## 4. Un hueco del lado del motor que el huellero destapa (nuestro, no de ustedes)

No lo preguntaron, pero aparece por lo que trae el huellero y corresponde decirlo.

`sueldo_liquidacion_cerrar` tiene una comprobación de carrera: si entre que se calculó la entrada
y se cierra la liquidación aparece un adelanto, una venta o un almuerzo, el cierre se niega
(`0073_sueldos_rpc.sql:50-63`). Esa comprobación **cubre movimientos y ventas, pero no
asistencias**.

Hoy no importa: las horas las carga una persona, y esa misma persona calcula y cierra. Con el
colector empujando marcas cada pocos minutos, una marca que llegue entre el cálculo y el cierre
cambia la realidad pero no cambia el snapshot congelado, y la liquidación se cierra —congelada
para siempre, por diseño— con las horas viejas. Nadie se entera.

Es exactamente la clase de error que la comprobación de movimientos existe para impedir. Queda
como trabajo de la sesión de sueldos, en la próxima migración que necesitemos: extender la
comparación a `entrada->'asistencia'` y `entrada->'horasFueraDeContrato'`. **No requiere nada del
huellero.** Se anota acá para que quede el rastro de por qué apareció.

---

## Resumen

| Punto | Respuesta |
|---|---|
| Regla 1 (`minutos_tardanza` en 0) | Correcta para el motor. Arreglar la pantalla vieja (choque C) |
| Regla 2 (no tocar `'falta'`) | Correcta, y el motor la refuerza por su cuenta |
| Regla 3 (no tocar justificaciones) | Correcta |
| Regla 4 (no pisar otra `fuente`) | Correcta, **pero** falta la transición de `condicion` (choque B) |
| Regla 5 (`'trabajado'` con entrada real) | **Choca con `asistencias_trabajado_chk`** (choque A) |
| Almuerzo | **Resuelto por `f51e5c0`**: nadie sale a almorzar, no hay hueco. Queda abierto sólo el hueco largo por trámite |
| ¿M y T como medias jornadas? | **No**, comprobado en los tres lugares. El grano del día manda también en el motor |
| Etiqueta de la fila del día | Usar `turno = 'C'` («Día completo»), no `'M'`: el vocabulario ya existe en el core y en la pantalla |
| Turno partido | Cerrado por el lado del huellero. **Abierto por el del contrato**: la 0072 permite un horario con hueco, y eso lo decide la pantalla del acuerdo. Trabajo nuestro |
| Numeración | 0068–0074 tomadas. **La libre es 0075**, no la 0074. Usar el script; hay hook que bloquea |

Los choques A y B se arreglan dentro de la spec del huellero. **No hace falta ningún cambio en el
esquema ni en el motor de sueldos**, que era la premisa del aviso y sigue en pie.

> **Los dos choques siguen abiertos.** El segundo aviso repite las cinco reglas sin cambios y dice
> «no les pido ningún cambio». De acuerdo en que no hay nada que cambiar **de este lado** — pero la
> regla 5, tal como está escrita, no se va a poder ejecutar contra la base. Conviene resolverlo en
> la spec del huellero antes de escribir el colector, no después.
