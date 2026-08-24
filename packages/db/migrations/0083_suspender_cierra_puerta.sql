-- 0083_suspender_cierra_puerta.sql — una persona suspendida deja de existir para la RLS
--
-- Implementa docs/superpowers/specs/permisos/2026-08-23-suspender-cierra-la-puerta-design.md §3,
-- cerradura C-3.
--
-- EL PROBLEMA. `empleados.activo` se escribía y nadie la miraba. Ni el login, ni la sesión, ni el
-- middleware, ni ninguno de los helpers de RLS. Reproducido contra esta base dentro de una
-- transacción descartada: con activo=false, la persona suplantada siguió leyendo sus reportes y
-- sus prendas, y `private.app_sedes()` siguió devolviéndole su sede.
--
-- ESTA ES LA TERCERA CERRADURA, no la única. La aplicación banea al usuario en Supabase Auth
-- (puerta de calle) y corta la sesión que ya estuviera abierta (getSesion). Ésta es la que sigue
-- puesta aunque alguien escriba la columna con un update directo, o aunque la aplicación tenga un
-- bug: a partir de acá, para la base, una persona suspendida no tiene rol ni sedes.
--
-- `private.app_es_almacen()` queda igual A PROPÓSITO: hoy no hay nadie con rol 'encargado_almacen'
-- ni 'confeccionista', y esa función tiene su propio problema (devuelve true para los dos roles,
-- ver 0006_pipeline_rls.sql:22-25) que se resuelve en otra migración. Meter dos cambios en la misma
-- función haría imposible saber cuál rompió qué.
--
-- Idempotente: las tres son `create or replace function`. No tocan datos ni esquema.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas.
--   · Toda tabla con RLS necesita policy de LECTURA y de ESCRITURA.

-- ── Quién es administrador ───────────────────────────────────────────────────────────────────
-- Un administrador suspendido no es administrador. Es el caso que más duele si se olvida: quien
-- se va conservando el rol sigue viendo el sueldo, el documento y la nota de las once personas.
create or replace function private.app_es_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.empleados e
    where e.id = auth.uid() and e.rol in ('admin','dueno') and e.activo
  );
$function$;

-- ── En qué sedes trabaja ─────────────────────────────────────────────────────────────────────
-- De esta función cuelgan casi todas las políticas por sede (reportes, solicitudes,
-- notificaciones, inventario). Para una persona suspendida devuelve el conjunto vacío, y una
-- política `sede_cod in (select private.app_sedes())` con el conjunto vacío no deja pasar nada.
--
-- La primera rama lee empleado_tiendas, que no tiene columna `activo`: por eso el `exists` sobre
-- empleados. Sin él, quien tuviera tiendas asignadas conservaría el acceso a todas ellas.
create or replace function private.app_sedes()
returns setof text
language sql
stable
security definer
set search_path to ''
as $function$
  select et.sede_cod
    from public.empleado_tiendas et
   where et.empleado_id = auth.uid()
     and exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo)
  union
  select e.sede_cod
    from public.empleados e
   where e.id = auth.uid() and e.sede_cod is not null and e.activo;
$function$;

-- ── Quién puede ver datos de personas ────────────────────────────────────────────────────────
-- El permiso de módulo 'datos_personas' (0067) sigue mandando; lo que se agrega es que la persona
-- tiene que seguir trabajando acá para ejercerlo.
create or replace function private.app_ve_datos_personas()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.empleados e
    left join public.permisos_modulos p
      on  p.rol    = coalesce(e.rol_cod, e.rol)
      and p.modulo = 'datos_personas'
    where e.id = auth.uid()
      and e.activo
      and (
        e.rol in ('admin', 'dueno')
        or 'ver' = any(coalesce(p.acciones, '{}'::text[]))
      )
  );
$function$;
