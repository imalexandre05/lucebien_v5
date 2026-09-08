-- Prueba de la migración 0107_notificaciones_reglas_control_interno.sql
--
-- Comprueba los casos 9 a 12 de la §7 de la spec
-- (docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md),
-- todos sobre `dia_con_hora_estimada`:
--   9.  Un aviso de la persona P lo ven el administrador y P. Otro colaborador NO.
--   10. P con 3 días con hora estimada en el mismo período → UN aviso que dice 3, no tres sueltos.
--   11. Se corrige uno de esos tres días (entrada_estimada/salida_estimada a false a mano) y se
--       vuelve a correr generar_alertas() → el MISMO aviso pasa a decir 2.
--   12. Se corrigen los tres → el aviso desaparece (lo borra C-1, ya probado en general por 0101).
--
-- Más UN caso positivo por cada una de las otras cinco reglas nuevas (declaracion_incompleta,
-- periodo_liquidable, dia_sin_marca, extra_sin_valor, falta_fecha_ingreso): que se crea el aviso
-- cuando la condición es cierta. El ciclo completo de refresco/retiro (C-1/C-2) ya lo prueba
-- 0101_alertas_se_retiran.prueba.sql de forma genérica sobre el mecanismo — no hace falta
-- repetirlo regla por regla (lo dice el propio encargo).
--
-- DATOS SINTÉTICOS, NUNCA REALES. Siete empleados con cod 'PRUEBA0107-*' (P, Q, DEC, PER, DSM, EXT,
-- FFI), cada uno dueño de UN escenario, para que ningún caso contamine a otro:
--   · P: sujeto de los casos 9-12 (dia_con_hora_estimada), SIN acuerdo/turnos (para no disparar
--     dia_sin_marca/declaracion_incompleta/periodo_liquidable de rebote) y CON fecha_ingreso (para
--     no disparar falta_fecha_ingreso).
--   · Q: "otro colaborador", ajeno a todo, sólo para el caso 9.
--   · DEC: acuerdo 'liquidado' (para no interferir con periodo_liquidable) con UNA liquidación
--     'borrador' de una semana de enero-2024 (bien lejos de "hoy", para no interferir con
--     dia_sin_marca) y CERO asistencia declarada → dispara declaracion_incompleta.
--   · PER: acuerdo 'vigente' vencido hace más de periodo_liquidable.umbral días → dispara
--     periodo_liquidable. Sin turnos, para no interferir con dia_sin_marca.
--   · DSM: acuerdo 'vigente' con fecha_fin en el futuro (para no interferir con periodo_liquidable)
--     y un turno el día de la semana de "ayer", sin ninguna asistencia → dispara dia_sin_marca.
--   · EXT: sólo un reporte_extras con cod y peso_unitario=0 (puntos_total generado en 0) → dispara
--     extra_sin_valor. Usa un `reportes.id` real ya existente sólo como FK obligatoria de
--     reporte_extras.reporte_id (no se lo modifica).
--   · FFI: activo, fecha_ingreso NULL → dispara falta_fecha_ingreso.
--
-- generar_alertas() es SECURITY DEFINER, revocada de `authenticated` — se llama DIRECTO, como
-- owner, exactamente igual que 0101_alertas_se_retiran.prueba.sql y
-- 0081_reportes_escritura_directa.prueba.sql (reportes_auto_cierre()). El montaje y las
-- aserciones de contenido (casos 10/11/12 y las otras cinco reglas) se hacen TODAS como owner
-- (visibilidad completa, sin RLS). Sólo el caso 9 cambia de rol —con
-- `set_config('role','authenticated',true)` + `request.jwt.claims`, igual que
-- 0100_notificaciones_aislamiento.prueba.sql— y vuelve con `reset role` antes de seguir escribiendo
-- en tablas de zona crítica (asistencias) para los casos 11/12.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila — ni los siete empleados de
-- prueba, ni ningún cambio real que generar_alertas() haya hecho sobre datos de producción al
-- evaluar las seis reglas contra la base completa (mismo criterio que ya usa 0101).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0107
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y leer
-- el mensaje de error P0001 que empieza con "RESULTADO 0107")

