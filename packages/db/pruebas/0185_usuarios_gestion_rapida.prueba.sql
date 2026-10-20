-- Prueba de la migración 0185_usuarios_gestion_rapida.sql
-- Spec: docs/superpowers/specs/empleados/2026-10-20-usuarios-gestion-rapida-design.md
-- Escrita ANTES que la migración (Zone Guard). Termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0185

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
  e_adm uuid; e_a uuid; e_b uuid; e_otro uuid;
  v_txt text; v_n int; v_ant text; v_cod text;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('9001','P185 Admin','PA','admin') returning id into e_adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('9002','P185 Persona A','PB','ventas_junior') returning id into e_a;
  insert into empleados (cod, nombre, iniciales, rol) values ('9003','P185 Persona B','PC','ventas_junior') returning id into e_b;
  insert into empleados (cod, nombre, iniciales, rol) values ('9004','P185 Otro','PD','ventas_junior') returning id into e_otro;

  -- 1) el admin cambia el código; devuelve el anterior; queda auditado
  perform pg_temp.como(e_adm);
  select empleado_codigo_cambiar(e_a, '9102') into v_ant;
  perform pg_temp.dueno();
  select cod into v_cod from empleados where id = e_a;
  if v_ant = '9002' and v_cod = '9102' then r := r || '[ok] caso 1: cambia y devuelve el anterior;';
  else r := r || '[FALLA] caso 1: anterior=' || coalesce(v_ant,'null') || ' cod=' || v_cod || ';'; end if;
  select count(*) into v_n from audit_log
   where tabla = 'empleados' and fila_id = e_a::text and antes->>'cod' = '9002' and despues->>'cod' = '9102';
  if v_n >= 1 then r := r || '[ok] caso 1b: auditado con antes y después;'; else r := r || '[FALLA] caso 1b: sin rastro;'; end if;

  -- 2) un no-admin no puede
  perform pg_temp.como(e_otro);
  v_txt := pg_temp.mensaje(format('select empleado_codigo_cambiar(%L, %L)', e_b, '9103'));
  perform pg_temp.dueno();
  if v_txt like 'PERMISO%' then r := r || '[ok] caso 2: un no-admin no cambia códigos;'; else r := r || '[FALLA] caso 2: ' || v_txt || ';'; end if;

  -- 3) formato inválido
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje(format('select empleado_codigo_cambiar(%L, %L)', e_b, '123'));
  if v_txt like 'DATO%' then r := r || '[ok] caso 3a: 3 dígitos se rechaza;'; else r := r || '[FALLA] caso 3a: ' || v_txt || ';'; end if;
  v_txt := pg_temp.mensaje(format('select empleado_codigo_cambiar(%L, %L)', e_b, 'ab12'));
  if v_txt like 'DATO%' then r := r || '[ok] caso 3b: letras se rechazan;'; else r := r || '[FALLA] caso 3b: ' || v_txt || ';'; end if;

  -- 4) duplicado
  v_txt := pg_temp.mensaje(format('select empleado_codigo_cambiar(%L, %L)', e_b, '9102'));
  perform pg_temp.dueno();
  if v_txt like 'DATO%' then r := r || '[ok] caso 4: código repetido se rechaza;'; else r := r || '[FALLA] caso 4: ' || v_txt || ';'; end if;
  select cod into v_cod from empleados where id = e_b;
  if v_cod = '9003' then r := r || '[ok] caso 4b: no cambió nada;'; else r := r || '[FALLA] caso 4b: cod=' || v_cod || ';'; end if;

  -- 5) auditar acción de contraseña: sin secreto, solo admin
  perform pg_temp.como(e_adm);
  v_txt := pg_temp.mensaje(format('select empleado_auditar_accion(%L, %L)', e_a, 'contraseña temporal generada'));
  perform pg_temp.dueno();
  select count(*) into v_n from audit_log
   where tabla = 'empleados' and fila_id = e_a::text and despues->>'accion' = 'contraseña temporal generada' and actor = e_adm;
  if v_txt = 'ok' and v_n = 1 then r := r || '[ok] caso 5a: acción auditada a nombre del admin;'; else r := r || '[FALLA] caso 5a: ' || v_txt || ' n=' || v_n || ';'; end if;
  perform pg_temp.como(e_otro);
  v_txt := pg_temp.mensaje(format('select empleado_auditar_accion(%L, %L)', e_a, 'x'));
  perform pg_temp.dueno();
  if v_txt like 'PERMISO%' then r := r || '[ok] caso 5b: un no-admin no audita;'; else r := r || '[FALLA] caso 5b: ' || v_txt || ';'; end if;

  -- 6) anon no ejecuta
  execute 'set local role anon';
  v_txt := pg_temp.mensaje(format('select empleado_codigo_cambiar(%L, %L)', e_b, '9105'));
  perform pg_temp.dueno();
  if v_txt <> 'ok' then r := r || '[ok] caso 6: anon no ejecuta;'; else r := r || '[FALLA] caso 6: anon pudo;'; end if;

  raise exception 'RESULTADO: %', r;
end $$;
