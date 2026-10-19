-- Prueba de la migración 0174_puntos_solo_propios.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-puntos-solo-propios-design.md
-- Escrita ANTES que la migración. Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0174

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
create or replace function pg_temp.ve(p_uid uuid, p_emp uuid) returns int language plpgsql as $f$
declare n int;
begin
  perform pg_temp.como(p_uid);
  select count(*) into n from pipeline_puntos where empleado_id = p_emp;
  perform pg_temp.dueno();
  return n;
end $f$;

do $$
declare
  r text := '';
  v_a text := 'P174A'; v_b text := 'P174B';
  e_op uuid; e_comp uuid; e_enc uuid; e_ajeno uuid; e_conf uuid; e_adm uuid;
  p_a uuid; p_b uuid; v_n int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0174 Sede A'), (v_b, 'P0174 Sede B');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-OP','Prueba 0174 Operario','OP','ventas_junior', v_a) returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-CO','Prueba 0174 Compañero','CO','ventas_junior', v_a) returning id into e_comp;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-EN','Prueba 0174 Encargado','EN','encargado_tienda', v_a) returning id into e_enc;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-AJ','Prueba 0174 Ajeno','AJ','ventas_junior', v_b) returning id into e_ajeno;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-CF','Prueba 0174 Confeccionista','CF','confeccionista', v_a) returning id into e_conf;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P174-AD','Prueba 0174 Admin','AD','admin', v_a) returning id into e_adm;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P174-PA', 'Saco', v_a, 'recepcion') returning id into p_a;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P174-PB', 'Saco', v_b, 'recepcion') returning id into p_b;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos) values
    (e_op, p_a, 'recepcion', 1), (e_comp, p_a, 'lavado', 1), (e_ajeno, p_b, 'recepcion', 1);

  if pg_temp.ve(e_op, e_comp) = 0 and pg_temp.ve(e_op, e_op) = 1
  then r := r || '[ok] caso 1: el operario ve lo suyo y no lo del compañero;';
  else r := r || format('[FALLA] caso 1: compañero=%s propio=%s;', pg_temp.ve(e_op, e_comp), pg_temp.ve(e_op, e_op)); end if;

  if pg_temp.ve(e_enc, e_comp) = 1 and pg_temp.ve(e_enc, e_ajeno) = 0
  then r := r || '[ok] caso 2: el encargado ve su sede y no la otra;';
  else r := r || format('[FALLA] caso 2: sede=%s otra=%s;', pg_temp.ve(e_enc, e_comp), pg_temp.ve(e_enc, e_ajeno)); end if;

  if pg_temp.ve(e_conf, e_comp) = 0 and pg_temp.ve(e_conf, e_ajeno) = 0
  then r := r || '[ok] caso 3: el confeccionista no ve puntos ajenos;';
  else r := r || format('[FALLA] caso 3: sede=%s otra=%s;', pg_temp.ve(e_conf, e_comp), pg_temp.ve(e_conf, e_ajeno)); end if;

  if pg_temp.ve(e_adm, e_comp) = 1 and pg_temp.ve(e_adm, e_ajeno) = 1
  then r := r || '[ok] caso 4: el admin ve todo;';
  else r := r || '[FALLA] caso 4: el admin no ve todo;'; end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'pipeline_puntos' and cmd in ('SELECT', 'ALL');
  if v_n = 1 then r := r || '[ok] caso 5: una sola policy de lectura;';
  else r := r || format('[FALLA] caso 5: policies=%s;', v_n); end if;

  raise exception 'RESULTADO %', r;
end $$;
