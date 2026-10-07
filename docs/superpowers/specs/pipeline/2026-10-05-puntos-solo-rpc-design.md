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
  el guard debe fallar (ver §7, paso 6).

## 6. Pruebas (se escriben antes que la migración — Zone Guard)

`packages/db/pruebas/0115_puntos_solo_rpc.prueba.sql` (el número real lo da `reservar-migracion.sh`):

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
6. La migración se puede reaplicar sin fallar (se comprueba a mano, aplicándola dos veces: la prueba corre dentro de una transacción y no puede reaplicar el archivo).

## 7. Plan de ejecución

1. Este documento (commit sólo de docs).
2. `bash tools/reservar-migracion.sh puntos-solo-rpc`; commit y push de la reserva sola.
3. La prueba SQL (commit aparte, antes del código); correrla contra Postgres local y ver que
   **falla** donde hoy hay hueco.
4. La migración idempotente; correr la prueba y ver que pasa; correr también las pruebas anteriores
   del pipeline (`0086`, `0095`, `0112`) para comprobar que nada se rompió.
5. `tools/auditoria-puntos.sql` (sólo lectura).
6. Una regla en el guard (`regla2-puntos`) que falla si `apps/erp-web` escribe directo sobre las dos
   tablas (mira la cadena `.from(...)…insert/update/delete/upsert`, también en varias líneas).
   Las migraciones futuras no se pueden vigilar igual de bien: ahí manda la prueba 0115 y el
   `verificador`.
7. `bash tools/verificar-local.sh` verde antes de cada commit; subagente `verificador` al final.
8. PR en borrador con base `feat/codigo-personal`, `Closes imalexandre05/lucebien-tablero#36`.

**Nada se aplica a ninguna base desde esta rama.** La migración la aplica el dueño después de
revisar; la auditoría la corre la sesión maestra.

## 8. Decisiones tomadas al diseñar (no son reglas de negocio nuevas)

- Se **quita** la rama «sus propios puntos» de la condición de escritura (§3.3). Es un
  endurecimiento, no un parámetro: por `pipeline_puntos` y `prenda_historial` ya no se puede escribir
  un punto propio. (Ojo: NO es «ningún camino»; ver §9.)
- `lavanderia_enviar` pasa a guardar `registrado_por` (antes quedaba vacío en sus filas de
  historial). Sólo agrega auditoría.
- Nada hardcodeado ni inventado: no hay parámetros nuevos.

## 9. Lo que esta migración NO cierra (hallado por el verificador, 05-oct-2026)

La regla de §2 vale para **estas dos tablas**. El verificador probó en Postgres local, como
`authenticated`, que alrededor de ellas quedan tres caminos abiertos. Ninguno lo crea la 0115, pero
la spec no debe afirmar que no existen:

1. **`prenda_pasada` sigue siendo `FOR ALL` (`pasada_rw`, 0006).** Alguien de la sede puede insertar
   una prenda (o retroceder su etapa) directo y llamar a la RPC legítima `pipeline_avanzar` una y
   otra vez: medido, 5 vueltas = 15 puntos a su nombre con `pts_planchado = 3`. Los puntos son
   legítimos para la RPC pero la prenda no. **Es el mismo hueco un nivel más arriba**
   (no-negociable 2: «nunca un `update` plano sobre `prenda_pasada`») y requiere su propia spec:
   hay muchos escritores legítimos de `prenda_pasada` (entradas desde lavandería, inventario).
2. **El historial se puede borrar por cascada.** `prenda_historial.pasada_id` es `ON DELETE CASCADE`;
   un `delete from prenda_pasada` directo de una prenda sin puntos se lleva sus filas de historial
   (medido: 2 → 0). Se cierra con el punto 1 (o cambiando la FK a `restrict`).
3. **`pipeline_deshacer` (0112) no valida `p_etapa_anterior`** contra el historial: recepción →
   refacción → planchado → control de calidad, deshacer a recepción y repetir deja 5 puntos en vez
   de 3 (la RPC sólo borra el último punto positivo). Es de la 0112, no de este cambio.

