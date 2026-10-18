# SPEC — El huellero deja de adivinar por orden y empieza a decidir por el horario

> **Qué es.** Cinco pedidos del administrador sobre cómo el sistema convierte las marcas del
> huellero en asistencia (ítems B-2 a B-6 de [la hoja de ruta](../2026-08-25-reunion-admin-hoja-de-ruta.md)).
> Los cinco caen sobre la misma función, y por eso van en una sola spec aunque se construyan en dos
> migraciones.
>
> **Zona de rigor: spec completa.** `huellero_derivar_asistencia` es la puerta por la que entra el
> 98,8 % de las filas de `asistencias`, y la asistencia es la base de la liquidación. Un error acá
> le paga de menos a una persona real, o le inventa una falta que cuesta dos días.

---

## 1. Lo que hay hoy, verificado contra el código

| | Dónde | Qué hace |
|---|---|---|
| **El emparejado real** | `packages/db/migrations/0079_huellero_emparejado_fix.sql:56` — `huellero_derivar_asistencia(p_empleado_id, p_fecha)` | Es **SQL**, no TypeScript |
| Quién lo llama | `0075:502` `huellero_registrar_marcas()`, loop en `:609-617` | Única puerta de ingesta del colector |
| El colector | `tools/colector-huellero/lib/isapi.js:267-274` | Sólo extrae 4 campos crudos. **Cero lógica** de entrada/salida |
| Marcas crudas | `marcas_huellero` (`0075:119-128`) | **No guarda si una marca es de entrada o de salida** — se deriva por orden cronológico |
| Procedencia | `fuente` (`0001_init.sql:219`) + `huellero_puso_entrada` / `huellero_puso_salida` (`0075:171-172`) | Dicen «esta hora la escribió la máquina», por hora, no por fila |
| Estados posibles | `check (condicion in ('sin_dato','trabajado','falta'))` — `0072:203-205` | Sólo tres. **Ninguno significa «derivado, no declarado»** |
| Pausa mínima | `sueldo_pausa_minima_minutos` (15), aplicada en `0079:136-190` | Ver §3 |
| **El horario contratado** | `sueldo_acuerdo_turnos` (`0072:143-153`) | 🔴 **La función NO lo consulta. Ni una vez.** Verificado con grep en `0075`, `0079` y `huellero.ts` |

**Ese último renglón es todo el problema.** El administrador pidió cuatro veces, con distintas
palabras, que el sistema use el horario para decidir. Hoy el horario no está ni siquiera disponible
en ese punto del código.

### 🔴 Hallazgo aparte: hay código muerto que parece vivo

`packages/core/src/huellero.ts:122` (`decidirAsistencia`) **no tiene ningún llamador fuera de sus
propios tests** — verificado con grep en todo el repo. Y ya se separó de la versión viva: no
implementa tramos ni pausa mínima, o sea el modelo que la `0079` reemplazó hace cinco días.

Peor: su comentario de cabecera (`huellero.ts:10-13`) promete un «test de paridad» que detectaría
justamente esa separación. **Ese test no existe** — se buscó «paridad» en todo el repo y no aparece.
El archivo se separó del SQL sin que nada lo marcara, exactamente lo que el comentario decía que no
podía pasar.

**Esto importa para esta spec:** cualquiera que lea el repo buscando dónde cambiar el emparejado va
a encontrar `huellero.ts` primero —tiene el nombre correcto, está en el core, tiene tests— y va a
editar un archivo que no cambia nada en producción. Se resuelve en C-5.

---

## 2. Las cinco anotaciones, y qué resulta ser cada una

| # | Textual | Qué es en realidad |
|---|---|---|
| B-2 | *«si su salida es a las 8 y se marca a las 8:20 entonces se ponga que es de salida y ya no de entrada»* | Un caso particular de B-3 |
| B-3 | *«que automáticamente decida si algo (marcaje) es ingreso o salida dependiendo su horario»* | **El cambio de fondo.** Traer el horario contratado a la función |
| B-4 | *«si se marca dos veces, por ejemplo a las 8pm y 8:01pm, que se considere el que esté más temprano y se obvie el otro»* | Casi resuelto, pero con un conflicto real — ver C-2 |
| B-5 | *«cuando no se marca entrada o salida se rellena automáticamente, pero se avisa que ese marcado no es real»* | Regla nueva + **una columna que hoy no existe** |
| B-6 | *«si no se marca ni una huella ya es falta»* | Regla nueva **con consecuencia económica de dos días** — es la más peligrosa de las cinco |

