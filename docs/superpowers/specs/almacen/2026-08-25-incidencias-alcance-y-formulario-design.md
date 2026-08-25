# SPEC — Incidencias: cada quien ve las suyas, y el formulario deja de preguntar lo que ya sabe

> **Qué es.** Tres correcciones al módulo de incidencias que salieron de la reunión con el
> administrador del 25-ago-2026 (ver [la hoja de ruta](../2026-08-25-reunion-admin-hoja-de-ruta.md),
> ítems E-1, E-3 y E-4). Dos son de formulario; la primera toca quién ve datos de personas y por eso
> esta spec existe.
>
> **Zona de rigor:** spec corta con cuidado extra en C-1. No toca la cadena del sueldo ni el
> pipeline, pero **sí cambia qué filas de personas ve cada sesión**, que es el no-negociable 3.

---

## 1. Las tres anotaciones, textuales

> *«incidencias solo a su nombre»* · *«el admin sí puede ver de todos»*
>
> *«incidencias solo en "otros" se puede ver gravedad y requiere descripción»*
>
> *«incidencias en lo demás si tiene sus puntos en contra y ya tiene gravedad, es redundante»*

---

## 2. C-1 — El colaborador ve sólo las incidencias a su nombre

### Lo que pasa hoy, verificado

La política `inc_select` quedó, tras la migración `0092` (24-ago-2026), en:

```sql
using (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()))
```

Es decir: administrador, rol de almacén, **o cualquiera cuya sede coincida**. Y como las once
personas activas tienen las cuatro sedes asignadas —confirmado por el administrador el 24-ago como
intencional, por la rotación— en la práctica **hoy todos ven todas las incidencias de todos**.

### Por qué esto no contradice lo que dijo el 24-ago

El 24-ago contestó: *«sí [ven el listado], pero no pueden ver quién reportó, solo el admin»*. Sobre
eso se construyó la `0092`. Ahora dice *«solo a su nombre»*. Las dos frases conviven: lo que quiso
acotar es el **alcance de las filas**, no la existencia de la pantalla. Con las cuatro sedes por
persona, «por sede» dejó de acotar nada — y eso es justo lo que suena que le llamó la atención.

### El diseño

`inc_select` pasa a:

```sql
using (
  private.app_es_admin()
  or responsable_id = auth.uid()
  or reportado_por_id = auth.uid()
)
```

- **`responsable_id = auth.uid()`** es la lectura literal de *«a su nombre»*, y es la que importa:
  una incidencia a mi nombre me descuenta puntos de mi evaluación. Tengo que poder verla.
- **`reportado_por_id = auth.uid()`** se agrega por una razón concreta, no por generosidad: sin
  esto, alguien registra una incidencia y **desaparece de su pantalla al guardarla**, lo que se lee
  como que no se guardó. No filtra nada nuevo —ya sé lo que yo mismo reporté— y no choca con C-2 de
  la spec del 24-ago, que oculta el NOMBRE del reportante a los no-administradores: si soy yo, no
  hay nada que ocultarme.
- **`private.app_es_almacen()` se va.** No es un descuido: ese helper devuelve `true` también para
  `confeccionista` (`0006_pipeline_rls.sql:22-25`), y este repo ya pagó caro dejarlo sobre datos de
  personas — una incidencia con responsable **es** un dato de una persona, porque le mueve la nota.
  Si el almacén necesita ver más que lo suyo, es una decisión del administrador, no un efecto
  lateral de un helper mal nombrado.
- **`sede_cod in (...)` se va**, que es exactamente lo que el administrador pidió acotar.

`inc_insert`, `inc_update` e `inc_delete` **no se tocan**: quién puede registrar y quién puede
editar no cambia.

### Lo que esto revierte, dicho explícito

