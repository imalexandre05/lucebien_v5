# SPEC — Los puntos son la moneda; la nota /20 pasa a ser una lectura de esos puntos

> **Qué es.** El cambio que el administrador subrayó en la reunión del 25-ago-2026: todo el trabajo
> —pipeline, actividades, extras— **da puntos**, y la nota mensual deja de ser un promedio ponderado
> de siete componentes para pasar a ser una **lectura visual de los puntos acumulados**, sin techo en
> 20.
>
> **De dónde sale.** Textual, y es la única parte de la reunión que Alexander subrayó aparte:
>
> > *«todas las actividades, pipeline, etc, dan puntos, eso es importante, porque en la evaluación
> > una cierta cantidad de puntos aún no definida (por ejemplo: 5000) significará el promedio, y
> > tendrá por ejemplo la nota de "16" y luego veremos cuántos puntos debe llegar para tener 20 de
> > nota (que es excelente o perfección) si pasa de ese promedio o incluso más de la nota de 20
> > (haciendo actividades extras, etc) es alguien sobresaliente y se evalúa poder mejorar sus
> > condiciones laborales o línea de carrera»*
>
> Más, de las mismas notas: *«los componentes dan los puntos, no lo demás»* · *«el 1/20 que quede
> como visual no como ponderado»* · *«>18 ideal y perfección»* · *«>20 persona sobresaliente»* ·
> *«<13 riesgo de despido»* · *«poder ver si esa persona es puntual o es buena con ventas y ver dónde
> flaquea»*.
>
> **Zona de rigor: spec completa.** Es la cadena del sueldo (no-negociable 1). La nota alimenta hoy
> `sugerirMontoPago()`, y cambiar su techo cambia plata — ver §5, que es la parte más delicada de
> este documento.

---

## 1. Lo que hay hoy, verificado contra el código

| Pieza | Dónde | Qué hace |
|---|---|---|
| `calcularNotaMensual(c, p)` | `packages/core/src/evaluaciones.ts:79-88` | `Σ(componente × peso) − descuentoIncidencias + bonusVentas` |
| Los 7 componentes | `evaluaciones.ts:5-12` | `competencias, valores, operaciones, software, limpieza, examenes, tardanza` |
| Los 7 pesos | `config-catalogo.ts:103-109` | 0.25 / 0.25 / 0.10 / 0.10 / 0.10 / 0.15 / 0.05 — suman 1,00 |
| El RPC que arma los componentes | `private.evaluacion_componentes_datos()`, versión viva en `0091_evaluacion_equipo_y_puntualidad.sql:55` | Devuelve los componentes, `puntosPipeline`, `extrasPuntos`, `descuento` y `bonusVentas` |
| `evaluaciones_mensuales` | `0001_init.sql:201-210` + `0027:5` | `nota_final`, `componentes` (jsonb), `pesos_usados` (jsonb), `ciclo_desde/hasta` |

**Las tres cosas que hacen que este cambio sea más chico de lo que parece:**

1. **Ya no hay techo en 20 en ninguna parte.** Verificado: ni `Math.min` en `calcularNotaMensual`,
   ni en el RPC, ni en las pantallas, ni en la columna (`numeric(5,2)` admite hasta 999,99). La
   nota «sobresaliente» que pide el administrador es mecánicamente posible hoy.
2. **Tres de las cuatro fuentes de puntos ya existen y ya llegan a la evaluación.**
   `pipeline_puntos` (una fila por avance de prenda, con los 10 `pts_*` de
   `config-catalogo.ts:91-100`), `reporte_extras.puntos_total` (columna generada
   `peso_unitario × cantidad`, `0053:41-43`) y `incidencias.puntos_penalidad`. El RPC ya las
   devuelve — lo que falta no es calcularlas, es **usarlas para la nota** en vez de mostrarlas al
   costado. Hoy `extrasPuntos` viaja hasta la pantalla con la etiqueta literal *«No entran a la
   fórmula»* (`evaluaciones/cliente.tsx:452`).
3. **`evaluaciones_mensuales` ya guarda el desglose completo** (`componentes` jsonb) además de la
   nota, así que las evaluaciones viejas se pueden seguir mostrando tal como se calcularon sin
   depender de que la fórmula siga existiendo.

---

## 2. El diseño

### C-1 — Qué da puntos, y qué no

