-- 0050_empleados_roles_derivados.sql — Fase 1 del plan de perfeccionamiento: empleados completos +
-- roles derivados + permisos con 4 acciones.
--
-- ⚠️ Hallazgo importante al escribir esta fase: CLAUDE.md describe "7 pseudo-FK por nombre TEXT"
-- como gotcha pendiente, pero esa nota es del ERP viejo (Express+SQLite). El schema Postgres
-- actual (0001_init.sql, W4) YA resolvió los 7 casos con columnas `empleado_id uuid references
-- empleados(id)` (reportes.encargado_id, incidencias.responsable_id/reportado_por_id,
-- pipeline_puntos.empleado_id, prenda_historial.empleado_id, reporte_trabajadores.empleado_id,
-- reporte_extras.registrado_por_id). Renombrar a un empleado NO requiere ninguna cascada: todos
-- los joins van por id (uuid), que nunca cambia. La única implicación real de renombrar es que
-- `loginConUsuario` busca por `ilike nombre` (lib/auth.ts) — por eso el requisito real es
-- UNICIDAD case-insensitive del nombre, no propagación. Ver índice único más abajo.
--
-- Roles derivados (híbrido, decisión del dueño 2026-07-26): los 7 roles base se quedan fijos
-- porque la RLS depende literalmente de ellos (private.app_es_admin() / private.app_sedes() leen
-- empleados.rol). Un rol derivado (`roles.cod`) hereda la seguridad de un rol base (`rol_base`) y
-- solo afina permisos de MÓDULO. `empleados.rol` SIEMPRE queda igual al `rol_base` de su rol
-- derivado (lo garantiza la RPC empleado_actualizar, nunca el cliente) — así la RLS nunca ve un
-- valor fuera de los 7 conocidos.
--
-- Idempotente: create table/index if not exists, add column if not exists, DO block con
-- duplicate_object para el constraint (mismo idiom que 0008_pipeline_realtime.sql).

-- ── 1) Roles derivados ──────────────────────────────────────────────────────────────────────
create table if not exists roles (
  cod        text primary key,
  nombre     text not null,
  rol_base   text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_rol_base_check check (rol_base in (
    'admin', 'dueno', 'encargado_tienda', 'encargado_almacen',
    'confeccionista', 'ventas_junior', 'ventas_junior_2'
  )),
  -- Un rol derivado no puede reusar el código de un rol base (compartirían clave en
  -- permisos_modulos.rol / empleados.rol_cod de forma ambigua).
  constraint roles_cod_no_choca_base check (cod not in (
    'admin', 'dueno', 'encargado_tienda', 'encargado_almacen',
    'confeccionista', 'ventas_junior', 'ventas_junior_2'
  ))
);
alter table roles enable row level security;

drop policy if exists roles_select on roles;
create policy roles_select on roles for select
  using (auth.uid() is not null);
drop policy if exists roles_admin_write on roles;
create policy roles_admin_write on roles for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- ── 2) empleados: rol_cod (nullable — sin rol derivado, el rol base sigue mandando) ─────────
alter table empleados add column if not exists rol_cod text references roles(cod);

-- CHECK del rol base: fija los 7 valores que la RLS conoce (defensa en profundidad — hoy la app
-- ya solo escribe estos 7, esto lo hace explícito a nivel de esquema). Idempotente.
do $$ begin
  alter table empleados add constraint empleados_rol_base_check
    check (rol in (
      'admin', 'dueno', 'encargado_tienda', 'encargado_almacen',
      'confeccionista', 'ventas_junior', 'ventas_junior_2'
    ));
exception when duplicate_object then null; end $$;

-- Unicidad case-insensitive del nombre (requisito real del login por usuario, ver nota arriba).
-- ⚠️ Antes de aplicar: verificar que no haya choques (ya se verificó para 0049/LOGIN_V2, pero
-- confirmar de nuevo por si se creó algún empleado nuevo desde entonces):
--   select lower(nombre), count(*) from empleados group by lower(nombre) having count(*) > 1;
create unique index if not exists empleados_nombre_lower_uk on empleados (lower(nombre));

