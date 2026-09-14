-- 0105_empleado_documentos.sql — tabla de metadatos + bucket privado para adjuntos de personal
-- (DNI, CV, imágenes), C-3.
--
-- Implementa docs/superpowers/specs/empleados/2026-09-08-documentos-adjuntos-design.md.
--
-- ZONA CRÍTICA (no-negociable 3): documentos de identidad de personas reales. Sólo admin/dueño ve,
-- sube o borra — confirmado con Alexander el 08-sep-2026 (spec §1), no inventado.
--
-- Corregida tras el subagente verificador (spec §7, antes de aplicar): la primera versión usaba
-- `on delete cascade`, que se llevaría los documentos en silencio si algún día se borra una fila de
-- `empleados` — exactamente lo que docs/superpowers/specs/empleados/2026-08-25-borrar-alta-por-
-- error-design.md §7.5 pide evitar (una FK nueva sin listar en esa RPC debe fallar RUIDOSO, no
-- ceder solo). Va `restrict`. También corrige el `on conflict` del bucket (no restauraba
-- `public = false` si alguien lo hubiera creado público a mano) y endurece columnas/policies
-- siguiendo el mismo patrón que `0069_mi_talla_storage.sql` (bucket hermano ya aplicado) y
-- `0070_mi_talla_endurecimiento.sql` (grant de columnas + checks).
--
-- ⚠️ POSIBLE FALLO CONOCIDO (mismo aviso que la 0069): en Supabase hosted el owner de
-- storage.objects es supabase_storage_admin. Si al aplicar aparece "must be owner of table
-- objects" (42501) al crear las policies, el insert del bucket sí habrá quedado — crear las tres
-- policies desde Dashboard → Storage → empleado-documentos → Policies con EXACTAMENTE las mismas
-- expresiones de abajo.
--
-- Idempotente: `create table if not exists`, `drop policy if exists` + `create policy`, bucket con
-- `on conflict (id) do update` sobre las cuatro columnas que le importan a esta spec.

create table if not exists empleado_documentos (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references empleados(id) on delete restrict,
  nombre_archivo text not null,
  tipo_mime     text not null check (tipo_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  tamano_bytes  bigint not null check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  storage_path  text not null unique check (storage_path like empleado_id::text || '/%'),
  subido_por    uuid references empleados(id) on delete set null default auth.uid(),
  subido_en     timestamptz not null default now()
);

create index if not exists idx_empleado_documentos_empleado on empleado_documentos(empleado_id);

alter table empleado_documentos enable row level security;

-- Sólo admin/dueño lee, sube o borra. Columnas que el cliente puede fijar en el insert: las que
-- describen el archivo. `id`/`subido_en`/`subido_por` quedan afuera del grant — nunca del cliente,
-- siempre del default (mismo endurecimiento que la 0070 §2 le aplicó a mt_medicion_real).
drop policy if exists empdoc_admin_todo on empleado_documentos;
create policy empdoc_admin_todo on empleado_documentos for all to authenticated
  using (private.app_es_admin())
  with check (private.app_es_admin());

revoke insert on empleado_documentos from authenticated;
grant insert (empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path)
  on empleado_documentos to authenticated;

-- Auditoría (0058): borrar el DNI de alguien es la operación más sensible del módulo y no puede
-- quedar sin rastro — mismo trigger que ya llevan empleados/asistencias/pagos/sueldo_*.
drop trigger if exists trg_audit_empleado_documentos on empleado_documentos;
create trigger trg_audit_empleado_documentos
  after insert or delete on empleado_documentos
  for each row execute function private.audit_log_trigger();

-- ── Bucket privado ────────────────────────────────────────────────────────────────────────────
-- Spec §1/§3: 10 MB, sólo imágenes (jpeg/png/webp) + PDF. `public = false`: sin URL pública, toda
-- lectura pasa por una URL firmada que sólo un admin puede pedir (RLS de storage.objects abajo).
-- El `do update` toca las CUATRO columnas de la spec (incluida `public`): si alguien lo hubiera
-- creado público a mano antes de esta migración, reaplicarla lo vuelve a cerrar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empleado-documentos', 'empleado-documentos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Subir: sólo admin/dueño, sólo a este bucket.
drop policy if exists empdoc_storage_admin_insert on storage.objects;
create policy empdoc_storage_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'empleado-documentos' and private.app_es_admin());

-- Leer (URL firmada): sólo admin/dueño.
drop policy if exists empdoc_storage_admin_select on storage.objects;
create policy empdoc_storage_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'empleado-documentos' and private.app_es_admin());

-- Borrar: sólo admin/dueño.
drop policy if exists empdoc_storage_admin_delete on storage.objects;
create policy empdoc_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'empleado-documentos' and private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='empleado-documentos';
--   select policyname, cmd, roles from pg_policies
--     where schemaname='storage' and tablename='objects' and policyname like 'empdoc\_storage\_%';
--     -- esperado: 3 policies, roles={authenticated}; si 0, aplicar el fallback manual del Dashboard
-- ═══════════════════════════════════════════════════════════════════════════════════════════
