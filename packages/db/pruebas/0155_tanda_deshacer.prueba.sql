-- Prueba de la migración 0155_tanda_deshacer.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-tanda-deshacer-y-resultado-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0155

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
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := '';
  v_a text := 'P155A';
  e_cf uuid; e_otro uuid;
  p1 uuid; p2 uuid; p3 uuid; p_x uuid;
  v_res jsonb; v_pts numeric; v_err text; v_n int; v_e1 text; v_e2 text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P155 A');
  insert into empleados (cod,nombre,iniciales,rol) values ('P155-CF','P155 Confeccionista','CF','confeccionista') returning id into e_cf;
  insert into empleados (cod,nombre,iniciales,rol,cuenta_compartida) values ('P155-EQ','P155 Equipo','EQ','confeccionista',true) returning id into e_otro;
  insert into config (clave, valor) values ('pts_lavado_normal','1'), ('pts_recepcion','1') on conflict (clave) do update set valor = excluded.valor;
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P155-1','Chaqueta','normal',v_a,'recepcion') returning id into p1;
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P155-2','Chaqueta','normal',v_a,'recepcion') returning id into p2;
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P155-3','Chaqueta','normal',v_a,'recepcion') returning id into p3;
  insert into prenda_pasada (codigo,tipo,tipo_lavado,sede_origen_cod,etapa) values ('P155-X','Chaqueta','normal',v_a,'listo') returning id into p_x;

  -- 1) resultado detallado: una de las tres no se puede avanzar a lavado
  perform pg_temp.como(e_cf);
  v_res := pipeline_avanzar_tanda_resultado(array[p1, p_x, p2], 'lavado');
  perform pg_temp.dueno();
  if (v_res->>'movidas')::int = 2 and (v_res->>'omitidas')::int = 1 and (v_res->>'puntos')::numeric = 2
     and v_res->'ids_movidos' @> to_jsonb(p1::text) and v_res->'ids_movidos' @> to_jsonb(p2::text)
     and not (v_res->'ids_movidos' @> to_jsonb(p_x::text)) then
    r := r || '[ok] caso 1: resultado dice 2 movidas, 1 omitida, 2 puntos y cuáles se movieron;';
  else r := r || format('[FALLA] caso 1: %s;', v_res); end if;

  -- 2) la función vieja conserva su retorno numérico
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar_tanda(array[p3], 'lavado');
  perform pg_temp.dueno();
  if v_pts = 1 then r := r || '[ok] caso 2: pipeline_avanzar_tanda sigue devolviendo los puntos;';
  else r := r || format('[FALLA] caso 2: %s;', v_pts); end if;

  -- 3) deshacer tanda de p1 y p2 (lavado → recepcion): vuelven y se quitan los puntos
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer_tanda(%L::jsonb)',
    jsonb_build_array(jsonb_build_object('id', p1, 'etapa_anterior', 'recepcion'), jsonb_build_object('id', p2, 'etapa_anterior', 'recepcion'))::text));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where id in (p1, p2) and etapa = 'recepcion';
  select count(*) into v_e1 from pipeline_puntos where pasada_id in (p1, p2);
  if v_err = 'ok' and v_n = 2 and v_e1::int = 0 then r := r || '[ok] caso 3: deshacer tanda devuelve las prendas y quita sus puntos;';
  else r := r || format('[FALLA] caso 3: %s vueltas=%s puntos=%s;', v_err, v_n, v_e1); end if;

  -- 4) atomicidad: p3 sí se puede deshacer, p_x no (no es lo último que se le hizo) → no se deshace ninguna
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer_tanda(%L::jsonb)',
    jsonb_build_array(jsonb_build_object('id', p3, 'etapa_anterior', 'recepcion'), jsonb_build_object('id', p_x, 'etapa_anterior', 'lavado'))::text));
  perform pg_temp.dueno();
  select etapa into v_e2 from prenda_pasada where id = p3;
  if v_err <> 'ok' and v_err like '%P155-X%' and v_e2 = 'lavado' then r := r || '[ok] caso 4: si una no se puede deshacer no se deshace ninguna y el error nombra la prenda;';
  else r := r || format('[FALLA] caso 4: %s p3=%s;', v_err, v_e2); end if;

  -- 5) lista vacía y cuenta compartida sin token
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje('select pipeline_deshacer_tanda(''[]''::jsonb)');
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 5a: lista vacía rechazada;'; else r := r || '[FALLA] caso 5a;'; end if;
  perform pg_temp.como(e_otro);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer_tanda(%L::jsonb)',
    jsonb_build_array(jsonb_build_object('id', p3, 'etapa_anterior', 'recepcion'))::text));
  perform pg_temp.dueno();
  select etapa into v_e2 from prenda_pasada where id = p3;
  if v_err like 'CODIGO:%' and v_e2 = 'lavado' then r := r || '[ok] caso 5b: cuenta compartida sin token pide código;';
  else r := r || format('[FALLA] caso 5b: %s %s;', v_err, v_e2); end if;

  -- 6) firmas únicas y sin anon
  select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname in ('pipeline_avanzar_tanda','pipeline_avanzar_tanda_resultado','pipeline_deshacer_tanda');
  if v_n = 3 and not exists (select 1 from pg_proc pr where pr.proname in ('pipeline_avanzar_tanda','pipeline_avanzar_tanda_resultado','pipeline_deshacer_tanda') and has_function_privilege('anon', pr.oid, 'execute'))
  then r := r || '[ok] caso 6: una firma por función y sin execute para anon;';
  else r := r || format('[FALLA] caso 6: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO 0155 --> %', r;
end $$;