---

## 3. El diseño

### C-1 — La función aprende el horario contratado (B-2, B-3)

`huellero_derivar_asistencia` resuelve, para `(p_empleado_id, p_fecha)`, el turno contratado de ese
día: el acuerdo vigente (`sueldo_acuerdos` donde la fecha cae entre `fecha_inicio` y `fecha_fin` —
a lo sumo uno, garantizado por `sueldo_acuerdos_sin_solape`) y sus tramos de ese día de la semana
(`sueldo_acuerdo_turnos.dia_semana = extract(isodow from p_fecha)`).

De ahí salen dos horas: **`hora_inicio` más temprana** y **`hora_fin` más tardía** del día.

**Dónde se usa: sólo cuando el día queda ambiguo.** Si las marcas cierran en tramos pares —entrada
y salida claras—, no cambia nada: el emparejado por orden ya acierta y sigue mandando. El horario
entra a decidir **únicamente cuando queda una marca suelta**, que es justo el caso que hoy termina
en `sin_dato`:

> Una sola marca en el día, a las 20:20, con turno contratado 14:00–20:00.
> Distancia a la entrada: 6 h 20 min. Distancia a la salida: 20 min.
> → **Es una salida.** Falta la entrada.

Regla, en una línea: **la marca suelta se asigna al extremo del turno que tenga más cerca.** Es
exactamente el ejemplo que dio el administrador (B-2), generalizado (B-3).

**Si no hay horario contratado para ese día** —sin acuerdo vigente, o el día no tiene turno—, la
función se comporta **exactamente como hoy**. No se inventa un horario. Ese caso ya existe (trabajo
fuera del horario pactado, RN-17) y tiene su propio tratamiento aguas abajo.

### C-2 — La doble marca: un parámetro nuevo, no el que ya está (B-4)

**Acá hay un conflicto real que las notas no ven**, y por eso este punto es más largo que los otros.

La regla de la pausa de hoy (`0079:136-190`) ya trata la doble marca — pero sólo en la apertura. En
el **cierre** hace lo contrario de lo que pidió el administrador:

| Marcas | Hoy | Lo que pidió |
|---|---|---|
| 8:00pm y 8:01pm, al final del día | Cierra a las **8:01** (la segunda marca descarta el cierre tentativo y el día se cierra con la última) | Cierra a las **8:00** (*«el que esté más temprano»*) |

Y las dos conductas son correctas, para casos distintos:
- **Doble toque** (el primero no sonó, vuelve a apoyar el dedo): son *el mismo evento*. Vale la
  primera. Es lo que él describe.
- **Salió y volvió** (marca 8:00, vuelve por algo, se va de verdad 8:14): son *dos eventos*. Vale la
  última — si no, se le pagan 14 minutos de menos.

Los dos caen hoy dentro de la misma ventana de 15 minutos (`sueldo_pausa_minima_minutos`), y por eso
se pisan.

**Solución: separarlos en dos ventanas.**

| Ventana | Parámetro | Default | Qué significa |
|---|---|---|---|
| Doble toque | `huellero_doble_marca_minutos` 🆕 | **2** | Dos marcas a menos de esto son **la misma**: se conserva la más temprana y se descarta la otra, en la apertura y en el cierre |
| Pausa real | `sueldo_pausa_minima_minutos` (ya existe) | 15 | Sigue funcionando igual entre 2 y 15 minutos |

Con eso: 8:00 y 8:01 → una sola marca, las 8:00 (lo que pidió). 8:00 y 8:14 → sigue siendo una
salida a las 8:14 (no se le paga de menos a nadie). **El default de 2 minutos es elegido por mí** y
se anota como provisional: es el más chico que resuelve el caso que él nombró.

### C-3 — Rellenar lo que falta, sin mentir sobre su origen (B-5)

> **RETIRADA el 18-oct-2026 (decisión del dueño n.º 3, migración 0163).** Con pago por horas reales
> lo que falta ya no se completa con el horario: queda «Pendiente de resolver». C-1 también cambió:
> la marca suelta se compara con todos los turnos del día. Ver
> [2026-10-18-huellero-marca-extremo-cercano-design.md](2026-10-18-huellero-marca-extremo-cercano-design.md).

