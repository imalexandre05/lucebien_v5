-- Prueba de la migración 0103_schema_migrations_rls.sql
--
-- Ataca la promesa exacta: que anon/authenticated ya NO puedan leer ni escribir
-- public.schema_migrations por PostgREST, sin necesidad de ninguna policy nueva.
--
-- Se descarta sola: todo corre dentro de un bloque que termina lanzando una excepción con el
-- resultado, así que no queda ni una fila y ninguna sesión real necesita un rollback.
--
-- Cómo se corre: pegar el archivo entero en el SQL editor de Supabase (proyecto scilb) o
-- bash tools/probar-migracion.sh 0103 con psql. Lee la línea RESULTADO.

do $$
declare
  v_rls_activa boolean;
  v_filas_antes int;
  v_fallas text := '';
begin
  select relrowsecurity into v_rls_activa
  from pg_class where oid = 'public.schema_migrations'::regclass;

  if v_rls_activa is not true then
    v_fallas := v_fallas || E'\n  · RLS sigue desactivada en public.schema_migrations';
  end if;

  select count(*) into v_filas_antes from public.schema_migrations;

  -- Ataque 1: leer como authenticated (cualquier usuario con sesión, sin admin).
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  if exists (select 1 from public.schema_migrations limit 1) then
    v_fallas := v_fallas || E'\n  · authenticated todavía puede LEER schema_migrations';
  end if;

  -- Ataque 2: escribir como authenticated.
  begin
    insert into public.schema_migrations (version, aplicada_en) values ('ataque-prueba-0103', now());
    v_fallas := v_fallas || E'\n  · authenticated todavía puede ESCRIBIR en schema_migrations';
  exception when insufficient_privilege or others then
    null; -- esperado: sin policy de escritura, la fila no entra
  end;
  reset role;

  -- Ataque 3: leer como anon.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if exists (select 1 from public.schema_migrations limit 1) then
    v_fallas := v_fallas || E'\n  · anon todavía puede LEER schema_migrations';
  end if;
  reset role;

  if v_filas_antes <> (select count(*) from public.schema_migrations) then
    v_fallas := v_fallas || E'\n  · el numero de filas cambio durante la prueba (algun ataque escribio de verdad)';
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0103: OK — RLS activa, anon y authenticated no leen ni escriben schema_migrations (% filas intactas)', v_filas_antes;
  else
    raise exception 'RESULTADO 0103: FALLAS —%', v_fallas;
  end if;
end $$;
