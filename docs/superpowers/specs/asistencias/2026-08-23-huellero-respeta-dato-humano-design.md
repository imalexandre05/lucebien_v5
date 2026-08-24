# SPEC — El huellero respeta el dato humano

> **Qué es.** Cuando una persona corrige a mano la hora de una asistencia, esa corrección tiene
> que ganarle a la máquina. Hoy no: el siguiente lote del colector la vuelve a pisar, y una
> reversión de mapeo puede borrar la fila entera con las horas escritas a mano adentro. Encima,
> si la derivación revienta, el colector sigue diciendo que todo salió bien.
>
> **Zona de rigor:** spec completa. La fila que se toca es la que decide si un día contratado
> bloquea o paga la liquidación (no-negociable 1). Migración numerada con su prueba, verificada
> contra la base antes de aplicar.
>
> **Estado:** escrita el 23-ago-2026 a partir de los hallazgos F43, F44 y F48 de la auditoría
> previa a producción, los tres confirmados contra la base viva (proyecto `scilb`).

---

## 1. La cadena que esto protege

`marcas_huellero` → `huellero_derivar_asistencia` → `asistencias` → `sueldo_entrada` → liquidación.

`asistencias` es el único lugar donde conviven dos autores: la máquina, que escribe sola cada
pocos minutos, y la persona que corrige. Para poder distinguirlos, la 0075 agregó dos columnas
sello:

| Columna | Qué significa cuando está en `true` |
|---|---|
| `huellero_puso_entrada` | `hora_entrada` la escribió la máquina, no una persona |
| `huellero_puso_salida` | `hora_salida` la escribió la máquina, no una persona |

Los sellos no son informativos: **mandan**. La derivación recalcula exactamente las horas cuyo
sello está en `true` (`0079_huellero_emparejado_fix.sql:270-273`) y respeta las demás. La
reversión de un mapeo anula exactamente las horas cuyo sello está en `true`
(`0075_huellero_asistencias.sql:876-877`). Un sello mal puesto no es un detalle de auditoría: es
una hora que se recalcula o se borra sin permiso.

Estado en producción al 23-ago-2026: 1.118 filas de `asistencias`, 1.105 con
`huellero_puso_entrada = true`, 955 con `huellero_puso_salida = true`, 1.105 con
`fuente = 'huellero'`. Cero filas de fuente `huellero` con una hora de entrada de autor humano —
o sea: **el sello nunca se bajó, porque el único camino que lo baja hoy casi no se usa.**

## 2. Lo que pasa hoy

### F43 — Declarar un día no baja el sello

`crearAsistencia()` (`apps/erp-web/lib/asistencias-repo.ts:93-105`) sí lo baja, y lo comenta:

```ts
...(p.horaEntrada ? { huellero_puso_entrada: false } : {}),
...(p.horaSalida  ? { huellero_puso_salida:  false } : {}),
```

`declararDia()` (`apps/erp-web/lib/asistencias-repo.ts:255-262`) escribe `condicion`,
`hora_entrada`, `hora_salida`, las dos justificaciones y el motivo — y **no toca los sellos**.

Pero `declararDia()` es la puerta principal: es la que usa la pantalla de asistencias del período,
la que corrige la hora antes de liquidar, y la única que puede declarar `trabajado`. Sobre una
fila del huellero —el 98,8 % de las filas— la corrección queda escrita con el sello todavía en
`true`, y el siguiente ciclo del colector la recalcula a la hora de la máquina.

**Qué se ve un lunes.** El administrador ve que a Marylin le figura la salida a las 14:05 cuando
en realidad se quedó hasta las 18:30 cerrando el almacén. La corrige y guarda; la pantalla dice
que guardó, y guardó. Cinco minutos después el colector sube el lote siguiente, la derivación
recalcula la hora sellada, y la salida vuelve a las 14:05. Nadie recibe un error. Se le pagan
cuatro horas menos, y quien corrigió cree que ya lo arregló.

### F44 — La reversión borra la fila entera aunque tenga horas de una persona

`huellero_limpiar_dia_sin_marcas` (`0075_huellero_asistencias.sql:864-869`) borra así:

```sql
delete from asistencias a
where a.empleado_id = p_empleado_id and a.fecha = p_fecha
  and a.fuente = 'huellero'
  and a.condicion <> 'falta';
```

