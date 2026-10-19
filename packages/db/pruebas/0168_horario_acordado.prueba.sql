-- Prueba de la migración 0168_horario_acordado.sql
-- Spec: docs/superpowers/specs/asistencias/2026-10-19-horario-acordado-design.md §2, §3 y §6
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0168
--
-- Lunes 2020-03-02, turno 08:00–16:00, tolerancia 10 min (default). La persona llega 08:55:
--   sin hora acordada es tardanza; con inicio acordado 09:00 ya no.

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;

do $$
declare
  r text := ''; adm uuid; otro uuid; e uuid; ac uuid; v_id uuid; j jsonb; fila jsonb; cnt int;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P168-AD', 'P168 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P168-OT', 'P168 Otro', 'OT', 'encargado_tienda') returning id into otro;
  insert into empleados (cod, nombre, iniciales, rol) values ('P168-E', 'P168 Persona', 'PE', 'confeccionista') returning id into e;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (e, date '2020-03-01', date '2020-03-31', 1000) returning id into ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select ac, n, time '08:00', time '16:00' from generate_series(1, 5) n;
  insert into asistencias (empleado_id, fecha, turno, hora_entrada, hora_salida, condicion)
    values (e, date '2020-03-02', 'M', time '08:55', time '16:00', 'trabajado') returning id into v_id;
  delete from config where clave = 'eval_puntualidad_modo';

  -- 1) las columnas existen y empiezan vacías
  select count(*) into cnt from asistencias where id = v_id and inicio_acordado is null and motivo_acordado is null;
  if cnt = 1 then r := r || '[ok] 1;'; else r := r || '[FALLA] 1: columnas ausentes o con valor;'; end if;

  -- 2) sin hora acordada: tardanza (la nota de puntualidad es 0 con 1 debido y 0 puntuales)
  j := private.evaluacion_componentes_datos(e, date '2020-03-02', date '2020-03-08');
  if (j ->> 'puntualidadTardanzas')::int = 1 and (j ->> 'tardanza')::numeric = 0 then r := r || '[ok] 2;';
  else r := r || format('[FALLA] 2: %s;', j); end if;

  -- 3) el administrador escribe la hora acordada
  perform pg_temp.como(adm);
  update asistencias set inicio_acordado = time '09:00', motivo_acordado = 'Cambio acordado con Jordan' where id = v_id;
  perform pg_temp.dueno();
  select count(*) into cnt from asistencias where id = v_id and inicio_acordado = time '09:00';
  if cnt = 1 then r := r || '[ok] 3;'; else r := r || '[FALLA] 3: el admin no pudo escribirla;'; end if;

  -- 4) con hora acordada 09:00 la puntualidad lo cuenta puntual
  j := private.evaluacion_componentes_datos(e, date '2020-03-02', date '2020-03-08');
  if (j ->> 'puntualidadTardanzas')::int = 0 and (j ->> 'puntualidadPuntuales')::int = 1 and (j ->> 'tardanza')::numeric = 20 then
    r := r || '[ok] 4;';
  else r := r || format('[FALLA] 4: %s;', j); end if;

  -- 5) llegó 09:20 con acordado 09:00 → tardanza igual (tolerancia 10)
  update asistencias set hora_entrada = time '09:20' where id = v_id;
  j := private.evaluacion_componentes_datos(e, date '2020-03-02', date '2020-03-08');
  if (j ->> 'puntualidadTardanzas')::int = 1 then r := r || '[ok] 5;'; else r := r || format('[FALLA] 5: %s;', j); end if;
  update asistencias set hora_entrada = time '08:55' where id = v_id;

  -- 6) sueldo_entrada manda inicioAcordado en el día; sin hora acordada la clave no se emite (un borrador anterior no queda «desactualizado»)
  perform pg_temp.como(adm);
  j := public.sueldo_entrada(ac, date '2020-03-02', date '2020-03-06', true);
  fila := (j -> 'asistencia') -> 0;
  if fila ->> 'inicioAcordado' = '09:00' then r := r || '[ok] 6a;'; else r := r || format('[FALLA] 6a: %s;', fila); end if;
  perform pg_temp.dueno();
  update asistencias set inicio_acordado = null, motivo_acordado = null where id = v_id;
  perform pg_temp.como(adm);
  j := public.sueldo_entrada(ac, date '2020-03-02', date '2020-03-06', true);
  fila := (j -> 'asistencia') -> 0;
  if not (fila ? 'inicioAcordado') then r := r || '[ok] 6b;'; else r := r || format('[FALLA] 6b: %s;', fila); end if;
  perform pg_temp.dueno();

  -- 7) un motivo de más de 300 letras se rechaza
  begin
    update asistencias set inicio_acordado = time '09:00', motivo_acordado = repeat('x', 301) where id = v_id;
    r := r || '[FALLA] 7: aceptó un motivo de 301 letras;';
  exception when check_violation then r := r || '[ok] 7;';
  end;

  -- 8) un no administrador no puede escribirla
  perform pg_temp.como(otro);
  begin
    update asistencias set inicio_acordado = time '10:00' where id = v_id;
  exception when others then null;
  end;
  perform pg_temp.dueno();
  select count(*) into cnt from asistencias where id = v_id and inicio_acordado is null;
  if cnt = 1 then r := r || '[ok] 8;'; else r := r || '[FALLA] 8: un no admin la escribió;'; end if;

  raise exception 'RESULTADO 0168 --> %', r;
end $$;
