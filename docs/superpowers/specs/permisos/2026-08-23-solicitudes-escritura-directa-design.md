# SPEC — Solicitudes: cerrar la escritura que no pasa por la RPC (F29)

> **Rama de la spec paraguas**
> [2026-08-23-escritura-directa-y-anonimato-design.md](2026-08-23-escritura-directa-y-anonimato-design.md) §1 A-2.
> Esa spec describe la familia entera de agujeros; esta resuelve el caso de `solicitudes` y no
> modifica la otra (la están leyendo otros agentes de la misma ola).
>
> **Migración:** `packages/db/migrations/0087_solicitudes_escritura_directa.sql`
> **Prueba de ataque:** `packages/db/pruebas/0087_solicitudes_escritura_directa.prueba.sql`
> **Zona de rigor:** completa — toca permisos, uno de los siete no-negociables.

---

## 1. El fallo, verificado

`F29`, reproducido en vivo el 23-ago-2026 suplantando a una colaboradora de ventas sin ninguna
autoridad de almacén: un `PATCH /rest/v1/solicitudes?id=eq.<id>` con
`{"estado":"confirmada","confirmado":true}` dejó la solicitud confirmada sin pasar por ninguna RPC.

La causa está en una sola línea de la migración 0056 (`0056_solicitudes.sql:88-90`):

```sql
create policy solicitudes_rw on solicitudes for all
  using      (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()))
  with check (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));
```

`for all` significa que la MISMA condición habilita leer, insertar, actualizar y borrar. Toda la
autoridad real del módulo —quién aprueba, quién entrega, quién rechaza, quién confirma— vive
adentro de las seis RPC (`private.app_es_gestor_solicitudes()`, `0056_solicitudes.sql:253` y sus
usos en las líneas 323, 359, 390, 434, 488). La base no conoce ninguna de esas reglas: quien puede
*ver* una solicitud puede *reescribirla entera*, y como hoy las once personas tienen AL, LB y ST en
`empleado_tiendas`, "ver" es "todas".

Lo mismo vale para `solicitud_items` (`0056_solicitudes.sql:93-101`, misma forma `for all`
colgando de la sede del padre): un `PATCH` directo puede fijar `cantidad_enviada`,
`cantidad_recibida` y `estado_item`, que son los números con los que el almacén sabe qué salió y
qué llegó.

Y no queda rastro: `solicitudes` no tiene trigger de auditoría, así que ninguna de esas escrituras
aparece en `audit_log`.

### Por qué importa

Una solicitud confirmada es la constancia de que el almacén entregó prendas y de que la tienda las
recibió. Fabricarla —o borrarla— sin autoridad rompe el inventario físico, que es hoy lo único que
respalda dónde está cada terno. Además `codigos_prenda` asocia códigos reales (`TN-042`) a esa
entrega.

---

## 2. Lo que NO cambia esta spec

- **No** cambia quién puede hacer qué desde la pantalla. Lo que la interfaz ya permitía sigue
  permitido y lo que negaba sigue negado; lo único nuevo es que ahora la base también lo niega.
- **No** toca el motor de sueldos ni el pipeline.
- **No** resuelve que todas las personas tengan las cuatro sedes: es un dato y la decisión es del
  dueño (spec paraguas §4).
- **No** mueve inventario al confirmar (eso es F25, y depende de la decisión 8 del dueño: si la
  prenda se mueve al entregar o al confirmar).

---

## 3. El diseño

### 3.1 Partir la política en dos, y dejar UPDATE y DELETE sin ninguna

Con RLS activa, **la ausencia de política deniega**. Ése es el mecanismo: no hay nada que
"esquivar" porque no hay puerta.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `solicitudes` | condición actual (admin · almacén · sede propia) | condición actual **+ la fila nace neutra** | *sin política* → sólo por RPC | *sin política* → nadie |
| `solicitud_items` | padre visible | padre visible **+ contadores en cero** | *sin política* → sólo por RPC | *sin política* → nadie |

**"La fila nace neutra"** es el único agregado sobre lo que pidió la auditoría, y responde a que la
misma familia de ataque funciona por `POST`: crear directamente una solicitud ya `confirmada`, o a
nombre de otra persona, hace exactamente el mismo daño que el `PATCH` de F29, y cerrar sólo el
`PATCH` lo dejaría abierto. El `with check` de INSERT exige por lo tanto `estado = 'pendiente'`,
`confirmado = false`, `solicitante_id = auth.uid()` y los cuatro `*_por_id` de transición en
`null`. Son exactamente los valores que produce `solicitud_crear` (0056:298-300, todos por defecto
de columna), así que el camino legítimo no cambia.

En `solicitud_items` el equivalente es `cantidad_enviada = 0`, `cantidad_recibida = 0` y
`estado_item = 'pendiente'`: los defaults que pone `solicitud_crear` (0056:302-311).

### 3.2 Las RPC de transición pasan a `security definer`

Las seis RPC de la 0056 son `security invoker`: corren con la RLS del actor. Si se les quita la
política de UPDATE, dejan de poder escribir. Por eso las cinco que **actualizan** pasan a
`security definer` con `set search_path = public`:

| RPC | Guard que ya tiene adentro | Fuente |
|---|---|---|
| `solicitud_aprobar` | `private.app_es_gestor_solicitudes()` | 0056:323 |
| `solicitud_rechazar` | `private.app_es_gestor_solicitudes()` | 0056:359 |
| `solicitud_entregar` | `private.app_es_gestor_solicitudes()` | 0056:390 |
| `solicitud_confirmar` | `admin` o la sede que pidió | 0056:434 |
| `solicitud_deshacer` | gestor, o la sede que confirmó, según el destino | 0056:481-490 |

