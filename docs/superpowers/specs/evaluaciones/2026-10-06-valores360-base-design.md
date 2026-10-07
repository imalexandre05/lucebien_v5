# SPEC — Valores 360°: cerrar la base (lectura de `evaluaciones_mensuales` y votos fuera de mes)

> **Ticket:** imalexandre05/lucebien-tablero#45. Continúa la spec `2026-10-05-valores360-anonimato-design.md`
> (PR #53, rama `fix/valores360-solo-admin`): esta rama va encima de esa.
> **Decisión del dueño:** cerrar **todas** las vías por las que alguien pueda deducir quién votó.
> **Regla de #53, que no cambia:** un no-administrador sólo ve el 360 de un mes **ya cerrado** (hora Perú)
> y con ≥ `valores_min_evaluaciones` evaluaciones.
> **Rigor:** spec completa (RLS + RPC + aislamiento + cadena del sueldo vecina). Verificador antes de mergear.
> **Migración:** `0119` (0110–0118 están tomadas por PRs abiertos; confirmado con `git ls-remote` y `ls-tree` de cada rama).

## 1. Lo que hay hoy, verificado contra el código

| Pieza | Dónde | Hoy |
|---|---|---|
| Policy `eval_select` | `0082` (última definición) | `app_es_admin() or app_ve_datos_personas() or empleado_id = auth.uid()` |
| Fila guardada | `evaluaciones_mensuales.componentes` (jsonb, 0027) | trae `valores` (promedio 360 del mes, **en vivo al momento de evaluar**) y `valoresCantidad` |
| Fórmula `ponderado` | `core/evaluaciones.ts::calcularNotaMensual` | `nota = Σ componente × peso − descuento + bono`; `valores` pesa 0.25 |
| Fórmula `puntos` | `notaDesdePuntos` (0095) | la nota sale **sólo de los puntos**; `valores` no entra en `nota_final` |
| Método de las evaluaciones nuevas | `app/evaluaciones/cliente.tsx:300` | siempre `metodo = 'puntos'` desde el 25-ago-2026 |
| Policies de voto | `0057` | insert: `evaluador_id = auth.uid() and evaluado_id <> auth.uid()`; update: admin o el propio evaluador. **Ninguna mira el mes ni la ventana** |
| Ventana de envío | `config.valores_habilitado/_modo/_dia_inicio/_dia_fin` (0058) | sólo la hace cumplir la app (`enviarEvaluacionValores`) |

### Lecturas de `evaluaciones_mensuales` hechas con sesión en `apps/erp-web` (grep)
| Archivo | Quién | Cambia |
|---|---|---|
| `lib/evaluaciones-repo.ts::listarEvaluaciones` | admin (todo) o no-admin con `evaluaciones:ver` | no-admin pasa a la RPC |
| `lib/desempeno-repo.ts::miDesempeno` | el propio usuario o admin mirando a otro | propio → RPC; admin → tabla |
| `lib/colaboradores-repo.ts` (~l.309) | pantalla de colaboradores, `nota_final` por persona | no-admin → RPC |
| `lib/pagos-repo.ts` (l.94 `empleadosParaPago`, l.184 `obtenerPago`) | `/pagos` | l.94 es del administrador (otros ven «—»); l.184 suma rama no-admin por RPC para el comprobante |

## 2. ¿Se puede despejar el voto con lo que ya se muestra? — Sí, en las filas `ponderado`

Con la fórmula vigente de `ponderado`, `valores = (nota_final − Σ otros componentes × pesos + descuento − bono) / peso_valores`.
La persona ve `nota_final`, `pesos_usados` y los otros seis componentes: **despeja el promedio 360 guardado**
(que se calculó en vivo, tal vez con una sola evaluación) aunque `valores` no se le muestre.

Con `metodo = 'puntos'` (todas las evaluaciones nuevas) **no hay despeje**: `nota_final` no depende de `valores`.
Quedan en riesgo sólo las filas históricas `ponderado`.

**Forma mínima de evitarlo (para el dueño, en una línea):** *mientras el resultado de Valores 360° de ese mes no
sea público (mes sin cerrar o sin el mínimo de evaluaciones), en una evaluación del método antiguo la persona
ve la nota del mes como «en cálculo»; cuando el mes cierra y alcanza el mínimo, ve la nota completa.*
Las evaluaciones del método de puntos no cambian: la nota se ve siempre. No se toca la nota que se paga.

## 3. Cambios

### 3.1 Lectura: nadie salvo el administrador lee la tabla directo
`eval_select` queda `private.app_es_admin()`. Se quitan `empleado_id = auth.uid()` y `app_ve_datos_personas()`.

### 3.2 RPC `mi_evaluacion_mensual(p_mes text default null)`
`security definer`, `set search_path to ''`, sin `anon`. Devuelve **las evaluaciones propias** (`auth.uid()` se lee
adentro, nunca por parámetro), la más reciente primero; `p_mes` filtra. Columnas: las de la tabla **menos nada que
el resto de las pantallas ya usaba**, más `valores_publicos boolean`. Reglas, en una sola función privada
`private.evaluaciones_mensuales_publicas(...)` compartida:

- `valores_publicos` = el mes de la evaluación es **< mes actual (hora Perú)**, hay hoy ≥ `private.valores_min_evaluaciones()`
  votos para ese `(evaluado, mes)` **y la foto guardada se calculó con ≥ el mínimo** (`componentes.valoresCantidad`;
  sin cantidad, nunca es pública). Sin esto, una foto tomada en vivo con un solo voto se publicaría al cerrar el
  mes aunque después lleguen más (hallazgo del verificador). La cantidad nunca se devuelve si no es pública.
- Si **no** es pública: `componentes` sale **sin** `valores` ni `valoresCantidad`; y si `metodo = 'ponderado'`,
  `nota_final` sale `null` (la pantalla dice «en cálculo»). `puntos` conserva su nota.
- Si es pública: la fila completa.
- Administrador llamándola sobre sí mismo: misma regla que cualquiera (igual que `valores_mis_puntajes` en 0116).

### 3.3 RPC `evaluaciones_mensuales_visibles()`
Para quien tiene `datos_personas`: la misma regla anterior aplicada a la evaluación de **otras personas**, para no
quitarle a un encargado una pantalla que hoy usa. Sin `datos_personas` devuelve sólo las propias. Sin función
nueva de permisos: reutiliza `private.app_ve_datos_personas()`.
*(Decisión mía, no del dueño: si prefiere que los encargados dejen de ver notas ajenas, es quitar una rama de esta función.)*

### 3.4 Votos: sólo mes en curso y ventana abierta
- `private.valores_ventana_abierta()`: lee `valores_habilitado/modo/dia_inicio/dia_fin` de `config` con **los mismos
  respaldos que la app** (`habilitado` salvo `'false'`; `modo` salvo `'ventana'` es siempre; día 1–31) y el día de
  hoy en `America/Lima`. Mismo criterio que `puedeEvaluarValoresHoy` (rango invertido se intercambia).
- `eval_valores_insert`: `evaluador_id = auth.uid() and evaluado_id <> auth.uid() and (app_es_admin() or (mes = private.valores_mes_actual() and private.valores_ventana_abierta()))`.
- `eval_valores_update`: `using` y `with check` agregan la misma condición para el no-administrador (no se puede
  editar una fila de un mes cerrado ni moverla a uno). El administrador conserva la moderación.
- `mes` también se valida como `YYYY-MM` por la comparación misma (`= valores_mes_actual()`).
- No hace falta una RPC `valores_enviar`: la policy basta, y la app sigue usando `upsert` (`on conflict` exige que
  pasen **ambas** policies, insert y update; un voto nuevo y uno corregido del mes en curso las cumplen).

### 3.5 App
Las tres lecturas no-admin de §1 pasan por las RPC. Si la RPC no existe (0119 sin aplicar) la pantalla falla con el
error normal: **no hay respaldo que lea la tabla**, porque ese respaldo sería justo la fuga que se cierra.
`miDesempeno`: usa `valores_publicos` en lugar de la segunda llamada a `valores_mis_puntajes`.

## 4. Lo que NO cambia
- La nota que se calcula y se paga. El cálculo de `private.evaluacion_componentes_datos` y de la liquidación (son
  `security definer`; el cambio de policy no los afecta). El administrador: lee la tabla, ve todo, en vivo.
- `evaluaciones_valores` ya sólo la lee el administrador y quien envió (0116).

## 5. Prueba SQL (antes del código, regla 6)
`packages/db/pruebas/0119_valores360_base.prueba.sql`:

| Caso | Esperado |
|---|---|
| No-admin (propio, y encargado con `datos_personas`) hace `select` directo a `evaluaciones_mensuales` | 0 filas |
| Administrador hace `select` directo | ve todo |
| `mi_evaluacion_mensual` en mes en curso con 3 votos | sin `valores`/`valoresCantidad`; `valores_publicos = false` |
| Fila `ponderado`, mes en curso o con 2 votos | `nota_final` `null` |
| Fila `puntos`, mes en curso | `nota_final` visible |
| Mes cerrado con 3 votos hoy pero foto guardada con 1 voto | no público |
| Mes cerrado con 3 votos y foto con 3 | fila completa, `valores_publicos = true` |
| Mínimo configurado en 4 con 3 votos | no público |
| Encargado con `datos_personas` por `evaluaciones_mensuales_visibles` | ve la de otros con la misma regla; sin el permiso sólo la propia |
| `anon` ejecuta las RPC | denegado |
| Voto en el mes en curso, ventana abierta | pasa (insert y corrección) |
| Voto en mes cerrado / futuro | rechazado en insert; update que lo mueve a un mes cerrado, rechazado |
| Ventana en `modo = 'ventana'` fuera de los días / `habilitado = false` | rechazado |
| Administrador | inserta, modifica y lee igual que antes |

## 6. Riesgos residuales (anotados, no se cierran aquí)
- `pagos.monto` y las liquidaciones de una evaluación `ponderado` se derivan de `nota_final` y la propia persona los
  ve: para esas filas históricas el despeje sigue posible por ahí. Las evaluaciones nuevas (`puntos`) no tienen el
  problema. Cerrarlo toca la cadena del sueldo (spec propia); se anota en `docs/pendientes-negocio.md`.
- Un evaluador puede bajar `mes` de un voto **del mes en curso** sólo a otro mes en curso (la policy lo impide):
  no hay riesgo de mover un mes ya publicado.
- Restar la foto guardada (≥ mínimo) del promedio vivo da la suma de los votos posteriores; aceptado: ambos ya cumplen el mínimo.
- Con exactamente el mínimo de votos, quien conozca su propio voto acota los demás (aceptado en #53).

## 7. Plan de ejecución y orden de commits (Zone Guard)
1. `docs` — esta spec (sola). 2. `migration` — reserva de `0119`, sola, con push. 3. `migration` — prueba SQL, roja
contra el estado actual. 4. `migration` — `0119` (prueba verde en Postgres local). 5. `erp` — repos + pantallas +
docs de cierre. `bash tools/verificar-local.sh` verde antes de cada commit. Nada se aplica a ninguna base: la
aplica Alexander, y **antes** de desplegar la app (la app nueva exige las RPC).

## 8. Enmienda del 06-oct-2026 — decisión del dueño y H-6

> Fuentes: decisión del dueño transmitida por la sesión maestra el 06-oct-2026 («cada persona sólo
> ve lo suyo, excepto los admins») y `docs/auditorias/2026-10-06-pipeline.md` H-6. Se escribe antes
> del código (Zone Guard). **Manda sobre §3.3 y la fila correspondiente de §5.**

**8.1 Los encargados ya no ven notas ajenas.** `evaluaciones_mensuales_visibles()` devuelve **sólo
las evaluaciones de quien llama**, tenga o no `datos_personas`; el administrador sigue leyendo la
tabla directo (§3.1). Se quita la rama `app_ve_datos_personas()` de
`private.evaluaciones_mensuales_publicas` (el parámetro `p_solo_propias` queda sin efecto). La
función pública se conserva para no romper la app; un encargado que abra la evaluación de otra
persona ve «sin evaluación». Esto además cierra, para estas notas, el hueco de la auditoría de
seguridad H4 (`datos_personas` ignoraba la sede).

**8.2 Fila sin `valoresCantidad` (H-6).** Nada guardaba `componentes.valoresCantidad` hasta el
arreglo del PR #46 (spec 2026-10-04-evaluacion-guardar-recalculada §7). La regla de §3 ya decía que
una foto sin cantidad nunca es pública; la prueba lo cubre ahora explícitamente: una fila
`ponderado` de un mes cerrado, con votos suficientes hoy pero **sin** `valoresCantidad`, sale con
`nota_final` null y sin `valores`; una fila `puntos` en el mismo caso muestra la nota pero no el 360°.

**8.3 Filas históricas — NO se decide aquí.** Toda evaluación `ponderado` guardada antes del arreglo
de #46 no tiene `valoresCantidad` y, con esta migración, queda para siempre en «en cálculo» para la
persona. Opciones para el dueño (anotadas en el PR #56 y en `docs/pendientes-negocio.md`):
(a) completar `valoresCantidad` con el conteo de votos del mes (válido sólo para meses cerrados), o
(b) aceptar que no se publiquen y decirlo en la pantalla en vez de «se publica al cerrar el mes».
Mientras tanto se deja el comportamiento actual.

**Pruebas que cambian:** «el encargado con `datos_personas` ve las 7 de otras personas» pasa a
«el encargado con `datos_personas` ve sólo las propias (0 ajenas)»; se agrega el caso de §8.2.
