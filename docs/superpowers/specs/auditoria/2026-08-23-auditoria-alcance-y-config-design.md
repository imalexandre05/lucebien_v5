# SPEC — Que el rastro de auditoría se pueda alcanzar, y que Configuración deje rastro

> **Qué es.** Dos defectos que encontró la auditoría del 23-ago-2026 sobre el módulo
> `/administracion/auditoria` (F05/F46 y F35) y que se verificaron uno por uno contra la base viva
> del proyecto `scilb`. Los dos tienen la misma forma: la evidencia existe o debería existir, pero
> nadie puede llegar a ella.
>
> **Por qué importa ahora.** El ERP entra en producción con once personas. La auditoría es la única
> respuesta que el sistema tiene a «¿quién cambió esto?». Hay tres administradores; mientras esa
> pregunta tenga tres respuestas posibles y ninguna evidencia, el módulo promete algo que no
> cumple.
>
> **Zona de rigor:** spec completa — toca el esquema (una función y un trigger nuevos, migración
> `0088`). La parte de interfaz no toca reglas de negocio: sólo deja de recortar lo que la base ya
> guarda.

---

## 0. El principio que se rompe

El no-negociable 7 dice que lo que se escribe se verifica contra el código o contra la base. Este
módulo hace lo contrario con quien lo mira: le muestra una lista que **parece** el rastro completo
y es una ventana de 200 filas recortada en el navegador. Quien elige «Pedidos» y ve *Sin
movimientos* concluye que no pasó nada, cuando hay 138 movimientos de pedidos guardados.

Una pantalla que devuelve vacío sin decir que buscó sólo en una parte no es una pantalla
incompleta: es una pantalla que miente.

---

## 1. Lo que está mal hoy (verificado el 23-ago-2026)

### A-1 — La pantalla no alcanza el rastro (F05/F46)

`app/administracion/auditoria/page.tsx:31` llama `listarAuditoria()` **sin argumentos**.
`lib/auditoria-repo.ts:58-64` corta en 200 filas ordenadas por fecha descendente, y
`cliente.tsx:44-53` filtra **en memoria** sobre esas 200. El repositorio ya acepta los cuatro
filtros (`tabla`, `operacion`, `desde`, `hasta`, líneas 66-70): nadie se los pasa.

Reparto real de `audit_log` (5.239 filas, `select tabla, count(*) group by 1`):

| tabla | filas |
|---|---|
| `asistencias` | 4.809 |
| `sueldo_acuerdo_turnos` | 175 |
| `pedidos` | 138 |
| `empleados` | 58 |
| `caja_movimientos` | 31 |
| `sueldo_acuerdos` | 16 |
| `evaluaciones_mensuales` | 10 |
| `pagos` | 2 |

`asistencias` es el 92 % del total, así que la ventana de 200 filas está copada por ella: pedidos,
caja y pagos aportan **cero** a lo que la pantalla llegó a traer. Elegir esos filtros devuelve una
lista vacía con el rastro entero guardado en la base.

### A-2 — El desplegable no nombra todo lo que la base audita (F05/F46)

`lib/auditoria-tipos.ts:19-29` declara nueve tablas. `pg_trigger` devuelve **trece** triggers
`trg_audit_*` vivos: las nueve menos `solicitudes` (que llega con la `0087`), más
`sueldo_liquidaciones`, `sueldo_liquidacion_lineas`, `sueldo_liquidacion_pagos`,
`sueldo_movimientos` y `sueldo_ventas`. Cinco cubos —los cinco de la cadena del sueldo— no tienen
ni entrada en el filtro.

### A-3 — Configuración no deja rastro (F35)

Ninguna tabla de configuración tiene trigger de auditoría, pese a que la migración que creó el
mecanismo se llama `0058_config_tipado_auditoria`. `config` guarda los pesos de la evaluación, los
puntos de cada etapa del pipeline y las horas de cierre de turno: parámetros que deciden una nota y
un sueldo. Hay tres administradores. Hoy, quién movió uno de esos parámetros es una pregunta con
tres respuestas y ninguna evidencia.

### A-4 — `fila_id` no sabe identificar una fila sin columna `id`

`private.audit_log_trigger()` (`0058:93`) arma el identificador con
`coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', '')`. La clave primaria de `config` es
`clave` y la tabla **no tiene columna `id`** (verificado en `information_schema.columns`). Sin
arreglar esto, auditar `config` produciría filas con `fila_id = ''`: el registro diría que alguien
cambió *algo* de configuración, sin decir **qué parámetro**. Es la mitad inútil de la respuesta.

---

## 2. Lo que se hace

### B-1 — El filtro sube al servidor

Una server action en `app/administracion/auditoria/actions.ts` que reciba los cuatro filtros y
llame a `listarAuditoria({ tabla, operacion, desde, hasta })`. `cliente.tsx` la invoca cuando
cambia un filtro, en vez de recortar en memoria lo ya traído.

La acción **revalida la sesión y el permiso** con el mismo criterio que `page.tsx`
(`puede(matriz, rol, 'auditoria', 'ver', rolCod)`). Una server action exportada es un extremo
público: dejarla sin control repetiría, del lado del servidor, exactamente el error que esta
auditoría encontró en la base — que la regla viva sólo en la pantalla.

El límite de 200 **se conserva** y pasa a ser lo que siempre debió ser: el tamaño de la ventana de
*cada consulta*, no del módulo entero. Con el filtro en el servidor, pedir «Pedidos» trae los 138
movimientos de pedidos. El aviso de pie deja de decir «Mostrando los N más recientes» a secas y
pasa a decir que hay más y que hay que acotar el rango.

