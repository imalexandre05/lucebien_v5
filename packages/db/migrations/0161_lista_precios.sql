-- 0161_lista_precios.sql — lista de precios de confecciones, editable por el administrador.
-- Spec: docs/superpowers/specs/2026-10-18-lista-de-precios-confecciones-design.md
-- Prueba: packages/db/pruebas/0161_lista_precios.prueba.sql
-- Nace VACÍA: no se inventa ningún precio (el catálogo inicial lo carga la dueña desde
-- /configuracion/lista-precios; anotado en docs/pendientes-negocio.md). Idempotente.

create table if not exists public.lista_precios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) > 0),
  categoria   text not null check (categoria in ('prenda', 'servicio')),
  precio      numeric(10,2) not null check (precio >= 0),
  activo      boolean not null default true,
  creado_por  uuid references public.empleados(id) on delete set null,
  creado_en   timestamptz not null default now()
);

-- Un artículo no se repite aunque cambien mayúsculas o espacios.
create unique index if not exists lista_precios_nombre_uniq on public.lista_precios (lower(btrim(nombre)));

alter table public.lista_precios enable row level security;

drop policy if exists lista_precios_select on public.lista_precios;
create policy lista_precios_select on public.lista_precios for select to authenticated
  using (exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo));

drop policy if exists lista_precios_admin_insert on public.lista_precios;
create policy lista_precios_admin_insert on public.lista_precios for insert to authenticated
  with check (private.app_es_admin());

drop policy if exists lista_precios_admin_update on public.lista_precios;
create policy lista_precios_admin_update on public.lista_precios for update to authenticated
  using (private.app_es_admin()) with check (private.app_es_admin());

drop policy if exists lista_precios_admin_delete on public.lista_precios;
create policy lista_precios_admin_delete on public.lista_precios for delete to authenticated
  using (private.app_es_admin());

revoke all on public.lista_precios from anon, authenticated;
grant select, insert, update, delete on public.lista_precios to authenticated;

drop trigger if exists lista_precios_audit on public.lista_precios;
create trigger lista_precios_audit after insert or update or delete on public.lista_precios
  for each row execute function private.audit_log_trigger();

comment on table public.lista_precios is
  'Lista de precios de confecciones (0161). El administrador escribe, todo empleado activo lee. Vacía de origen: no hay precios inventados.';
