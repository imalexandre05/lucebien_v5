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