El administrador fue preciso: *«los componentes dan los puntos, no lo demás»*. Lo que produce puntos
es **trabajo hecho y medible**; lo que es **juicio de una persona sobre otra** no se convierte en
moneda.

| Fuente | ¿Da puntos? | De dónde salen | Estado |
|---|---|---|---|
| **Pipeline** (avance de prendas) | **Sí** | `pipeline_puntos.puntos`, ya escrito por `pipeline_avanzar()` con los 10 `pts_*` | Ya existe, sólo se empieza a contar |
| **Extras del reporte** | **Sí** | `reporte_extras.puntos_total` (columna generada) | Ya existe; deja de ser «informativo» |
| **Actividades del reporte** (limpieza, software, operaciones) | **Sí** | `calificacion` (0 a 1) × `pts_actividad_cumplida` | 🆕 parámetro nuevo, default provisional 1 |
| **Incidencias** | **Sí, en contra** | `incidencias.puntos_penalidad`, se resta | Ya existe |
| **Ventas** | **Sí, cuando se defina cuánto** | `sueldo_ventas.monto` × `pts_por_sol_vendido` | 🔴 **parámetro vacío a propósito** — ver §4 |
| **Valores 360°** | **No** | — | Es opinión de compañeros: sigue siendo **perfil**, no moneda |
| **Competencias** | **No** | — | Es juicio del jefe en vivo: **perfil** |
| **Exámenes** | **No** | — | **Perfil**. Además hoy no tiene ninguna fuente automática |

**Puntos del período** = pipeline + extras + actividades + ventas − incidencias.

### C-2 — De puntos a nota: dos anclas y una recta quebrada

El administrador dio tres puntos de la curva: *«5000 significará el promedio... la nota de 16»*,
*«7500... para tener 20»*, *«si pasa 7500 es mayor todavía»*. Con eso alcanza para una recta
quebrada, con el codo en el promedio:

```
                    puntos ≤ promedio:   nota = puntos / puntosPromedio × notaPromedio
                    puntos > promedio:   nota = notaPromedio
                                              + (puntos − puntosPromedio)
                                              × (20 − notaPromedio) / (puntosExcelente − puntosPromedio)
```

Con los defaults (5000 → 16, 7500 → 20):

| Puntos | Nota | Lectura |
|---|---|---|
| 0 | 0,00 | No hizo nada. La recta arranca en cero, no en un piso inventado |
| 2.500 | 8,00 | |
| 4.000 | 12,80 | |
| **5.000** | **16,00** | El promedio que dio el administrador |
| 6.250 | 18,00 | Entra en «ideal» |
| **7.500** | **20,00** | «excelente o perfección» |
| 9.000 | **22,40** | **Sobresaliente — sin techo, es lo que pidió** |

**Por qué quebrada y no una sola recta.** Una recta de 0 a 7500 daría 13,3 en el promedio, no 16.
Dos anclas exigen dos pendientes. Y el resultado tiene sentido de negocio: llegar al promedio cuesta
0,0032 de nota por punto; de ahí a la perfección, la mitad — **el último tramo cuesta el doble de
esfuerzo por punto**, que es exactamente lo que uno espera de «perfección».

### C-3 — Las bandas

| Banda | Rango | Palabra del administrador |
|---|---|---|
| **Riesgo** | < 13 | *«riesgo de despido»* |
| **En desarrollo** | 13 a 18 | (sin nombre propio en las notas — es el resto) |
| **Ideal** | 18 a 20 | *«>18 ideal y perfección»* |
| **Sobresaliente** | > 20 | *«persona sobresaliente... se evalúa poder mejorar sus condiciones laborales o línea de carrera»* |

Los dos cortes (13 y 18) van a `config`, editables. La banda se muestra como etiqueta junto a la
nota, en todas las pantallas que hoy muestran un tramo.

### C-4 — Los 7 componentes dejan de ser la fórmula y pasan a ser el perfil

Es la otra mitad de lo que pidió: *«poder ver si esa persona es puntual o es buena con ventas y ver
dónde flaquea; tal vez es buena en limpieza y puntual pero no venda»*.

Los siete componentes **se siguen calculando exactamente igual que hoy** —el RPC no cambia en eso—
pero ya no se suman ponderados. Se muestran como un perfil: siete barras /20 que dicen en qué es
fuerte y en qué flojea, al lado de la nota (que ahora sale de los puntos).

