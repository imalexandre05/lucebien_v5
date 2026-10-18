-- Prueba de la migración 0146_reporte_con_codigo.sql
-- Spec: docs/superpowers/specs/reportes/2026-10-18-envio-reporte-con-codigo-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción
-- RESULTADO con un [ok]/[FALLA] por caso.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0146

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
  v_a text := 'P146A'; v_b text := 'P146B';
  e_op uuid; e_eq uuid; e_otro uuid; e_per uuid; e_ajeno uuid;
  tok uuid; tok_otro uuid; tok_ajeno uuid;
  v_err text; v_n int; v_enc uuid;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0146 Sede A'), (v_b, 'P0146 Sede B');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P146-OP','Prueba 0146 Operador','OP','encargado_tienda', v_a) returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, cuenta_compartida) values ('P146-EQ','Prueba 0146 Equipo','EQ','encargado_tienda', v_a, true) returning id into e_eq;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P146-OT','Prueba 0146 Otro','OT','encargado_tienda', v_a) returning id into e_otro;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P146-PE','Prueba 0146 Personal','PE','encargado_tienda', v_a) returning id into e_per;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P146-AJ','Prueba 0146 Ajeno','AJ','encargado_tienda', v_b) returning id into e_ajeno;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_eq, e_op, now() + interval '5 minutes') returning token into tok;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_otro, e_op, now() + interval '5 minutes') returning token into tok_otro;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_eq, e_ajeno, now() + interval '5 minutes') returning token into tok_ajeno;

  -- 1) Cuenta compartida sin token
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,null::uuid[],null::jsonb,null::jsonb,null,null)', '01-10-26_P146A_M', v_a, 'M'));
  perform pg_temp.dueno();
  select count(*) into v_n from reportes where id = '01-10-26_P146A_M';
  if v_err like 'CODIGO:%' and v_n = 0 then r := r || '[ok] caso 1: cuenta compartida sin token pide código y no escribe;';
  else r := r || format('[FALLA] caso 1: err=%s n=%s;', v_err, v_n); end if;

  -- 2) Token válido de un encargado de la sede
  perform pg_temp.como(e_eq);
  perform reportes_crear('02-10-26_P146A_M', v_a, 'M', 0, 0, null::uuid[], null::jsonb, null::jsonb, null, tok);
  perform pg_temp.dueno();
  select encargado_id into v_enc from reportes where id = '02-10-26_P146A_M';
  select count(*) into v_n from reporte_trabajadores where reporte_id = '02-10-26_P146A_M' and empleado_id = e_op;
  if v_enc = e_op and v_n = 1 then r := r || '[ok] caso 2: el reporte queda a nombre del operador;';
  else r := r || format('[FALLA] caso 2: encargado=%s trabajadores=%s;', v_enc, v_n); end if;
  update reportes set evaluado = true where id = '02-10-26_P146A_M';

  -- 3) Operador de otra sede
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,null::uuid[],null::jsonb,null::jsonb,null,%L)', '03-10-26_P146A_M', v_a, 'M', tok_ajeno));
  perform pg_temp.dueno();
  select count(*) into v_n from reportes where id = '03-10-26_P146A_M';
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 3: operador de otra sede se rechaza;';
  else r := r || format('[FALLA] caso 3: err=%s n=%s;', v_err, v_n); end if;

  -- 4) Token de otra sesión
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,null::uuid[],null::jsonb,null::jsonb,null,%L)', '04-10-26_P146A_M', v_a, 'M', tok_otro));
  perform pg_temp.dueno();
  select count(*) into v_n from reportes where id = '04-10-26_P146A_M';
  if v_err like 'CODIGO:%' and v_n = 0 then r := r || '[ok] caso 4: token de otra sesión se rechaza;';
  else r := r || format('[FALLA] caso 4: err=%s n=%s;', v_err, v_n); end if;

  -- 5) p_encargado distinto del operador
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,null::uuid[],null::jsonb,null::jsonb,%L,%L)', '05-10-26_P146A_M', v_a, 'M', e_otro, tok));
  perform pg_temp.dueno();
  select count(*) into v_n from reportes where id = '05-10-26_P146A_M';
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 5: encargado distinto del operador se rechaza;';
  else r := r || format('[FALLA] caso 5: err=%s n=%s;', v_err, v_n); end if;

  -- 6) Cuenta personal sin token: como antes
  perform pg_temp.como(e_per);
  perform reportes_crear('06-10-26_P146A_M', v_a, 'M', 0, 0, null::uuid[], null::jsonb, null::jsonb, null, null);
  perform pg_temp.dueno();
  select encargado_id into v_enc from reportes where id = '06-10-26_P146A_M';
  if v_enc = e_per then r := r || '[ok] caso 6: cuenta personal sin token, encargado = sesión;';
  else r := r || format('[FALLA] caso 6: encargado=%s;', v_enc); end if;

  -- 7) Firma única y sin anon
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reportes_crear';
  if v_n = 1 and not exists (select 1 from pg_proc p where p.proname = 'reportes_crear'
       and has_function_privilege('anon', p.oid, 'execute'))
  then r := r || '[ok] caso 7: una sola firma y sin execute para anon;';
  else r := r || format('[FALLA] caso 7: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO 0146 --> %', r;
end $$;
