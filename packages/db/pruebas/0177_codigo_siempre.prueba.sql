-- Prueba de la migración 0177_codigo_siempre.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codigo-siempre-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0177

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
  e_per uuid; e_op uuid; e_adm uuid; tok uuid; v_actor uuid; v_msg text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P177A', 'P0177 Sede A');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P177-PE','Prueba 0177 Personal','PE','encargado_tienda','P177A') returning id into e_per;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P177-OP','Prueba 0177 Operador','OP','encargado_tienda','P177A') returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P177-AD','Prueba 0177 Admin','AD','admin','P177A') returning id into e_adm;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_per, e_op, now() + interval '5 minutes') returning token into tok;
  delete from config where clave in ('codigo_siempre', 'codigo_exigir_admin');
  insert into config (clave, valor) values ('codigo_siempre', 'true'), ('codigo_exigir_admin', 'false');

  -- 1) cuenta personal sin token → CODIGO
  perform pg_temp.como(e_per);
  v_msg := pg_temp.mensaje('select private.actor_pipeline(null)');
  if v_msg like 'CODIGO:%' then r := r || '[ok] caso 1: sin token se pide el código;';
  else r := r || '[FALLA] caso 1: ' || v_msg || ';'; end if;

  -- 2) con token propio → el actor es el dueño del token
  v_actor := private.actor_pipeline(tok);
  if v_actor = e_op then r := r || '[ok] caso 2: con token el actor es el dueño del código;';
  else r := r || '[FALLA] caso 2;'; end if;

  -- 3) admin sin token y sin exigir_admin → pasa
  perform pg_temp.como(e_adm);
  if private.actor_pipeline(null) = e_adm then r := r || '[ok] caso 3: el admin entra sin código;';
  else r := r || '[FALLA] caso 3;'; end if;

  -- 4) admin con exigir_admin → CODIGO
  perform pg_temp.dueno();
  update config set valor = 'true' where clave = 'codigo_exigir_admin';
  perform pg_temp.como(e_adm);
  v_msg := pg_temp.mensaje('select private.actor_pipeline(null)');
  if v_msg like 'CODIGO:%' then r := r || '[ok] caso 4: exigir al admin;';
  else r := r || '[FALLA] caso 4: ' || v_msg || ';'; end if;

  -- 5) codigo_siempre apagado → comportamiento anterior (cuenta personal pasa)
  perform pg_temp.dueno();
  update config set valor = 'false' where clave = 'codigo_siempre';
  perform pg_temp.como(e_per);
  if private.actor_pipeline(null) = e_per then r := r || '[ok] caso 5: apagado vuelve a lo anterior;';
  else r := r || '[FALLA] caso 5;'; end if;

  -- 6) la pantalla pregunta si debe pedir el código
  perform pg_temp.dueno();
  update config set valor = 'true' where clave = 'codigo_siempre';
  perform pg_temp.como(e_per);
  if public.sesion_debe_dar_codigo() then r := r || '[ok] caso 6: la pantalla pide el código;';
  else r := r || '[FALLA] caso 6;'; end if;

  -- 7) validar código desde un equipo NO compartido ya no responde equipo_no_compartido
  perform pg_temp.como(e_per);
  v_msg := (pipeline_validar_codigo('P177-OP', '0000', 'equipo-que-no-existe')->>'motivo');
  if v_msg is distinct from 'equipo_no_compartido' then r := r || '[ok] caso 7: el código se evalúa en cualquier equipo;';
  else r := r || '[FALLA] caso 7;'; end if;

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0177 --> %', r;
end $$;
