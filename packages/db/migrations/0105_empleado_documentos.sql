-- 0105_empleado_documentos.sql — tabla de metadatos + bucket privado para adjuntos de personal
-- (DNI, CV, imágenes), C-3.
--
-- Implementa docs/superpowers/specs/empleados/2026-09-08-documentos-adjuntos-design.md.
--
-- ZONA CRÍTICA (no-negociable 3): documentos de identidad de personas reales. Sólo admin/dueño ve,
-- sube o borra — confirmado con Alexander el 08-sep-2026 (spec §1), no inventado.
--
-- Sin columna de "categoría": no se pidió clasificar los adjuntos, sólo poder subirlos (spec §3).
--
-- Idempotente: `create table if not exists`, `create policy` envuelto en `do $$ ... $$` que
-- consulta pg_policies, bucket con `on conflict (id) do update` para poder ajustar el límite o los
-- tipos permitidos si hiciera falta reaplicar.

create table if not exists empleado_documentos (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references empleados(id) on delete cascade,
  nombre_archivo text not null,
  tipo_mime     text not null,
  tamano_bytes  bigint not null,
  storage_path  text not null unique,
  subido_por    uuid references empleados(id) on delete set null,
  subido_en     timestamptz not null default now()
);

create index if not exists idx_empleado_documentos_empleado on empleado_documentos(empleado_id);

alter table empleado_documentos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'empleado_documentos' and policyname = 'empdoc_admin_todo'
  ) then
    create policy empdoc_admin_todo on empleado_documentos for all
      using (private.app_es_admin())
      with check (private.app_es_admin());
  end if;
end $$;

-- ── Bucket privado ────────────────────────────────────────────────────────────────────────────
-- Spec §1/§3: 10 MB, sólo imágenes (jpeg/png/webp) + PDF. `public = false`: sin URL pública, toda
-- lectura pasa por una URL firmada que sólo un admin puede pedir (RLS de storage.objects abajo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empleado-documentos', 'empleado-documentos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'empdoc_storage_admin_select'
  ) then
    create policy empdoc_storage_admin_select on storage.objects
      for select using (bucket_id = 'empleado-documentos' and private.app_es_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'empdoc_storage_admin_insert'
  ) then
    create policy empdoc_storage_admin_insert on storage.objects
      for insert with check (bucket_id = 'empleado-documentos' and private.app_es_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'empdoc_storage_admin_delete'
  ) then
    create policy empdoc_storage_admin_delete on storage.objects
      for delete using (bucket_id = 'empleado-documentos' and private.app_es_admin());
  end if;
end $$;
