# SPEC — Cerrar los tres agujeros de aislamiento y hacer configurable quién ve datos de personas

Corrige tres defectos vivos en producción que violan el no-negociable 3, y de paso convierte
"quién puede ver datos de otras personas" en algo que el administrador edita desde una pantalla en
vez de algo escrito a fuego en el SQL.

> Encontrados el 14-ago-2026 mapeando el esquema para la capa de datos de sueldos. **No son
> defectos de ese diseño: estaban antes.** Verificados leyendo las migraciones, no otro documento.
>
> ✅ **APLICADA Y VERIFICADA contra `scilb` el 14-ago-2026.** Comprobado después de aplicar:
> cero policies conservan `app_es_almacen()` sobre datos de personas, las tres usan el helper
> nuevo, el cuerpo de `evaluacion_componentes` quedó en `private` con el envoltorio plpgsql
> delante, `empleado_tiendas` pasó de 1 a 2 policies, y el módulo `datos_personas` tiene sus
> 5 filas vacías listas para repartir.

---

## 1. El problema de fondo: dos sistemas de permisos que no se hablan

Este repo tiene **dos** capas de permisos, y sólo una es editable.

| Capa | Dónde vive | ¿La edita el administrador? | Qué controla |
|---|---|---|---|
| **Matriz de módulos** | Tabla `permisos_modulos`, pantalla `/configuracion/permisos` | **Sí**, rol por rol y módulo por módulo, incluidos los roles derivados | Qué ve y qué puede hacer en la interfaz |
| **RLS** | Policies en SQL, con los roles escritos a mano | **No** | Qué filas devuelve la base de datos |

La segunda es la que de verdad protege los datos, y hoy tiene los roles quemados en el SQL. Por eso
el administrador puede quitarle a alguien el módulo de pagos desde la pantalla y esa persona
**sigue pudiendo leer la tabla** por la API.

El pedido de Alexander (14-ago-2026) es que la asignación de permisos sea una realidad para el
administrador y que pueda repartirlos "a gusto y de manera totalmente personalizada". Esta spec
hace que la RLS respete la misma matriz que él edita.

---

## 2. Los tres defectos

### P-01 🔴 Un confeccionista lee el sueldo, la asistencia y los votos de todo el equipo

`private.app_es_almacen()` devuelve `true` para **dos** roles:

```sql
-- 0006_pipeline_rls.sql:22-25
where e.id = auth.uid() and e.rol in ('encargado_almacen','confeccionista')
```

Tiene sentido para el pipeline de prendas, que es para lo que se creó. Pero ese mismo helper quedó
en la policy de **lectura** de tres tablas de datos personales:

| Tabla | Migración | Qué expone |
|---|---|---|
| `pagos` | `0028_pagos_rls.sql:6` | Cuánto cobra cada uno |
| `asistencias` | `0025_asistencias.sql:14` | A qué hora entra y sale cada uno |
| `evaluaciones_valores` | `0057_valores360_competencias_pagos.sql:48` | Quién puntuó a quién en Valores 360° |

Rompe **tres de los cuatro aislamientos**. Hoy, en producción, la confeccionista del almacén puede
leer el sueldo de sus 17 compañeros y ver quién votó a quién en la evaluación entre pares — que es
justamente lo que el dueño pidió que nadie viera salvo el administrador.

### P-02 🔴 Cualquier usuario logueado pide los datos de evaluación de cualquiera

`evaluacion_componentes(p_empleado uuid, p_desde date, p_hasta date)` es `security definer`
—bypassa RLS por diseño—, está concedida a `authenticated`, y **no comprueba quién la llama**
(`0032`, `0044`, `0053`).

Un colaborador la invoca con el uuid de otro y recibe sus tardanzas, incidencias, puntos y
valores.

### P-03 🟡 `empleado_tiendas` tiene RLS activa y sólo policy de `select`

Sus `insert` fallan con 42501 y sus `delete` quitan cero filas. **En silencio**: la pantalla dice
que guardó y no guardó nada.

---

## 3. La corrección

### 3.1 Un helper nuevo que lee la matriz editable

```sql
create or replace function private.app_ve_datos_personas()
  returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.empleados e
    left join public.permisos_modulos p
      on  p.rol    = coalesce(e.rol_cod, e.rol)
      and p.modulo = 'datos_personas'
    where e.id = auth.uid()
      and (
        e.rol in ('admin', 'dueno')            -- siempre, no es configurable
        or 'ver' = any(coalesce(p.acciones, '{}'))
      )
  );
$$;
```

**Tres propiedades que importan:**

- **Seguro por defecto.** Sin ninguna fila del módulo `datos_personas`, sólo pasan `admin` y
  `dueno`. Nadie hereda acceso por accidente.
