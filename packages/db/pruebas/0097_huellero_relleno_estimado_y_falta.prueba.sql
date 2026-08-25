-- Prueba de la migración 0097_huellero_relleno_estimado_y_falta.sql
--
-- Cubre C-3 (relleno estimado con el horario contratado) y C-4 (falta automática con freno) de
-- docs/superpowers/specs/asistencias/2026-08-25-huellero-decide-por-horario-design.md §3. Corre
-- CONTRA una base con la 0096 ya aplicada (C-1 horario + C-2 doble marca + las columnas
-- *_estimada), así que los casos de abajo comprueban el comportamiento FINAL de las dos
-- migraciones juntas — es la forma correcta de leerlos contra la tabla de la spec §6.
--
-- Empleados sintéticos con turno contratado 14:00–20:00, cada uno con su acuerdo acotado a SU
-- propia fecha de prueba (no a todo el año): el freno de C-4 cuenta personas por fecha, y un
-- acuerdo de rango ancho compartido entre casos distintos habría hecho que un caso contaminara el
-- conteo del otro. Se aprendió escribiendo esta prueba, no hace falta repetir el error para verlo.
--
-- OJO: `huellero_declarar_faltas_del_dia` exige `private.app_es_admin()` — es `security definer`
-- pero el guard interno depende de `auth.uid()`, que sale de `request.jwt.claims`. Sin
-- impersonar a un administrador con `set_config(...)` (mismo patrón que ya usa
-- 0073_sueldos_rpc.prueba.sql), la función devuelve PERMISO y esos casos no comprobarían nada.
-- `huellero_derivar_asistencia` no lo necesita: sigue totalmente revocada y se llama con el rol
-- dueño de la conexión, igual que en 0079/0084.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado: eso aborta la transacción y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0097
-- (o pegar el archivo entero de una sola vez en el SQL editor de Supabase, proyecto scilb, DESPUÉS
-- de haber aplicado la 0096).
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  adm  uuid;
  eA uuid; eB uuid; eC uuid; eD uuid; eE uuid; eF uuid; eG uuid; eH uuid; eI uuid;
  v_emp     uuid;
  v_acuerdo uuid;
  v_cond    text;
  v_ent     time;
  v_sal     time;
  v_ee      boolean;   -- entrada_estimada
  v_se      boolean;   -- salida_estimada
  v_hpe     boolean;   -- huellero_puso_entrada
  v_hps     boolean;   -- huellero_puso_salida
  v_ffj     boolean;   -- falta_justificada
  v_obs     text;
  v_res     jsonb;
  v_n       int;
  r text := '';
