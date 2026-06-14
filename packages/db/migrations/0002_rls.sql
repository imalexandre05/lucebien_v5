-- 0002_rls.sql — Row Level Security por rol/sede (W7).
-- Reemplaza el JWT_SECRET hardcodeado del ERP viejo por RLS real de Supabase.
-- Asume Supabase Auth con auth.uid() == empleados.id (uuid). Las políticas filtran por sede
-- usando empleado_tiendas; admin/dueno ven todo.
--
-- NOTA: requiere Supabase Auth conectado. Es el framework de políticas; los módulos se afinan
-- a medida que se construyen.

-- ── Helpers (SECURITY DEFINER para leer el rol/sedes del empleado autenticado) ──
create or replace function app_es_admin() returns boolean
  language sql stable security definer as $$
  select exists (
    select 1 from empleados e
    where e.id = auth.uid() and e.rol in ('admin', 'dueno')
  );
$$;

create or replace function app_sedes() returns setof text
  language sql stable security definer as $$
  select et.sede_cod from empleado_tiendas et where et.empleado_id = auth.uid()
  union
  select e.sede_cod from empleados e where e.id = auth.uid() and e.sede_cod is not null;
$$;

-- ── Activar RLS ──
alter table empleados            enable row level security;
alter table inventario_activo    enable row level security;
alter table clientes             enable row level security;
alter table pedidos              enable row level security;
alter table prenda_pasada        enable row level security;
alter table reportes             enable row level security;

-- ── empleados: cada uno se ve a sí mismo; admin ve todos ──
create policy emp_select on empleados for select
  using (app_es_admin() or id = auth.uid());
create policy emp_admin_write on empleados for all
  using (app_es_admin()) with check (app_es_admin());

-- ── inventario_activo: lectura por sede; escritura admin/almacén (afinar con la matriz) ──
create policy inv_select on inventario_activo for select
  using (app_es_admin() or sede_cod in (select app_sedes()));
create policy inv_write on inventario_activo for all
  using (app_es_admin() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or sede_cod in (select app_sedes()));

-- ── clientes: por sede ──
create policy cli_rw on clientes for all
  using (app_es_admin() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or sede_cod in (select app_sedes()));

-- ── pedidos: por sede ──
create policy ped_rw on pedidos for all
  using (app_es_admin() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or sede_cod in (select app_sedes()));

-- ── prenda_pasada (pipeline): por sede de origen ──
create policy pasada_rw on prenda_pasada for all
  using (app_es_admin() or sede_origen_cod in (select app_sedes()))
  with check (app_es_admin() or sede_origen_cod in (select app_sedes()));

-- ── reportes FR-01: por sede ──
create policy rep_rw on reportes for all
  using (app_es_admin() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or sede_cod in (select app_sedes()));
