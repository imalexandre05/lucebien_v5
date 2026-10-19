-- Prueba de la migración 0175_envios_solo_rpc.sql (auditoría 1, no-negociable 2).
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0175

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
create or replace function pg_temp.filas(p_sql text) returns text language plpgsql as $f$
declare n int;
begin execute p_sql; get diagnostics n = row_count; return n::text;
exception when others then raise notice '%', sqlerrm; return 'error'; end $f$;

do $$
declare
  r text := '';
  v_a text := 'P175A';
  e_enc uuid; e_otro uuid; p_a uuid; v_env uuid; v_res text; v_n int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0175 Sede A');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P175-EN','Prueba 0175 Encargado','EN','encargado_tienda', v_a) returning id into e_enc;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P175-OT','Prueba 0175 Otro','OT','ventas_junior', v_a) returning id into e_otro;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P175-PA', 'Saco', v_a, 'enviado') returning id into p_a;
  insert into envios_prendas (sede_destino_cod, estado) values (v_a, 'enviado') returning id into v_env;

  perform pg_temp.como(e_enc);
  -- 1) El envío se lee pero no se escribe directo
  select count(*) into v_n from envios_prendas where id = v_env;
  v_res := pg_temp.filas(format('update envios_prendas set estado = %L where id = %L', 'recibido', v_env))
        || '/' || pg_temp.filas(format('delete from envios_prendas where id = %L', v_env));
  perform pg_temp.dueno();
  if v_n = 1 and v_res in ('0/0', 'error/error', '0/error', 'error/0')
     and (select estado from envios_prendas where id = v_env) = 'enviado'
  then r := r || '[ok] caso 1: el envío se lee y no se edita ni borra directo;';
  else r := r || format('[FALLA] caso 1: lee=%s escritura=%s;', v_n, v_res); end if;

  -- 2) La calificación no se inserta directo (y menos a nombre de otro)
  perform pg_temp.como(e_enc);
  v_res := pg_temp.filas(format(
    'insert into prenda_calificacion (pasada_id, aceptada, calificador_id) values (%L, false, %L)',
    p_a, e_otro));
  perform pg_temp.dueno();
  if v_res = 'error' and not exists (select 1 from prenda_calificacion where pasada_id = p_a)
  then r := r || '[ok] caso 2: la calificación no se inserta directo;';
  else r := r || format('[FALLA] caso 2: insert=%s;', v_res); end if;

  -- 3) Una sola policy por tabla, sólo de lectura
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('envios_prendas', 'prenda_calificacion') and cmd <> 'SELECT';
  if v_n = 0 then r := r || '[ok] caso 3: no quedan policies de escritura;';
  else r := r || format('[FALLA] caso 3: policies de escritura=%s;', v_n); end if;

  raise exception 'RESULTADO %', r;
end $$;