El filtro de **Actor** sigue siendo en memoria a propósito: el repositorio filtra por `actorId`
(uuid) y la pantalla busca por nombre escrito. Con los otros cuatro filtros ya aplicados en el
servidor, la ventana sobre la que busca es la correcta. Queda anotado como límite conocido, no como
arreglo pendiente de esta spec.

### B-2 — Fechas en hora Perú

`listarAuditoria` compara `at` (`timestamptz`) contra `'YYYY-MM-DDT00:00:00'` **sin huso**, que
Postgres interpreta en UTC, mientras la columna se muestra en pantalla convertida a
`America/Lima` (`fechaHoraCorta`, `lib/fechas.ts:59-71`). Filtrar «23 de agosto» dejaba fuera todo
lo ocurrido después de las 19:00 de ese día en Perú y metía cinco horas del día anterior. Los dos
extremos pasan a llevar el desfase explícito `-05:00`.

Esto no era visible mientras el filtro corría en memoria sobre un ISO en UTC; al volverlo el filtro
real, corregirlo es parte del mismo cambio. Es el no-negociable 4.

### B-3 — El desplegable nombra las quince tablas que la base audita

`TABLAS_AUDITADAS` y `TABLA_LABEL` incorporan las cinco `sueldo_*` que faltaban y `config`. Con
quince opciones más «Todas», el control de pastillas deja de ser el adecuado —su propio comentario
fija el límite en cinco opciones (`components/ui/opcion-botones.tsx:13-15`)— y el filtro de tabla
pasa a un `<select>` denso, como ya lo son los dos campos de fecha de esa misma barra.

### B-4 — `config` se audita, y el registro dice qué parámetro cambió

Migración `0088`, dos piezas:

1. `private.audit_log_trigger()` arma `fila_id` con
   `coalesce(new->>'id', old->>'id', new->>'clave', old->>'clave', '')`. El agregado sólo entra en
   juego cuando no hay columna `id`, así que **ninguna de las trece tablas ya auditadas cambia de
   comportamiento**.
2. Trigger de auditoría sobre `config`, **partido en dos**:
   - `after insert or delete` sin condición;
   - `after update ... when (old.* is distinct from new.*)`.

   El motivo de partirlo está medido: `/configuracion` manda **todos** los parámetros en cada
   *Guardar* (`app/configuracion/cliente.tsx:212` arma el arreglo con `items.map(...)` completo y
   `lib/config-repo.ts:94` hace un `upsert`), y `config` tiene 45 filas. Un trigger sin condición
   escribiría 45 filas de `audit_log` por cada clic, 44 de ellas sin ningún cambio. El rastro
   quedaría enterrado bajo su propio ruido, que es el defecto A-1 otra vez. Un trigger combinado no
   admite cláusula `when` que mire `old`, de ahí los dos.

`permisos_modulos` **queda fuera a propósito**: esa matriz se borra y se reinserta entera en cada
*Guardar* (`permisos_guardar_matriz` hace `delete ... where true`), así que ahí ni siquiera la
condición `is distinct from` ayudaría — cada clic produciría 105 `DELETE` más 105 `INSERT`
legítimos. Auditar esa tabla necesita otro mecanismo (registrar la diferencia, no las filas), y eso
es más que el arreglo mínimo.

---

## 3. Lo que esta spec NO hace

- **No agrega `updated_at` ni `actualizado_por` a `config`.** El trigger ya responde quién y cuándo,
  con el antes y el después. Dos fuentes para el mismo dato es la forma en que se desincronizan.
- **No toca `permisos_modulos`, `roles`, `actividades_config`, `competencias_config` ni
  `alertas_reglas`** (ver B-4).
- **No pagina ni archiva `audit_log`.** Con 5.239 filas y 4.809 de una sola tabla, el filtro
  resuelve el problema de hoy. La paginación es la conversación del día que el volumen la pida.
- **No inventa ningún parámetro de negocio.** No hay ningún valor por defecto nuevo en este cambio.
- **No cambia quién puede leer `audit_log`.** Sigue siendo `audit_log_select` con
  `private.app_es_admin()`, y la tabla sigue sin policy de escritura: el único camino de escritura
  es el trigger `security definer` (`0058:71-77`).

---

## 4. Promesas que la prueba tiene que atacar

`packages/db/pruebas/0088_auditoria_config_y_tablas.prueba.sql`, con el patrón de las anteriores:
monta el escenario, ataca cada promesa y termina lanzando una excepción con el resultado, de modo
que la transacción se aborta y no queda ni una fila.

| # | Promesa | Cómo se ataca |
|---|---|---|
| P1 | Cambiar un parámetro de `config` deja una fila en `audit_log` | `update config set valor` sobre una clave de prueba y contar |
| P2 | Esa fila dice **qué** parámetro cambió | comprobar que `fila_id` es la clave y no la cadena vacía |
| P3 | Esa fila dice **quién** | `set_config('request.jwt.claims', …)` con un administrador real y comprobar `actor` |
| P4 | Guardar sin cambiar nada no escribe ruido | `update config set valor = valor` y comprobar que **no** aparece fila nueva |
| P5 | El alta y la baja de un parámetro sí quedan | `insert` y `delete` de una clave de prueba, una fila cada uno |
| P6 | Las trece tablas ya auditadas no cambian de comportamiento | `update` sobre una fila real de `asistencias` y comprobar que `fila_id` sigue siendo el `id` |
| P7 | `audit_log` sigue cerrada a la escritura directa | como `authenticated`, un `insert into audit_log` tiene que fallar |

La P4 y la P7 son las que importan de verdad: la primera es la que hace que el registro sirva para
buscar, y la segunda es la que hace que el registro sea prueba y no un cuaderno que cualquiera
puede reescribir.