La única salvaguarda es `fuente`. Y `fuente` **no cambia nunca por mano humana**: `declararDia()`
lo dice explícito en su comentario —«si la fila existe se actualizan sólo las columnas de la
declaración, y `fuente` queda como estaba»— y `crearAsistencia()` hace lo mismo. Una fila que
nació del huellero y después alguien corrigió a mano sigue diciendo `fuente = 'huellero'` y se
borra entera: la condición declarada, las horas escritas a mano, la justificación y el motivo.

Lo llamativo es que el bloque de abajo (`:871-890`) hace exactamente lo contrario, con cuidado, y
tiene el comentario que explica por qué: «Antes se anulaban las dos, y eso borraba dato humano».
Ese cuidado se aplica sólo a las filas de otra fuente. El `delete` de arriba nunca recibió el
mismo criterio.

**Cuándo se dispara.** `huellero_reresolver_identificador` (`:761`) llama a esta función para cada
día afectado al crear, cerrar, ignorar o borrar un mapeo. Es decir: la operación normal de
corregir a quién pertenece un identificador del equipo.

### F48 — El colector esconde que la derivación falló

`huellero_registrar_marcas` cuenta las derivaciones que reventaron (`0075:631`) y las devuelve en
`derivaciones_fallidas` con este comentario: «Si esto es mayor que cero, las marcas entraron pero
NINGUNA asistencia se creó».

`tools/colector-huellero/lib/subida.js:88` arma el acumulador con cuatro claves —`insertadas`,
`duplicadas`, `sin_mapeo`, `enviadas`— y `:102-105` suma sólo tres de la respuesta.
`derivaciones_fallidas` y `rechazadas` se descartan sin leerse. No tienen un solo consumidor en
todo el repositorio.

Resultado: el log de PM2 dice `48 nuevas · 0 repetidas · 0 sin mapeo`, la pantalla muestra el
equipo al día, y el mes se liquida sin esos días. El camino de falla es real y está documentado en
la propia migración: la derivación lee `huellero_jornada_max_horas` de `config` y lo castea a
`numeric`; alguien escribe `12,5` desde `/configuracion` y todas las derivaciones revientan.

## 3. La regla que queda escrita

> **RN-H1 — Una hora escrita por una persona no la vuelve a tocar la máquina, y nadie la borra en
> silencio.**
>
> a) Toda escritura humana sobre `hora_entrada` / `hora_salida` baja el sello correspondiente,
>    cualquiera sea la puerta por la que entre.
> b) La reversión sólo borra una fila si **ninguna** de las horas que tiene es de autor humano.
>    Si sobrevive una, la fila se conserva, se le quitan únicamente las horas de la máquina, y el
>    día baja a `sin_dato` para que la liquidación corte nombrando la fecha en vez de pagarla mal.
> c) Un lote del colector que no pudo derivar sus días no se reporta como un lote sano.

## 4. El diseño

Tres cambios independientes. Ninguno depende de los otros dos; los tres sostienen la misma regla.

### D-1 — `declararDia()` baja el sello (RN-H1.a)

En `apps/erp-web/lib/asistencias-repo.ts`, el objeto `declaracion` suma las dos claves que
`crearAsistencia()` ya escribe, condicionadas a que haya hora:

```ts
...(d.horaEntrada ? { huellero_puso_entrada: false } : {}),
...(d.horaSalida  ? { huellero_puso_salida:  false } : {}),
```

**Por qué condicionadas y no siempre.** El sello protege una hora; sin hora no protege nada.
Cuando se declara una falta las dos horas van a `null`, y bajar el sello ahí no cambiaría el
resultado: con la hora en `null` la derivación rellena igual, por el `coalesce` de
`0079:270-273`. Escribir `false` sobre una hora ausente sería ruido que sugiere una protección que
no existe.

Las dos claves van dentro del objeto `declaracion`, que ya se reutiliza en las dos ramas —`update`
sobre la fila que existe, `insert` cuando no hay ninguna—, así que el arreglo es un solo lugar. En
el `insert`, si no hay hora la columna toma su `default false`, que es lo correcto: una fila creada
por esta función nunca tiene horas de la máquina.

### D-2 — La reversión no borra una fila con una hora humana (RN-H1.b)

Migración `0084_huellero_respeta_dato_humano.sql`. Recrea `huellero_limpiar_dia_sin_marcas` con
dos cambios y ni uno más:

