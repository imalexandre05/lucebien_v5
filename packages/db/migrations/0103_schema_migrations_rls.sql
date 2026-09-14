-- 0103_schema_migrations_rls.sql — activa RLS en public.schema_migrations, sin policy.
--
-- Implementa docs/superpowers/specs/2026-09-08-schema-migrations-rls-design.md.
--
-- El advisor de seguridad de Supabase marca esta tabla (ERROR): RLS deshabilitada, lo que deja
-- valer los grants amplios de todo proyecto nuevo — anon/authenticated tenían select/insert/
-- update/delete/truncate vía PostgREST. Es un registro casero de migraciones aplicadas (17 filas,
-- `version, aplicada_en`) de antes de que el proyecto adoptara el tracking nativo de Supabase; sin
-- referencias en apps/erp-web ni en tools/.
--
-- Sin policy a propósito: nada la lee, así que no hace falta abrirle lectura a nadie. Mismo patrón
-- que asistencias_respaldo_0075/asistencias_respaldo_20260821 (RLS activa, cero policies).
--
-- Idempotente: `enable row level security` no falla si ya estaba activa.

alter table if exists public.schema_migrations enable row level security;