Hoy un día con entrada y sin salida queda en `sin_dato` y **corta la liquidación del período
entero**. Eso no fue un descuido: la migración `0085` existe porque antes ese día se pagaba a
medias, en silencio, y era el único camino del sistema que pagaba de menos sin avisar.

El administrador quiere que se rellene solo, pero fue explícito sobre la condición:
*«se avisa que ese marcado no es real y fue automático porque no se marcó»*.

**El problema técnico:** hoy no hay dónde guardar esa distinción.
`huellero_puso_entrada`/`huellero_puso_salida` dicen «la máquina escribió esta hora» — y eso es
verdad también para una hora que salió de una huella real. Lo que falta es distinguir **«esta hora
salió de una huella»** de **«esta hora la inventó el sistema porque no hubo huella»**.

**Dos columnas nuevas en `asistencias`:**

```sql
entrada_estimada boolean not null default false
salida_estimada  boolean not null default false
```

Cuando falta un extremo y **hay horario contratado**, la función:
1. Lo completa con la hora del turno (`hora_inicio` o `hora_fin` según cuál falte).
2. Pone la bandera `*_estimada` correspondiente en `true`.
3. Deja `condicion = 'trabajado'` — ya no hay un dato ausente, hay uno propuesto y marcado.
4. Anota el motivo en `obs`, como ya hace hoy.

**Consecuencia deliberada:** ese día **deja de cortar la liquidación**. Es lo que él pidió. Lo que
lo hace aceptable es que la hora estimada está marcada como tal en la base, y por lo tanto:
- La pantalla de asistencia la muestra distinta, con su aviso.
- El detalle de la liquidación la nombra, para que quien firma el pago sepa qué se estimó.
- El administrador la pisa con la hora real cuando la sepa, y la bandera vuelve a `false`
  (`asistencias-repo.ts` ya baja `huellero_puso_*` al escribir a mano — mismo lugar, misma idea).

**Sin horario contratado, no se estima nada.** Queda `sin_dato` como hoy: inventar una hora sin
tener contra qué es adivinar, y adivinar en una asistencia es adivinar en un pago.

### C-4 — Cero marcas es falta, con un freno para el día que falla el aparato (B-6)

*«en caso si no se marca ni una huella ya es falta»*. Hoy queda `sin_dato`, que no es falta: obliga a
que una persona decida. Él quiere que sea falta directamente.

**Se hace — con un freno, y el freno no es negociable.**

Una falta cuesta **dos días de sueldo** (RN-09, confirmado por Alexander el 16-ago). Si el huellero
se cae un día —se reinicia, se corta la luz, falla la red del almacén— **nadie marca**, y sin freno
el sistema le pondría una falta a las once personas a la vez: veintidós días de sueldo descontados
en silencio, por un problema del aparato.

Eso no es hipotético en este proyecto: el histórico ya muestra días enteros sin marcas de nadie.

**El freno:** si en una misma fecha el número de personas con turno contratado y **cero marcas**
supera `huellero_falta_auto_max_personas` (🆕, default **2**), no se declara falta a ninguna. Esas
filas quedan en `sin_dato` como hoy, con el motivo en `obs`: *«varias personas sin marcas el mismo
día: parece falla del equipo, no faltas»*. El administrador las resuelve a mano.

Con dos o menos, sí se declara falta —marcada como derivada, igual que C-3, para que se vea que la
puso la máquina— y con `falta_justificada = false`, que es el default y significa exactamente lo que
tiene que significar: nadie la justificó todavía.

**El default de 2 es elegido por mí** y se anota como provisional. Sale de que las faltas reales son
individuales y las caídas del equipo son colectivas; dos personas faltando el mismo día es normal,
once no lo es nunca.

### C-5 — Borrar el código muerto que parece vivo

`packages/core/src/huellero.ts` (`decidirAsistencia` y lo que sólo él usa) se elimina, junto con sus
tests. No se «actualiza para que coincida»: mantener dos implementaciones de la misma regla en dos
lenguajes es lo que produjo esta divergencia, y el propio archivo prometía una salvaguarda que nunca
existió.