**Consecuencia que cierra un pendiente abierto:** los siete `peso_*` dejan de decidir la nota. Con
eso, la «decisión 14» de `docs/pendientes-negocio.md` —qué hacer si los pesos no suman 100 %— **se
cierra sola**: ya no importa cuánto sumen, porque ya no multiplican nada. Los pesos quedan
guardados en `pesos_usados` de las evaluaciones viejas, para poder seguir explicando cómo se
calculó cada una de ellas.

### C-5 — Las evaluaciones ya guardadas no cambian nunca

`evaluaciones_mensuales` suma dos columnas:

- `metodo text not null default 'ponderado'` — las filas que ya existen quedan en `'ponderado'`;
  las nuevas se guardan como `'puntos'`.
- `puntos_total numeric` — nulo en las viejas, el total del período en las nuevas.

Las pantallas leen `metodo` para saber qué explicación mostrar. Una evaluación de julio calculada
con pesos sigue mostrando su nota y sus pesos; una de septiembre muestra sus puntos. **Ninguna nota
ya emitida se recalcula** — mismo criterio que el congelado de las liquidaciones.

---

## 3. 🔴 Lo más delicado: la nota sin techo toca plata

Esto no estaba en las notas de la reunión. Salió de verificar el código antes de diseñar, y es la
razón por la que esta spec es completa y no corta.

**`sugerirMontoPago(salarioBase, notaFinal, bonus, descuentos)`**
(`packages/core/src/pagos.ts:12-22`) calcula:

```
monto = salarioBase × (notaFinal / 20) + bonus − descuentos
```

**sin ningún techo** (sólo piso en 0). Está viva: la usa `/pagos`
(`apps/erp-web/app/pagos/cliente.tsx:94,99`) para pre-llenar cuánto pagarle a alguien.

Con la nota actual, tope 20 de hecho, ese factor nunca pasa de 1. **Con la nota nueva, una persona
sobresaliente con 9.000 puntos daría factor 1,12 — y la pantalla sugeriría pagarle 12 % más que su
sueldo, sin que nadie lo haya decidido.**

**Decisión (interpretación mía, para confirmar con el administrador — ver §6):** el factor se
**limita a 1,00**. La nota puede pasar de 20 para *leerse*; no multiplica el sueldo sola.

Los dos motivos:
1. El administrador dijo qué pasa con un sobresaliente, y no es un aumento automático: *«se evalúa
   poder mejorar sus condiciones laborales o línea de carrera»*. **Se evalúa** es una conversación,
   no una fórmula.
2. Un aumento que aparece solo en una pantalla de pago, derivado de un parámetro de puntos que
   todavía es provisional, es exactamente la clase de cosa que este repo ya aprendió a no dejar
   pasar en silencio.

El cambio es una línea en `pagos.ts` **más su test**, y va con un comentario que explica que el
techo es deliberado y de dónde salió.

---

## 4. 🔴 La pregunta que bloquea a media empresa: cuánto vale una venta

Textual: *«considerar que a veces hay personas que no hacen pipeline y solo ventas, tenemos que ver
cómo equiparar; si planchar 100 prendas vale 1000, ¿cuánto vale una venta?»*.

**El problema es real y es grave.** Con los puntos como moneda, quien no toca el pipeline no acumula
casi nada — y su nota sería baja aunque venda perfecto. Hoy eso no pasa porque la nota es un
promedio de componentes donde el pipeline pesa poco.

**No se inventa el número.** Poner una tasa cualquiera decidiría, en silencio, cuánto vale el
trabajo de las personas de ventas frente al de almacén. Eso es una decisión del administrador y de
nadie más (no-negociable 5).

**Qué hace el sistema mientras tanto**, que es lo único que se construye ahora:
- Se crea la clave `pts_por_sol_vendido` **vacía**, en `/configuracion` → Evaluación mensual.
- Con la clave vacía, las ventas suman **0 puntos** y **la pantalla lo dice con todas las letras**:
  *«Las ventas todavía no suman puntos: falta definir cuántos puntos vale un sol vendido»*, con
  enlace al parámetro.
- **La nota de quien tiene ventas en el período y la tasa sin definir se marca como incompleta**, y
  no se puede guardar la evaluación sin que el administrador lo vea. Es preferible frenar a emitir
  una nota que dice que alguien rindió mal cuando en realidad vendió y el sistema no lo contó.

