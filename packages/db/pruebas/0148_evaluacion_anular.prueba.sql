-- Prueba de la migración 0148_evaluacion_anular.sql
--
-- RPC evaluacion_anular(p_id, p_motivo). Casos (cada uno reporta [ok] o [FALLA]):
--   1) un no administrador es negado (PERMISO) y la evaluación sigue;
--   2) administrador SIN motivo (vacío o sólo espacios) es negado (DATO) y la evaluación sigue;
--   3) administrador con motivo, evaluación sin pago: la borra;
--   4) tras anular se puede guardar de nuevo la misma (empleado, mes);
--   5) queda una fila en audit_log con el motivo (además de la del trigger 0058);
--   6) con un pago enlazado a la evaluación, se niega (BLOQUEO) y la evaluación sigue;
--   7) un id inexistente se niega (DATO);
--   8) una liquidación no anulada (borrador) cuyo periodo cruza el ciclo BLOQUEA;
--   9) una liquidación anulada del mismo periodo NO bloquea;
--  10) una liquidación no anulada de periodo fuera del ciclo NO bloquea;
--  11) una liquidación cerrada que cruza el ciclo BLOQUEA.
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado, no queda ni una fila.
-- OJO: hay que correr el archivo ENTERO (el set_config del jwt da identidad al usuario).
-- Cómo se corre: bash tools/probar-migracion.sh 0148

do $$
declare
  adm uuid; col uuid; emp uuid;
  ev1 uuid; ev2 uuid; ev3 uuid;
  ac uuid;
  ev8 uuid; ev9 uuid; ev10 uuid; ev11 uuid;
  v_res text := '';
  v_fallas int := 0;
  v_n int;