begin
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';
  insert into config (clave, valor) values ('huellero_doble_marca_minutos', '2')
    on conflict (clave) do update set valor = '2';
  insert into config (clave, valor) values ('huellero_falta_auto_max_personas', '2')
    on conflict (clave) do update set valor = '2';

  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  select id into eA from empleados where id <> adm order by id offset 0 limit 1;
  select id into eB from empleados where id <> adm order by id offset 1 limit 1;
  select id into eC from empleados where id <> adm order by id offset 2 limit 1;
  select id into eD from empleados where id <> adm order by id offset 3 limit 1;
  select id into eE from empleados where id <> adm order by id offset 4 limit 1;
  select id into eF from empleados where id <> adm order by id offset 5 limit 1;
  select id into eG from empleados where id <> adm order by id offset 6 limit 1;
  select id into eH from empleados where id <> adm order by id offset 7 limit 1;
  select id into eI from empleados where id <> adm order by id offset 8 limit 1;
  if eA is null or eB is null or eC is null or eD is null or eE is null
     or eF is null or eG is null or eH is null or eI is null then
    raise exception 'La prueba necesita al menos diez empleados (uno admin + nueve más)';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaría nada';
  end if;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0097', '10.0.0.97') returning id into disp;

  -- Cada empleado, su propio acuerdo, acotado a su propia fecha de prueba.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (eA, '2099-08-01', '2099-08-01', 1500) returning id into v_acuerdo;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;

  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (eB, '2099-08-02', '2099-08-02', 1500) returning id into v_acuerdo;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;

  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (eC, '2099-08-03', '2099-08-03', 1500) returning id into v_acuerdo;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;

  -- Cinco empleados, los cinco con acuerdo para LA MISMA fecha: es el caso 7 (freno).
  foreach v_emp in array array[eD, eE, eF, eG, eH] loop
    insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
      values (v_emp, '2099-08-04', '2099-08-04', 1500) returning id into v_acuerdo;
    insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
      select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;
  end loop;

  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (eI, '2099-08-05', '2099-08-05', 1500) returning id into v_acuerdo;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select v_acuerdo, dia, '14:00', '20:00' from generate_series(1, 7) as dia;

  -- ── 2) Una sola marca, cerca de la SALIDA: se rellena la entrada, marcada como estimada ────
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '970', eA, '2099-08-01T20:20:00-05:00', 970001, 'A');
  perform huellero_derivar_asistencia(eA, '2099-08-01');
  select condicion, hora_entrada, hora_salida, entrada_estimada, salida_estimada
    into v_cond, v_ent, v_sal, v_ee, v_se
    from asistencias where empleado_id = eA and fecha = '2099-08-01';
  if v_cond = 'trabajado' and v_ent = '14:00' and v_sal = '20:20' and v_ee and not v_se then
    r := r || '2=ok ';
  else
    r := r || format('2-NO-RELLENA-ENTRADA=FALLA(cond=%s ent=%s sal=%s ee=%s se=%s) ',
                     v_cond, v_ent, v_sal, v_ee, v_se);
  end if;

  -- ── 3) Una sola marca, cerca de la ENTRADA: se rellena la salida, banderas al revés ────────
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '971', eB, '2099-08-02T14:05:00-05:00', 971001, 'B');
  perform huellero_derivar_asistencia(eB, '2099-08-02');
  select condicion, hora_entrada, hora_salida, entrada_estimada, salida_estimada
    into v_cond, v_ent, v_sal, v_ee, v_se
    from asistencias where empleado_id = eB and fecha = '2099-08-02';
  if v_cond = 'trabajado' and v_ent = '14:05' and v_sal = '20:00' and not v_ee and v_se then
    r := r || '3=ok ';
  else
    r := r || format('3-NO-RELLENA-SALIDA=FALLA(cond=%s ent=%s sal=%s ee=%s se=%s) ',
                     v_cond, v_ent, v_sal, v_ee, v_se);
  end if;

  -- ── 6) Cero marcas, UNA sola persona ese día: pasa a falta ──────────────────────────────
  v_res := huellero_declarar_faltas_del_dia('2099-08-03');
  select condicion, falta_justificada, obs into v_cond, v_ffj, v_obs
    from asistencias where empleado_id = eC and fecha = '2099-08-03';
  if (v_res->>'personas')::int = 1 and (v_res->>'faltas_declaradas')::int = 1
     and (v_res->>'frenado')::boolean = false
     and v_cond = 'falta' and v_ffj = false and v_obs like '%sin ninguna marca%'
  then
    r := r || '6=ok ';
  else
    r := r || format('6-NO-DECLARA-LA-FALTA=FALLA(res=%s cond=%s ffj=%s obs=%s) ', v_res, v_cond, v_ffj, v_obs);
  end if;

  -- ── 7) Cero marcas, CINCO personas el mismo día: se frena, ninguna falta ────────────────
  v_res := huellero_declarar_faltas_del_dia('2099-08-04');
  select count(*) into v_n
    from asistencias
    where empleado_id = any(array[eD, eE, eF, eG, eH]) and fecha = '2099-08-04' and condicion = 'falta';
  if (v_res->>'personas')::int = 5 and (v_res->>'faltas_declaradas')::int = 0
     and (v_res->>'frenado')::boolean = true and v_n = 0
  then
    select count(*) into v_n
      from asistencias
      where empleado_id = any(array[eD, eE, eF, eG, eH]) and fecha = '2099-08-04'
        and condicion = 'sin_dato' and obs like '%revisar: varias personas sin marcas%';
    if v_n = 5 then r := r || '7=ok ';
    else r := r || format('7-NO-DEJA-EL-MOTIVO-EN-SIN-DATO=FALLA(n=%s) ', v_n); end if;
  else
    r := r || format('7-NO-SE-FRENA=FALLA(res=%s faltas_reales=%s) ', v_res, v_n);
  end if;

  -- ── 9) Día con las dos horas escritas por una persona: el huellero no las toca ───────────
  -- Ni las horas ni las banderas *_estimada, aunque llegue una marca que —de no estar la 0084
  -- vigente— C-1/C-3 habrían usado para reasignar y estimar sobre esta misma fila.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida, entrada_estimada, salida_estimada)
    values (eI, '2099-08-05', 'M', '14:00', '18:45', 'manual', 'trabajado', false, false, false, false);
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '979', eI, '2099-08-05T19:50:00-05:00', 979001, 'I');
  perform huellero_derivar_asistencia(eI, '2099-08-05');
  select hora_entrada, hora_salida, entrada_estimada, salida_estimada,
         huellero_puso_entrada, huellero_puso_salida, condicion
    into v_ent, v_sal, v_ee, v_se, v_hpe, v_hps, v_cond
    from asistencias where empleado_id = eI and fecha = '2099-08-05';
  if v_ent = '14:00' and v_sal = '18:45' and not v_ee and not v_se
     and not v_hpe and not v_hps and v_cond = 'trabajado'
  then
    r := r || '9=ok ';
  else
    r := r || format('9-EL-HUELLERO-PISA-LA-HORA-HUMANA=FALLA(ent=%s sal=%s ee=%s se=%s hpe=%s hps=%s cond=%s) ',
                     v_ent, v_sal, v_ee, v_se, v_hpe, v_hps, v_cond);
  end if;

  -- ── 10) Reaplicar: re-derivar y re-declarar no cambian el estado ni rompen ──────────────
  begin
    perform huellero_derivar_asistencia(eA, '2099-08-01');
    select condicion, hora_entrada, hora_salida, entrada_estimada, salida_estimada
      into v_cond, v_ent, v_sal, v_ee, v_se
      from asistencias where empleado_id = eA and fecha = '2099-08-01';
    if v_cond <> 'trabajado' or v_ent <> '14:00' or v_sal <> '20:20' or not v_ee or v_se then
      r := r || format('10a-RE-DERIVAR-CAMBIA-EL-ESTADO=FALLA(cond=%s ent=%s sal=%s ee=%s se=%s) ',
                       v_cond, v_ent, v_sal, v_ee, v_se);
    else
      -- Segunda vuelta sobre la fecha del freno: eC ya está en 'falta' y deja de ser
      -- "pendiente", así que ahora tiene que dar CERO personas — ninguna vuelta a tocarla ni a
      -- contarla de nuevo.
      v_res := huellero_declarar_faltas_del_dia('2099-08-03');
      if (v_res->>'personas')::int = 0 then
        r := r || '10=ok ';
      else
        r := r || format('10b-RE-DECLARAR-VUELVE-A-CONTAR=FALLA(res=%s) ', v_res);
      end if;
    end if;
  exception when others then
    r := r || format('10-ABORTA=FALLA(%s) ', sqlerrm);
  end;

  -- ── Extra: el parámetro nuevo existe como fila editable (no-negociable 5) ───────────────
  if exists (select 1 from config where clave = 'huellero_falta_auto_max_personas') then
    r := r || 'config=ok ';
  else
    r := r || 'config-PARAMETRO-HARDCODEADO=FALLA ';
  end if;

  raise exception 'RESULTADO 0097 >>> %', r;
end $$;
