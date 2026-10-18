-- Prueba de la migración 0162_responsable_incidencia.sql
-- Spec: docs/superpowers/specs/2026-10-18-release-arreglos-verificador-design.md §1
-- Se corre: bash tools/postgres-local.sh probar 0162

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := ''; s1 text; s2 text; enc uuid; otro uuid; inact uuid; extra uuid; ajeno uuid; v boolean; m text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P162-A', 'P162 A'), ('P162-B', 'P162 B');
  s1 := 'P162-A'; s2 := 'P162-B';
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P162-EN', 'P162 Encargado', 'EN', 'encargado', s1) returning id into enc;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P162-OT', 'P162 Otro', 'OT', 'confeccionista', s1) returning id into otro;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo) values ('P162-IN', 'P162 Inactivo', 'IN', 'confeccionista', s1, false) returning id into inact;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P162-EX', 'P162 Extra', 'EX', 'confeccionista', s2) returning id into extra;
  insert into empleado_tiendas (empleado_id, sede_cod) values (extra, s1);
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P162-AJ', 'P162 Ajeno', 'AJ', 'confeccionista', s2) returning id into ajeno;

  perform pg_temp.como(enc);
  -- el encargado no ve a los demás por RLS, pero la función sí decide
  if (select count(*) from empleados where id = otro) = 0 then r := r || '[ok] caso 0: el encargado no ve a otro por RLS;';
  else r := r || '[FALLA] caso 0: el encargado ve a otro;'; end if;
  v := public.incidencia_responsable_valido(otro, s1);
  if v then r := r || '[ok] caso 1: un compañero activo de la sede es válido;'; else r := r || '[FALLA] caso 1;'; end if;
  v := public.incidencia_responsable_valido(inact, s1);
  if not v then r := r || '[ok] caso 2: un inactivo no es válido;'; else r := r || '[FALLA] caso 2;'; end if;
  v := public.incidencia_responsable_valido(ajeno, s1);
  if not v then r := r || '[ok] caso 3: una persona de otra sede no es válida;'; else r := r || '[FALLA] caso 3;'; end if;
  v := public.incidencia_responsable_valido(extra, s1);
  if v then r := r || '[ok] caso 4: quien trabaja también en la sede (empleado_tiendas) es válido;'; else r := r || '[FALLA] caso 4;'; end if;
  v := public.incidencia_responsable_valido(gen_random_uuid(), s1);
  if not v then r := r || '[ok] caso 5: un id inexistente es inválido;'; else r := r || '[FALLA] caso 5;'; end if;
  m := pg_temp.mensaje(format('select public.incidencia_responsable_valido(%L, %L)', ajeno, s2));
  if m like 'PERMISO:%' then r := r || '[ok] caso 6: preguntar por una sede ajena se rechaza;'; else r := r || format('[FALLA] caso 6: %s;', m); end if;

  perform pg_temp.dueno();
  perform set_config('role', 'anon', true);
  m := pg_temp.mensaje(format('select public.incidencia_responsable_valido(%L, %L)', otro, s1));
  if m like '%permission denied%' then r := r || '[ok] caso 7: anon no puede ejecutarla;'; else r := r || format('[FALLA] caso 7: %s;', m); end if;

  raise exception 'RESULTADO 0162 --> %', r;
end $$;
