-- 0069_mi_talla_storage.sql — Bucket privado 'mi-talla' para fotos de taller (F2 del módulo
-- Mi Talla, spec docs/superpowers/specs/2026-08-13-mi-talla-design.md §5) + RLS de
-- storage.objects. Fotos jpg comprimidas (~300 KB); NUNCA video completo; NUNCA fotos del
-- flujo público (no existe endpoint que las acepte — regla invariante nº3 del spec).
-- Complementa a 0068_mi_talla_esquema.sql (tabla de metadatos mt_medicion_imagen).
--
-- ⚠️ POSIBLE FALLO CONOCIDO: en Supabase hosted el owner de storage.objects es
-- supabase_storage_admin; si al aplicar esto aparece "must be owner of table objects"
-- (42501) al crear las policies, el INSERT del bucket sí habrá quedado — crear entonces
-- las 3 policies desde Dashboard → Storage → mi-talla → Policies con EXACTAMENTE las
-- mismas expresiones (guía A5 del plan de implementación).
--
-- Idempotente: insert on conflict do nothing, drop policy if exists + create policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mi-talla', 'mi-talla', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- Subir: solo empleados, solo a este bucket (jpg de máx 1 MB lo garantiza el bucket).
drop policy if exists mt_img_insert on storage.objects;
create policy mt_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mi-talla' and private.app_es_empleado());

-- Leer (necesario para createSignedUrl desde el celular del sastre): solo empleados.
drop policy if exists mt_img_select on storage.objects;
create policy mt_img_select on storage.objects for select to authenticated
  using (bucket_id = 'mi-talla' and private.app_es_empleado());

-- Borrar: solo admin (retención vencida / derecho de supresión ARCO).
drop policy if exists mt_img_delete on storage.objects;
create policy mt_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'mi-talla' and private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='mi-talla';
--   select policyname, cmd from pg_policies
--     where schemaname='storage' and tablename='objects' and policyname like 'mt\_img\_%';
--     -- esperado: 3 policies; si 0, aplicar el fallback manual del Dashboard (guía A5)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