begin
  insert into sedes (cod, nombre) values ('AL', 'Sede prueba 0148') on conflict (cod) do nothing;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0148', '0148a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0148', '0148b', 'ventas_junior', true, 'AL', 'CP') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Evaluada Prueba 0148', '0148c', 'confeccionista', true, 'AL', 'EP') returning id into emp;

  insert into evaluaciones_mensuales (empleado_id, mes, nota_final, ciclo_desde, ciclo_hasta)
    values (emp, '2026-08', 14, '2026-08-10', '2026-09-09') returning id into ev1;
  insert into evaluaciones_mensuales (empleado_id, mes, nota_final, ciclo_desde, ciclo_hasta)
    values (emp, '2026-09', 15, '2026-09-10', '2026-10-09') returning id into ev2;
  insert into evaluaciones_mensuales (empleado_id, mes, nota_final, ciclo_desde, ciclo_hasta)
    values (emp, '2026-07', 16, '2026-07-10', '2026-08-09') returning id into ev3;
  insert into pagos (empleado_id, evaluacion_id, monto) values (emp, ev3, 100);

  set local role authenticated;

  -- 1) no administrador
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform evaluacion_anular(ev1, 'intento de un colaborador');
    v_res := v_res || E'\n  [FALLA] 1) un no administrador pudo anular'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'PERMISO%' then v_res := v_res || E'\n  [ok]    1) no administrador negado';
    else v_res := v_res || format(E'\n  [FALLA] 1) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;
  reset role;
  select count(*) into v_n from evaluaciones_mensuales where id = ev1;
  if v_n <> 1 then v_res := v_res || E'\n  [FALLA] 1b) la evaluación desapareció'; v_fallas := v_fallas + 1; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  -- 2) sin motivo
  begin
    perform evaluacion_anular(ev1, '   ');
    v_res := v_res || E'\n  [FALLA] 2) anuló sin motivo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'DATO%' then v_res := v_res || E'\n  [ok]    2) sin motivo negado';
    else v_res := v_res || format(E'\n  [FALLA] 2) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 3) administrador con motivo, sin pago
  begin
    perform evaluacion_anular(ev1, 'Se cargaron mal los exámenes');
    v_res := v_res || E'\n  [ok]    3) administrador con motivo anuló';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 3) no pudo anular: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;
  reset role;
  select count(*) into v_n from evaluaciones_mensuales where id = ev1;
  if v_n <> 0 then v_res := v_res || E'\n  [FALLA] 3b) la fila sigue'; v_fallas := v_fallas + 1; end if;

  -- 4) se puede guardar de nuevo la misma (empleado, mes)
  begin
    insert into evaluaciones_mensuales (empleado_id, mes, nota_final, ciclo_desde, ciclo_hasta)
      values (emp, '2026-08', 13, '2026-08-10', '2026-09-09');
    v_res := v_res || E'\n  [ok]    4) se vuelve a guardar el mismo mes';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 4) no se pudo volver a guardar: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;

  -- 5) rastro con el motivo
  select count(*) into v_n from audit_log
    where tabla = 'evaluaciones_mensuales' and fila_id = ev1::text
      and despues->>'motivo' = 'Se cargaron mal los exámenes';
  if v_n = 1 then v_res := v_res || E'\n  [ok]    5) audit_log guarda el motivo';
  else v_res := v_res || format(E'\n  [FALLA] 5) filas de audit_log con motivo: %s', v_n); v_fallas := v_fallas + 1; end if;

  -- 6) con pago enlazado
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    perform evaluacion_anular(ev3, 'intento con pago');
    v_res := v_res || E'\n  [FALLA] 6) anuló una evaluación con pago'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'BLOQUEO%' then v_res := v_res || E'\n  [ok]    6) con pago, negado';
    else v_res := v_res || format(E'\n  [FALLA] 6) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 7) id inexistente
  begin
    perform evaluacion_anular(gen_random_uuid(), 'no existe');
    v_res := v_res || E'\n  [FALLA] 7) aceptó un id inexistente'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'DATO%' then v_res := v_res || E'\n  [ok]    7) id inexistente negado';
    else v_res := v_res || format(E'\n  [FALLA] 7) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;
  reset role;
  select count(*) into v_n from evaluaciones_mensuales where id = ev3;
  if v_n <> 1 then v_res := v_res || E'\n  [FALLA] 6b) la evaluación con pago desapareció'; v_fallas := v_fallas + 1; end if;

  -- 8-11) liquidaciones de sueldo. Escenario: cada caso con su propia persona (un acuerdo por
  -- persona) y una evaluación de ciclo 2026-09-10..2026-10-09. Cruzan el ciclo las de septiembre;
  -- el caso 10 usa un acuerdo de agosto (fuera del ciclo).
  for i in 8..11 loop
    insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
      values ('Liquidada Prueba 0148 ' || i, '0148l' || i, 'confeccionista', true, 'AL', 'LP')
      returning id into emp;
    insert into evaluaciones_mensuales (empleado_id, mes, nota_final, ciclo_desde, ciclo_hasta)
      values (emp, '2026-09', 15, '2026-09-10', '2026-10-09') returning id into ev1;
    insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, estado)
      values (emp, case when i = 10 then '2026-08-01'::date else '2026-09-01'::date end,
                   case when i = 10 then '2026-08-31'::date else '2026-09-30'::date end, 1500, 'vigente')
      returning id into ac;
    insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
        entrada, parametros_usados, resultado, total, valor_por_hora, motor_version, anulada_motivo)
      select ac, emp, a.fecha_inicio, a.fecha_fin,
             case when i = 9 then 'anulada' else 'borrador' end,
             '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1500, 6, 'prueba-0148',
             case when i = 9 then 'prueba' end
        from sueldo_acuerdos a where a.id = ac;
    if i = 11 then
      update sueldo_liquidaciones set estado = 'cerrada', cerrada_en = now() where acuerdo_id = ac;
    end if;
    if i = 8 then ev8 := ev1; end if;
    if i = 9 then ev9 := ev1; end if;
    if i = 10 then ev10 := ev1; end if;
    if i = 11 then ev11 := ev1; end if;
  end loop;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  begin
    perform evaluacion_anular(ev8, 'con liquidación borrador');
    v_res := v_res || E'\n  [FALLA] 8) anuló con una liquidación borrador que cruza el ciclo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'BLOQUEO%' then v_res := v_res || E'\n  [ok]    8) liquidación borrador que cruza, negado';
    else v_res := v_res || format(E'\n  [FALLA] 8) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;
  begin
    perform evaluacion_anular(ev9, 'liquidación anulada');
    v_res := v_res || E'\n  [ok]    9) liquidación anulada no bloquea';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 9) la anulada bloqueó o falló: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;
  begin
    perform evaluacion_anular(ev10, 'liquidación de otro periodo');
    v_res := v_res || E'\n  [ok]   10) liquidación fuera del ciclo no bloquea';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 10) la de otro periodo bloqueó o falló: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;
  begin
    perform evaluacion_anular(ev11, 'con liquidación cerrada');
    v_res := v_res || E'\n  [FALLA] 11) anuló con una liquidación cerrada que cruza el ciclo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'BLOQUEO%' then v_res := v_res || E'\n  [ok]   11) liquidación cerrada que cruza, negado';
    else v_res := v_res || format(E'\n  [FALLA] 11) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;
  reset role;
  select count(*) into v_n from evaluaciones_mensuales where id in (ev8, ev11);
  if v_n <> 2 then v_res := v_res || E'\n  [FALLA] 8b) una evaluación bloqueada desapareció'; v_fallas := v_fallas + 1; end if;
  select count(*) into v_n from evaluaciones_mensuales where id in (ev9, ev10);
  if v_n <> 0 then v_res := v_res || E'\n  [FALLA] 9b) una evaluación no bloqueada sigue'; v_fallas := v_fallas + 1; end if;

  if v_fallas = 0 then
    raise exception 'RESULTADO 0148 --> OK, todos los casos pasan:%', v_res;
  else
    raise exception 'RESULTADO 0148 --> FALLA (% caso(s)):%', v_fallas, v_res;
  end if;
end $$;
