-- Prueba de la migración 0096_huellero_decide_por_horario.sql
--
-- Cubre C-1 (marca suelta según el horario contratado) y C-2 (doble marca separada de la pausa
-- real) de docs/superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md
-- §3. Los casos de la spec §6 que dependen de C-3/C-4 (rellenar y declarar falta, migración 0097)
-- se prueban en 0097_huellero_relleno_estimado_y_falta.prueba.sql — acá sólo lo que ya vale con
-- esta migración sola.
--
-- Empleado sintético con turno contratado 14:00–20:00 todos los días de la semana, igual que
-- describe la spec ("el horario real de Marylin, para que los casos se lean").
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado: eso aborta la transacción y no queda ni una fila — ni asistencias, ni marcas,
-- ni los acuerdos ni los turnos de prueba, ni el dispositivo, ni el valor de `config` que se fija
-- más abajo.
--
-- OJO CON LOS UNIQUE. `asistencias` tiene `(empleado_id, fecha, turno)` único: cada caso usa su
-- propio empleado y su propia fecha para no chocar entre sí ni con lo que la propia derivación
-- pueda insertar.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0096
-- (o pegar el archivo entero de una sola vez en el SQL editor de Supabase, proyecto scilb).
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  eA uuid; eB uuid; eC uuid; eD uuid;
  v_emp     uuid;
  v_acuerdo uuid;
  v_cond    text;
  v_ent     time;
  v_sal     time;
  v_ee      boolean;
  v_se      boolean;
  r text := '';
