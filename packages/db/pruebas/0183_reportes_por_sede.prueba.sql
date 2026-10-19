-- Prueba de la migración 0183_reportes_por_sede.sql (sesión 10A, no-negociable 3).
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0183

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
  e_al uuid; e_ta uuid; e_tb uuid; e_ad uuid; v_n int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P183X', 'P0183 Almacen'), ('P183A', 'P0183 Tienda A'), ('P183B', 'P0183 Tienda B');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P183-AL','Prueba 0183 Almacen','AL','encargado_almacen','P183X') returning id into e_al;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P183-TA','Prueba 0183 Tienda A','TA','encargado_tienda','P183A') returning id into e_ta;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P183-TB','Prueba 0183 Tienda B','TB','encargado_tienda','P183B') returning id into e_tb;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P183-AD','Prueba 0183 Admin','AD','admin','P183X') returning id into e_ad;
  insert into reportes (id, sede_cod, turno, fecha) values ('P183-RX', 'P183X', 'M', current_date), ('P183-RA', 'P183A', 'M', current_date), ('P183-RB', 'P183B', 'M', current_date);
  insert into reporte_trabajadores (reporte_id, empleado_id) values ('P183-RA', e_ta), ('P183-RB', e_tb), ('P183-RX', e_al);
  insert into reporte_actividades (reporte_id, cod, nombre) values ('P183-RA', 'A1', 'x'), ('P183-RB', 'A1', 'x'), ('P183-RX', 'A1', 'x');
  insert into reporte_extras (reporte_id, tipo, nombre) values ('P183-RA', 't', 'x'), ('P183-RB', 't', 'x'), ('P183-RX', 't', 'x');

  -- 1) el almacén ve SOLO los de su sede, en las cuatro tablas
  perform pg_temp.como(e_al);
  select (select count(*) from reportes where id like 'P183-%')
       + (select count(*) from reporte_trabajadores where reporte_id like 'P183-%')
       + (select count(*) from reporte_actividades where reporte_id like 'P183-%')
       + (select count(*) from reporte_extras where reporte_id like 'P183-%') into v_n;
  perform pg_temp.dueno();
  if v_n = 4 then r := r || '[ok] caso 1: almacén ve solo lo de su sede (4 filas, una por tabla);';
  else r := r || format('[FALLA] caso 1: filas=%s (esperaba 4);', v_n); end if;

  -- 2) una tienda ve solo lo suyo
  perform pg_temp.como(e_ta);
  select (select count(*) from reportes where id like 'P183-%') + (select count(*) from reporte_extras where reporte_id like 'P183-%') into v_n;
  perform pg_temp.dueno();
  if v_n = 2 then r := r || '[ok] caso 2: la tienda A ve solo sus reportes;';
  else r := r || format('[FALLA] caso 2: filas=%s (esperaba 2);', v_n); end if;

  -- 3) el admin ve todo
  perform pg_temp.como(e_ad);
  select count(*) into v_n from reportes where id like 'P183-%';
  perform pg_temp.dueno();
  if v_n = 3 then r := r || '[ok] caso 3: admin ve todos;';
  else r := r || format('[FALLA] caso 3: %s;', v_n); end if;

  raise exception 'RESULTADO 0183 --> %', r;
end $$;
