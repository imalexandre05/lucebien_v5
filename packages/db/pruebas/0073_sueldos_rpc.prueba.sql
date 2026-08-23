-- Prueba de la migración 0073_sueldos_rpc.sql
--
-- Comprueba las tres RPC contra un caso real, incluida la carrera entre el cálculo y el cierre.
-- Se descarta sola: termina lanzando una excepción con el resultado, y eso aborta la transacción.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0073
--
-- OJO: las RPC son `security invoker` y exigen `private.app_es_admin()`. Por eso la prueba se
-- hace pasar por un administrador con `set_config('request.jwt.claims', ...)`, que es de donde
-- `auth.uid()` saca el uuid. Sin eso, todo devuelve PERMISO y la prueba no comprueba nada.

do $$
declare
  adm uuid; ac uuid; liq uuid; mov uuid; e jsonb; r text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- Contrato de una semana: lunes 09:00-13:00 + 13:00-20:00 = 11 h.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (adm,'2099-01-05','2099-01-11', 500, adm, 'vigente') returning id into ac;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac,1,'09:00','13:00'), (ac,1,'13:00','20:00');

  -- A) Sin asistencia declarada tiene que cortar NOMBRANDO la fecha. Un día sin cargar no es
  --    una falta: confundirlos cuesta dos días de sueldo por día.
  begin
    e := sueldo_entrada(ac); r := r || 'A-SIN-ASISTENCIA=FALLA ';
  exception when others then r := r || 'A=ok '; end;

  -- B) 'sin_dato' no alcanza: significa que nadie cargó nada.
  insert into asistencias(empleado_id, fecha, turno, condicion) values (adm,'2099-01-05',1,'sin_dato');
  begin
    e := sueldo_entrada(ac); r := r || 'B-SIN-DATO=FALLA ';
  exception when others then r := r || 'B=ok '; end;

  -- C) Declarada. Los dos turnos del lunes se colapsan a un par por día, y el martes —que no
  --    tiene turno contratado— sale por horasFueraDeContrato, que el motor cobra distinto.
  update asistencias set condicion='trabajado', hora_entrada='09:05', hora_salida='13:00'
    where empleado_id=adm and fecha='2099-01-05';
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida)
    values (adm,'2099-01-05',2,'trabajado','13:00','20:00'),
           (adm,'2099-01-06',1,'trabajado','09:00','12:00');

  insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
    values (adm,'2099-01-07','adelanto',100,'adelanto de prueba', adm) returning id into mov;
  insert into sueldo_movimientos(empleado_id, fecha, tipo, cantidad, motivo, creado_por)
    values (adm,'2099-01-08','almuerzo_entregado',3,'entregados en tienda', adm);
  insert into sueldo_ventas(empleado_id, fecha, monto, tipo, sede_cod)
    values (adm,'2099-01-05', 300,'venta','LB');

  e := sueldo_entrada(ac);
  r := r || 'C: dias=' || jsonb_array_length(e->'asistencia')
         || ' fuera=' || jsonb_array_length(e->'horasFueraDeContrato')
         || ' ent='   || coalesce(e->'asistencia'->0->>'horaIngreso','NULL')
         || ' sal='   || coalesce(e->'asistencia'->0->>'horaSalida','NULL')
         || ' alm='   || (e->>'almuerzosEntregados')
         || ' tol='   || (e->'parametros'->>'toleranciaMinutos')
         || ' mph='   || (e->'parametros'->>'metaPorHora') || ' ';
  -- Esperado: dias=1 fuera=1 ent=09:05 sal=20:00 alm=3 tol=10 mph=45.45454545454545
  -- El almuerzo llega como CONTEO (3), no como monto. metaPorHora conserva sus 16 dígitos:
  -- redondeado a 45.4545 la meta del periodo da 7.499,99 y el bono de S/30 no se paga.

  -- D) El override del contrato pisa al global.
  update sueldo_acuerdos set parametros='{"toleranciaMinutos":25}'::jsonb where id=ac;
  e := sueldo_entrada(ac);
  r := r || 'D-tol=' || (e->'parametros'->>'toleranciaMinutos') || ' ';   -- esperado 25

  -- E) Cerrar.
  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, adm, '2099-01-05','2099-01-11', e, e->'parametros',
      jsonb_build_object('lineas', jsonb_build_array(
        jsonb_build_object('grupo','ingreso','concepto','Sueldo','detalle','11 h','regla','RN-06','monto',500),
        jsonb_build_object('grupo','descuento','concepto','Adelanto','detalle','','regla','RN-18','monto',-100),
        jsonb_build_object('grupo','final','concepto','Total','detalle','','regla','','monto',400))),
      400, 45.454545, 'prueba') returning id into liq;
  r := r || 'E=' || (sueldo_liquidacion_cerrar(liq))::text || ' ';

  -- F a H) Lo que ya no se puede.
  begin
    update sueldo_movimientos set monto=1 where id=mov; r := r || 'F-SELLADO=FALLA ';
  exception when others then r := r || 'F=ok '; end;
  begin
    perform sueldo_liquidacion_cerrar(liq); r := r || 'G-DOBLE-CIERRE=FALLA ';
  exception when others then r := r || 'G=ok '; end;
  begin
    perform sueldo_liquidacion_anular(liq, '   '); r := r || 'H-SIN-MOTIVO=FALLA ';
  exception when others then r := r || 'H=ok '; end;

  -- I y J) Anular suelta los sellos, y la reemisión vuelve a ver el adelanto. Si el sello
  --        quedara pegado, la persona cobraría de más exactamente ese monto.
  r := r || 'I=' || (sueldo_liquidacion_anular(liq, 'error de carga'))::text || ' ';
  e := sueldo_entrada(ac);
  r := r || 'J-adel=' || jsonb_array_length(e->'adelantos') || ' ';   -- esperado 1

  insert into sueldo_liquidaciones(acuerdo_id, empleado_id, periodo_desde, periodo_hasta,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version)
    values (ac, adm, '2099-01-05','2099-01-11', e, e->'parametros',
      jsonb_build_object('lineas', jsonb_build_array(
        jsonb_build_object('grupo','final','concepto','Total','monto',405))),
      405, 45.454545, 'prueba') returning id into liq;

  -- K) La carrera. Un adelanto cargado DESPUÉS de calcular tiene que impedir el cierre: si no,
  --    queda sellado sin estar en el pago.
  insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
    values (adm,'2099-01-09','adelanto',40,'colado tarde', adm);
  begin
    perform sueldo_liquidacion_cerrar(liq); r := r || 'K-CARRERA=FALLA ';
  exception when others then r := r || 'K=ok '; end;

  -- L) La misma carrera con un CONTEO, que es la variante que se me escapó la primera vez: el
  --    cierre sella los cinco tipos pero la comprobación contaba tres.
  delete from sueldo_movimientos where motivo='colado tarde' and empleado_id=adm;
  insert into sueldo_movimientos(empleado_id, fecha, tipo, cantidad, motivo, creado_por)
    values (adm,'2099-01-10','almuerzo_entregado',2,'colado tarde', adm);
  begin
    perform sueldo_liquidacion_cerrar(liq); r := r || 'L-CARRERA-CONTEO=FALLA ';
  exception when others then r := r || 'L=ok '; end;

  raise exception 'RESULTADO 0073 >>> %', r;
end $$;
