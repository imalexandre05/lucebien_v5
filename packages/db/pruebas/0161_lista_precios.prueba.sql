-- Prueba de la migración 0161_lista_precios.sql
-- Spec: docs/superpowers/specs/2026-10-18-lista-de-precios-confecciones-design.md
-- Escrita ANTES que la migración. Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0161

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
  r text := ''; adm uuid; per uuid; n int; m text;
begin
  perform pg_temp.dueno();
  select count(*) into n from lista_precios;
  if n = 0 then r := r || '[ok] caso 1: nace vacía;'; else r := r || format('[FALLA] caso 1: %s filas;', n); end if;

  insert into empleados (cod, nombre, iniciales, rol) values ('P161-AD', 'P161 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P161-PE', 'P161 Persona', 'PE', 'confeccionista') returning id into per;

  perform pg_temp.como(adm);
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('P161 Terno', 'prenda', 350)$q$);
  if m = 'ok' then r := r || '[ok] caso 2: el administrador inserta;'; else r := r || format('[FALLA] caso 2: %s;', m); end if;

  perform pg_temp.como(per);
  select count(*) into n from lista_precios where nombre = 'P161 Terno';
  if n = 1 then r := r || '[ok] caso 3: una persona activa lee;'; else r := r || format('[FALLA] caso 3: ve %s;', n); end if;
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('P161 Camisa', 'prenda', 50)$q$);
  if m <> 'ok' then r := r || '[ok] caso 4: una persona común no inserta;'; else r := r || '[FALLA] caso 4: insertó;'; end if;
  update lista_precios set precio = 1 where nombre = 'P161 Terno';
  get diagnostics n = row_count;
  if n = 0 then r := r || '[ok] caso 5: una persona común no edita;'; else r := r || '[FALLA] caso 5: editó;'; end if;

  perform pg_temp.como(adm);
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('P161 Malo', 'prenda', -1)$q$);
  if m <> 'ok' then r := r || '[ok] caso 6: precio negativo rechazado;'; else r := r || '[FALLA] caso 6;'; end if;
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('   ', 'servicio', 5)$q$);
  if m <> 'ok' then r := r || '[ok] caso 7: nombre vacío rechazado;'; else r := r || '[FALLA] caso 7;'; end if;
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('p161 terno ', 'prenda', 1)$q$);
  if m <> 'ok' then r := r || '[ok] caso 8: nombre repetido (sin importar mayúsculas) rechazado;'; else r := r || '[FALLA] caso 8;'; end if;
  m := pg_temp.mensaje($q$insert into lista_precios (nombre, categoria, precio) values ('P161 X', 'otra', 1)$q$);
  if m <> 'ok' then r := r || '[ok] caso 9: categoría inválida rechazada;'; else r := r || '[FALLA] caso 9;'; end if;

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0161 --> %', r;
end $$;