- **Configurable de verdad.** El administrador le da o le quita la acción `ver` a cualquier rol —
  base o derivado — desde `/configuracion/permisos`, y la **base de datos** obedece, no sólo la
  pantalla.
- **Respeta el rol derivado.** `coalesce(e.rol_cod, e.rol)` es el mismo criterio que ya usa
  `puede()` en el core, así que las dos capas coinciden.

`admin` y `dueno` quedan fuera de la matriz a propósito: son los dueños del negocio y quitarles el
acceso a sí mismos dejaría el sistema sin nadie que pueda arreglarlo.

### 3.2 Las tres policies

Se reemplaza `private.app_es_almacen()` por `private.app_ve_datos_personas()` en las policies de
lectura de `pagos`, `asistencias` y `evaluaciones_valores`. Nada más cambia: sigue pasando el
administrador y sigue pasando uno mismo.

`app_es_almacen()` **no se toca**: sigue siendo correcta para lo que se creó, que es el pipeline.

### 3.3 El guard de `evaluacion_componentes`

La función se conserva tal cual y se le pone un portero delante, **sin reescribir su cuerpo**:

1. Se renombra la función actual a `private.evaluacion_componentes_datos` con `alter function`.
   El cuerpo no se toca, así que no hay riesgo de transcribir mal 55 líneas de SQL.
2. Se crea con el nombre original un envoltorio en plpgsql que valida y delega:

```sql
if not (private.app_es_admin() or p_empleado = auth.uid()) then
  raise exception 'PERMISO:no puede consultar los componentes de otra persona';
end if;
return private.evaluacion_componentes_datos(p_empleado, p_desde, p_hasta);
```

La firma no cambia, así que ningún repo ni pantalla se entera.

### 3.4 Las policies de escritura de `empleado_tiendas`

Se agregan `insert`, `update` y `delete` para administrador, igual que el resto de las tablas de
personas.

---

## 4. Qué NO cambia

- La pantalla `/configuracion/permisos` funciona igual; sólo aparece un módulo más.
- Ninguna firma de RPC. Ningún repo de TypeScript. Ninguna pantalla.
- `app_es_almacen()` sigue existiendo con su definición actual para el pipeline.
- Nadie pierde acceso a lo suyo: la parte `empleado_id = auth.uid()` de cada policy queda intacta.

**Quién sí pierde acceso:** los roles `encargado_almacen` y `confeccionista` dejan de ver los
pagos, las asistencias y los votos de los demás. Si alguno de los dos lo necesitaba de verdad, el
administrador se lo devuelve desde la pantalla — que es exactamente el punto.

---

## 5. Cómo se comprueba que funcionó

Después de aplicar, con una cuenta de rol `confeccionista`:

```sql
select count(*) from pagos;          -- debe devolver sólo los propios
select count(*) from asistencias;    -- ídem
select count(*) from evaluaciones_valores;  -- sólo donde es evaluado o evaluador
select evaluacion_componentes('<uuid de otro>', '2026-08-01', '2026-08-31');
-- debe fallar con PERMISO:...
```

Y con el administrador: los cuatro siguen devolviendo todo.

---

## 6. Pasos

1. **Migración `0067_aislamiento_datos_personas.sql`** — el helper, las tres policies, el guard y
   las policies de `empleado_tiendas`. Idempotente.
2. **Sumar el módulo `datos_personas`** a la lista de módulos de la pantalla de permisos, con la
   acción `ver`, para que el administrador lo pueda repartir. Es un cambio de TypeScript y va
   aparte.
3. **Correr el subagente verificador** antes de mergear: esto toca permisos y aislamiento, que es
   zona crítica según `docs/rigor-por-zona.md`.

> **Esta migración se lleva el número `0067`**, así que la de sueldos pasa a ser la `0068`. Son
> independientes: ninguna toca las tablas de la otra.

---

## 7. Lo que esto deja pendiente

- **Revisar el resto de las policies con el mismo criterio.** Se corrigieron las tres que exponen
  datos de personas. Falta pasar la misma lupa por las otras tablas sensibles.
- **Las RPC `security definer` sin guard.** `evaluacion_componentes` era la más grave, pero hay que
  auditar las demás: una función que bypassa RLS y no comprueba quién la llama es una puerta
  abierta, y el patrón se repite fácil.
- **Que la matriz de permisos cubra más que un módulo.** Esta spec agrega `datos_personas`. La
  meta de Alexander es que todo permiso relevante sea repartible desde la pantalla; esto es el
  primer paso, no el último.

---

_Verificado contra las migraciones `0006`, `0025`, `0028`, `0032`, `0044`, `0045`, `0050`, `0053`
y `0057`. 14 de agosto de 2026._
