-- Prueba de la migración 0091_evaluacion_equipo_y_puntualidad.sql
--
-- Ataca las nueve promesas de la tabla de la spec
-- (docs/superpowers/specs/evaluaciones/2026-08-24-equipo-y-puntualidad-design.md §4), contra
-- `private.evaluacion_componentes_datos` — que es donde vive el cuerpo real desde la 0067; el
-- envoltorio `public.evaluacion_componentes` sólo agrega el portero de permisos y esta migración
-- no lo toca, así que no hace falta simular ningún usuario ni setear `request.jwt.claims` para
-- comprobar la LÓGICA que cambió.
--
--   C-1 (equipo):
--     · el encargado de un turno evaluado sigue sumando limpieza/software/operaciones,
--     · un trabajador (no encargado) del mismo turno ahora suma lo mismo,
--     · alguien que no trabajó ese turno no suma nada de él,
--     · los puntos extras de reporte_extras siguen siendo de quien los registró, no del equipo.
--   C-2 (puntualidad):
--     · un día puntual (dentro de la tolerancia) no suma minutos,
--     · un día con 20 minutos de tardanza real, sin justificar, cuenta esos minutos,
--     · el mismo día, justificado, deja de sumar,
--     · un día sin acuerdo vigente no rompe nada y no aporta minutos,
--     · un día partido en dos tramos se mide contra el tramo más temprano, no contra el segundo.
--
-- MONTAJE: siete empleados de prueba (ninguno real), un turno evaluado de 2099-08-17 y cuatro
-- escenarios de acuerdo/horario/asistencia de junio de 2099. La tolerancia
-- (`sueldo_tolerancia_minutos`) y el divisor de la nota (`eval_tardanza_min_por_punto`) se pinean
-- a valores conocidos (10 y 15, los mismos defaults que ya traen de fábrica) para que la prueba no
-- dependa de lo que el administrador haya tocado desde /configuracion.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0091
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0091")

do $$
declare
  v_sede        text;
  enc           uuid;
  trab          uuid;
  ajeno         uuid;
  punt_ok       uuid;
  punt_tarde    uuid;
  punt_partido  uuid;
  punt_sin_ac   uuid;
  v_reporte     text;
  v_fecha_rep   date := date '2099-08-17';
  v_dia         date := date '2099-06-01';
  v_dow         int;
  ac1 uuid; ac2 uuid; ac3 uuid;
  j             jsonb;
  r             text := '';
