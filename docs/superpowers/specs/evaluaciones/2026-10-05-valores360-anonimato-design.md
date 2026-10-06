# SPEC — Valores 360°: sólo el administrador ve quién puntuó a quién

> **Ticket:** imalexandre05/lucebien-tablero#40 (parte de anonimato).
> **Decisión del dueño (05-oct-2026):** *sólo el administrador puede ver quién puntuó a quién.*
> **Rigor:** spec completa (RLS + RPC + aislamiento 3 de los no-negociables). Verificador antes de mergear.
> **Fuera de alcance** (otros ítems del ticket): ventana de envío, mes evaluado, bordes de altas.

## 1. Lo que hay hoy, verificado contra el código

| Pieza | Dónde | Hoy |
|---|---|---|
| Policy `eval_valores_select` | `0082_aislamiento_notas_valores_respaldo.sql` (última definición) | `app_es_admin() or app_ve_datos_personas() or evaluador_id = auth.uid()` |
| RPC `valores_mis_puntajes(p_mes)` | `0082` (+ `0090` le quita `execute` a `anon`) | `security definer`; devuelve **una fila por evaluador** con los seis puntajes |
| Lectura propia | `apps/erp-web/lib/valores-repo.ts::miResumenValores` | usa la RPC si mira lo suyo; lee la tabla si es otra persona (el admin) |
| Seguimiento | `valores-repo.ts::seguimientoValores` | lee la tabla entera; la pantalla sólo la ofrece al admin con reauth |
| Funciones `private.evaluacion_componentes_datos` | `0091`, `0095` | `security definer`: no dependen de la policy |

Dos fugas, aunque ninguna muestra `evaluador_id`:

1. **`app_ve_datos_personas()` en la policy.** Un encargado con ese permiso lee la fila completa,
   `evaluador_id` incluido. Contradice «nadie sabe quién lo puntuó salvo el administrador».
2. **La RPC devuelve el vector de cada evaluador.** En un equipo de once personas, un vector de seis
   notas por evaluador es una huella: con una sola evaluación recibida, el resultado *es* lo que puso
   esa persona; con dos, se deduce por descarte lo que puso la otra.

## 2. Cambios

### 2.1 Policy
`eval_valores_select` queda `private.app_es_admin() or evaluador_id = auth.uid()`. Cada quien ve
lo que **envió**; el administrador ve todo. Se quita `app_ve_datos_personas()`.

### 2.2 RPC `valores_mis_puntajes(p_mes)` — nuevo formato
- Devuelve **a lo sumo una fila**: `cantidad int` y el **promedio por valor** (`integridad`, `respeto`,
  `honestidad`, `amabilidad`, `relacion`, `actitud`, `numeric` redondeado a 2 decimales, igual que
  `promediosPorValor` del core). Nada por evaluador.
- **Sólo si `cantidad >= mínimo`.** Con menos, devuelve **cero filas**. Tampoco se revela la cantidad
  por debajo del mínimo: «hay 2» ya es información.
- `auth.uid()` se sigue leyendo adentro; `security definer`, `set search_path to ''`, sin `anon`.
- Cambia el tipo de retorno, así que la migración hace `drop function if exists` y recrea con sus
  `revoke`/`grant` (el `revoke ... from anon` de 0090 se repite).

### 2.3 Mínimo de evaluaciones — **default inventado**
Clave `config.valores_min_evaluaciones`, **default `3`**. No lo dio el dueño: es el menor número que
impide deducir por descarte el voto de una persona. Queda:
- comentado como default en la migración (`insert ... on conflict do nothing`);
- editable en `/configuracion` (entrada en `config-catalogo.ts`, sección Valores 360°);
- anotado en `docs/pendientes-negocio.md`.
La RPC lo lee con respaldo a 3 si la clave falta o no es un entero ≥ 1 (nunca queda en 0: eso
equivaldría a apagar el anonimato en silencio).

### 2.4 Pantallas
- `valores-repo.ts::miResumenValores` consume el nuevo formato. `MiResumenValores` gana
  `minimoEvaluaciones` y `suficientes`; `recibidas`/`nota20` son `null` cuando no alcanza.
- `/valores`: si no alcanza, la tarjeta de resultado dice
  «Aún no hay suficientes evaluaciones para mostrar tu resultado (mínimo N)». Si alcanza, se muestra
  nota /20 y una barra horizontal por valor (sobrio, navy/gold, `tabular-nums`, sin emojis).
- Ficha de Personal (`personal/[id]/valores`): el administrador mirando a **otra** persona sigue
  leyendo la tabla (la policy lo permite) y ve todo, sin mínimo. Quien mira lo **suyo** pasa por la RPC.
- Otras lecturas de `evaluaciones_valores` en `apps/erp-web`: `companerosParaEvaluar` filtra por
  `evaluador_id = yo` (sigue funcionando); `enviarEvaluacionValores` escribe; `seguimientoValores` es
  admin. Ninguna otra depende de ver `evaluador_id` siendo no-administrador (verificado con grep).

## 3. Prueba SQL (antes del código, regla 6)
`packages/db/pruebas/0116_valores360_anonimato.prueba.sql` (número reservado: 0116):