1. El `delete` agrega la condición de que no sobreviva ninguna hora humana:

```sql
and (a.hora_entrada is null or a.huellero_puso_entrada)
and (a.hora_salida  is null or a.huellero_puso_salida)
```

2. El `update` de abajo deja de exigir `fuente <> 'huellero'`.

El segundo cambio es lo que hace que el primero sirva. Sin él, la fila que deja de calificar para
el `delete` tampoco califica para el `update` —porque su `fuente` sigue diciendo `'huellero'`— y
se quedaría con la hora de la máquina pegada, que es justo lo que la reversión existe para quitar.
Con los dos, las filas se reparten sin huecos ni superposición:

| Fila del día sin marcas | Qué le pasa |
|---|---|
| `condicion = 'falta'` | Nada. Una falta declarada no se toca nunca (ya era así) |
| `fuente = 'huellero'` y ninguna hora suya es humana — incluida la fila sin hora alguna | Se borra entera (ya era así) |
| `fuente = 'huellero'`, le sobrevive una hora humana y le queda una de la máquina | Se le quita sólo la de la máquina, se bajan los sellos, y baja a `sin_dato` |
| `fuente = 'huellero'` con las dos horas ya corregidas a mano (ningún sello puesto) | Nada: no hay nada de la máquina que revertir |
| Otra `fuente` con alguna hora de la máquina | Igual que la tercera fila (ya era así) |
| Otra `fuente` sin ningún sello puesto | Nada (ya era así) |

El reparto no deja huecos ni superposición. Lo que hay que mirar al leer el `delete` y el `update`
juntos: una fila del huellero que deja de calificar para el `delete` es, por definición, una que
conserva una hora humana. Si además le queda una hora de la máquina, el `update` se la quita; si
ya no le queda ninguna —las dos horas se corrigieron a mano— no hay nada que revertir y la fila se
queda como está, que es exactamente lo correcto.

**Efecto sobre los datos que ya existen: ninguno hoy.** De las 1.105 filas de fuente `huellero`,
ninguna tiene la entrada de autor humano; cuatro tienen la salida de autor humano
(`huellero_puso_salida = false` con `hora_salida` puesta), las cuatro de Marylin (sede AL), en
2026-06-03, 2026-07-25, 2026-08-19 y 2026-08-22. Las cuatro conservan marcas del huellero ese día,
así que hoy el `if exists (...) then return` de la función las intercepta antes de llegar al
`delete`/`update` que este cambio toca: corrida hoy sobre estas filas, la función se comporta
igual antes y después de la 0084, y no hace falta backfill porque ya están en el estado correcto.

Eso no las vuelve irrelevantes. Una marca deja de contar para ese `exists` sin desaparecer: si se
corrige el mapeo que hoy la asocia a Marylin, `huellero_reresolver_identificador` reasigna la
marca (paso 2, `0075:720-744`) y llama a esta función para la fecha vieja (paso 4, `0075:760-763`),
que a partir de ahí puede quedarse sin marcas propias. Antes de la 0084 eso borraba la fila
entera —la salida que alguien corrigió a mano, incluida—; después, sobrevive. La migración cambia
el comportamiento futuro; no reescribe el pasado.

*(Verificado el 24-ago-2026 contra la base real, proyecto `scilb`, dentro de una transacción que
se revirtió sola: los números de este párrafo y de §1 se recontaron, y la prueba de §6 se corrió
completa con la función de esta migración ya creada — los ocho casos A-H dieron `ok`.)*

### D-3 — El colector dice cuando la derivación falló (RN-H1.c)

En `tools/colector-huellero/lib/subida.js`: el acumulador suma también `derivaciones_fallidas` y
`rechazadas`, y cuando `derivaciones_fallidas > 0` se emite un `registrar()` explícito:

```
ATENCIÓN: N día(s) no se pudieron derivar — las marcas entraron pero NO se creó la asistencia.
```

No se lanza una excepción. Las marcas ya están a salvo en la base y la derivación se puede repetir
sola en el ciclo siguiente; tumbar el proceso perdería el `ultima_sincronizacion` que hace visible
una cadena rota, que es el problema de al lado. Lo que hacía falta era que el log dejara de
mentir.

`rechazadas` se suma por lo mismo: hoy se descarta, y son marcas leídas del equipo que la base no
aceptó. Se muestra en la línea de resumen junto a las demás.