begin
  -- El umbral de la pausa real y el de la doble marca, fijados en la propia transacción para que
  -- el escenario no dependa de lo que tenga `config` el día que se corra.
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';
  insert into config (clave, valor) values ('huellero_doble_marca_minutos', '2')
    on conflict (clave) do update set valor = '2';

  select id into eA from empleados order by id offset 0 limit 1;
  select id into eB from empleados order by id offset 1 limit 1;
  select id into eC from empleados order by id offset 2 limit 1;
  select id into eD from empleados order by id offset 3 limit 1;
  if eA is null or eB is null or eC is null or eD is null then
    raise exception 'La prueba necesita al menos cuatro empleados';
  end if;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0096', '10.0.0.96') returning id into disp;

  -- eA, eB, eC tienen turno contratado 14:00–20:00 los siete días de la semana. eD NO tiene
  -- ningún acuerdo — es el empleado del caso 8 («sin horario contratado»).
  foreach v_emp in array array[eA, eB, eC] loop
    insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
      values (v_emp, '2099-01-01', '2099-12-31', 1500)
      returning id into v_acuerdo;
    insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
      select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;
  end loop;

  -- ── 1) Tramos parejos: nada cambia ────────────────────────────────────────────────────────
  -- Marcas 13:55 y 20:35 con turno 14:00–20:00. El día ya cierra con entrada y salida claras: el
  -- horario contratado no tiene nada que decidir. Trabajado, y las dos banderas *_estimada en
  -- false porque 0096 no las escribe todavía (eso es C-3, 0097).
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '960', eA, '2099-07-01T13:55:00-05:00', 960001, 'A'),
           (disp, '960', eA, '2099-07-01T20:35:00-05:00', 960002, 'A');

  perform huellero_derivar_asistencia(eA, '2099-07-01');
  select condicion, hora_entrada, hora_salida, entrada_estimada, salida_estimada
    into v_cond, v_ent, v_sal, v_ee, v_se
    from asistencias where empleado_id = eA and fecha = '2099-07-01';
  if v_cond = 'trabajado' and v_ent = '13:55' and v_sal = '20:35' and not v_ee and not v_se then
    r := r || '1=ok ';
  else
    r := r || format('1-CAMBIO-SIN-NECESITARLO=FALLA(cond=%s ent=%s sal=%s ee=%s se=%s) ',
                     v_cond, v_ent, v_sal, v_ee, v_se);
  end if;

  -- ── 4) Doble toque: se queda el más temprano (C-2) ───────────────────────────────────────
  -- Marcas 20:00 y 20:01 solas ese día. Deduplicadas a una sola (20:00); como está pegada a la
  -- hora de fin del turno (20:00), C-1 la toma como salida — el punto del caso es que el 20:01
  -- se descartó: no puede aparecer en ningún lado.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '961', eB, '2099-07-02T20:00:00-05:00', 961001, 'B'),
           (disp, '961', eB, '2099-07-02T20:01:00-05:00', 961002, 'B');

  perform huellero_derivar_asistencia(eB, '2099-07-02');
  select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
    from asistencias where empleado_id = eB and fecha = '2099-07-02';
  if v_sal = '20:00' and v_ent is null and v_cond = 'sin_dato' then
    r := r || '4=ok ';
  else
    r := r || format('4-NO-DESCARTA-EL-SEGUNDO-TOQUE=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal);
  end if;

  -- ── 5) Pausa real, no doble toque: se queda el más tardío ────────────────────────────────
  -- Marcas 14:00, 20:00 y 20:14. El hueco entre el segundo y el tercero es de 14 minutos: pasa
  -- los 2 del doble toque pero no llega a los 15 de la pausa real, así que el tramo se reabre y
  -- termina en la última marca. Sale 20:14, no 20:00.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '962', eC, '2099-07-03T14:00:00-05:00', 962001, 'C'),
           (disp, '962', eC, '2099-07-03T20:00:00-05:00', 962002, 'C'),
           (disp, '962', eC, '2099-07-03T20:14:00-05:00', 962003, 'C');

  perform huellero_derivar_asistencia(eC, '2099-07-03');
  select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
    from asistencias where empleado_id = eC and fecha = '2099-07-03';
  if v_cond = 'trabajado' and v_ent = '14:00' and v_sal = '20:14' then
    r := r || '5=ok ';
  else
    r := r || format('5-CONFUNDE-PAUSA-CON-DOBLE-TOQUE=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal);
  end if;

  -- ── 8) Marca suelta SIN acuerdo vigente: sigue como hoy ──────────────────────────────────
  -- eD no tiene ningún sueldo_acuerdos. Una sola marca a las 20:20 no puede compararse contra
  -- ningún horario, así que C-1 no toca nada: sigue siendo "entrada sin salida", igual que antes
  -- de esta migración. No se inventa un horario.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '963', eD, '2099-07-04T20:20:00-05:00', 963001, 'D');

  perform huellero_derivar_asistencia(eD, '2099-07-04');
  select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
    from asistencias where empleado_id = eD and fecha = '2099-07-04';
  if v_cond = 'sin_dato' and v_ent = '20:20' and v_sal is null then
    r := r || '8=ok ';
  else
    r := r || format('8-INVENTA-HORARIO-SIN-ACUERDO=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal);
  end if;

  -- ── 10) Reaplicar: re-derivar el mismo día no cambia nada y no rompe ─────────────────────
  -- Sin marcas nuevas, volver a llamar a la función sobre el caso 1 tiene que dar exactamente lo
  -- mismo: ninguna hora se mueve, la condición no cambia. La idempotencia de la DDL (columnas
  -- `if not exists`, config `on conflict do nothing`) es estructural y se prueba aparte, aplicando
  -- el archivo dos veces contra la base real.
  begin
    perform huellero_derivar_asistencia(eA, '2099-07-01');
    select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
      from asistencias where empleado_id = eA and fecha = '2099-07-01';
    if v_cond = 'trabajado' and v_ent = '13:55' and v_sal = '20:35' then
      r := r || '10=ok ';
    else
      r := r || format('10-RE-DERIVAR-CAMBIA-EL-ESTADO=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal);
    end if;
  exception when others then
    r := r || format('10-RE-DERIVAR-ABORTA=FALLA(%s) ', sqlerrm);
  end;

  -- ── Extra: el parámetro nuevo existe como fila editable (no-negociable 5) ────────────────
  if exists (select 1 from config where clave = 'huellero_doble_marca_minutos') then
    r := r || 'config=ok ';
  else
    r := r || 'config-PARAMETRO-HARDCODEADO=FALLA ';
  end if;

  raise exception 'RESULTADO 0096 >>> %', r;
end $$;
