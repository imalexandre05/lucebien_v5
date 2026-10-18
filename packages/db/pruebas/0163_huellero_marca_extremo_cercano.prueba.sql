-- Prueba de la migración 0163_huellero_marca_extremo_cercano.sql
-- Spec: docs/superpowers/specs/asistencias/2026-10-18-huellero-marca-extremo-cercano-design.md §4
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0163

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;

-- Persona con contrato 2099 (todo el año) y los turnos que se pasen, los siete días.
create or replace function pg_temp.persona(p_cod text, p_adm uuid, p_turnos text[]) returns uuid
language plpgsql as $f$
declare v_id uuid; v_ac uuid; t text;
begin
  insert into empleados (cod, nombre, iniciales, rol) values (p_cod, 'Prueba ' || p_cod, 'PR', 'confeccionista')
    returning id into v_id;
  if p_turnos is not null then
    insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
      values (v_id, '2099-01-01', '2099-12-31', 1000, p_adm, 'vigente') returning id into v_ac;
    foreach t in array p_turnos loop
      insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
        select v_ac, d, split_part(t, '-', 1)::time, split_part(t, '-', 2)::time from generate_series(1, 7) d;
    end loop;
  end if;
  return v_id;
end $f$;

create or replace function pg_temp.marcar(p_disp uuid, p_emp uuid, p_fecha date, p_horas text[]) returns void
language plpgsql as $f$
declare h text; n int := 0;
begin
  foreach h in array p_horas loop
    n := n + 1;
    insert into marcas_huellero (dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
      values (p_disp, '163', p_emp, (p_fecha::text || 'T' || h || ':00-05:00')::timestamptz,
              (extract(epoch from clock_timestamp()) * 1000)::bigint + n + (random() * 1e9)::bigint, 'X');
  end loop;
end $f$;

do $$
declare
  r text := '';
  adm uuid; disp uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; e6 uuid; e7 uuid; e8 uuid; e9 uuid;
  v_ac uuid;
  a record;
  v_n int;
  v_err text;
begin
  perform pg_temp.dueno();
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';
  insert into config (clave, valor) values ('huellero_doble_marca_minutos', '2')
    on conflict (clave) do update set valor = '2';
  insert into empleados (cod, nombre, iniciales, rol) values ('P163-AD', 'Prueba 163 Admin', 'AD', 'admin') returning id into adm;
  insert into dispositivos_huellero (nombre, ip) values ('Prueba 0163', '10.0.1.63') returning id into disp;

  e1 := pg_temp.persona('P163-1', adm, array['08:00-14:00']);
  e2 := pg_temp.persona('P163-2', adm, array['08:00-14:00', '16:00-21:00']);
  e3 := pg_temp.persona('P163-3', adm, array['08:00-14:00', '16:00-21:00']);
  e4 := pg_temp.persona('P163-4', adm, array['08:00-14:00']);
  e5 := pg_temp.persona('P163-5', adm, array['08:00-14:00']);
  e6 := pg_temp.persona('P163-6', adm, null);
  e7 := pg_temp.persona('P163-7', adm, null);
  e8 := pg_temp.persona('P163-8', adm, null);
  e9 := pg_temp.persona('P163-9', adm, array['08:00-14:00']);

  -- ── 1) Una sola marca 14:05 con turno 08:00–14:00: es la salida ──────────────────────────
  perform pg_temp.marcar(disp, e1, '2099-03-02', array['14:05']);
  perform huellero_derivar_asistencia(e1, '2099-03-02');
  select * into a from asistencias where empleado_id = e1 and fecha = '2099-03-02';
  if a.hora_salida = '14:05' and a.hora_entrada is null and a.condicion = 'sin_dato'
     and coalesce(a.obs, '') like '%pendiente: falta la hora de entrada%' and not a.entrada_estimada then
    r := r || '[ok] 1;';
  else
    r := r || format('[FALLA] 1: ent=%s sal=%s cond=%s obs=%s;', a.hora_entrada, a.hora_salida, a.condicion, a.obs);
  end if;

  -- ── 2) Dos turnos: 14:05 está más cerca del fin del primero que de cualquier inicio ───────
  perform pg_temp.marcar(disp, e2, '2099-03-02', array['14:05']);
  perform huellero_derivar_asistencia(e2, '2099-03-02');
  select * into a from asistencias where empleado_id = e2 and fecha = '2099-03-02';
  if a.hora_salida = '14:05' and a.hora_entrada is null and a.condicion = 'sin_dato' then
    r := r || '[ok] 2;';
  else
    r := r || format('[FALLA] 2: ent=%s sal=%s cond=%s;', a.hora_entrada, a.hora_salida, a.condicion);
  end if;

  -- ── 3) Primer tramo completo, vuelta de la tarde sin salida: entrada pendiente ────────────
  perform pg_temp.marcar(disp, e3, '2099-03-02', array['08:00', '14:00', '16:02']);
  perform huellero_derivar_asistencia(e3, '2099-03-02');
  select count(*) into v_n from asistencias
   where empleado_id = e3 and fecha = '2099-03-02' and condicion = 'trabajado'
     and hora_entrada = '08:00' and hora_salida = '14:00';
  select * into a from asistencias
   where empleado_id = e3 and fecha = '2099-03-02' and hora_entrada = '16:02';
  if v_n = 1 and found and a.hora_salida is null and a.condicion = 'sin_dato'
     and coalesce(a.obs, '') like '%pendiente: falta la hora de salida%' then
    r := r || '[ok] 3;';
  else
    r := r || format('[FALLA] 3: completos=%s tarde ent=%s sal=%s cond=%s;', v_n, a.hora_entrada, a.hora_salida, a.condicion);
  end if;

  -- ── 4) Sólo la entrada: ya no se estima la salida con el horario ──────────────────────────
  perform pg_temp.marcar(disp, e4, '2099-03-02', array['08:03']);
  perform huellero_derivar_asistencia(e4, '2099-03-02');
  select * into a from asistencias where empleado_id = e4 and fecha = '2099-03-02';
  if a.hora_entrada = '08:03' and a.hora_salida is null and a.condicion = 'sin_dato'
     and not a.salida_estimada then
    r := r || '[ok] 4;';
  else
    r := r || format('[FALLA] 4: ent=%s sal=%s cond=%s est=%s;', a.hora_entrada, a.hora_salida, a.condicion, a.salida_estimada);
  end if;

  -- ── 5) Huella completa: trabajado, nada estimado ──────────────────────────────────────────
  perform pg_temp.marcar(disp, e5, '2099-03-02', array['08:00', '14:01']);
  perform huellero_derivar_asistencia(e5, '2099-03-02');
  select * into a from asistencias where empleado_id = e5 and fecha = '2099-03-02';
  if a.hora_entrada = '08:00' and a.hora_salida = '14:01' and a.condicion = 'trabajado'
     and not a.entrada_estimada and not a.salida_estimada then
    r := r || '[ok] 5;';
  else
    r := r || format('[FALLA] 5: ent=%s sal=%s cond=%s;', a.hora_entrada, a.hora_salida, a.condicion);
  end if;

  -- ── 6) Sin horario: la marca suelta queda como entrada, pendiente ─────────────────────────
  perform pg_temp.marcar(disp, e6, '2099-03-02', array['14:05']);
  perform huellero_derivar_asistencia(e6, '2099-03-02');
  select * into a from asistencias where empleado_id = e6 and fecha = '2099-03-02';
  if a.hora_entrada = '14:05' and a.hora_salida is null and a.condicion = 'sin_dato' then
    r := r || '[ok] 6;';
  else
    r := r || format('[FALLA] 6: ent=%s sal=%s cond=%s;', a.hora_entrada, a.hora_salida, a.condicion);
  end if;

  -- ── 7) Derivado sin horario; llega el contrato y se vuelve a leer: pasa a salida ──────────
  perform pg_temp.marcar(disp, e7, '2099-03-02', array['14:05']);
  perform huellero_derivar_asistencia(e7, '2099-03-02');
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (e7, '2099-01-01', '2099-12-31', 1000, adm, 'vigente') returning id into v_ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_ac, d, '08:00', '14:00' from generate_series(1, 7) d;
  perform pg_temp.como(adm);
  v_n := huellero_rederivar(e7, '2099-03-01', '2099-03-31');
  perform pg_temp.dueno();
  select * into a from asistencias where empleado_id = e7 and fecha = '2099-03-02';
  if a.hora_salida = '14:05' and a.hora_entrada is null and a.condicion = 'sin_dato' and v_n = 1 then
    r := r || '[ok] 7;';
  else
    r := r || format('[FALLA] 7: ent=%s sal=%s cond=%s n=%s;', a.hora_entrada, a.hora_salida, a.condicion, v_n);
  end if;

  -- ── 8) La misma situación pero la entrada 14:05 la escribió una persona: no se toca ───────
  insert into asistencias (empleado_id, fecha, turno, hora_entrada, condicion, fuente, minutos_tardanza)
    values (e8, '2099-03-02', 'M', '14:05', 'sin_dato', 'manual', 0);
  perform pg_temp.marcar(disp, e8, '2099-03-02', array['14:05']);
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (e8, '2099-01-01', '2099-12-31', 1000, adm, 'vigente') returning id into v_ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_ac, d, '08:00', '14:00' from generate_series(1, 7) d;
  perform pg_temp.como(adm);
  perform huellero_rederivar(e8, '2099-03-01', '2099-03-31');
  perform pg_temp.dueno();
  select * into a from asistencias where empleado_id = e8 and fecha = '2099-03-02';
  if a.hora_entrada = '14:05' then
    r := r || '[ok] 8;';
  else
    r := r || format('[FALLA] 8: la hora humana cambió: ent=%s sal=%s;', a.hora_entrada, a.hora_salida);
  end if;

  -- ── 9) Un día dentro de un pago cerrado no se vuelve a leer ───────────────────────────────
  perform pg_temp.marcar(disp, e9, '2099-04-06', array['08:00']);
  insert into asistencias (empleado_id, fecha, turno, hora_entrada, hora_salida, condicion, fuente,
                           minutos_tardanza, huellero_puso_entrada, huellero_puso_salida)
    values (e9, '2099-04-06', 'M', '08:00', '14:00', 'trabajado', 'huellero', 0, true, true);
  select id into v_ac from sueldo_acuerdos where empleado_id = e9;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada,
      parametros_usados, resultado, total, valor_por_hora, motor_version, cerrada_en, cerrada_por)
    values (v_ac, e9, '2099-04-01', '2099-04-30', 'cerrada', '{}', '{}', '{"lineas":[]}', 1000, 1, 't', now(), adm);
  perform pg_temp.como(adm);
  v_n := huellero_rederivar(e9, '2099-04-01', '2099-04-30');
  perform pg_temp.dueno();
  select * into a from asistencias where empleado_id = e9 and fecha = '2099-04-06';
  if v_n = 0 and a.hora_salida = '14:00' and a.condicion = 'trabajado' then
    r := r || '[ok] 9;';
  else
    r := r || format('[FALLA] 9: n=%s sal=%s cond=%s;', v_n, a.hora_salida, a.condicion);
  end if;

  -- ── 10) Sólo el administrador; anon sin execute ───────────────────────────────────────────
  perform pg_temp.como(e1);
  begin
    perform huellero_rederivar(e1, '2099-03-01', '2099-03-31');
    v_err := 'pasó';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.dueno();
  if v_err like 'PERMISO:%'
     and not has_function_privilege('anon', 'huellero_rederivar(uuid, date, date)', 'execute') then
    r := r || '[ok] 10;';
  else
    r := r || format('[FALLA] 10: %s;', v_err);
  end if;

  raise exception 'RESULTADO 0163 --> %', r;
end $$;