## 5. Lo que esta spec NO cambia

- **La derivación (`huellero_derivar_asistencia`).** Sus reglas de emparejado quedan como están.
- **La condición de una falta declarada.** Sigue intocable en las dos funciones.
- **`fuente`.** Sigue diciendo de dónde nació la fila y ninguna corrección la reescribe. La
  autoría de cada hora la llevan los sellos; ése es el diseño de la 0075 y no se toca.
- **El aislamiento por sede.** Nada de esto cambia quién ve qué.
- **Las justificaciones sobre una fila sin horas humanas.** Una fila del huellero con
  `motivo_justificacion` escrito a mano pero sin ninguna hora corregida se sigue borrando entera
  en la reversión. Es una pérdida de trabajo humano menor —y distinta de la que esta spec
  ataca, que es una hora que se paga— y ampliar el criterio a las justificaciones cambiaría el
  reparto de la tabla de §4. Queda anotado como pendiente, no resuelto acá.

## 6. Cómo se comprueba

**D-2**, en `packages/db/pruebas/0084_huellero_respeta_dato_humano.prueba.sql`, contra la base
real dentro de una transacción que se aborta sola. Cinco casos, uno por fila de la tabla de §4 más
los que prueban que el sello es el que manda:

| Caso | Qué monta | Qué tiene que pasar |
|---|---|---|
| A | Fila `huellero`, las dos horas de la máquina | Se borra (no se rompió lo que funcionaba) |
| B | Fila `huellero`, entrada humana + salida de la máquina | Sobrevive, conserva la entrada, pierde la salida, queda en `sin_dato` y con los dos sellos en `false` |
| C | Fila `huellero` declarada `falta` | Intacta |
| D | Fila `reporte` con una hora de la máquina | Sigue comportándose como antes de la 0084 |
| E | Fila `huellero` con las dos horas humanas y los sellos bajos | Intacta: ni se borra ni se le quita nada |

**D-1** no tiene banco de pruebas automático en este repositorio: `tools/verificar-local.sh` corre
vitest sólo sobre `packages/core`, y `asistencias-repo.ts` habla con Supabase. Lo que sí se
comprueba mecánicamente es el mecanismo del que depende, y va en la misma prueba:

| Caso | Qué monta | Qué tiene que pasar |
|---|---|---|
| F | Fila con la salida escrita a mano y el sello en `false`, marcas del día presentes, se corre `huellero_derivar_asistencia` | La salida humana sobrevive |
| G | La misma fila con el sello en `true` | La máquina la recalcula |

F y G juntos son la razón de ser de D-1: demuestran que bajar el sello es exactamente lo que
salva la corrección, y que no bajarlo es exactamente lo que la pierde. La comprobación de que
`declararDia()` lo baja de verdad es manual, y está descrita en §7.

**D-3** se comprueba leyendo el log: se fuerza el fallo escribiendo `12,5` en
`huellero_jornada_max_horas` desde `/configuracion` (el camino que la propia 0075 documenta), se
espera un ciclo del colector, y el log de PM2 tiene que traer la línea de ATENCIÓN. Después se
devuelve el valor a `14`.

## 7. Comprobación manual de D-1 antes de dar el módulo por bueno

1. Elegir un día de una persona con marcas del huellero y la fila en `fuente = 'huellero'`.
2. Corregir la hora de salida desde la pantalla del período y guardar.
3. Consultar la fila: `huellero_puso_salida` tiene que estar en `false` y `hora_salida` con lo
   corregido.
4. Correr un ciclo del colector sobre ese mismo día (o llamar a `huellero_derivar_asistencia`).
5. La hora corregida sigue ahí.

Antes de este cambio el paso 5 devolvía la hora de la máquina.

## 8. Riesgo

Bajo, y acotado a lo que ya estaba roto:

- D-1 sólo agrega dos columnas a un `update` que ya se hacía. Si el sello ya estaba en `false`, no
  cambia nada.
- D-2 hace que la reversión borre **menos** filas, nunca más. El caso que deja de borrarse
  termina en `sin_dato`, que bloquea la liquidación nombrando la fecha: el modo de fallar es que
  alguien tenga que declarar un día a mano, no que se pague de más.
- D-3 sólo agrega líneas al log.

Ningún parámetro de negocio nuevo, ningún default inventado.