La migración `0092` es de ayer y abrió la lectura por sede. Esta la vuelve a cerrar, más ajustada.
No es que la `0092` estuviera mal: resolvió el problema que había entonces —los operativos veían
«0 registradas» siempre, porque `inc_select` era admin-only y contradecía el permiso de módulo—. Lo
que cambia es la respuesta del administrador sobre **cuánto** deben ver.

---

## 3. C-2 — El formulario pregunta gravedad y descripción sólo cuando hace falta

### Lo que pasa hoy

`incidencia_tipos` (21 tipos activos, verificado contra `scilb` el 25-ago-2026) tiene una columna
`nivel_default` y una `puntos_default` **por tipo**. Ejemplos reales: «Dejar prendida la plancha» →
`Alto` / 4 puntos; «Hurto o robo de prenda» → `Alto` / 10; «Dejar prendidas las luces» → `Bajo` / 1.

O sea: **el catálogo ya sabe la gravedad y los puntos de cada tipo**. Preguntárselos de nuevo a
quien registra es pedirle que decida algo que ya está decidido — y peor, deja que dos personas
carguen la misma falta con gravedades distintas.

Y hay **exactamente un tipo** en la categoría `Otros`: **«Otro (especificar)»**. Su propio nombre
dice qué se espera de él.

### El diseño

En el formulario de registrar una incidencia:

| Si el tipo elegido… | Gravedad | Descripción |
|---|---|---|
| tiene `categoria = 'Otros'` (hoy, «Otro (especificar)») | **se muestra y se elige**, arrancando en `nivel_default` | **obligatoria** — sin ella no se guarda |
| es cualquier otro de los 20 | **no se muestra**: se toma `nivel_default` del catálogo | opcional, como hoy |

Los **puntos** salen siempre de `puntos_default` del tipo, en los dos casos — eso ya funciona así y
no cambia. Lo que se quita es la pregunta redundante, no el dato.

**El administrador conserva el control:** los `nivel_default` y `puntos_default` de los 21 tipos se
editan desde `/configuracion/tipos-incidencia`, que ya existe. Que el formulario deje de preguntarlo
no lo vuelve fijo — lo vuelve **una decisión del catálogo en vez de una del turno**.

### Detalle que no se puede pasar por alto

La pantalla de edición del administrador (donde hoy puede cambiar responsable, nivel y puntos de una
incidencia ya registrada) **no se toca**. Corregir a mano después sigue estando permitido; lo que
cambia es qué se pregunta al momento de registrar.

---

## 4. Lo que esta spec NO hace

- **No** cambia quién puede REGISTRAR una incidencia (`inc_insert` intacta).
- **No** cambia cómo se calculan los puntos de penalidad ni cómo entran a la evaluación.
- **No** toca el catálogo `incidencia_tipos` ni sus valores: los 21 tipos y sus niveles quedan como
  están.
- **No** agrega ningún parámetro de negocio nuevo (no-negociable 5).

## 5. Cómo se comprueba

Prueba de migración para C-1 (`packages/db/pruebas/00XX_incidencias_solo_a_su_nombre.prueba.sql`),
con el patrón autodescartable de la `0092`:

| # | Caso | Esperado |
|---|---|---|
| 1 | Un no-admin lee una incidencia donde él es `responsable_id` | La ve |
| 2 | El mismo lee una donde él es `reportado_por_id` pero no responsable | La ve |
| 3 | El mismo lee una de su MISMA sede, donde no es ni responsable ni reportante | **No la ve** — es el cambio central |
| 4 | El administrador lee las tres | Las ve todas |
| 5 | `inc_insert` sigue dejando registrar a un operativo de esa sede | Sin cambios |
| 6 | `inc_update` / `inc_delete` siguen admin-only | Sin cambios |

Para C-2, en la pantalla: elegir «Otro (especificar)» muestra el selector de gravedad y no deja
guardar sin descripción; elegir cualquier otro tipo no muestra el selector, y la incidencia queda
guardada con el `nivel_default` y los `puntos_default` de ese tipo.