do $$
declare
  admin_id   uuid;
  v_sede     text;
  emp_p      uuid; emp_q uuid; emp_dec uuid; emp_per uuid; emp_dsm uuid; emp_ext uuid; emp_ffi uuid;
  ac_dec     uuid; liq_dec uuid;
  ac_per     uuid;
  ac_dsm     uuid;
  v_reporte  text;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_pl_umbral  int;
  v_dsm_umbral int;
  v_dow_ayer   int;
  dedup_admin   text;
  dedup_persona text;
  n          int;
  v_mensaje  text;
  v_id_admin uuid;
  v_id_persona uuid;
  r          text := '';
begin
  -- ── Montaje: actores reales sólo de lectura ───────────────────────────────────────────────────
  select id into admin_id from empleados where rol in ('admin', 'dueno') and activo order by id limit 1;
  if admin_id is null then raise exception 'La prueba necesita al menos un administrador activo'; end if;

  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  select id into v_reporte from reportes order by created_at desc limit 1;
  if v_reporte is null then raise exception 'La prueba necesita al menos un reporte existente (sólo lo lee, no lo toca)'; end if;

  -- ── Montaje: los siete empleados sintéticos ───────────────────────────────────────────────────
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-P', 'PRUEBA0107-P', 'P0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_p;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-Q', 'PRUEBA0107-Q', 'Q0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_q;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-DEC', 'PRUEBA0107-DEC', 'D0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_dec;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-PER', 'PRUEBA0107-PER', 'R0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_per;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-DSM', 'PRUEBA0107-DSM', 'M0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_dsm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-EXT', 'PRUEBA0107-EXT', 'E0', 'confeccionista', v_sede, true, date '2020-01-01')
    returning id into emp_ext;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo, fecha_ingreso)
    values ('PRUEBA0107-FFI', 'PRUEBA0107-FFI', 'F0', 'confeccionista', v_sede, true, null)
    returning id into emp_ffi;

  -- ── Montaje P: 3 días 'trabajado' con hora estimada, SIN acuerdo (evita ruido de otras reglas) ─
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, entrada_estimada, salida_estimada, fuente)
  values
    (emp_p, date '2024-03-05', 'M', 'trabajado', time '09:00', time '13:00', true,  false, 'huellero'),
    (emp_p, date '2024-03-12', 'M', 'trabajado', time '09:00', time '13:00', true,  false, 'huellero'),
    (emp_p, date '2024-03-19', 'M', 'trabajado', time '09:00', time '13:00', false, true,  'huellero');

  -- Sin liquidación 'borrador' para P: cae al fallback de mes calendario (2024-03-01 a 2024-03-31).
  dedup_admin   := 'dia_con_hora_estimada:' || emp_p::text || ':2024-03-01:admin';
  dedup_persona := 'dia_con_hora_estimada:' || emp_p::text || ':2024-03-01:persona';

  -- ── Montaje DEC: acuerdo 'liquidado' (no interfiere con periodo_liquidable), liquidación
  --    'borrador' de una semana de enero-2024 (lejos de "hoy": no interfiere con dia_sin_marca),
  --    turno el lunes, y CERO asistencia declarada → 1 día "falta declarar" (guarda 1 de 0093) ────
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado)
    values (emp_dec, date '2024-01-01', date '2024-01-31', 'mensual', 1000, 'liquidado')
    returning id into ac_dec;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac_dec, 1, time '09:00', time '13:00');  -- 2024-01-01 fue lunes
  insert into sueldo_liquidaciones (
    acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
  ) values (
    ac_dec, emp_dec, date '2024-01-01', date '2024-01-07', 'borrador',
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 'prueba-0107'
  ) returning id into liq_dec;

  -- ── Montaje PER: acuerdo 'vigente' vencido hace más de periodo_liquidable.umbral días.
  --    Sin turnos: no interfiere con dia_sin_marca ────────────────────────────────────────────────
  select coalesce(umbral, 3)::int into v_pl_umbral from alertas_reglas where tipo = 'periodo_liquidable';
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado)
    values (emp_per, v_hoy - (v_pl_umbral + 30), v_hoy - (v_pl_umbral + 5), 'mensual', 1000, 'vigente')
    returning id into ac_per;

  -- ── Montaje DSM: acuerdo 'vigente' con fecha_fin en el futuro (no interfiere con
  --    periodo_liquidable), turno el día de la semana de "ayer", CERO asistencia ────────────────
  select coalesce(umbral, 7)::int into v_dsm_umbral from alertas_reglas where tipo = 'dia_sin_marca';
  select extract(isodow from (v_hoy - 1))::int into v_dow_ayer;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado)
    values (emp_dsm, v_hoy - 90, v_hoy + 90, 'mensual', 1000, 'vigente')
    returning id into ac_dsm;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac_dsm, v_dow_ayer, time '09:00', time '13:00');

  -- ── Montaje EXT: un extra de catálogo (cod no nulo) con peso_unitario=0 → puntos_total=0 ────────
  insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, peso_unitario, monto_total, revisar, registrado_por_id)
    values (v_reporte, 'por_puntos', 'PRUEBA0107-EXT extra', 'PRUEBA0107-EXT', 2, 0, 0, false, emp_ext);

  -- FFI ya quedó montado arriba (fecha_ingreso null).

  r := r || 'montaje=ok; ';

  -- ── Primera corrida: dispara las seis reglas nuevas de una sola vez ──────────────────────────
  perform generar_alertas();

  -- ── declaracion_incompleta (DEC) ──────────────────────────────────────────────────────────────
  select count(*), min(mensaje) into n, v_mensaje
    from notificaciones where dedup_key = 'declaracion_incompleta:' || liq_dec::text;
  if n = 1 and v_mensaje like '%: 1 día(s) sin declarar%' then
    r := r || '[ok] declaracion_incompleta: se creo el aviso con 1 dia sin declarar; ';
  else
    r := r || format('[FALLA] declaracion_incompleta: n=%s mensaje=%s; ', n, v_mensaje);
  end if;

  -- ── periodo_liquidable (PER) ──────────────────────────────────────────────────────────────────
  select count(*) into n from notificaciones where dedup_key = 'periodo_liquidable:' || ac_per::text;
  if n = 1 then
    r := r || '[ok] periodo_liquidable: se creo el aviso del contrato vencido; ';
  else
    r := r || format('[FALLA] periodo_liquidable: n=%s (esperaba 1); ', n);
  end if;

  -- ── dia_sin_marca (DSM) — admin y persona ────────────────────────────────────────────────────
  select count(*) into n from notificaciones
    where dedup_key in ('dia_sin_marca:' || emp_dsm::text || ':admin', 'dia_sin_marca:' || emp_dsm::text || ':persona');
  if n = 2 then
    r := r || '[ok] dia_sin_marca: se crearon las dos filas (admin y persona); ';
  else
    r := r || format('[FALLA] dia_sin_marca: n=%s (esperaba 2); ', n);
  end if;

  -- ── extra_sin_valor (EXT) ─────────────────────────────────────────────────────────────────────
  select count(*) into n from notificaciones where dedup_key = 'extra_sin_valor:' || emp_ext::text;
  if n = 1 then
    r := r || '[ok] extra_sin_valor: se creo el aviso del extra sin valor; ';
  else
    r := r || format('[FALLA] extra_sin_valor: n=%s (esperaba 1); ', n);
  end if;

  -- ── falta_fecha_ingreso (FFI) ─────────────────────────────────────────────────────────────────
  select count(*) into n from notificaciones where dedup_key = 'falta_fecha_ingreso:' || emp_ffi::text;
  if n = 1 then
    r := r || '[ok] falta_fecha_ingreso: se creo el aviso de la persona sin fecha de ingreso; ';
  else
    r := r || format('[FALLA] falta_fecha_ingreso: n=%s (esperaba 1); ', n);
  end if;

  -- ── Caso 10: P con 3 días estimados en el mismo período → UN aviso que dice 3 ───────────────────
  select id, mensaje into v_id_admin, v_mensaje from notificaciones where dedup_key = dedup_admin;
  select id into v_id_persona from notificaciones where dedup_key = dedup_persona;
  if v_id_admin is not null and v_id_persona is not null and v_mensaje like '%: 3 día(s) del período%' then
    r := r || '[ok] caso10: un solo aviso por destinatario, diciendo 3 dias; ';
  else
    r := r || format('[FALLA] caso10: admin_id=%s persona_id=%s mensaje=%s; ', v_id_admin, v_id_persona, v_mensaje);
  end if;

  -- ── Caso 9: lo ven el administrador y P; Q (otro colaborador) NO ────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', emp_q, 'role', 'authenticated')::text, true);
  if private.app_es_admin() then
    raise exception 'caso9: emp_q resulto admin; la prueba no comprobaria nada';
  end if;
  select count(*) into n from notificaciones where dedup_key in (dedup_admin, dedup_persona);
  if n = 0 then
    r := r || '[ok] caso9a: Q (otro colaborador) no ve ninguna de las dos filas; ';
  else
    r := r || format('[FALLA] caso9a: Q ve %s fila(s) (esperaba 0); ', n);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', emp_p, 'role', 'authenticated')::text, true);
  if private.app_es_admin() then
    raise exception 'caso9: emp_p resulto admin; la prueba no comprobaria nada';
  end if;
  select count(*) into n from notificaciones where dedup_key = dedup_persona;
  if n = 1 then
    r := r || '[ok] caso9b: P ve el aviso dirigido a ella; ';
  else
    r := r || format('[FALLA] caso9b: P ve %s fila(s) del aviso propio (esperaba 1); ', n);
  end if;
  select count(*) into n from notificaciones where dedup_key = dedup_admin;
  if n = 0 then
    r := r || '[ok] caso9c: P NO ve el aviso dirigido por rol al administrador; ';
  else
    r := r || format('[FALLA] caso9c: P ve %s fila(s) del aviso admin-only (esperaba 0); ', n);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  select count(*) into n from notificaciones where dedup_key = dedup_admin;
  if n = 1 then
    r := r || '[ok] caso9d: el administrador ve el aviso dirigido por rol; ';
  else
    r := r || format('[FALLA] caso9d: el administrador ve %s fila(s) (esperaba 1); ', n);
  end if;

  execute 'reset role';

  -- ── Caso 11: se corrige uno de los tres días → el mismo aviso pasa a decir 2 ─────────────────────
  update asistencias
     set entrada_estimada = false, salida_estimada = false
   where empleado_id = emp_p and fecha = date '2024-03-19';

  perform generar_alertas();

  select id, mensaje into v_id_admin, v_mensaje from notificaciones where dedup_key = dedup_admin;
  if v_mensaje like '%: 2 día(s) del período%' then
    r := r || '[ok] caso11: al corregir un dia, el aviso paso a decir 2; ';
  else
    r := r || format('[FALLA] caso11: mensaje=%s (esperaba "2 dia(s)"); ', v_mensaje);
  end if;

  -- ── Caso 12: se corrigen los tres → el aviso desaparece ──────────────────────────────────────────
  update asistencias
     set entrada_estimada = false, salida_estimada = false
   where empleado_id = emp_p and fecha in (date '2024-03-05', date '2024-03-12');

  perform generar_alertas();

  select count(*) into n from notificaciones where dedup_key in (dedup_admin, dedup_persona);
  if n = 0 then
    r := r || '[ok] caso12: al corregir los tres dias, las dos filas del aviso desaparecieron; ';
  else
    r := r || format('[FALLA] caso12: quedan %s fila(s) (esperaba 0); ', n);
  end if;

  raise exception 'RESULTADO 0107 --> %', r;
end $$;