Media ancla ya la dio él (*«planchar 100 prendas vale 1000»* → 10 puntos por prenda planchada, que
además no coincide con el `pts_planchado = 3` que hay hoy en config — otra cosa a confirmar).

---

## 5. Los parámetros nuevos

Todos van a `apps/erp-web/lib/config-catalogo.ts`, sección «Evaluación mensual», editables desde
`/configuracion`, y **todos se anotan en `docs/pendientes-negocio.md` como provisionales**
(no-negociable 5).

| Clave | Default | De dónde sale ese default |
|---|---|---|
| `eval_puntos_promedio` | `5000` | El ejemplo textual del administrador, que él mismo marcó como *«aún no definida (por ejemplo: 5000)»* |
| `eval_nota_promedio` | `16` | Ídem |
| `eval_puntos_excelente` | `7500` | Ídem |
| `eval_banda_riesgo` | `13` | *«<13 riesgo de despido»* |
| `eval_banda_ideal` | `18` | *«>18 ideal»* |
| `pts_actividad_cumplida` | `1` | **Elegido por mí**, el más chico que hace que una actividad cuente algo. Ver la nota de abajo |
| `pts_por_sol_vendido` | **vacío** | 🔴 No se inventa. Ver §4 |

**Sobre `pts_actividad_cumplida = 1`:** el administrador dijo que las actividades dan puntos, pero
no cuántos. Un default de 1 punto por actividad cumplida (proporcional a su calificación: media
calificación, medio punto) es el número más conservador posible — hace que cuenten, sin inflar la
nota de nadie. Un turno con 12 actividades bien hechas suma 12 puntos; contra los 5.000 del promedio
mensual, es deliberadamente poco. **Está pensado para que el administrador lo suba a lo que él
considere justo**, no para quedarse así.

---

## 6. Lo que esta spec NO hace

- **No** cambia cómo se calcula ninguno de los siete componentes: el RPC de la `0091` sigue igual
  en esa parte.
- **No** toca los 10 `pts_*` del pipeline ni el catálogo de extras.
- **No** recalcula ninguna evaluación ya guardada.
- **No** convierte los puntos en dinero. El administrador dijo *«esos puntos son lo que dan dinero
  en algún punto»* — **en algún punto**, no ahora. Cuando llegue, será su propia spec y su propia
  conversación.
- **No** decide qué pasa con alguien que cae en «riesgo». La banda es información; qué se hace con
  ella es del administrador.

## 7. Casos de prueba

**En `packages/core/src/evaluaciones.test.ts`** (`notaDesdePuntos`):

| # | Puntos | Nota esperada | Banda |
|---|---|---|---|
| 1 | 0 | 0,00 | riesgo |
| 2 | 5.000 (el promedio exacto) | 16,00 | en desarrollo |
| 3 | 7.500 (el excelente exacto) | 20,00 | ideal |
| 4 | 9.000 | 22,40 | **sobresaliente** |
| 5 | 4.000 | 12,80 | riesgo (< 13) |
| 6 | 6.250 | 18,00 | ideal (el borde exacto) |
| 7 | Puntos negativos (incidencias > trabajo) | 0,00, nunca negativa | riesgo |
| 8 | Escala con `puntosExcelente == puntosPromedio` | Corta con error claro, no divide por cero | — |

**En `packages/core/src/pagos.test.ts`** (el techo de §3):

| # | Caso | Esperado |
|---|---|---|
| 9 | `sugerirMontoPago(1500, 22.4)` | **1500**, no 1680 — el factor se limita a 1 |
| 10 | Todos los casos que ya existen (nota ≤ 20) | Exactamente igual que hoy |

**Contra la base** (prueba de migración): que una `evaluaciones_mensuales` vieja siga leyéndose con
`metodo = 'ponderado'` y su nota intacta después de aplicar la migración.

## 8. Orden de implementación

1. Migración: las dos columnas de `evaluaciones_mensuales` + el RPC que suma los puntos de
   actividades y devuelve `puntosTotal` desglosado.
2. `packages/core`: `notaDesdePuntos()` con sus tests, y el techo de `sugerirMontoPago()` con el
   suyo.
3. `config-catalogo.ts`: los 7 parámetros.
4. Pantallas: `/evaluaciones` (nota + perfil + el aviso de ventas sin tasa), `/mi-desempeno` (nota +
   banda + perfil propio).
5. `docs/pendientes-negocio.md`: los 7 parámetros provisionales y las dos preguntas de §3 y §4.
