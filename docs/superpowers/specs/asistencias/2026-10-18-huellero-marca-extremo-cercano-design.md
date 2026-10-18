# SPEC — Cada marca va a la entrada o salida más cercana; lo que falta queda «Pendiente de resolver»

> Sesión 7 · 18-oct-2026 · decisión del dueño n.º 3 · migración **0163** · **zona crítica**
> (la asistencia es la base del pago por horas).
>
> Enmienda a [2026-08-25-huellero-decide-por-horario-design.md](2026-08-25-huellero-decide-por-horario-design.md)
> §3 C-1 y C-3. Lo demás de esa spec (C-2 doble marca, C-4 falta automática con freno) no cambia.

## Decisión del dueño (18-oct-2026)

> «HUELLERO, BUG DE MARCAS. Si entra 8:00 y sale 14:00 pero solo marcó 14:05, hoy esa marca queda
> como ENTRADA (mal). Regla: cada marca se asigna a la entrada o salida del horario más cercana; la
> que falte queda «Pendiente de resolver».»

## 1. Por qué pasa hoy (verificado contra 0096/0097, no contra otro documento)

`huellero_derivar_asistencia` (0097) ya intenta decidir una marca suelta con el horario, pero:

1. **Compara sólo contra el inicio más temprano y el fin más tardío del día** (`min(hora_inicio)`,
   `max(hora_fin)`). Con dos turnos (p. ej. 08:00–14:00 y 16:00–21:00) una marca de 14:05 queda
   más cerca de 08:00 (6 h 05) que de 21:00 (6 h 55) y se guarda como **entrada**. Lo mismo con la
   vuelta de la tarde: una marca de 15:00 sin salida queda como salida.
2. **Un día derivado antes de que existiera el horario no se vuelve a leer.** Sin horario la marca
   suelta queda como entrada; cargar el contrato después no cambia esa fila. Y aunque se volviera a
   derivar, la REGLA 2 de la 0079 («nunca dejar en null una hora cargada») mantendría la entrada
   mal puesta y la fila no se corregiría.
3. **C-3 (0097) completa el lado que falta con la hora del horario** y da el día por trabajado. Con
   pago por horas reales (decisión n.º 1) eso paga horas que nadie marcó.

## 2. La regla nueva

**R1 — Extremo más cercano entre todos los turnos del día.** El horario de ese día es la lista de
turnos de `sueldo_acuerdo_turnos` del contrato vigente. Cada turno aporta dos extremos: su inicio
(entrada) y su fin (salida). Cuando un tramo queda con **una sola marca**, la marca va al extremo
más cercano de toda la lista: si es un fin, es **salida**; si es un inicio, es **entrada**. Empate:
entrada (como hoy). Los tramos con dos marcas no cambian: el emparejado de la 0079/0096 (doble toque,
pausa mínima) sigue igual.

**R2 — Lo que falta queda «Pendiente de resolver».** Ya no se completa con la hora del horario. La
fila queda en `condicion = 'sin_dato'`, con la hora que sí se marcó y la otra vacía, y en `obs`:
`pendiente: falta la hora de entrada` o `pendiente: falta la hora de salida`. La pantalla lo
muestra como **«Pendiente de resolver»** y el administrador lo resuelve con un clic (decisión n.º 4).
Sin horario contratado la marca suelta queda como entrada y también pendiente (no hay contra qué
decidir).

**R3 — Una hora puesta por la máquina se puede mover al otro lado.** La REGLA 2 de la 0079 sigue:
ninguna escritura deja en null una hora real. Única excepción, acotada: si la hora vieja la puso el
huellero (`huellero_puso_* = true`) y esta pasada la coloca **en el otro lado** (la misma marca pasó
de entrada a salida o al revés), el lado viejo se vacía. No se pierde ningún dato: la marca sigue en
la fila, del lado correcto. Una hora escrita por una persona nunca se toca (0084).

**R4 — Volver a leer las marcas.** RPC nueva `huellero_rederivar(p_empleado uuid, p_desde date,
p_hasta date) → int`: vuelve a derivar cada día con marcas de ese rango. Sólo administrador. Salta
los días que caen en un pago ya cerrado (`private.sueldo_estado_fecha(...)->>'estado' = 'cerrado'`)
— lo pagado no cambia. Rango máximo 400 días (default inventado, sólo protege de un rango absurdo).
La app la llama sola al guardar el horario de un contrato, desde el inicio del contrato hasta hoy
(hora Perú) o su fin si es antes.

## 3. Qué no cambia (regresión)

- Filas ya escritas: nada se re-deriva al aplicar la migración. Sólo cambia lo que se derive desde
  entonces, o lo que el administrador vuelva a leer (R4), y nunca dentro de un pago cerrado.
- Días que ya tenían una hora estimada por C-3: conservan la hora y su bandera `*_estimada` hasta que
  alguien los revise; la lista «Por revisar» (decisión n.º 4) los muestra como días con problema.
- Liquidaciones cerradas y contratos: intactos.
- C-2 (doble toque), C-4 (`huellero_declarar_faltas_del_dia`), salvaguarda de falta declarada y de
  horas humanas: intactos.

## 4. Casos de prueba (`packages/db/pruebas/0163_huellero_marca_extremo_cercano.prueba.sql`)

| # | Horario | Marcas | Esperado |
|---|---|---|---|
| 1 | 08:00–14:00 | 14:05 | salida 14:05, entrada vacía, `sin_dato`, obs «pendiente: falta la hora de entrada» |
| 2 | 08:00–14:00 y 16:00–21:00 | 14:05 | salida 14:05 (antes quedaba entrada) |
| 3 | 08:00–14:00 y 16:00–21:00 | 08:00, 14:00, 16:02 | tramo 1 completo `trabajado`; tramo 2 entrada 16:02 pendiente |
| 4 | 08:00–14:00 | 08:03 | entrada 08:03, salida vacía, pendiente (antes: salida estimada 14:00 y `trabajado`) |
| 5 | 08:00–14:00 | 08:00, 14:01 | `trabajado` 08:00–14:01, sin bandera estimada |
| 6 | sin horario | 14:05 | entrada 14:05, pendiente |
| 7 | (fila derivada sin horario: entrada 14:05 de la máquina) + se carga 08:00–14:00 + `huellero_rederivar` | — | salida 14:05, entrada vacía |
| 8 | Igual que 7 pero la entrada 14:05 la escribió una persona | — | no se toca |
| 9 | Día dentro de un pago cerrado | — | `huellero_rederivar` lo salta |
| 10 | No administrador llama `huellero_rederivar` | — | error de permiso; `anon` sin `execute` |

## 5. Defaults inventados

- Tope de `huellero_rederivar`: 400 días. No es regla de negocio (es una protección técnica); se
  anota igual en `docs/pendientes-negocio.md`.

## 6. Ajustes del verificador (18-oct-2026)

- **R4 espera a un cierre en curso.** Antes de mirar si un día está cerrado, `huellero_rederivar` toma
  `for share` sobre los borradores de esa persona que cubren el día (mismo patrón que la 0144): si un
  cierre está corriendo, espera a que termine y recién entonces decide.
- **Texto viejo en `obs`.** Cuando la bandera final `*_estimada` queda en false, la derivación borra
  también el aviso «estimado: no marcó la …» que hubiera dejado la 0097 en esa fila.
- Caso de prueba 11: fila heredada de la 0097 (salida estimada) que R3 corrige → `obs` sin «estimado».