El cambio **no afloja nada**: la autoridad ya estaba escrita adentro de cada una, y ahora es la
única que queda en pie. `definer` sólo les devuelve el permiso de escritura que la política nueva
les saca.

> `solicitud_deshacer` no figuraba en el encargo de la auditoría, pero también escribe sobre
> `solicitudes` y `solicitud_items`. Dejarla `invoker` habría dejado el botón "Deshacer" muerto
> desde el día que se aplique la migración. Se incluye por eso.

`solicitud_crear` **se queda `invoker`**: es la única que sólo inserta, la política de INSERT sigue
existiendo, y mantenerla bajo la RLS real del actor es el permiso más chico que alcanza.

Efecto secundario aceptado: bajo `definer` la RLS ya no filtra el `select ... for update` interno,
así que una solicitud de otra sede pasa de contestar *"Solicitud no encontrada"* a contestar
`SIN_PERMISO`. Es un mensaje más honesto y no habilita nada nuevo.

### 3.3 El único camino que hoy escribe sin RPC: marcar como impresa

`apps/erp-web/lib/solicitudes-repo.ts:325-333` marca `pedido_impreso` / `confirmacion_impresa` con
un `update` plano. Sin política de UPDATE ese `update` no falla: **afecta cero filas en silencio**,
que es la peor forma de romperse.

Se resuelve con una RPC chica, `solicitud_marcar_impreso(p_id, p_tipo)`, `security definer` con su
guard adentro: la misma condición que hoy decide si esa persona ve la solicitud (admin, almacén o
sede propia). Ni más ni menos permiso que hoy.

**Por qué una RPC y no una política de UPDATE acotada a esas columnas.** La RLS de Postgres no sabe
de columnas: acotar por columna exige `revoke update on solicitudes from authenticated` +
`grant update(pedido_impreso, ...)`, es decir mover la regla a la capa de *grants*, donde no la
busca nadie y donde el próximo `alter table` la puede pisar sin ruido. Además volvería a existir
una política de UPDATE sobre la tabla, que es justo la superficie que esta spec elimina: cualquier
error futuro en su `with check` reabre el agujero entero. La RPC deja la regla en el mismo lugar
que las otras seis, es explícita, y queda auditada por el trigger de §3.4.

### 3.4 Trigger de auditoría

`solicitudes` pasa a tener `trg_audit_solicitudes` con la función genérica
`private.audit_log_trigger()` (0058:84), la misma de las cinco tablas sensibles. Registra en
`audit_log` el antes y el después de cada INSERT/UPDATE/DELETE con `auth.uid()` como actor, y su
cuerpo está envuelto en su propio `exception when others then null`, así que un fallo de auditoría
nunca bloquea la operación real.

`solicitud_items` queda **fuera** a propósito: es alta frecuencia (una fila por ítem por
solicitud), mismo criterio con el que la 0058 dejó afuera a `prenda_pasada`. El antes/después de la
cabecera alcanza para reconstruir quién movió qué.

---

## 4. Cómo se comprueba

`packages/db/pruebas/0087_solicitudes_escritura_directa.prueba.sql`, corrida entera dentro de una
transacción que termina abortando. Monta una solicitud entregada y otra pendiente, y **se hace
pasar por una persona de ventas sin autoridad de almacén** (`set_config('role','authenticated')` +
`request.jwt.claims`; sin ese cambio de rol las políticas ni se evalúan y la prueba pasaría sin
comprobar nada — aprendizaje del 22-ago).

Promesas que ataca, en este orden:

1. el `update` plano de F29 afecta **cero filas** y el estado no se mueve;
2. el `delete` plano afecta cero filas;
3. el `update` plano sobre `solicitud_items` afecta cero filas;
4. el `insert` directo de una solicitud ya `confirmada` es rechazado;
5. el `insert` directo a nombre de otra persona es rechazado;
6. la **lectura** sigue funcionando (no se rompió lo que andaba);
7. `solicitud_crear` sigue funcionando para esa misma persona;
8. `solicitud_aprobar` le sigue contestando `SIN_PERMISO`;
9. como gestor, `solicitud_aprobar` → `solicitud_entregar` → `solicitud_deshacer` funcionan
   **aunque ya no exista política de UPDATE** (esto es lo que prueba que `definer` era necesario);
10. `solicitud_confirmar` funciona para la sede que pidió;
11. `solicitud_marcar_impreso` funciona, y el `update` plano de esa misma columna no;
12. queda rastro en `audit_log` para la tabla `solicitudes`.

---

## 5. Riesgo

El riesgo real no es que algo quede abierto: es que algo que hoy funciona quede **cerrado en
silencio**. Un `update` sin política no da error, devuelve cero filas. Por eso el inventario de
caminos de escritura de §3.3 se hizo por búsqueda exhaustiva sobre `apps/erp-web`
(`from('solicitudes')`, `solicitud_items`, `.update(`, `.delete(`) y arrojó exactamente un camino
fuera de las RPC —el de marcar impreso— que esta spec convierte en RPC. La prueba de §4 vuelve a
recorrer los caminos legítimos uno por uno justamente para que ese modo de fallo no pase
inadvertido.

---

## 6. Lo que queda anotado para el dueño

Ningún parámetro de negocio nuevo. La única decisión que esta spec tomó por su cuenta —y que se
anota en `docs/pendientes-negocio.md`— es que **borrar una solicitud deja de ser posible desde la
aplicación**: hoy nadie la borra (no hay pantalla ni repo que lo haga) y el camino previsto para
revertir es `solicitud_deshacer`. Si el dueño quiere un borrado real, es una RPC nueva con su
autoridad, no una política de DELETE.
