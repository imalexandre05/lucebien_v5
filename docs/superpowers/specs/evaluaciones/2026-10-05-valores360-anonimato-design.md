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
`packages/db/pruebas/0110_valores360_anonimato.prueba.sql` (el número lo fija `reservar-migracion.sh`):

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
