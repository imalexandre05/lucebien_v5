# SPEC — F-2: Dashboard de personal

> **Zona de rigor:** nivel 2 (pantalla nueva, sólo lectura, sin escritura ni cálculo de sueldo —
> `docs/rigor-por-zona.md`).
>
> Implementa el ítem **F-2** de
> [la hoja de ruta del 25-ago](../2026-08-25-reunion-admin-hoja-de-ruta.md): *«poner una página de
> métricas de todo tipo, dashboard de personal exclusivamente»*, alimentada por **A-4**: *«poder
> ver si esa persona es puntual o es buena con ventas y ver dónde flaquea […] y con eso tomar
> decisiones, como darles cursos etc y retener a los empleados»*.

## 1. Qué NO es esta pantalla

`/personal` ya existe y ya muestra, por persona, la nota del período y un hilo de pendientes
(asistencia/evaluación/pago/contrato) — es el hub operativo, «¿qué falta hacer con esta persona?».

F-2 contesta una pregunta distinta y **comparativa**: «¿de dónde sale la nota de cada uno, y quién
flaquea en qué?». No repite el hilo de pendientes ni agrega ninguna acción — es sólo lectura.

## 2. De dónde sale el dato (verificado contra el código, no contra otra spec)

No existe hoy ninguna función que traiga el desglose de puntos de todos los empleados a la vez —
`componentesEvaluacion(empleadoId, desde, hasta)` (`apps/erp-web/lib/evaluaciones-repo.ts:134`)
llama a la RPC `evaluacion_componentes` de a **un** empleado por vez. Para el dashboard se llama en
paralelo (`Promise.all`) para los activos — con 18-24 personas es una página admin, no un endpoint
de tráfico alto, así que el costo es aceptable y no justifica una RPC nueva agregada en la base.

Cada persona usa **su propio ciclo** (`calcularCiclo(fechaIngreso, hoyPeru())`, el mismo que usan
`/evaluaciones` y `/personal/[id]/evaluacion`), no el mes calendario de `/mi-desempeño` — la nota
que se muestra acá tiene que ser la misma que se usaría para pagar, no una aproximación de otro
período.

La RPC **no** devuelve `competencias` ni `examenes` (son manuales, sin fuente automática — mismo
comentario que ya deja `app/evaluaciones/actions.ts:29`). Este dashboard no los muestra: mostrar
dos columnas en blanco para todo el mundo sería peor que no mostrarlas — es el mismo criterio que
ya usa `/mi-desempeño` al omitir `PerfilComponentes` cuando no hay `componentes` guardado.

## 3. Qué muestra

Una tabla, una fila por empleado activo, ordenada por nota ascendente (quien está peor, primero —
es la pregunta operativa real: ¿a quién miro hoy?):

| Columna | De dónde sale |
|---|---|
| Nombre · sede · rol | `listarColaboradores()` |
| Nota /20 · banda | `notaDesdePuntos(componentes.puntosTotal, escala)` — mismas 5 claves de config que ya usa `/evaluaciones`, vía `leerEscalaPuntos()` |
| Pipeline | `componentes.puntosPipeline` |
| Actividades | `componentes.puntosActividades ?? 0` |
| Ventas | `componentes.puntosVentas ?? 0` |
| Extras | `componentes.extrasPuntos` |
| Descuento | `componentes.descuento` (incidencias) |

Fila sin ciclo con datos (nadie tocó nada este período: pipeline=0, extras=0, actividades=0,
ventas=0, descuento=0) se marca «sin actividad este período» en vez de mostrar nota 0 como si fuera
un mal desempeño — mismo espíritu que la escala sin calibrar ya documentado en
`docs/pendientes-negocio.md` («la nota por puntos no se puede leer como un juicio sobre nadie»
mientras la escala siga con los defaults del ejemplo). Este aviso no oculta la fila: la muestra con
los números en cero y la aclaración al lado, para que quede la misma decisión que tomó el
administrador el 25-ago (no calibrar a ciegas) — no una nueva.

## 4. Dónde vive y quién la ve

`/personal/dashboard`, como una «herramienta del período» más en el hub `/personal`
(`app/personal/page.tsx:46`, arreglo `HERRAMIENTAS`) — mismo gate `admin` que Liquidar el período y
Adelantos, porque cruza nota y sueldo de todo el equipo. Reautenticación heredada de `/personal`
(no se pide de nuevo: es la misma sesión, mismo criterio que ya aplican las sub-pantallas de
`/sueldos/*`).

## 5. Qué pasa cuando algo falla

Si `notaDesdePuntos` lanza (escala de config rota — ver el `throw` explícito en
`packages/core/src/evaluaciones.ts:205`), la fila de esa persona muestra «No se pudo calcular» en
vez de tirar abajo la pantalla entera: un dato de configuración roto para una persona no debe
esconder la nota de las otras 17.
