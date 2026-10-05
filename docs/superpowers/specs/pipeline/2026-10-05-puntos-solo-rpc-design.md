# Los puntos y el historial del pipeline sólo los escriben las RPC

> Spec completa (rigor nivel 3): toca la cadena del sueldo (no-negociable 1), el esquema y los
> permisos de dos tablas (no-negociables 2 y 3). Ticket: imalexandre05/lucebien-tablero#36.
> Decisión del dueño: **arreglar ya y auditar el historial**. Fecha: 05-oct-2026.
> Va encima de `feat/codigo-personal` (PR #42): toca las mismas ocho RPC.

## 1. El problema (verificado)

La policy `puntos_rw` de `pipeline_puntos` (`0006_pipeline_rls.sql:52-66`) es `FOR ALL`, y `hist_rw`
de `prenda_historial` (`0006:33-47`) también. Con la API pública (PostgREST) cualquier sesión
`authenticated` que cumpla la condición de lectura puede hacer `insert`, `update` y `delete`
directos sobre las dos tablas, sin pasar por ninguna RPC. Un verificador lo confirmó en Postgres
local: un `insert` de 500 puntos entra.

Quién lo cumple hoy (la misma condición para leer y para escribir):

- admin / dueño;
- `encargado_almacen` y `confeccionista` (`private.app_es_almacen()`);
- **cualquier empleado sobre sus propios puntos** (`empleado_id = auth.uid()`) — es decir, cualquiera
  puede sumarse puntos, o borrarse los negativos de un rechazo;
- cualquier empleado sobre las prendas de su sede.

Los puntos alimentan reportes → nota /20 → pago. Un `insert` directo es dinero. El historial es la
evidencia con la que se audita cada movimiento; poder editarlo borra la evidencia.

## 2. La regla

**Sólo las RPC del pipeline escriben `pipeline_puntos` y `prenda_historial`.**

Esto cierra el no-negociable 2 («todo avance de prenda pasa por una RPC») para las dos tablas que
faltaban.

## 3. El diseño

### 3.1 Permisos de las tablas

Para `authenticated` (y `anon`) sobre `pipeline_puntos` y `prenda_historial`:

- `revoke insert, update, delete, truncate` — se quedan sólo con `select`;
- se borran `puntos_rw` y `hist_rw`; se crean `puntos_sel` y `hist_sel`, **`for select`**, con
  **exactamente la misma condición de lectura** de hoy. La lectura no cambia para nadie.

El `service_role` y el dueño de las tablas (que usan las funciones `security definer` de
`0099` y `0102`) no pasan por RLS ni por estos permisos: no cambian.

### 3.2 Tres funciones de escritura, en `private`

Las RPC siguen `security invoker` (no se cambia su modelo: así la RLS de `prenda_pasada` sigue
mandando sobre quién puede mover qué prenda). Pero **ya no escriben** en las dos tablas: llaman a

| Función | Hace |
|---|---|
| `private.pipeline_registrar_punto(p_empleado, p_pasada, p_etapa, p_puntos, p_detalle)` | inserta una fila de `pipeline_puntos` (fecha = `now()`); devuelve su id |
| `private.pipeline_borrar_punto(p_pasada, p_empleado, p_todos default false)` | `p_todos = false`: borra el ÚLTIMO punto positivo de ese empleado en esa prenda (deshacer); `p_todos = true`: borra todos los de esa prenda (deshacer división); devuelve cuántas filas borró |
| `private.prenda_historial_registrar(p_pasada, p_etapa_anterior, p_etapa_nueva, p_empleado, p_obs)` | inserta una fila de `prenda_historial` con `registrado_por = auth.uid()` |

Las tres son `security definer`, `set search_path = public`, con `revoke ... from public, anon` y
`grant execute ... to authenticated` (patrón de `0037`: el schema `private` no lo expone
PostgREST, así que un cliente no puede llamarlas directo; las llaman las RPC invoker y por eso
`authenticated` necesita el `execute`).

### 3.3 Las funciones no son una puerta nueva

Aunque PostgREST no las exponga, cada una **valida por sí misma** que quien llama tenga derecho
sobre la prenda, con la misma condición que hoy da `pasada_rw` para escribir:

> `auth.uid()` no nulo **y** (admin, **o** almacén —`encargado_almacen` / `confeccionista`—, **o** la
> prenda es de una sede del llamador).

Se **endurece** un punto respecto de la policy actual: desaparece la rama «o `empleado_id =
auth.uid()`», que es justo la que deja sumarse puntos a uno mismo. Las RPC nunca la necesitan:
para mover una prenda el llamador ya tiene que verla en `prenda_pasada`, y eso lo cubren las tres
ramas de arriba. La prenda debe existir (`pasada_id` obligatorio). Lo que se rechaza lanza
`PERMISO: …`, que aborta la RPC entera (rollback: no queda un avance sin su punto).

`registrado_por` no es un parámetro: siempre es `auth.uid()`, no se puede falsificar.

### 3.4 Qué escribe hoy en esas tablas (inventario con grep)

Última definición de cada una; ninguna queda fuera.

| Quién | Dónde vive | Escribe |
|---|---|---|
| `pipeline_avanzar` | `0112` | historial + punto |
| `pipeline_avanzar_tanda` | `0112` | nada (llama a `pipeline_avanzar`) |
| `pipeline_enviar` | `0112` | historial |
| `pipeline_rechazar` | `0112` | historial + punto (negativo al culpable) |
| `pipeline_deshacer` | `0112` | historial + borra el último punto |
| `pipeline_dividir` | `0112` | 3 filas de historial |
| `pipeline_deshacer_division` | `0112` | borra puntos de las hijas + historial |
| `pipeline_calificar` | `0112` | historial |
| `lavanderia_enviar` | `0066` | historial (por prenda ingresada) |
| `empleado_borrar_alta` | `0099` (definer, admin) | `update`/`delete` como dueño: **no cambia** |
| fusión de identidades | `0102` (una sola vez, ya aplicada) | no es un camino vivo |
| `apps/erp-web` | `pipeline-repo.ts`, `desempeno-repo.ts`, `colaboradores-repo.ts` | **sólo `select`** |
| `routes/*.js`, `database/*.js` | sistema viejo (SQLite) | otra base: fuera de alcance |

La app nueva no tiene ningún `insert`/`update`/`delete` directo sobre las dos tablas; no hay
código del ERP que cambiar. Los *cuerpos* de las RPC se reescriben sólo en las líneas que escribían.

### 3.5 Qué NO cambia

La lógica de puntos (pesos, medias piezas, negativos del rechazo), la lista blanca de transiciones,
el token de operador, las firmas, los `grant` de las RPC, ni el modelo `security invoker`.

## 4. Auditoría del historial (decisión del dueño)

Mientras el hueco estuvo abierto alguien pudo escribir. `tools/auditoria-puntos.sql` es **sólo
lectura** (`select`, nada de DDL ni DML) y lista:

1. puntos sin fila correspondiente en `prenda_historial` (misma prenda y etapa, mismo empleado,
   ±5 min);
2. puntos mayores que el máximo configurado para su etapa (`config.pts_*`);
3. duplicados exactos;
4. puntos con `pasada_id` nulo o inexistente;
5. totales por empleado y por mes, para compararlos con lo que se pagó.

**Lo ejecuta la sesión maestra contra producción, no esta rama.** Los puntos anteriores al
`0112` no tienen `registrado_por` y el `etapa_nueva` del historial no coincide siempre con la
etapa del punto (un rechazo guarda `<etapa>_rechazo`): el script lo tiene en cuenta y marca esos
casos como «esperados» en vez de ocultarlos.

## 5. Qué falla y cómo se ve

- Un cliente que intente `insert`/`update`/`delete` directo recibe `42501 permission denied for
  table …`.
- Una llamada a una función privada sobre una prenda ajena lanza `PERMISO: …`.
- Si una RPC futura vuelve a escribir directo: el permiso ya no existe y falla en la prueba; además
  el guard debe fallar (ver §6).

## 6. Pruebas (se escriben antes que la migración — Zone Guard)

`packages/db/pruebas/0113_puntos_solo_rpc.prueba.sql` (el número real lo da `reservar-migracion.sh`):

1. `authenticated` NO puede `insert`, `update` ni `delete` directos en las dos tablas —probado con
   admin, almacén, tienda y un empleado sobre sus propios puntos—.
2. Las lecturas siguen igual (cada rol ve lo mismo que antes; una tienda no ve la sede ajena).
3. Las RPC siguen funcionando igual y dejan los mismos puntos y filas de historial: `avanzar`,
   `avanzar_tanda`, `enviar`, `rechazar`, `deshacer`, `dividir`, `deshacer_division`, `calificar`
   y `lavanderia_enviar`, con y sin token de operador (se reutiliza el montaje de la `0112`).
4. `private.pipeline_registrar_punto` / `borrar_punto` / `prenda_historial_registrar` sobre una
   prenda ajena (otra sede, sin ser almacén ni admin) se rechazan; sobre `pasada_id` inexistente o
   nulo también.
5. El `registrado_por` no se puede falsificar.
6. La migración se puede reaplicar sin fallar.

## 7. Plan de ejecución

1. Este documento (commit sólo de docs).
2. `bash tools/reservar-migracion.sh puntos-solo-rpc`; commit y push de la reserva sola.
3. La prueba SQL (commit aparte, antes del código); correrla contra Postgres local y ver que
   **falla** donde hoy hay hueco.
4. La migración idempotente; correr la prueba y ver que pasa; correr también las pruebas anteriores
   del pipeline (`0086`, `0095`, `0112`) para comprobar que nada se rompió.
5. `tools/auditoria-puntos.sql` (sólo lectura).
6. Una regla en el guard que impida que vuelva a haber un `insert`/`update`/`delete` directo sobre
   las dos tablas fuera de las funciones permitidas, si cabe sin falsos positivos.
7. `bash tools/verificar-local.sh` verde antes de cada commit; subagente `verificador` al final.
8. PR en borrador con base `feat/codigo-personal`, `Closes imalexandre05/lucebien-tablero#36`.

**Nada se aplica a ninguna base desde esta rama.** La migración la aplica el dueño después de
revisar; la auditoría la corre la sesión maestra.

## 8. Decisiones tomadas al diseñar (no son reglas de negocio nuevas)

- Se **quita** la rama «sus propios puntos» de la condición de escritura (§3.3). Es un
  endurecimiento, no un parámetro: no se puede escribir un punto propio por ningún camino.
- `lavanderia_enviar` pasa a guardar `registrado_por` (antes quedaba vacío en sus filas de
  historial). Sólo agrega auditoría.
- Nada hardcodeado ni inventado: no hay parámetros nuevos.
