-- Prueba de la migración 0072_sueldos_esquema.sql
--
-- No comprueba que las tablas existan: comprueba que HAGAN LO QUE PROMETEN. Monta un caso
-- completo —contrato, horario, adelanto, liquidación, cierre— y después intenta romperlo de
-- catorce maneras distintas.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una
-- excepción con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final
-- ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0072
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  e1 uuid; e2 uuid; ac uuid; liq uuid; mov uuid; liq2 uuid;
  r text := '';
begin
  select id into e1 from empleados order by id limit 1;
  select id into e2 from empleados order by id offset 1 limit 1;

  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por)
    values (e1, '2099-01-01', '2099-01-31', 1000, e1) returning id into ac;
  r := r || 'acuerdo=ok ';

  -- 1) Dos acuerdos que se pisan son dos sueldos pactados para el mismo día.
  begin
    insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
      values (e1, '2099-01-15', '2099-02-15', 900);
    r := r || '1-SOLAPE-ACUERDO=FALLA ';
  exception when others then r := r || '1=ok '; end;

  -- 2) Una clave en snake_case se guarda bien y después TODA liquidación de esa persona corta.
  begin
    insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, parametros)
      values (e1, '2099-03-01', '2099-03-31', 900, '{"tolerancia_minutos":15}'::jsonb);
    r := r || '2-PARAM-SNAKE=FALLA ';
  exception when others then r := r || '2=ok '; end;

  -- 3) Turnos contiguos entran (es el horario real de la empresa); solapados, no.
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac,1,'09:00','13:00'), (ac,1,'13:00','20:00');
  begin
    insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
      values (ac,1,'12:00','14:00');
    r := r || '3-SOLAPE-TURNO=FALLA ';
  exception when others then r := r || '3=ok '; end;

  -- 4) capacitacion y almuerzo_entregado son CONTEOS: no llevan monto.
  begin
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo)
      values (e1,'2099-01-05','capacitacion', 25, 'x');
    r := r || '4-CAPAC-CON-MONTO=FALLA ';
  exception when others then r := r || '4=ok '; end;

  insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo)
    values (e1,'2099-01-05','adelanto', 100, 'adelanto de prueba') returning id into mov;

  -- 5) El aislamiento 1: empleado_id decide la RLS y tiene que ser el del acuerdo.
  begin
    insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
      values (ac, e2, '2099-01-01','2099-01-31','{}','{}','{}', 700, 3.6, 'prueba');
    r := r || '5-EMP-CRUZADO=FALLA ';
  exception when others then r := r || '5=ok '; end;

  -- 6) El periodo fuera del acuerdo cambia horasContratadas, que es el divisor de todo el mes.
  begin
    insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
      values (ac, e1, '2099-01-01','2099-02-28','{}','{}','{}', 700, 3.6, 'prueba');
    r := r || '6-PERIODO-FUERA=FALLA ';
  exception when others then r := r || '6=ok '; end;

  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, e1, '2099-01-01','2099-01-31','{}','{}','{}', 700, 3.6, 'prueba') returning id into liq;

  insert into sueldo_liquidacion_lineas(liquidacion_id, orden, grupo, concepto, monto)
    values (liq, 1, 'ingreso', 'Sueldo', 700);
  update sueldo_movimientos set liquidacion_id = liq where id = mov;   -- sellar en borrador: sí
  update sueldo_liquidaciones set estado='cerrada', cerrada_en=now(), cerrada_por=e1 where id=liq;
  r := r || 'cierre=ok ';

  -- 7 a 12) Los seis caminos por los que un pago emitido cambiaba de valor.
  begin
    update sueldo_liquidaciones set total = 9999 where id = liq;
    r := r || '7-EDITAR-CERRADA=FALLA ';
  exception when others then r := r || '7=ok '; end;

  begin
    insert into sueldo_liquidacion_lineas(liquidacion_id, orden, grupo, concepto, monto)
      values (liq, 2, 'ingreso', 'Inventado', 5000);
    r := r || '8-LINEA-EN-CERRADA=FALLA ';
  exception when others then r := r || '8=ok '; end;

  begin
    update sueldo_liquidacion_lineas set monto = 5000 where liquidacion_id = liq;
    r := r || '9-EDITAR-LINEA=FALLA ';
  exception when others then r := r || '9=ok '; end;

  begin
    update sueldo_movimientos set monto = 1 where id = mov;
    r := r || '10-EDITAR-SELLADO=FALLA ';
  exception when others then r := r || '10=ok '; end;

  -- El peor de todos: sellar contra una cerrada deja la fila fuera de ese mes Y del siguiente.
  begin
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, liquidacion_id)
      values (e1,'2099-01-20','adelanto', 50, 'colado', liq);
    r := r || '11-SELLAR-CONTRA-CERRADA=FALLA ';
  exception when others then r := r || '11=ok '; end;

  begin
    delete from sueldo_liquidaciones where id = liq;
    r := r || '12-BORRAR-CERRADA=FALLA ';
  exception when others then r := r || '12=ok '; end;

  -- 13 a 16) La anulación, y que 'anulada' también sea terminal.
  begin
    update sueldo_liquidaciones set estado='anulada' where id = liq;
    r := r || '13-ANULAR-SIN-MOTIVO=FALLA ';
  exception when others then r := r || '13=ok '; end;

  update sueldo_liquidaciones set estado='anulada', anulada_en=now(), anulada_por=e1,
    anulada_motivo='error de carga' where id = liq;
  r := r || '14=ok ';

  begin
    update sueldo_liquidaciones set estado='cerrada', total=9999 where id = liq;
    r := r || '15-REVIVIR-ANULADA=FALLA ';
  exception when others then r := r || '15=ok '; end;

  begin
    delete from sueldo_liquidaciones where id = liq;
    r := r || '16-BORRAR-ANULADA=FALLA ';
  exception when others then r := r || '16=ok '; end;

  -- 17 y 18) Soltar el sello es lo único permitido, y la reemisión tiene que ser posible.
  update sueldo_movimientos set liquidacion_id = null where id = mov;
  r := r || '17=ok ';

  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, e1, '2099-01-01','2099-01-31','{}','{}','{}', 705, 3.6, 'prueba') returning id into liq2;
  r := r || '18=ok ';

  raise exception 'RESULTADO 0072 >>> %', r;
end $$;