| Caso | Esperado |
|---|---|
| Encargado con `datos_personas` lee `evaluaciones_valores` de otros | 0 filas, `evaluador_id` inalcanzable |
| Administrador lee la tabla | ve todo |
| Quien puntuó | ve sólo lo suyo |
| Evaluado con 2 evaluaciones llama la RPC | 0 filas |
| Evaluado con 3 | 1 fila: `cantidad = 3` y promedios correctos |
| Mínimo configurado en 4 con 3 evaluaciones | 0 filas |
| Mínimo inválido (`0`, `abc`) | cae a 3 |
| `anon` ejecuta la RPC | denegado |

## 4. Orden de commits (Zone Guard)
1. `docs` — esta spec. 2. `migration` — reserva del número (sola, con push). 3. `migration` — la
prueba SQL (roja contra el estado actual). 4. `migration` — la migración (prueba verde).
5. `erp` — repo + pantalla + catálogo de configuración + docs de cierre.
Nada se aplica a ninguna base: la migración queda para que la aplique Alexander.

## 5. Riesgos que acepta la decisión
- Con exactamente 3 evaluaciones, quien conozca su propio voto acota los otros dos; es el mínimo
  razonable para un equipo chico. Subirlo es editar una clave.
- Los encargados dejan de ver quién puntuó. Es intencional: es la decisión del dueño.

---

## 6. Regla única: nunca en vivo (decisión del dueño, 05-oct-2026, tras la verificación)

El verificador encontró tres caminos por los que un no-administrador veía su resultado sin pasar por
el mínimo del §2.2 (o lo veía en vivo, lo que permite despejar cada voto nuevo restando dos lecturas
consecutivas). El dueño decidió cerrar las tres con **una sola regla**, que **reemplaza** lo que el
§2.2 dice sobre el mes consultado:

> **El resultado de Valores 360° que ve un no-administrador es siempre el de un MES YA CERRADO
> (mes < mes actual, hora Perú) y sólo si ese mes tiene ≥ `valores_min_evaluaciones` evaluaciones.
> Nunca en vivo.**

El administrador no cambia: ve todo, en vivo, y la nota del mes que calcula para la evaluación y el
pago no se toca (no-negociable 1).

| # | Camino | Qué cambia |
|---|---|---|
| 1 | RPC `valores_mis_puntajes` | Deja de recibir «el mes en curso». Devuelve el **último mes cerrado que cumpla el mínimo** (con una columna `mes` que dice cuál). `p_mes` pasa a ser opcional: si se pasa un mes en curso o futuro, o sin mínimo, devuelve vacío. Lecturas sucesivas ya no revelan votos nuevos: el mes cerrado no cambia. |
| 2 | `/mi-desempeno` | La nota de Valores 360° guardada en `evaluaciones_mensuales.componentes.valores` sólo se muestra si `valores_mis_puntajes(mes de la evaluación)` devuelve fila (mes cerrado, con mínimo). Si no: «Aún no hay suficientes evaluaciones» y la barra de Valores 360° se oculta. El valor guardado no se modifica. |
| 3 | `public.evaluacion_componentes` (envoltorio) | Si quien llama **no es administrador** (sólo puede ser sí mismo), `valores` y `valoresCantidad` vienen en `null` salvo que el mes de `p_desde` esté cerrado y alcance el mínimo. Para el administrador no cambia nada, y **`private.evaluacion_componentes_datos` no se toca** (alimenta la evaluación y el pago). |

### Pruebas SQL añadidas (en la misma prueba 0116, antes del código)
- Con 3 votos en el **mes en curso** no se ve nada por ninguna de las tres vías hasta que el mes cierre.
- Mes cerrado con 2 votos → vacío; con 3 → una fila con `mes`, `cantidad` y promedios.
- Con dos meses cerrados que cumplen, devuelve el más reciente; con el más reciente sin mínimo, cae al anterior que sí cumple.
- `evaluacion_componentes` a sí mismo: `valores`/`valoresCantidad` en `null` en el mes en curso y con mínimo no alcanzado; presentes en mes cerrado con mínimo.
- `evaluacion_componentes` como administrador: idéntico a antes, en vivo.

### Riesgos residuales (no se cierran aquí)
- Un evaluador puede insertar —y también actualizar: `eval_valores_update` deja cambiar `mes` y
  `evaluado_id`— por la API un voto en un mes ya cerrado (la policy de escritura sólo pide
  `evaluador_id = auth.uid()`); eso movería un mes ya publicado. Es el ítem «mes evaluado» del ticket,
  fuera de alcance.
- **Abierto:** `evaluaciones_mensuales.componentes.valores` (el promedio guardado al evaluar) sigue
  legible por la propia persona por PostgREST directo (`eval_select`, 0082), sin mes cerrado ni mínimo.
  Las pantallas ya no lo muestran, pero eso no es una garantía de base. Cerrarlo toca la RLS de la
  cadena del sueldo y pide spec propia (vista/RPC que quite `valores` con esta regla).
- El administrador mirando **su propio** resultado pasa por la misma regla de mes cerrado y mínimo
  (usa la misma función); el «no cambia» de arriba se refiere a lo que ve del equipo y a la nota
  que calcula para la evaluación y el pago.
- `evaluaciones_mensuales.nota_final` (método ponderado) incluye el componente de valores y se muestra
  a la propia persona; deducir de ahí el voto de un solo evaluador exigiría que el mes ya esté cerrado
  y evaluado, pero no está sujeto al mínimo. Queda anotado para decisión del dueño.

> **Actualización 06-oct-2026:** los residuales «mes evaluado» y la lectura directa de `evaluaciones_mensuales`
> (incluido el despeje por `nota_final`) se cierran en `2026-10-06-valores360-base-design.md` (migración 0119).
