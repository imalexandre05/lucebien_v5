-- Prueba de la migración 0134_candidatos.sql
-- Spec: docs/superpowers/specs/empleados/2026-10-11-candidatos-entrevista-prueba-design.md (§8)
--
-- QUÉ COMPRUEBA:
--   1. Un no-admin no lee, no crea ni cambia candidatos (datos personales).
--   2. Transiciones inválidas se rechazan (cerrar sin iniciar, saltar etapas).
--   3. No se cierra la prueba antes de su fecha de fin; con la fecha cumplida sí.
--   4. Vincular al empleado: una sola vez; estado contratado.
--   5. Sin escritura directa; el cliente no fija creado_por/creado_en.
-- Todo sintético, prefijo 'P0134'. Se descarta sola (excepción final con RESULTADO).
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0134

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
  e_adm uuid; e_op uuid; e_nuevo uuid; c uuid; v_n int; m text; v_estado text; v_hasta date; v_cb uuid;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P0134-AD', 'P0134 Admin', 'AD', 'admin') returning id into e_adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0134-OP', 'P0134 Operario', 'OP', 'confeccionista') returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0134-NU', 'P0134 Nuevo', 'NU', 'confeccionista') returning id into e_nuevo;

  -- 1) el operario no crea ni lee
  perform pg_temp.como(e_op);
  m := pg_temp.mensaje($q$select candidato_crear('P0134 Ana', '12345678', '999', null, null)$q$);
  r := r || format('noadmin_crea=%s; ', case when m like '%administrador%' then 'ok' else 'FALLA:' || m end);

  perform pg_temp.como(e_adm);
  c := candidato_crear('P0134 Ana', '12345678', '999', null, null);
  perform pg_temp.como(e_op);
  select count(*) into v_n from candidatos;
  r := r || format('noadmin_lee=%s; ', case when v_n = 0 then 'ok' else 'FALLA:' || v_n end);
  m := pg_temp.mensaje($q$insert into candidatos (nombre) values ('P0134 directo')$q$);
  r := r || format('directo=%s; ', case when m like '%permission denied%' or m like '%row-level%' then 'ok' else 'FALLA:' || m end);

  -- 2) transiciones inválidas
  perform pg_temp.como(e_adm);
  m := pg_temp.mensaje(format($q$select candidato_iniciar_prueba(%L, current_date)$q$, c));
  r := r || format('saltar=%s; ', case when m like '%entrevist%' then 'ok' else 'FALLA:' || m end);
  m := pg_temp.mensaje(format($q$select candidato_cerrar_prueba(%L, 'bueno', null)$q$, c));
  r := r || format('cerrar_sin_iniciar=%s; ', case when m like '%prueba%' then 'ok' else 'FALLA:' || m end);

  -- 3) camino feliz y cierre anticipado
  perform candidato_entrevistar(c, 'Buena actitud');
  perform candidato_iniciar_prueba(c, (now() at time zone 'America/Lima')::date);
  select prueba_hasta into v_hasta from candidatos where id = c;
  r := r || format('fin_prueba=%s; ', case when v_hasta = (now() at time zone 'America/Lima')::date + 2 then 'ok' else 'FALLA:' || v_hasta end);
  m := pg_temp.mensaje(format($q$select candidato_cerrar_prueba(%L, 'bueno', null)$q$, c));
  r := r || format('cierre_anticipado=%s; ', case when m like '%día%' or m like '%fin%' then 'ok' else 'FALLA:' || m end);
  perform pg_temp.dueno();
  update candidatos set prueba_desde = prueba_desde - 5, prueba_hasta = prueba_hasta - 5 where id = c;
  perform pg_temp.como(e_adm);
  perform candidato_cerrar_prueba(c, 'bueno', 'Cumplió');
  select estado, creado_por into v_estado, v_cb from candidatos where id = c;
  r := r || format('cerrada=%s; ', case when v_estado = 'prueba_cerrada' and v_cb = e_adm then 'ok' else 'FALLA:' || v_estado end);

  -- 4) vincular una sola vez
  perform candidato_vincular(c, e_nuevo);
  select estado into v_estado from candidatos where id = c;
  r := r || format('contratado=%s; ', case when v_estado = 'contratado' then 'ok' else 'FALLA:' || v_estado end);
  m := pg_temp.mensaje(format($q$select candidato_vincular(%L, %L)$q$, c, e_nuevo));
  r := r || format('doble_alta=%s; ', case when m like '%contratado%' or m like '%transici%' then 'ok' else 'FALLA:' || m end);

  -- 5) descartar / reactivar
  c := candidato_crear('P0134 Beto', null, null, null, null);
  perform candidato_descartar(c, 'No se presentó');
  perform candidato_reactivar(c);
  select estado into v_estado from candidatos where id = c;
  r := r || format('reactivar=%s; ', case when v_estado = 'por_entrevistar' then 'ok' else 'FALLA:' || v_estado end);

  raise exception 'RESULTADO: %', r;
end $$;
