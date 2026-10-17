# Exámenes: software, escritos online y presencial de habilidades

Ticket: lucebien-tablero #12 · Zona crítica (alimenta la nota → pago) · Migración 0138

## Qué pide el cliente
- **Software**: examen del sistema por la plataforma; la nota se sube sola.
- **Escritos online**: conocimientos de las capacitaciones (medidas, cuadernillos, confección, software); nota automática.
- **Presencial de habilidades**: planchado, costura, etc. El evaluador pone una nota a cada habilidad de una lista creada antes.

## Enganche con lo que ya existe (sin tocar la cadena del sueldo)
La evaluación (0132) ya toma `examenes` = promedio de la **nota vigente** (la última fila de
`capacitacion_examenes`, por fecha y `created_at`) de las capacitaciones completadas del ciclo. Los
tres exámenes nuevos **no cambian esa RPC**: cada vez que se califica algo, la base inserta una fila
nueva «Examen integral» en `capacitacion_examenes` con la nota consolidada. Esa fila es la última, así
que es la vigente; el cierre de la capacitación (0131) y la evaluación (0132) la leen como cualquier
examen manual. Los exámenes manuales siguen funcionando.

## Reglas
1. **Banco de preguntas** (`examen_preguntas`): tipo `software` o `escrito`, tema libre (medidas,
   cuadernillos, confección, software…), enunciado, 2–6 opciones y la correcta. Solo el administrador
   lo lee y lo edita; **la respuesta correcta nunca sale de la base hacia quien rinde**.
2. **Rendir** (solo la persona nueva, sobre su capacitación en curso): `examen_iniciar(cap, tipo)`
   arma un intento con N preguntas al azar del banco activo (N = `examen_preguntas_por_intento`) y
   devuelve enunciados y opciones sin la clave. Si ya hay un intento sin terminar, lo retoma.
   `examen_responder(intento, respuestas)` califica en la base: nota = 20 × aciertos / total, con 2
   decimales. Un intento se califica una sola vez. Devuelve nota y aciertos, no cuáles fallaron.
3. **Intentos** máximos por tipo y capacitación: `examen_intentos_max`. Cuenta la **última** nota
   (misma regla de «nota vigente» que el resto).
4. **Presencial** (`examen_habilidades` + `examen_presencial_notas`): lista de habilidades editable
   por el administrador. El capacitador o el administrador —nunca la persona evaluada— califica cada
   habilidad de 0 a 20 con `examen_presencial_calificar(cap, notas)`. Cuenta cuando **todas** las
   habilidades activas tienen nota; la nota presencial es su promedio.
5. **Consolidación** (`private.examen_consolidar`): promedio ponderado de lo que haya entre
   software, escrito, presencial **y el último examen manual** (el que carga el capacitador con
   `capacitacion_examen`; así un examen online no puede tapar una nota manual más baja), con pesos
   `examen_peso_software`, `examen_peso_escrito`, `examen_peso_presencial`, `examen_peso_manual`.
   `capacitacion_examen` también consolida al registrar. Lo que no se rindió no entra; si no hay nada, no
   inserta. Redondea a 2 decimales.
6. **Solo con la capacitación en curso**: cerrada o cancelada no admite intentos ni notas.
7. **Aislamiento**: intentos y notas presenciales los lee el administrador, el capacitador de esa
   capacitación y la propia persona nueva (hereda `cap_select`). Nadie escribe directo: todo por RPC.
8. **Pantalla** `/capacitacion/examenes` (administrador): banco de preguntas y lista de habilidades.
   `/capacitacion/examen/[id]`: la persona nueva rinde; el capacitador califica el presencial y ve
   las notas.

## Defaults inventados (anotados en `docs/pendientes-negocio.md`, editables en /configuracion)
`examen_preguntas_por_intento`=10 · `examen_intentos_max`=3 · pesos 1/1/1/1 (promedio simple) · habilidades
iniciales «Planchado» y «Costura» · sin límite de tiempo por intento · el banco empieza vacío.

## Pruebas (packages/db/pruebas/0138_examenes.prueba.sql)
1. La persona nueva no lee el banco ni la clave; sí recibe preguntas sin clave por `examen_iniciar`.
2. Calificación: todo correcto = 20; mitad = 10; todo mal = 0; un intento no se califica dos veces.
3. Consolidación: inserta «Examen integral» y la nota vigente de la capacitación pasa a ser esa.
4. Ponderación: pesos 2/1 dan el promedio ponderado; sin tipos rendidos no inserta.
5. Intentos: el máximo corta; reintento reemplaza la nota vigente del tipo.
6. Presencial: la persona evaluada no puede calificarse; el capacitador sí; con habilidades pendientes no cuenta.
7. Solo en curso: cerrada rechaza.
8. Terceros: otra persona (ni nueva, ni capacitador, ni admin) no inicia, responde ni lee intentos.
9. La evaluación (0132) toma la nota consolidada cuando la capacitación se completa.
10. Permisos: anon sin execute; solo admin edita banco y habilidades. Reaplicar es inocuo.

## Corrección tras la revisión adversarial
11. Un examen manual de 6 y un software online de 20 dan un integral de 13 (no 20); y registrar un
    manual después de los online vuelve a consolidar con todo.
