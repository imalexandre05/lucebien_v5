-- Prueba de la migración 0173_asesor_seguridad.sql (auditoría 1, asesor de seguridad de Supabase).
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0173

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;

do $$
declare
  r text := '';
  e_alm uuid; v_b boolean; v_cfg text[];
begin
  perform pg_temp.dueno();
  -- 1) private.sueldo_mes_es con search_path fijo y mismo resultado
  select proconfig into v_cfg from pg_proc where oid = 'private.sueldo_mes_es(date)'::regprocedure;
  if v_cfg is not null and exists (select 1 from unnest(v_cfg) c where c like 'search_path=%')
     and private.sueldo_mes_es('2026-10-19') = 'octubre de 2026'
  then r := r || '[ok] caso 1: sueldo_mes_es con search_path fijo;';
  else r := r || format('[FALLA] caso 1: proconfig=%s;', v_cfg); end if;

  -- 2) Un encargado de almacén suspendido ya no gestiona solicitudes
  insert into empleados (cod, nombre, iniciales, rol, activo) values ('P173-AL','Prueba 0173 Almacén','AL','encargado_almacen', false) returning id into e_alm;
  perform pg_temp.como(e_alm);
  v_b := private.app_es_gestor_solicitudes();
  perform pg_temp.dueno();
  if v_b is false then r := r || '[ok] caso 2: almacén suspendido no gestiona solicitudes;';
  else r := r || format('[FALLA] caso 2: gestor=%s;', v_b); end if;
  update empleados set activo = true where id = e_alm;
  perform pg_temp.como(e_alm);
  v_b := private.app_es_gestor_solicitudes();
  perform pg_temp.dueno();
  if v_b is true then r := r || '[ok] caso 2b: almacén activo sí gestiona;';
  else r := r || format('[FALLA] caso 2b: gestor=%s;', v_b); end if;

  -- 3) Ninguna tabla de respaldo queda en public (fuera de la API)
  if to_regclass('public.asistencias_respaldo_0075') is null and to_regclass('public.asistencias_respaldo_20260821') is null
  then r := r || '[ok] caso 3: respaldos fuera de public;';
  else r := r || '[FALLA] caso 3: hay respaldos en public;'; end if;

  raise exception 'RESULTADO %', r;
end $$;