Tres de ellos tocan la cadena del sueldo: **van a spec propia** y están anotados en
`docs/pendientes-negocio.md`. Mientras tanto, `tools/auditoria-puntos.sql` ayuda a verlos
(puntos duplicados, sin historial) pero **no los detecta todos** (límites en su cabecera).

Además, dos supuestos de este documento no se verificaron contra la base real (no-negociable 7):
que el schema `private` no esté entre los expuestos de PostgREST (se apoya en la 0037, que es otro
documento) y que `pg_graphql` no lo refleje. **Hay que comprobarlo en la configuración de Supabase
antes de aplicar la 0115.** Si estuviera expuesto, las tres funciones serían llamables con un
`p_empleado` y un `p_puntos` arbitrarios sobre prendas de la propia sede.

## 10. Cambios a esta spec después de escribir el código (Zone Guard)

El commit `005ba2a` ajustó §6.6 (la reaplicación se comprueba a mano) y §7.6 (el guard cubre sólo
`apps/erp-web`) **después** de existir el código, para describir lo que el código hace; no
cambia ninguna regla de negocio, pero queda registrado aquí y **pendiente de que Alexander lo
confirme**.

## 11. Enmienda del 06-oct-2026 (auditoría de pipeline H-1, H-4)

> Fuente: `docs/auditorias/2026-10-06-pipeline.md` (rama `audit/2026-10-06-pipeline`). Pedido por la
> sesión maestra del dueño el 06-oct-2026. Se escribe antes del código (Zone Guard).

**H-4 — una tienda no se acredita puntos avanzando prendas.** La cabecera de la 0115 decía que
desaparecía «la rama que dejaba sumarse puntos a uno mismo», pero cualquier rol de tienda puede
llamar `pipeline_avanzar` sobre prendas de su sede y se acreditaba cada etapa (medido: +7 en 7
llamadas). Regla nueva:

- `private.pipeline_registrar_punto` sólo escribe el punto si **quien lo recibe** tiene rol de
  pipeline: `admin`, `dueno`, `encargado_almacen` o `confeccionista` (los mismos roles de
  `private.app_es_admin()` y `private.app_es_almacen()`, 0006/0083). Si no, no escribe nada y
  devuelve `null`; la RPC devuelve 0 puntos. La prenda **sí** avanza (la tienda puede mover sus
  prendas; sólo no cobra por ello).
- Vale igual para el negativo de un rechazo: si la etapa la hizo alguien sin rol de pipeline (que no
  cobró por ella), tampoco se le descuenta.
- Quien recibe el punto es el actor resuelto (dueño del código en el equipo compartido, o la
  sesión), no necesariamente quien tiene la sesión.
- La cabecera de la 0115 se corrige para decir esto (no-negociable 7).

**H-1 — deshacer quita los puntos del movimiento deshecho.** Mismo diseño que la enmienda de la
0112 (spec del código personal §0 E-4), ahora a través de las funciones privadas:

- `private.pipeline_registrar_punto` recibe además `p_historial uuid` (el `prenda_historial` que
  originó el punto) y lo guarda en `pipeline_puntos.historial_id`.
- `private.prenda_historial_registrar` devuelve el `id` de la fila (antes `void`) y fija
  `fecha = clock_timestamp()`, para que «el último movimiento» sea inequívoco aun dentro de una
  misma transacción.
- `private.pipeline_borrar_punto(p_pasada, p_historial, p_todos)`: con `p_todos = false` borra los
  puntos de ese movimiento, sean de quien sean; para puntos anteriores a la columna, el último
  positivo de esa prenda en la etapa de origen del movimiento, sin mirar el empleado. Ya no recibe
  un empleado.
- `pipeline_deshacer` sólo deshace el último movimiento (la misma validación que la 0112; cierra
  el punto 3 de §9 dentro de esta RPC).

Compatibilidad con la 0122 (`fix/seguridad-produccion`, otra sesión): esa migración cierra la
escritura directa de `prenda_pasada` (§9.1) y valida el deshacer en `main`. Las RPC de esta rama
siguen siendo `security invoker`; quien mergee la segunda debe reconciliar las definiciones (la
última que se aplique manda).

