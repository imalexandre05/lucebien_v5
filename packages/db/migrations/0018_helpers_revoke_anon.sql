-- 0018_helpers_revoke_anon.sql — Endurecimiento de seguridad.
-- Las funciones SECURITY DEFINER del proyecto no deben ser ejecutables por el rol `anon`
-- (usuario sin login) vía /rest/v1/rpc. Cierra el aviso 0028 del linter de Supabase.
--
-- Por qué solo `anon` y NO `authenticated`: las RLS policies invocan app_es_admin/
-- app_es_almacen/app_sedes al evaluarse, así que el rol `authenticated` NECESITA EXECUTE
-- (revocárselo rompería toda la RLS). El aviso 0029 (authenticated) de los 3 helpers se
-- resolvería moviéndolos a un schema privado no expuesto por REST — pendiente de decisión.
-- pipeline_ranking_hoy es un RPC intencional para usuarios logueados (ranking del día).
--
-- Nota: 0017 intentó esto con `revoke ... from public`, pero los grants a anon/authenticated
-- son explícitos (no vía PUBLIC), así que aquel revoke fue un no-op. Este es el correcto.

revoke execute on function public.app_es_admin()        from anon;
revoke execute on function public.app_es_almacen()      from anon;
revoke execute on function public.app_sedes()           from anon;
revoke execute on function public.pipeline_ranking_hoy() from anon;
