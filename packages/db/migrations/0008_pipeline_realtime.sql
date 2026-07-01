-- 0008_pipeline_realtime.sql — habilita Supabase Realtime en prenda_pasada para que el
-- tablero se actualice EN VIVO (postgres_changes) cuando una prenda avanza/se envía, sin
-- recargar. El canal respeta la RLS con el JWT del usuario (ve solo lo que le toca).
-- Idempotente: ignora si la tabla ya está en la publicación.
do $$ begin
  alter publication supabase_realtime add table prenda_pasada;
exception when duplicate_object then null; end $$;