**Tests nuevos:** un `encargado_tienda` avanza su prenda y no recibe puntos (la prenda sí avanza);
A avanza, B avanza y A deshace lo de B → B pierde ese punto y A conserva el suyo; deshacer a una
etapa que no es la del último movimiento → `TRANSICION:`.

## 12. Compatibilidad con la 0122 (07-oct-2026)

La 0122 (`fix/seguridad-produccion`) se aplica **antes** que la 0112 y la 0115. Revoca
`insert`/`update`/`delete` de `prenda_pasada`, `prenda_historial` y `pipeline_puntos` a
`anon`/`authenticated` (`prenda_pasada` conserva un `insert` limitado a la etapa `recepcion`) y deja
`pasada_rw` en sólo lectura. Con eso, una RPC `security invoker` que haga `update` directo sobre
`prenda_pasada` falla con `permission denied`. Lo que cambia en esta rama:

- **Las siete RPC por prenda** (`pipeline_avanzar`, `_enviar`, `_rechazar`, `_deshacer`, `_dividir`,
  `_deshacer_division`, `_calificar`) pasan a `security definer` con
  `set search_path = public, pg_temp` y llaman a `private.pipeline_exigir_acceso(p_id)` justo
  después del chequeo «No autenticado» y antes de resolver el actor. La función (definida en la 0112
  y en la 0122 con la misma semántica) deja pasar a admin, a `private.app_es_almacen()` o a quien
  tenga la sede de origen de la prenda en `private.app_sedes()`; si no, `Prenda no encontrada`. La
  0115 reescribe las RPC de la 0112, así que **repite** este cambio: si no, volvería a invoker.
- `pipeline_avanzar_tanda` sigue `security invoker` (sólo llama a `pipeline_avanzar`).
- Los helpers `private.pipeline_registrar_punto`, `pipeline_borrar_punto`, `prenda_historial_registrar`
  y `pipeline_exigir_derecho` ya eran `security definer`: no cambian.
- `lavanderia_enviar` sigue `security invoker`: la 0122 deja el `insert` limitado a `recepcion` sobre
  `prenda_pasada` justamente para no romperla (su historial ya pasa por la función definer).
- Resultado de seguridad: el mismo. Quien no tiene derecho sobre la prenda no escribe nada; sólo
  cambia el mensaje con que se le rechaza en las RPC (`Prenda no encontrada`, que además no revela
  si la prenda existe, en lugar de `PERMISO:` desde el helper).

## 13. Alineación con la 0122 (H-7) y hallazgos del verificador (07-oct-2026)

La 0115 reescribe `pipeline_rechazar`, `pipeline_calificar` y `pipeline_deshacer` de la 0112, así que
repite los mismos arreglos que la 0112 (spec del código personal §0 E-7); si no, los reabriría. Con
los helpers `private.*` de esta migración y la misma lógica:

- **`pipeline_rechazar`:** `for update` y sólo rechaza desde `control_calidad` hacia `recepcion`,
  `lavado`, `empatado`, `refaccion`, `compostura` o `planchado` (`TRANSICION: sólo se rechaza desde
  control de calidad hacia una etapa anterior`). Cierra el doble rechazo, que restaba dos veces al
  culpable.
- **`pipeline_calificar`:** portero de la 0122 (admin, almacén, sede de origen o sede destino del
  envío de la prenda en `app_sedes()`; si no, `Prenda no encontrada`), `for update`, sólo califica
  una prenda `enviado` y una observada vuelve a una etapa del proceso o a `control_calidad`.
- **`pipeline_deshacer`:** último movimiento por `fecha desc, id desc` con `obs` nulo (sólo un
  avance real: no un «Deshacer», rechazo, envío ni división), rechaza prendas divididas y desde
  `listo` deja `aprobada = false`. Mensaje: `TRANSICION: sólo se puede deshacer el último avance de
  la prenda`. El deshacer de un deshacer reaplicaba el movimiento sin puntos.
- `private.pipeline_exigir_acceso` llega con la copia exacta de la 0122 por la 0112 (esta rama la
  hereda); la 0115 no la redefine.
