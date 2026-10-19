-- Prueba de la migración 0182_accesorios_con_codigo.sql (sesión 10A).
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0182

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

create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := '';
  e_al uuid; e_op uuid; e_ta uuid; e_tb uuid; v_id uuid; v_err text; v_n int; v_tok uuid;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P182X', 'P0182 Almacen'), ('P182A', 'P0182 Tienda A'), ('P182B', 'P0182 Tienda B');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P182-AL','Prueba 0182 Almacen','AL','encargado_almacen','P182X') returning id into e_al;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P182-OP','Prueba 0182 Operador','OP','confeccionista','P182X') returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P182-TA','Prueba 0182 Tienda A','TA','encargado_tienda','P182A') returning id into e_ta;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P182-TB','Prueba 0182 Tienda B','TB','encargado_tienda','P182B') returning id into e_tb;
  delete from config where clave = 'codigo_siempre';
  insert into config (clave, valor) values ('codigo_siempre', 'false');
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_al, e_op, now() + interval '5 minutes') returning token into v_tok;

  -- 1) almacén envía con token: la remesa queda a nombre del dueño del código
  perform pg_temp.como(e_al);
  v_id := accesorios_enviar('P182A', 'prueba', '[{"tipo":"Corbata","cantidad":5}]'::jsonb, v_tok);
  perform pg_temp.dueno();
  select count(*) into v_n from envios_accesorios where id = v_id and responsable_id = e_op;
  if v_n = 1 and (select count(*) from envio_accesorios_items where envio_id = v_id) = 1
    then r := r || '[ok] caso 1: la remesa queda a nombre del dueño del código;';
  else r := r || '[FALLA] caso 1;'; end if;

  -- 2) una tienda no puede enviar; sin ítems o sede falsa se rechaza
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format('select accesorios_enviar(%L, %L, %L::jsonb, null)', 'P182B', '', '[{"tipo":"Corbata","cantidad":1}]'));
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 2a: una tienda no envía remesas;'; else r := r || '[FALLA] caso 2a;'; end if;
  perform pg_temp.como(e_al);
  v_err := pg_temp.mensaje(format('select accesorios_enviar(%L, %L, %L::jsonb, null)', 'P182A', '', '[{"tipo":"Corbata","cantidad":0}]'));
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 2b: sin cantidad se rechaza;'; else r := r || '[FALLA] caso 2b;'; end if;

  -- 3) otra tienda no valida; la destino sí, a nombre del código; no se valida dos veces
  perform pg_temp.como(e_tb);
  v_err := pg_temp.mensaje(format('select accesorios_validar(%L, null)', v_id));
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 3a: otra tienda no valida;'; else r := r || '[FALLA] caso 3a;'; end if;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_ta, e_op, now() + interval '5 minutes') returning token into v_tok;
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format('select accesorios_validar(%L, %L)', v_id, v_tok));
  perform pg_temp.dueno();
  select count(*) into v_n from envios_accesorios where id = v_id and validado_tienda and validado_por_id = e_op;
  if v_err = 'ok' and v_n = 1 then r := r || '[ok] caso 3b: la destino valida a nombre del código;';
  else r := r || format('[FALLA] caso 3b: %s %s;', v_err, v_n); end if;
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format('select accesorios_validar(%L, null)', v_id));
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 3c: no se valida dos veces;'; else r := r || '[FALLA] caso 3c;'; end if;

  -- 4) con la regla «código siempre», sin token se pide el código
  update config set valor = 'true' where clave = 'codigo_siempre';
  perform pg_temp.como(e_al);
  v_err := pg_temp.mensaje(format('select accesorios_enviar(%L, %L, %L::jsonb, null)', 'P182A', '', '[{"tipo":"Corbata","cantidad":1}]'));
  perform pg_temp.dueno();
  if v_err like 'CODIGO:%' then r := r || '[ok] caso 4: sin código se pide el código;'; else r := r || format('[FALLA] caso 4: %s;', v_err); end if;

  -- 5) escritura directa cerrada
  perform pg_temp.como(e_al);
  v_err := pg_temp.mensaje(format('insert into envios_accesorios (sede_destino_cod, fecha) values (%L, now())', 'P182A'));
  perform pg_temp.dueno();
  if v_err <> 'ok' then r := r || '[ok] caso 5: el insert directo falla;'; else r := r || '[FALLA] caso 5;'; end if;

  raise exception 'RESULTADO 0182 --> %', r;
end $$;
