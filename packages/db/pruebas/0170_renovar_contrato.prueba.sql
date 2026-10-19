-- Prueba de la migración 0170_renovar_contrato.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-renovar-contrato-design.md §3 y §5
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0170

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
  r text := ''; adm uuid; otro uuid; per uuid; per2 uuid; per3 uuid; a3 uuid; a1 uuid; a2 uuid; nuevo uuid; msg text; cnt int; f record;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P170-AD', 'P170 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P170-OT', 'P170 Otro', 'OT', 'encargado_tienda') returning id into otro;
  insert into empleados (cod, nombre, iniciales, rol) values ('P170-PE', 'P170 Persona', 'PE', 'confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P170-P2', 'P170 Persona 2', 'P2', 'confeccionista') returning id into per2;

  -- Contrato por horas, meses completos: 1-jul-2099 a 31-jul-2099, semanal cada 7 días, 2 turnos el lunes.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias, sueldo_pactado, tarifa_hora, escala,
                               almuerzo_habilitado, parametros, creado_por, estado)
    values (per, '2099-07-01', '2099-07-31', 'dias', 7, 0, 6.5, 2, true, '{"toleranciaMinutos": 15}', adm, 'vigente') returning id into a1;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin, lugar)
    values (a1, 1, '08:00', '12:00', 'AL'), (a1, 1, '14:00', '18:00', 'AL'), (a1, 3, '08:00', '13:00', null);

  -- 1) un no administrador no puede renovar
  perform pg_temp.como(otro);
  msg := pg_temp.mensaje(format('select sueldo_acuerdo_renovar(%L)', a1));
  if msg like 'PERMISO:%' then r := r || '[ok] 1;'; else r := r || format('[FALLA] 1: %s;', msg); end if;

  -- 2) renovar: borrador con todo copiado, fechas de meses completos
  perform pg_temp.como(adm);
  nuevo := sueldo_acuerdo_renovar(a1);
  select * into f from sueldo_acuerdos where id = nuevo;
  if f.estado = 'borrador' and f.renueva_a = a1 and f.empleado_id = per
     and f.fecha_inicio = date '2099-08-01' and f.fecha_fin = date '2099-08-31'
     and f.modalidad = 'dias' and f.cada_dias = 7 and f.tarifa_hora = 6.5 and f.sueldo_pactado = 0 and f.escala = 2
     and f.almuerzo_habilitado and f.parametros = '{"toleranciaMinutos": 15}'::jsonb then
    r := r || '[ok] 2;';
  else r := r || format('[FALLA] 2: %s;', to_jsonb(f)); end if;
  select count(*) into cnt from sueldo_acuerdo_turnos where acuerdo_id = nuevo;
  if cnt = 3 and exists (select 1 from sueldo_acuerdo_turnos where acuerdo_id = nuevo and dia_semana = 1 and hora_inicio = '14:00' and lugar = 'AL') then
    r := r || '[ok] 3;'; else r := r || format('[FALLA] 3: %s turnos;', cnt); end if;

  -- 4) renovar dos veces se rechaza
  msg := pg_temp.mensaje(format('select sueldo_acuerdo_renovar(%L)', a1));
  if msg like 'ESTADO:%' then r := r || '[ok] 4;'; else r := r || format('[FALLA] 4: %s;', msg); end if;

  -- 5) un borrador no se renueva
  msg := pg_temp.mensaje(format('select sueldo_acuerdo_renovar(%L)', nuevo));
  if msg like 'ESTADO:%' then r := r || '[ok] 5;'; else r := r || format('[FALLA] 5: %s;', msg); end if;

  -- 6) fechas no de meses completos → los mismos días (5-jul a 3-ago = 30 días → 4-ago a 2-sep)
  perform pg_temp.dueno();
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per2, '2099-07-05', '2099-08-03', 900, adm, 'vigente') returning id into a2;
  perform pg_temp.como(adm);
  nuevo := sueldo_acuerdo_renovar(a2);
  select * into f from sueldo_acuerdos where id = nuevo;
  if f.fecha_inicio = date '2099-08-04' and f.fecha_fin = date '2099-09-02' and f.sueldo_pactado = 900 then r := r || '[ok] 6;';
  else r := r || format('[FALLA] 6: %s a %s;', f.fecha_inicio, f.fecha_fin); end if;

  -- 7) el administrador puede editar el borrador antes de que empiece
  update sueldo_acuerdos set fecha_fin = date '2099-09-30' where id = nuevo;
  select count(*) into cnt from sueldo_acuerdos where id = nuevo and fecha_fin = date '2099-09-30';
  if cnt = 1 then r := r || '[ok] 7;'; else r := r || '[FALLA] 7: no se pudo editar;'; end if;
  perform pg_temp.dueno();

  -- 8) activación: antes del inicio no hace nada (per2 renueva desde 2099-08-04)
  if sueldo_renovaciones_activar(date '2099-08-03') = 0
     and (select estado from sueldo_acuerdos where id = nuevo) = 'borrador' then r := r || '[ok] 8;';
  else r := r || '[FALLA] 8: activó antes de tiempo;'; end if;

  -- 9) llegó el día pero el anterior sigue vigente → espera (nunca dos vigentes)
  if sueldo_renovaciones_activar(date '2099-08-04') = 0
     and (select estado from sueldo_acuerdos where id = nuevo) = 'borrador' then r := r || '[ok] 9;';
  else r := r || '[FALLA] 9: dejó dos vigentes;'; end if;

  -- 10) con el anterior liquidado, pasa a vigente
  update sueldo_acuerdos set estado = 'liquidado' where id = a2;
  cnt := sueldo_renovaciones_activar(date '2099-08-04');
  if cnt = 1
     and (select estado from sueldo_acuerdos where id = nuevo) = 'vigente'
     and (select count(*) from sueldo_acuerdos where empleado_id = per2 and estado = 'vigente') = 1 then r := r || '[ok] 10;';
  else r := r || format('[FALLA] 10: activó %s;', cnt); end if;

  -- 11) un borrador sin renueva_a nunca se activa solo
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (otro, '2099-01-01', '2099-01-31', 500, adm, 'borrador');
  if sueldo_renovaciones_activar(date '2099-12-31') = 0
     and (select estado from sueldo_acuerdos where empleado_id = otro) = 'borrador' then r := r || '[ok] 11;';
  else r := r || '[FALLA] 11: activó un borrador manual;'; end if;

  -- 12) con un cambio de frecuencia dentro del contrato, el borrador copia lo vigente al final
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P170-P3', 'P170 Persona 3', 'P3', 'confeccionista') returning id into per3;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, creado_por, estado)
    values (per3, '2098-10-01', '2098-12-31', 'mensual', 1200, adm, 'vigente') returning id into a3;
  insert into sueldo_acuerdo_cambios (acuerdo_id, desde, modalidad, sueldo_pactado, modalidad_anterior, sueldo_pactado_anterior, creado_por)
    values (a3, '2098-12-01', 'quincenal', 650, 'mensual', 1200, adm);
  perform pg_temp.como(adm);
  nuevo := sueldo_acuerdo_renovar(a3);
  perform pg_temp.dueno();
  select * into f from sueldo_acuerdos where id = nuevo;
  if f.modalidad = 'quincenal' and f.sueldo_pactado = 650 then r := r || '[ok] 12;';
  else r := r || format('[FALLA] 12: %s %s;', f.modalidad, f.sueldo_pactado); end if;

  raise exception 'RESULTADO 0170 --> %', r;
end $$;
