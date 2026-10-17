-- Prueba de la migración 0133_temporadas.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-temporadas-pago-y-metas-design.md
--
-- QUÉ COMPRUEBA:
--   1. Sólo admin/dueño crea, edita y borra temporadas (por RPC); un no-admin recibe error.
--   2. Un usuario autenticado activo las lee; un insert directo falla para todos.
--   3. Validaciones: hasta < desde, nombre vacío, valores negativos y solape se rechazan.
--   4. Editar una temporada no choca consigo misma; borrar funciona.
-- Todo sintético, prefijo 'P0133'. Se descarta sola (excepción final con RESULTADO).
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0133

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
  e_adm uuid; e_op uuid; t1 uuid; v_n int; m text;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P0133-AD', 'P0133 Admin', 'AD', 'admin') returning id into e_adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0133-OP', 'P0133 Operario', 'OP', 'confeccionista') returning id into e_op;

  -- 1) no-admin no escribe
  perform pg_temp.como(e_op);
  m := pg_temp.mensaje($q$select temporada_guardar(null, 'P0133 Navidad', '2026-12-01', '2026-12-31', 6, 2000, null)$q$);
  r := r || format('noadmin=%s; ', case when m like '%administrador%' then 'ok' else 'FALLA:' || m end);

  -- 2) admin crea; el operario lee; insert directo falla
  perform pg_temp.como(e_adm);
  t1 := temporada_guardar(null, 'P0133 Navidad', '2026-12-01', '2026-12-31', 6, 2000, null);
  perform pg_temp.como(e_op);
  select count(*) into v_n from temporadas where nombre = 'P0133 Navidad';
  r := r || format('lectura=%s; ', case when v_n = 1 then 'ok' else 'FALLA:' || v_n end);
  m := pg_temp.mensaje($q$insert into temporadas (nombre, desde, hasta) values ('P0133 directo', '2027-01-01', '2027-01-10')$q$);
  r := r || format('directo=%s; ', case when m like '%permission denied%' or m like '%row-level%' then 'ok' else 'FALLA:' || m end);

  -- 3) validaciones
  perform pg_temp.como(e_adm);
  m := pg_temp.mensaje($q$select temporada_guardar(null, 'P0133 X', '2026-12-31', '2026-12-01', null, null, null)$q$);
  r := r || format('invertida=%s; ', case when m like '%hasta%' then 'ok' else 'FALLA:' || m end);
  m := pg_temp.mensaje($q$select temporada_guardar(null, '  ', '2027-02-01', '2027-02-10', null, null, null)$q$);
  r := r || format('nombre=%s; ', case when m like '%nombre%' then 'ok' else 'FALLA:' || m end);
  m := pg_temp.mensaje($q$select temporada_guardar(null, 'P0133 Neg', '2027-02-01', '2027-02-10', -1, null, null)$q$);
  r := r || format('negativo=%s; ', case when m like '%negativ%' or m like '%mayor%' then 'ok' else 'FALLA:' || m end);
  m := pg_temp.mensaje($q$select temporada_guardar(null, 'P0133 Solape', '2026-12-31', '2027-01-05', null, null, null)$q$);
  r := r || format('solape=%s; ', case when m like '%se cruza%' then 'ok' else 'FALLA:' || m end);

  -- 4) editar sin chocar consigo misma, y borrar
  perform temporada_guardar(t1, 'P0133 Navidad', '2026-12-01', '2026-12-31', 7, 2500, 80);
  select count(*) into v_n from temporadas where id = t1 and pago_por_hora = 7 and meta_por_hora = 80;
  r := r || format('editar=%s; ', case when v_n = 1 then 'ok' else 'FALLA' end);
  perform temporada_eliminar(t1);
  select count(*) into v_n from temporadas where nombre = 'P0133 Navidad';
  r := r || format('borrar=%s; ', case when v_n = 0 then 'ok' else 'FALLA' end);

  raise exception 'RESULTADO: %', r;
end $$;
