# SPEC — Ficha única del colaborador y asistencia «Por revisar»

> Spec completa (toca lo que entra al pago) · sesión 7 · 18-oct-2026 · migración **0165**.
> Decisiones del dueño n.º 5 y n.º 4 (18-oct-2026). Se apoya en
> [2026-10-18-pagos-programados-cierre-un-paso-design.md](2026-10-18-pagos-programados-cierre-un-paso-design.md)
> y en [../asistencias/2026-10-18-huellero-marca-extremo-cercano-design.md](../asistencias/2026-10-18-huellero-marca-extremo-cercano-design.md).

## 1. Lo que decidió el dueño (18-oct-2026)

> **5. FICHA ÚNICA DEL COLABORADOR (/personal/[id]).** «Todo se hace ahí mismo sin redirigir:
> asistencia, adelantos, ventas/metas, evaluación, liquidación y pago, con la configuración de esa
> persona. El período elegido arriba filtra TODO (la asistencia muestra solo ese período, no el
> contrato entero). Se mantienen también los accesos generales de Personal (p. ej. «Liquidaciones de
> todos»).»
>
> **4. RESOLVER ASISTENCIA FÁCIL Y VISUAL.** «Los días con huella completa y sin problema se dan por
> trabajados solos. Solo se piden los días con problema (sin marca, una sola marca, tardanza, falta)
> en una lista «Por revisar» muy resaltada, con acciones de un clic: «Poner hora de entrada/salida»,
> «Justificar tardanza (motivo)», «Es falta», «Justificar falta». Botón «Todo bien» para el resto.
> Explica en pantalla con frases simples qué pasa con el pago en cada caso.»

## 2. Lo que hay hoy (verificado)

- La pestaña Asistencia de la ficha reusa `/sueldos/asistencia` y muestra **el contrato entero**,
  no el período elegido arriba (lo dice su propio comentario).
- Liquidar y cerrar se hacía en `/sueldos/liquidaciones` (resuelto por la spec de pagos programados).
- Ventas/metas sólo existen en `/sueldos/ventas` (las trae la spec de ventas rápidas, decisión n.º 8).
- Un día del huellero con las dos marcas ya queda `trabajado` solo; uno con una marca queda
  `sin_dato` «Pendiente de resolver» (0163).

## 3. Ficha única

- Todas las pestañas (Resumen, Asistencia, Adelantos y descuentos, Ventas y metas, Evaluación, Pago,
  Contrato, Datos, Valores) leen el período de la barra de arriba y muestran **sólo ese período**.
- La Asistencia muestra los días del período que caen dentro del contrato (intersección). Si el
  período se sale del contrato, una frase lo dice: «Del 01 al 04 no tiene contrato».
- Nada de lo que se hace en la ficha manda a otra pantalla; los enlaces a `/sueldos/…` dentro de la
  ficha se reemplazan por la pestaña que corresponde. El comprobante imprimible sigue abriéndose
  aparte (es para imprimir).
- **«Su configuración»**: una tarjeta corta en Resumen con lo que se aplica a esta persona en este
  contrato (tarifa por hora, horario de la semana, tolerancia de tardanza, tardanzas libres, descuento
  por tardanza, factor de hora extra, meta semanal), con «Cambiar» que abre la pestaña Contrato.
- Personal conserva sus accesos generales («Liquidaciones de todos», asistencia de todos, etc.).

## 4. Asistencia «Por revisar»

`diasPorRevisar(entrada)` en el core (puro, recibe `hoy` en hora Perú, no llama `new Date()`):
recorre los días del rango con horario contratado hasta hoy, más los días con filas, y devuelve los
que tienen problema, con un tipo y los datos para la frase:

| Tipo | Cuándo | Acciones (un clic) | Frase sobre el pago |
|---|---|---|---|
| `sin_marca` | día con horario, ya pasó, sin filas o sólo filas sin horas | «Poner hora de entrada y salida», «Es falta», «Justificar falta» | «Sin resolver, este pago no se puede cerrar.» |
| `una_marca` | alguna fila `sin_dato` con una sola hora | «Poner hora de salida» (o de entrada) | «Hasta poner la hora que falta, este día no se paga y el pago no se puede cerrar.» |
| `tardanza` | `trabajado` y la primera entrada pasa el inicio + tolerancia, sin justificar | «Justificar tardanza (motivo)», «Está bien» | «Llegó N min tarde. Tiene T tardanzas libres; desde la siguiente se descuentan S/ P cada una. Justificada, no cuenta.» |
| `falta` | `falta` sin justificar | «Justificar falta (motivo)», «Está bien» | «Ese día no se paga y se descuenta D día(s) más. Justificada, sólo no se paga el día.» |
| `hora_estimada` | alguna hora puesta por el sistema (C-3, antes de la 0163) | «Poner la hora real», «Está bien» | «Esta hora la puso el sistema, no una marca. Revísala antes de pagar.» |

- Los días sin problema no aparecen: se dan por trabajados.
- **«Está bien»** y **«Todo bien»** (para todos los que quedan de tipo `tardanza`, `falta` u
  `hora_estimada`) marcan el día como revisado: deja de aparecer y **el pago no cambia** (la
  tardanza se cuenta, la falta se descuenta, la hora estimada se paga). Los tipos `sin_marca` y
  `una_marca` nunca se cierran con «Todo bien»: necesitan un dato.
- Las acciones escriben con `declararDia` (la misma puerta de hoy, que baja los sellos del huellero).
  «Es falta» = `condicion 'falta'` sin horas. «Justificar falta/tardanza» pide el motivo (obligatorio,
  3 a 300 letras: default inventado).
- La lista va arriba, con borde dorado y un contador («3 días por revisar»). Debajo, el calendario
  compacto del período (de un vistazo, cada día con su color) y, plegado, el editor completo de hoy
  para casos raros (días con varios tramos).

## 5. Datos (migración 0165)

- `asistencias.revisada_en timestamptz null` y `asistencias.revisada_por uuid null` (referencia a
  `empleados`). Las escribe el administrador por la policy `asist_admin_write` de siempre. No cambian
  ningún cálculo: `sueldo_entrada` no las lee.
- Una escritura del huellero que cambia una hora del día vuelve a poner `revisada_en` en null (el
  dato cambió, hay que mirarlo de nuevo): trigger `before update` que compara horas y condición.

## 6. Qué no cambia

El motor, `sueldo_entrada`, el cierre, las reglas de tardanza y falta. «Todo bien» no inventa ningún
dato.

## 7. Tests (antes del código)

1. `diasPorRevisar`: día completo sin tardanza → no aparece; sin filas → `sin_marca`; una marca →
   `una_marca`; tardanza de 15 min con tolerancia 10 → `tardanza` con minutos 15; tardanza justificada
   → no aparece; falta → `falta`; falta justificada → no aparece; hora estimada → `hora_estimada`;
   día revisado (`revisadaEn`) de tipo tardanza/falta/estimada → no aparece; revisado de tipo
   `sin_marca` → aparece igual; días futuros → no aparecen; día sin horario sin filas → no aparece.
2. SQL 0165: las columnas existen; el admin marca revisado; un no admin no puede; un cambio de hora
   del huellero vuelve `revisada_en` a null; cambiar sólo `obs` no lo toca.

## 8. Defaults inventados

- Motivo de justificación: 3 a 300 letras.
- «Todo bien» deja de mostrar el día pero no cambia el pago.
