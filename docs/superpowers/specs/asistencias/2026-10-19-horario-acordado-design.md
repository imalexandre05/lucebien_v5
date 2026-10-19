# SPEC — Horario acordado ese día

> Spec completa (toca la tardanza del pago y la nota de puntualidad) · sesión 8A · 19-oct-2026 · migración **0168**.
> Decisión del dueño n.º 1 (19-oct-2026). Se apoya en la ficha «Por revisar»
> ([../sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md](../sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md))
> y en la puntualidad automática (0159).

## 1. Lo que decidió el dueño

> «Dentro de su horario» se mide por **cantidad de horas**, no por reloj. A veces el administrador y la
> persona acuerdan que ese día trabaje las mismas horas en otro horario (horario 8–14, acordado 9–15):
> eso **no es tardanza** si llegó puntual a la hora acordada. Una acción más en «Por revisar»:
> «Horario acordado ese día», con la hora de inicio acordada y un motivo opcional. Sin módulo nuevo.

## 2. Qué se guarda

Dos columnas en la fila del día (`asistencias`), nulas por defecto:

- `inicio_acordado time` — la hora de inicio acordada para ese día.
- `motivo_acordado text` — opcional, hasta 300 letras.

Si el día tiene varias filas (tramos), la acción las escribe todas con el mismo valor; el día usa el
valor más alto que encuentre. La escribe el administrador por la policy de siempre (0025).

## 3. Qué cambia

Sólo **contra qué hora se mide la tardanza** de ese día: `inicio_acordado` si existe, y si no, el
inicio del horario contratado (como hoy). La tolerancia se aplica igual sobre la hora acordada.

| Lugar | Cambio |
|---|---|
| `sueldo_entrada` | cada día emite `inicioAcordado` (null si no hay). |
| Motor (`sueldos.ts`) | `limite = (inicioAcordado ?? inicio contratado) + tolerancia`. |
| Pasaje (motor) | `inicioAcordado ?? inicio contratado` − minutos de anticipación. |
| Puntualidad (`evaluacion_componentes_datos`, 0159) | `inicio_turno` = hora acordada del día si existe. |
| «Por revisar» (`diasPorRevisar`) | la tardanza se mide contra la hora acordada. |

## 4. Lo que NO cambia

- Horas trabajadas, tarifa, horas extra y faltas: nada. Sigue siendo por cantidad de horas.
- La justificación de tardanza sigue siendo aparte (llegó tarde y se perdona).
- **El pasaje** (llegar con anticipación) también se mide contra la hora acordada del día cuando existe;
  si no, contra el inicio contratado (respuesta del dueño, 19-oct-2026).
- Un snapshot guardado antes de esta migración no trae `inicioAcordado` y se lee igual que siempre.

## 5. Pantalla

En la tarjeta de un día con **tardanza** de «Por revisar», un botón «Horario acordado» junto a
«Justificar tardanza». Pide la hora de inicio y un motivo opcional. Al guardar, el día sale de la lista
si llegó puntual a la hora acordada. Frase del pago: «Con el horario acordado de las 09:00 ya no cuenta
como tardanza.»

## 6. Casos que debe cubrir la prueba

1. Contratado 08:00, acordado 09:00, llegó 08:55 → no es tardanza (motor, puntualidad y lista).
2. Contratado 08:00, acordado 09:00, llegó 09:20 (tolerancia 10) → sí es tardanza, de 20 min.
3. Sin hora acordada: todo igual que antes.
4. Acordado más temprano que el contratado (07:00) y llegó 08:00 → tardanza de 60 min.
5. El motivo largo (> 300) y la hora acordada en una fila de otra persona se rechazan.
6. Un no administrador no puede escribir la hora acordada.
7. Pasaje: contratado 09:00, acordado 10:00, llegó 09:50 (anticipación 5 min) → gana el pasaje; sin acordado no.
