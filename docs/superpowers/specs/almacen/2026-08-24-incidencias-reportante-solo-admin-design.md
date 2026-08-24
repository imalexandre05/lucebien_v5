# SPEC — Quién reportó una incidencia lo ve sólo el administrador

> **Qué es.** `listarIncidencias()` calcula `reportadoPorNombre` (quién presentó la incidencia) y
> se lo manda a **cualquier sesión**, aunque ninguna pantalla lo dibuje hoy. Pasa a calcularse
> sólo cuando quien pide la lista es administrador.
>
> **De dónde sale.** Alexander respondió la pregunta pendiente de la auditoría sobre incidencias:
> *«sí, pero no pueden ver quién reportó, solo el admin puede»*.
>
> **Zona de rigor:** spec corta. No toca la cadena del sueldo ni el pipeline; cambia qué datos de
> personas llegan a qué sesión, que es zona de cuidado igual, así que queda escrito.

---

## 1. Lo que pasa hoy, con precisión

Los operativos ya pueden ver el listado de incidencias (migración 0065, confirmado: `confeccionista`,
`ventas_junior` y `ventas_junior_2` tienen el permiso de módulo `incidencias`). Eso está bien y no
se toca.

Lo que sí importa: `listarIncidencias()` (`apps/erp-web/lib/incidencias-repo.ts:44-52`) hace un
`select('*')` sin filtrar columnas y arma `reportadoPorNombre` para **todas** las filas, sin mirar
quién la está pidiendo. Ese valor viaja hasta el componente cliente (`app/incidencias/cliente.tsx`)
como parte de los props de cada fila.

**El JSX no lo dibuja hoy — para nadie, ni siquiera para el administrador** (confirmado: ninguna
referencia a `reportadoPorNombre` en `cliente.tsx`). Eso significa dos cosas a la vez:

1. El dato ya viaja en la carga de la página a **cualquier sesión** con el permiso de incidencias,
   aunque la pantalla no lo pinte. Quien abra las herramientas del navegador puede leerlo en el
   payload — es una fuga silenciosa, del mismo tipo que otras que esta auditoría ya cerró.
2. El administrador tampoco lo ve hoy: no hay ninguna pantalla que lo muestre. La respuesta de
   Alexander da por sentado que el admin sí puede verlo, y hoy no puede.

## 2. El diseño

### C-1 — El dato no sale del servidor si quien pregunta no es administrador

`listarIncidencias()` recibe un parámetro `esAdmin: boolean` (mismo patrón que ya usan otras
pantallas de este módulo — `page.tsx` ya calcula `esAdmin` y se lo pasa al cliente). Cuando es
`false`, la función arma `reportadoPorId: null, reportadoPorNombre: null` para cada fila, sin
consultar `mapaNombres()` para esa columna.

No es una regla de UI: es que el dato **no llega al navegador** de quien no es administrador,
aunque después nadie mire el payload.

### C-2 — El administrador sí lo ve, en alguna parte de la pantalla

Se agrega una línea chica «Reportado por: {nombre}» visible sólo cuando `esAdmin`, en el mismo
lugar donde hoy se muestra el responsable (o en el detalle expandido de la fila, lo que exija menos
cambios de layout). Sin esto, la respuesta de Alexander queda a medias: la mitad que dice «no
pueden ver» se cumple, la mitad que dice «sólo el admin puede» no se construye.

## 3. Lo que esta spec NO hace

- **No** cambia quién ve el listado de incidencias en sí: eso ya está bien (0065).
- **No** toca `responsableId`/`responsableNombre` — quién es responsable de la incidencia sigue
  siendo visible para todos, porque es distinto de quién la reportó y nadie pidió cambiarlo.
- **No** agrega auditoría a la tabla `incidencias`: es un tema aparte, ya cerrado por la auditoría
  del 23/24-ago (migración 0088 cubre `config`, no `incidencias`).

## 4. Cómo se comprueba

- Como colaborador (perfil `colaborador` del arnés E2E): pedir `/incidencias` y confirmar que el
  cuerpo de la página, en ningún punto, contiene el nombre de quien reportó una incidencia que no
  sea la propia sesión.
- Como administrador (perfil `admin`): confirmar que la línea «Reportado por» aparece.

---

## 5. Addendum — 24-ago-2026: la premisa §1 estaba mal en un punto

Al implementar C-1/C-2, el agente encontró que la premisa **«los operativos ya pueden ver el
listado» no es cierta a nivel de base**, aunque sí lo sea a nivel de permiso de módulo.

**Verificado contra `pg_policies` en scilb:** la política `inc_select` sobre `incidencias` es

```sql
using (private.app_es_admin())
```

**Sólo el administrador puede leer una fila**, sin excepción. La migración 0065 le dio a los tres
roles operativos el permiso de **módulo** (`ver` en `permisos_modulos`, lo que hace que el ítem
aparezca en el menú y la página no rebote), pero nunca tocó esta política de RLS. Resultado: hoy,
para cualquier operativo, `/incidencias` carga sin error y muestra **«0 registradas»** siempre —
no porque no haya incidencias de su sede, sino porque la base no le devuelve ninguna fila.

Esto contradice directamente la premisa de esta spec y la respuesta de Alexander («sí [pueden ver
el listado], pero no quién reportó»): hoy no ven el listado en absoluto.

### C-3 — La política de lectura se pone en línea con el resto del módulo

`inc_insert` (la política de escritura de este mismo módulo, migración 0056 o posterior) ya tiene
el patrón correcto:

```sql
with check (private.app_es_admin() OR private.app_es_almacen() OR sede_cod in (select private.app_sedes()))
```

`inc_select` pasa a usar la misma condición, ahora como `using`. Es el mismo criterio que ya
protege `reportes` (`rep_select`), `solicitudes` y el resto de las tablas por sede: administrador,
o el rol de almacén, o la sede de quien pregunta.

**Efecto práctico hoy:** como las once personas tienen las cuatro sedes en `empleado_tiendas`
(confirmado el 23-ago, y confirmado por Alexander el 24-ago como intencional — rotación temporal),
esta política deja ver, en la práctica, las incidencias de cualquier sede a cualquier persona. Es
el mismo comportamiento que ya tienen reportes y solicitudes: no es un aislamiento nuevo que se
rompe, es el mismo patrón que el resto del sistema ya usa.

### Cómo se comprueba (se suma a §4)

Prueba de la migración `packages/db/pruebas/0092_incidencias_rls_por_sede.prueba.sql`, con la forma
de las demás: monta una incidencia de prueba, suplanta a una persona no-admin, confirma que la lee
(hoy no podía), suplanta a alguien sin ninguna sede en común (si existiera) para confirmar que la
política sigue negando fuera de sede, y confirma que `inc_update`/`inc_delete` siguen intactas
(esta spec no las toca).
