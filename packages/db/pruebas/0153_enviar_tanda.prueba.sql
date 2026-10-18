-- Prueba de la migración 0153_enviar_tanda.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-enviar-tanda-atomica-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0153

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
  v_a text := 'P153A'; v_b text := 'P153B';
  e_alm uuid; e_eq uuid; e_ma uuid;
  p1 uuid; p2 uuid; p3 uuid; p_mal uuid; p_aj uuid;
  v_err text; v_n int; v_env int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P153 A'), (v_b, 'P153 B');
  insert into empleados (cod,nombre,iniciales,rol) values ('P153-AL','P153 Almacen','AL','encargado_almacen') returning id into e_alm;
  insert into empleados (cod,nombre,iniciales,rol,sede_cod,cuenta_compartida) values ('P153-EQ','P153 Equipo','EQ','encargado_almacen',v_a,true) returning id into e_eq;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-1','Saco',v_a,'listo') returning id into p1;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-2','Saco',v_a,'listo') returning id into p2;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-3','Saco',v_a,'listo') returning id into p3;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-MAL','Saco',v_a,'lavado') returning id into p_mal;

  -- 2) atomicidad: una no está lista → ninguna cambia
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[%L,%L,%L]::uuid[], %L)', p1, p_mal, p2, v_b));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo in ('P153-1','P153-2','P153-MAL') and etapa = 'enviado';
  if v_err <> 'ok' and v_n = 0 then r := r || '[ok] caso 2: si una falla no se envía ninguna;';
  else r := r || format('[FALLA] caso 2: %s enviadas=%s;', v_err, v_n); end if;

  -- 1) tanda completa
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[%L,%L,%L]::uuid[], %L)', p1, p2, p3, v_b));
  perform pg_temp.dueno();
  select count(*), count(distinct envio_id) into v_n, v_env from prenda_pasada where codigo in ('P153-1','P153-2','P153-3') and etapa = 'enviado';
  if v_err = 'ok' and v_n = 3 and v_env = 3 then r := r || '[ok] caso 1: la tanda completa sale, cada prenda con su envío;';
  else r := r || format('[FALLA] caso 1: %s enviadas=%s envios=%s;', v_err, v_n, v_env); end if;

  -- 3) otra sede sin permiso (encargado de tienda ajena)
  insert into empleados (cod,nombre,iniciales,rol,sede_cod) values ('P153-MA','P153 Otra','MA','encargado_tienda',v_b) returning id into e_ma;
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-AJ','Saco',v_a,'listo') returning id into p_aj;
  perform pg_temp.como(e_ma);
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[%L]::uuid[], %L)', p_aj, v_b));
  perform pg_temp.dueno();
  if v_err like '%no encontrada%' and (select etapa from prenda_pasada where id = p_aj) = 'listo' then r := r || '[ok] caso 3: sin permiso sobre la prenda, no sale;';
  else r := r || format('[FALLA] caso 3: %s;', v_err); end if;

  -- 4) vacía y repetidos
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[]::uuid[], %L)', v_b));
  if v_err <> 'ok' then r := r || '[ok] caso 4a: lista vacía rechazada;'; else r := r || '[FALLA] caso 4a;'; end if;
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[%L,%L]::uuid[], %L)', p_aj, p_aj, v_b));
  perform pg_temp.dueno();
  select count(*) into v_n from envios_prendas e join prenda_pasada p on p.envio_id = e.id where p.id = p_aj;
  if v_err = 'ok' and v_n = 1 then r := r || '[ok] caso 4b: un id repetido se envía una sola vez;';
  else r := r || format('[FALLA] caso 4b: %s envios=%s;', v_err, v_n); end if;

  -- 5) cuenta compartida sin token
  insert into prenda_pasada (codigo,tipo,sede_origen_cod,etapa) values ('P153-CC','Saco',v_a,'listo') returning id into p1;
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select pipeline_enviar_tanda(array[%L]::uuid[], %L)', p1, v_b));
  perform pg_temp.dueno();
  if v_err like 'CODIGO:%' and (select etapa from prenda_pasada where id = p1) = 'listo' then r := r || '[ok] caso 5: cuenta compartida sin token pide código;';
  else r := r || format('[FALLA] caso 5: %s;', v_err); end if;

  raise exception 'RESULTADO 0153 --> %', r;
end $$;
