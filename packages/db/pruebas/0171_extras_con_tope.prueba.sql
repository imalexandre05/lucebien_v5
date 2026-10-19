-- Prueba de la migración 0171_extras_con_tope.sql
-- Spec: docs/superpowers/specs/reportes/2026-10-19-extras-con-tope-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción
-- RESULTADO con un [ok]/[FALLA] por caso.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0171

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
-- Crea un reporte con un extra de catálogo y devuelve el mensaje; deja el reporte evaluado para que
-- el siguiente caso no choque con REPORTE_PENDIENTE.
create or replace function pg_temp.crear(p_uid uuid, p_id text, p_sede text, p_trab uuid[], p_extras jsonb)
returns text language plpgsql as $f$
declare v text;
begin
  perform pg_temp.como(p_uid);
  v := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,%L::uuid[],null::jsonb,%L::jsonb,null,null)',
                              p_id, p_sede, 'M', p_trab, p_extras));
  perform pg_temp.dueno();
  update reportes set evaluado = true where id = p_id;
  return v;
end $f$;

do $$
declare
  r text := '';
  v_a text := 'P171A'; v_b text := 'P171B';
  e_op uuid; e_comp uuid; e_ajeno uuid; e_inact uuid;
  v_err text; v_n int; v_pts numeric; v_reg uuid; v_cant int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0171 Sede A'), (v_b, 'P0171 Sede B');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P171-OP','Prueba 0171 Operario','OP','ventas_junior', v_a) returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P171-CO','Prueba 0171 Compañero','CO','ventas_junior', v_a) returning id into e_comp;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P171-AJ','Prueba 0171 Ajeno','AJ','ventas_junior', v_b) returning id into e_ajeno;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo) values ('P171-IN','Prueba 0171 Inactivo','IN','ventas_junior', v_a, false) returning id into e_inact;
  insert into actividades_config (sede_cod, cod, nombre, categoria, tipo_act, peso, precio_unitario)
    values (v_a, 'EXT-P171', 'Extra de prueba', 'EXT', 'por_puntos', 2, 1.5);

  -- 1) Cantidad enorme
  v_err := pg_temp.crear(e_op, '01-10-26_P171A_M', v_a, array[e_comp],
    '[{"cod":"EXT-P171","cantidad":5000}]'::jsonb);
  select count(*) into v_n from reportes where id = '01-10-26_P171A_M';
  if v_err like 'CANTIDAD:%' and v_n = 0 then r := r || '[ok] caso 1: cantidad 5000 se rechaza y no escribe;';
  else r := r || format('[FALLA] caso 1: err=%s n=%s;', v_err, v_n); end if;

  -- 2) Cantidad negativa o cero
  v_err := pg_temp.crear(e_op, '02-10-26_P171A_M', v_a, array[e_comp],
    format('[{"cod":"EXT-P171","cantidad":-5,"registrado_por_id":"%s"}]', e_comp)::jsonb);
  select count(*) into v_n from reportes where id = '02-10-26_P171A_M';
  if v_err like 'CANTIDAD:%' and v_n = 0 then r := r || '[ok] caso 2a: cantidad negativa se rechaza;';
  else r := r || format('[FALLA] caso 2a: err=%s n=%s;', v_err, v_n); end if;
  v_err := pg_temp.crear(e_op, '03-10-26_P171A_M', v_a, array[e_comp], '[{"cod":"EXT-P171","cantidad":0}]'::jsonb);
  select count(*) into v_n from reportes where id = '03-10-26_P171A_M';
  if v_err like 'CANTIDAD:%' and v_n = 0 then r := r || '[ok] caso 2b: cantidad 0 se rechaza;';
  else r := r || format('[FALLA] caso 2b: err=%s n=%s;', v_err, v_n); end if;

  -- 3) Cantidad dentro del tope
  v_err := pg_temp.crear(e_op, '04-10-26_P171A_M', v_a, array[e_comp], '[{"cod":"EXT-P171","cantidad":3}]'::jsonb);
  select max(puntos_total), max(registrado_por_id::text)::uuid into v_pts, v_reg from reporte_extras where reporte_id = '04-10-26_P171A_M';
  if v_err = 'ok' and v_pts = 6 and v_reg = e_op then r := r || '[ok] caso 3: cantidad 3 suma peso × 3 a quien registra;';
  else r := r || format('[FALLA] caso 3: err=%s pts=%s reg=%s;', v_err, v_pts, v_reg); end if;

  -- 4) Extra a nombre de alguien que no está en el turno
  v_err := pg_temp.crear(e_op, '05-10-26_P171A_M', v_a, array[e_comp],
    format('[{"cod":"EXT-P171","cantidad":1,"registrado_por_id":"%s"}]', e_ajeno)::jsonb);
  select count(*) into v_n from reportes where id = '05-10-26_P171A_M';
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 4: extra a nombre de alguien fuera del turno se rechaza;';
  else r := r || format('[FALLA] caso 4: err=%s n=%s;', v_err, v_n); end if;

  -- 5) Extra a nombre de un trabajador del turno
  v_err := pg_temp.crear(e_op, '06-10-26_P171A_M', v_a, array[e_comp],
    format('[{"cod":"EXT-P171","cantidad":2,"registrado_por_id":"%s"}]', e_comp)::jsonb);
  select max(registrado_por_id::text)::uuid, max(cantidad) into v_reg, v_cant from reporte_extras where reporte_id = '06-10-26_P171A_M';
  if v_err = 'ok' and v_reg = e_comp and v_cant = 2 then r := r || '[ok] caso 5: extra a nombre de un trabajador del turno;';
  else r := r || format('[FALLA] caso 5: err=%s reg=%s cant=%s;', v_err, v_reg, v_cant); end if;

  -- 6) Trabajador inexistente o inactivo
  v_err := pg_temp.crear(e_op, '07-10-26_P171A_M', v_a, array[e_inact], null);
  select count(*) into v_n from reportes where id = '07-10-26_P171A_M';
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 6a: trabajador inactivo se rechaza;';
  else r := r || format('[FALLA] caso 6a: err=%s n=%s;', v_err, v_n); end if;
  v_err := pg_temp.crear(e_op, '08-10-26_P171A_M', v_a, array[gen_random_uuid()], null);
  select count(*) into v_n from reportes where id = '08-10-26_P171A_M';
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 6b: trabajador inexistente se rechaza;';
  else r := r || format('[FALLA] caso 6b: err=%s n=%s;', v_err, v_n); end if;

  -- 7) Marcar asistencia de un reporte de otra sede
  delete from asistencias where empleado_id in (e_op, e_comp);
  perform pg_temp.como(e_ajeno);
  v_err := pg_temp.mensaje('select reportes_marcar_asistencia(''06-10-26_P171A_M'')');
  perform pg_temp.dueno();
  select count(*) into v_n from asistencias where empleado_id in (e_op, e_comp);
  if v_err like 'PERMISO:%' and v_n = 0 then r := r || '[ok] caso 7a: marcar asistencia de otra sede se rechaza;';
  else r := r || format('[FALLA] caso 7a: err=%s n=%s;', v_err, v_n); end if;
  perform pg_temp.como(e_op);
  v_err := pg_temp.mensaje('select reportes_marcar_asistencia(''06-10-26_P171A_M'')');
  perform pg_temp.dueno();
  select count(*) into v_n from asistencias where empleado_id in (e_op, e_comp);
  if v_err = 'ok' and v_n = 2 then r := r || '[ok] caso 7b: desde la sede marca asistencia;';
  else r := r || format('[FALLA] caso 7b: err=%s n=%s;', v_err, v_n); end if;

  -- 9) El tope es por extra del reporte: repetir el mismo código en varias filas no lo salta
  v_err := pg_temp.crear(e_op, '09-10-26_P171A_M', v_a, array[e_comp],
    (select jsonb_agg(jsonb_build_object('cod', 'EXT-P171', 'cantidad', 50, 'registrado_por_id', e_comp))
       from generate_series(1, 3))::jsonb);
  select count(*) into v_n from reportes where id = '09-10-26_P171A_M';
  if v_err like 'CANTIDAD:%' and v_n = 0 then r := r || '[ok] caso 9: el mismo extra repetido en filas no pasa el tope;';
  else r := r || format('[FALLA] caso 9: err=%s n=%s;', v_err, v_n); end if;

  -- 8) Firmas
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('reportes_crear', 'reportes_marcar_asistencia');
  if v_n = 2 and not exists (select 1 from pg_proc p where p.proname in ('reportes_crear', 'reportes_marcar_asistencia')
       and has_function_privilege('anon', p.oid, 'execute'))
  then r := r || '[ok] caso 8: una sola firma de cada una y sin execute para anon;';
  else r := r || format('[FALLA] caso 8: firmas=%s;', v_n); end if;

  raise exception 'RESULTADO %', r;
end $$;