begin
  -- ── Config pineada: la prueba no puede depender de lo que haya hoy en /configuracion ────────
  update config set valor = '10' where clave = 'sueldo_tolerancia_minutos';
  update config set valor = '15' where clave = 'eval_tardanza_min_por_punto';

  -- ── Una sede real para colgar el reporte de prueba (la FK de `reportes` lo exige) ───────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  -- ── Siete empleados de prueba. Ninguno real, ninguno queda: la transacción se descarta ──────
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-ENC', 'Prueba 0091 Encargado',   'P1') returning id into enc;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-TRB', 'Prueba 0091 Trabajador',  'P2') returning id into trab;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-AJE', 'Prueba 0091 Ajeno',       'P3') returning id into ajeno;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-PTO', 'Prueba 0091 Puntual',     'P4') returning id into punt_ok;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-TAR', 'Prueba 0091 Tardanza',    'P5') returning id into punt_tarde;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-PAR', 'Prueba 0091 Dia Partido', 'P6') returning id into punt_partido;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0091-SIN', 'Prueba 0091 Sin Acuerdo', 'P7') returning id into punt_sin_ac;

  r := r || 'montaje-empleados=ok; ';

  -- ── C-1: un turno evaluado con encargado + trabajador, y un extra registrado por el trabajador ──
  v_reporte := to_char(v_fecha_rep, 'DD-MM-YY') || '_M-' || v_sede;
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, evaluado)
    values (v_reporte, v_sede, 'M', v_fecha_rep, enc, true);
  insert into reporte_trabajadores (reporte_id, empleado_id) values (v_reporte, trab);
  insert into reporte_actividades (reporte_id, cod, nombre, cat, calificacion) values
    (v_reporte, 'IND1', 'Limpieza de prueba',  'IND',  1.00),
    (v_reporte, 'AS1',  'Software de prueba',  'SOFT', 0.80),
    (v_reporte, 'AT1',  'Operacion de prueba', 'OPS',  0.50);
  -- El extra queda registrado por el TRABAJADOR, no por el encargado: es el caso de "extras".
  insert into reporte_extras (reporte_id, tipo, nombre, cantidad, peso_unitario, monto_total, registrado_por_id)
    values (v_reporte, 'libre', 'Extra de prueba', 2, 5, 30, trab);

  r := r || 'montaje-reporte=ok; ';

  -- ── C-2: un acuerdo con horario para cada escenario de puntualidad, todos el mismo día ──────
  -- Van en empleados DISTINTOS (no en fechas distintas) para no depender de en qué día de la
  -- semana cae 2099-06-01: cada acuerdo es dueño exclusivo de su franja horaria y no puede pisar
  -- la de otro (la exclusión `sueldo_turnos_sin_solape` es por acuerdo, no por fecha).
  v_dow := extract(isodow from v_dia)::int;

  -- Puntual: entrada 09:07 contra un turno de 09:00, con 10' de tolerancia → no cuenta.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (punt_ok, '2099-06-01', '2099-06-30', 1000) returning id into ac1;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac1, v_dow, '09:00', '20:00');
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida)
    values (punt_ok, v_dia, 'M', 'trabajado', '09:07', '20:00');

  -- Tardanza real: entrada 09:20 contra el mismo turno de 09:00 → 20 minutos por encima de lo
  -- pactado (no se le resta la tolerancia: la tolerancia decide si cuenta, no cuánto pesa).
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (punt_tarde, '2099-06-01', '2099-06-30', 1000) returning id into ac2;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac2, v_dow, '09:00', '20:00');
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida)
    values (punt_tarde, v_dia, 'M', 'trabajado', '09:20', '20:00');

  -- Día partido: dos turnos contratados (09:00-13:00 y 13:00-20:00, el horario real de LuceBien) y
  -- dos tramos de asistencia. El primer tramo entra puntual (09:05); el segundo entra tarde de
  -- verdad para su propio turno (14:15 contra 13:00) — pero la entrada más temprana del DÍA sigue
  -- siendo 09:05, así que el día entero no debería contar tardanza.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (punt_partido, '2099-06-01', '2099-06-30', 1000) returning id into ac3;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin) values
    (ac3, v_dow, '09:00', '13:00'),
    (ac3, v_dow, '13:00', '20:00');
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida) values
    (punt_partido, v_dia, 'M', 'trabajado', '09:05', '13:00'),
    (punt_partido, v_dia, 'T', 'trabajado', '14:15', '20:00');

  -- Sin acuerdo: asistencia trabajada, pero esta persona no tiene NINGÚN sueldo_acuerdo.
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida)
    values (punt_sin_ac, v_dia, 'M', 'trabajado', '09:00', '20:00');

  r := r || 'montaje-puntualidad=ok; ';

  -- ═══ C-1 — los puntos del turno son de todo el equipo ═══════════════════════════════════════

  -- Caso: "Encargado de un turno evaluado" → sigue sumando (no se rompe lo que ya andaba).
  begin
    j := private.evaluacion_componentes_datos(enc, v_fecha_rep, v_fecha_rep);
    if (j->>'limpieza')::numeric = 20 and (j->>'software')::numeric = 16 and (j->>'operaciones')::numeric = 10 then
      r := r || '[ok] encargado: sigue sumando limpieza/software/operaciones; ';
    else
      r := r || format('[FALLA] encargado: limpieza=%s software=%s operaciones=%s (esperaba 20/16/10); ',
                        j->>'limpieza', j->>'software', j->>'operaciones');
    end if;
    -- Caso: "Puntos extras de reporte_extras" (mitad 1) → el encargado NO ve el extra ajeno.
    if (j->>'extrasPuntos')::numeric = 0 then
      r := r || '[ok] extras: el encargado no arrastra el extra del trabajador; ';
    else
      r := r || format('[FALLA] extras: el encargado ve extrasPuntos=%s (esperaba 0, no es de el); ', j->>'extrasPuntos');
    end if;
  exception when others then
    r := r || format('[FALLA] encargado lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- Caso: "Trabajador (no encargado) del mismo turno" → ahora suma lo mismo que el encargado.
  begin
    j := private.evaluacion_componentes_datos(trab, v_fecha_rep, v_fecha_rep);
    if (j->>'limpieza')::numeric = 20 and (j->>'software')::numeric = 16 and (j->>'operaciones')::numeric = 10 then
      r := r || '[ok] trabajador: ahora suma lo mismo que el encargado; ';
    else
      r := r || format('[FALLA] trabajador: limpieza=%s software=%s operaciones=%s (esperaba 20/16/10); ',
                        j->>'limpieza', j->>'software', j->>'operaciones');
    end if;
    -- Caso: "Puntos extras de reporte_extras" (mitad 2) → sigue siendo del que los registro.
    if (j->>'extrasPuntos')::numeric = 10 then
      r := r || '[ok] extras: el trabajador que registro el extra si lo ve (10 puntos); ';
    else
      r := r || format('[FALLA] extras: extrasPuntos del trabajador=%s (esperaba 10); ', j->>'extrasPuntos');
    end if;
  exception when others then
    r := r || format('[FALLA] trabajador lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- Caso: "Persona que no trabajó ese turno" → no suma nada de ese reporte.
  begin
    j := private.evaluacion_componentes_datos(ajeno, v_fecha_rep, v_fecha_rep);
    if (j->>'limpieza')::numeric = 0 and (j->>'software')::numeric = 0 and (j->>'operaciones')::numeric = 0 then
      r := r || '[ok] ajeno: quien no trabajo el turno no suma nada de el; ';
    else
      r := r || format('[FALLA] ajeno: limpieza=%s software=%s operaciones=%s (esperaba 0/0/0); ',
                        j->>'limpieza', j->>'software', j->>'operaciones');
    end if;
  exception when others then
    r := r || format('[FALLA] ajeno lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- ═══ C-2 — la puntualidad se calcula del horario, no de una columna vacía ═══════════════════

  -- Caso: "Día puntual (entrada antes de tolerancia)" → 0 minutos → tardanza = 20.
  begin
    j := private.evaluacion_componentes_datos(punt_ok, v_dia, v_dia);
    if (j->>'tardanza')::numeric = 20 then
      r := r || '[ok] puntual: 0 minutos de tardanza, nota 20; ';
    else
      r := r || format('[FALLA] puntual: tardanza=%s (esperaba 20); ', j->>'tardanza');
    end if;
  exception when others then
    r := r || format('[FALLA] puntual lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- Caso: "Día con 20 minutos de tardanza real, sin justificar" → cuenta esos minutos.
  -- 20 minutos / 15 (eval_tardanza_min_por_punto) = 1 punto menos → 20 - 1 = 19.
  begin
    j := private.evaluacion_componentes_datos(punt_tarde, v_dia, v_dia);
    if (j->>'tardanza')::numeric = 19 then
      r := r || '[ok] tardanza real: cuenta los 20 minutos, nota baja a 19; ';
    else
      r := r || format('[FALLA] tardanza real: tardanza=%s (esperaba 19); ', j->>'tardanza');
    end if;
  exception when others then
    r := r || format('[FALLA] tardanza real lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- Caso: "Mismo día, con tardanza_justificada = true" → 0 minutos, no penaliza lo perdonado.
  update asistencias set tardanza_justificada = true
    where empleado_id = punt_tarde and fecha = v_dia and turno = 'M';
  begin
    j := private.evaluacion_componentes_datos(punt_tarde, v_dia, v_dia);
    if (j->>'tardanza')::numeric = 20 then
      r := r || '[ok] justificada: la tardanza perdonada no penaliza, nota vuelve a 20; ';
    else
      r := r || format('[FALLA] justificada: tardanza=%s (esperaba 20); ', j->>'tardanza');
    end if;
  exception when others then
    r := r || format('[FALLA] justificada lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- Caso: "Día sin acuerdo vigente ese mes" → 0 minutos, sin error.
  begin
    j := private.evaluacion_componentes_datos(punt_sin_ac, v_dia, v_dia);
    if (j->>'tardanza')::numeric = 20 then
      r := r || '[ok] sin acuerdo: 0 minutos y sin error; ';
    else
      r := r || format('[FALLA] sin acuerdo: tardanza=%s (esperaba 20); ', j->>'tardanza');
    end if;
  exception when others then
    r := r || format('[FALLA] sin acuerdo exploto en vez de devolver 0: %s; ', sqlerrm);
  end;

  -- Caso: "Día partido en dos tramos, el segundo con tardanza" → mide contra la entrada más
  -- temprana del día (09:05), no contra el segundo tramo (14:15), igual que el motor de sueldos.
  begin
    j := private.evaluacion_componentes_datos(punt_partido, v_dia, v_dia);
    if (j->>'tardanza')::numeric = 20 then
      r := r || '[ok] dia partido: mide contra el primer tramo, ignora el segundo; ';
    else
      r := r || format('[FALLA] dia partido: tardanza=%s (esperaba 20 -- no deberia mirar el segundo tramo); ', j->>'tardanza');
    end if;
  exception when others then
    r := r || format('[FALLA] dia partido lanzo un error inesperado: %s; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0091 --> %', r;
end $$;
