-- 0024_incidencias.sql — módulo Incidencias: catálogo de tipos + RLS + columnas faltantes.
-- La tabla incidencias ya existe (0001) con RLS habilitada SIN policy. Aquí: catálogo
-- incidencia_tipos, columnas reporte_id/origen (paridad con el viejo), y políticas por sede.

-- ── catálogo de tipos de incidencia (global, lo gestiona admin) ──
create table if not exists incidencia_tipos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null unique,
  categoria      text,
  nivel_default  text not null default 'Medio',
  puntos_default numeric not null default 2,
  activo         boolean not null default true
);
alter table incidencia_tipos enable row level security;

drop policy if exists inc_tipos_select on incidencia_tipos;
create policy inc_tipos_select on incidencia_tipos for select
  using (auth.uid() is not null);
drop policy if exists inc_tipos_admin_write on incidencia_tipos;
create policy inc_tipos_admin_write on incidencia_tipos for all
  using (app_es_admin()) with check (app_es_admin());

-- ── incidencias: columnas que tenía el viejo (vínculo al reporte + origen) ──
alter table incidencias
  add column if not exists reporte_id text references reportes(id) on delete set null,
  add column if not exists origen     text default 'manual';

-- ── RLS por sede (espeja reportes/pipeline): admin/almacén ven todo, tiendas su sede ──
drop policy if exists inc_rw on incidencias;
create policy inc_rw on incidencias for all
  using      (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));

create index if not exists idx_incidencias_sede_fecha on incidencias(sede_cod, fecha);