Lo que **sí** se conserva de ese archivo: cualquier función que tenga llamadores reales (verificar
uno por uno antes de borrar). Si al final queda vacío, se borra el archivo entero y se saca del
`index.ts`.

En su lugar, un comentario en la cabecera de la migración deja dicho, en una línea, que la regla del
emparejado vive **sólo** en SQL y por qué.

---

## 4. Lo que esta spec NO hace

- **No** re-deriva ninguna asistencia ya escrita. Las 1.105 filas existentes quedan como están; las
  reglas nuevas valen para lo que entre desde que se apliquen. Re-derivar el pasado cambiaría
  liquidaciones ya calculadas.
- **No** toca `0084_huellero_respeta_dato_humano`: si una persona escribió una hora, el huellero
  sigue sin pisarla. Esa garantía es anterior y se mantiene entera.
- **No** cambia `sueldo_pausa_minima_minutos` ni los límites de jornada
  (`huellero_jornada_max_horas` / `min_horas`).
- **No** mejora el reconocimiento del lector de huellas (B-8 de la hoja de ruta): eso es
  configuración del equipo Hikvision, no del ERP.
- **No** decide qué pasa con la tolerancia (B-1, *«tolerancia en 0»*): es un parámetro que el
  administrador cambia desde `/configuracion`, y mueve plata — va aparte, avisado.

## 5. Parámetros nuevos

| Clave | Default | Quién lo eligió |
|---|---|---|
| `huellero_doble_marca_minutos` | `2` | **Yo.** El más chico que resuelve el caso «8:00 y 8:01» que nombró el administrador, sin comerse la pausa real de 15 min |
| `huellero_falta_auto_max_personas` | `2` | **Yo.** Freno anti-caída del equipo (C-4). Las faltas reales son individuales; las caídas, colectivas |

Los dos van a `config-catalogo.ts`, editables desde `/configuracion`, y **anotados como provisionales
en `docs/pendientes-negocio.md`** (no-negociable 5).

## 6. Casos de prueba

Prueba de migración, patrón autodescartable, con un empleado sintético y un acuerdo de turno
14:00–20:00 (el horario real de Marylin, para que los casos se lean):

| # | Escenario | Esperado |
|---|---|---|
| 1 | Marcas 13:55 y 20:35 | Sin cambios respecto de hoy: entrada 13:55, salida 20:35, nada estimado |
| 2 | **Una sola marca, 20:20** | Salida 20:20, entrada **estimada** 14:00, `salida_estimada=false`, `entrada_estimada=true`, `condicion='trabajado'` |
| 3 | **Una sola marca, 14:05** | Entrada 14:05, salida **estimada** 20:00, banderas al revés del caso 2 |
| 4 | Marcas 20:00 y 20:01 (doble toque) | **Una sola marca, 20:00** — la de 20:01 se descarta (C-2) |
| 5 | Marcas 14:00, 20:00 y 20:14 | Salida **20:14**, no 20:00: pasó los 2 min, es una pausa real, no un doble toque |
| 6 | **Cero marcas**, 1 persona ese día | `condicion='falta'`, marcada como derivada, `falta_justificada=false` |
| 7 | **Cero marcas, 5 personas** el mismo día | **Ninguna falta.** Las cinco en `sin_dato` con el motivo de posible falla del equipo |
| 8 | Una sola marca y **sin acuerdo vigente** | `sin_dato` como hoy — no se estima nada sin horario contra el cual estimar |
| 9 | Día con hora escrita por una persona | El huellero no la pisa (garantía de la `0084`, intacta) |
| 10 | Reaplicar la migración | Idempotente, sin error |

## 7. Orden de implementación

Dos migraciones, porque C-3 y C-4 tocan plata y C-1/C-2 no:

1. **Primera:** las dos columnas `*_estimada` + C-1 (horario) + C-2 (doble marca). Es el emparejado
   más inteligente, sin cambiar todavía qué se declara.
2. **Segunda:** C-3 (relleno estimado) y C-4 (falta automática con freno). Acá es donde un día deja
   de cortar la liquidación y donde aparece la falta automática — se aplica y se mira con el
   administrador antes de la primera liquidación que la use.
3. C-5 (borrar el código muerto) va con la primera, es independiente.