-- ── 3) RPC: editar TODO el empleado (atómica) ───────────────────────────────────────────────
-- Reemplaza actualizarContactoEmpleado() (solo telefono/dni/direccion/salario_base) por una
-- única RPC que también cubre nombre/rol/rol_cod/sede primaria/tiendas/fecha_ingreso/notas.
-- `cod` NUNCA se recibe ni se toca aquí (es la credencial de Supabase Auth — inmutable).
-- Si p_rol_cod viene informado, el rol_base EFECTIVO sale de `roles` (nunca de p_rol_base, que
-- solo se usa cuando el admin elige un rol base directo) — así `empleados.rol` no puede quedar
-- desincronizado del rol derivado que el propio admin asignó.
create or replace function empleado_actualizar(
  p_id            uuid,
  p_nombre        text,
  p_rol_base      text,
  p_rol_cod       text,
  p_sede_cod      text,
  p_tiendas       text[],
  p_fecha_ingreso date,
  p_notas         text,
  p_telefono      text,
  p_dni           text,
  p_direccion     text,
  p_salario_base  numeric
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_rol    text;
  v_nombre text := trim(p_nombre);
begin
  if not private.app_es_admin() then
    raise exception 'Solo administradores pueden editar colaboradores';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if not exists (select 1 from empleados where id = p_id) then
    raise exception 'Colaborador no encontrado';
  end if;
  if exists (select 1 from empleados where lower(nombre) = lower(v_nombre) and id <> p_id) then
    raise exception 'Ya existe un colaborador con ese nombre';
  end if;

  if p_rol_cod is not null then
    select rol_base into v_rol from roles where cod = p_rol_cod and activo;
    if not found then
      raise exception 'El rol derivado % no existe o está inactivo', p_rol_cod;
    end if;
  else
    if p_rol_base is null or p_rol_base not in (
      'admin', 'dueno', 'encargado_tienda', 'encargado_almacen',
      'confeccionista', 'ventas_junior', 'ventas_junior_2'
    ) then
      raise exception 'Rol base inválido: %', p_rol_base;
    end if;
    v_rol := p_rol_base;
  end if;

  update empleados set
    nombre        = v_nombre,
    rol           = v_rol,
    rol_cod       = p_rol_cod,
    sede_cod      = p_sede_cod,
    fecha_ingreso = p_fecha_ingreso,
    notas         = coalesce(p_notas, ''),
    telefono      = coalesce(p_telefono, ''),
    dni           = coalesce(p_dni, ''),
    direccion     = coalesce(p_direccion, ''),
    salario_base  = coalesce(p_salario_base, 0)
  where id = p_id;

  -- Tiendas: reemplazo completo. La sede primaria SIEMPRE queda incluida en sus propias tiendas
  -- (evita el estado inconsistente de "sede primaria X" + "sin acceso a X").
  delete from empleado_tiendas where empleado_id = p_id;
  insert into empleado_tiendas (empleado_id, sede_cod)
  select distinct p_id, s
  from unnest(array_append(coalesce(p_tiendas, '{}'::text[]), p_sede_cod)) as s
  where s is not null and s <> '';
end;
$$;
revoke execute on function empleado_actualizar(uuid, text, text, text, text, text[], date, text, text, text, text, numeric) from public;
grant execute on function empleado_actualizar(uuid, text, text, text, text, text[], date, text, text, text, text, numeric) to authenticated;

-- ── 4) RPC: guardar la matriz de permisos completa (atómica) ────────────────────────────────
-- Reemplaza guardarMatrizPermisos() (delete-all + insert desde JS, sin transacción). Guarda TODAS
-- las filas que mande el editor (incluidas acciones=[] explícitas) — esto es lo que permite que un
-- rol derivado "revoque" un módulo que su rol base sí tiene, en vez de solo poder sumar accesos
-- (ver private de puede() en @scilb/core: fila vacía en rol_cod = revocado, fila ausente = hereda).
create or replace function permisos_guardar_matriz(p_filas jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not private.app_es_admin() then
    raise exception 'Solo administradores pueden editar permisos';
  end if;

  delete from permisos_modulos;
  insert into permisos_modulos (rol, modulo, acciones)
  select
    f->>'rol',
    f->>'modulo',
    coalesce((select array_agg(x) from jsonb_array_elements_text(f->'acciones') x), '{}')
  from jsonb_array_elements(p_filas) f
  where coalesce(f->>'rol', '') <> '' and coalesce(f->>'modulo', '') <> '';
end;
$$;
revoke execute on function permisos_guardar_matriz(jsonb) from public;
grant execute on function permisos_guardar_matriz(jsonb) to authenticated;

-- ── Verificación (correr después de aplicar) ────────────────────────────────────────────────
-- select lower(nombre), count(*) from empleados group by lower(nombre) having count(*) > 1; -- debe ser 0 filas
-- select cod, nombre, rol_base, activo from roles;                                            -- vacío hasta que el admin cree uno
-- select rol, rol_cod, count(*) from empleados group by 1,2 order by 1;                       -- rol_cod null en todos hasta asignar
