-- Prueba de la migración 0075_huellero_asistencias.sql
--
-- No comprueba que las tablas existan: comprueba que la derivación NO PAGUE MAL. Cada caso es
-- un error que ya se cometió y que costaría plata si volviera.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una
-- excepción con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final
-- ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0075
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  eA uuid; eB uuid; eC uuid; eD uuid; eE uuid;
  map1 uuid; map2 uuid;
  cond text; ent time; sal time; obs text; n int;
  r text := '';
begin
  -- Cinco personas cualesquiera. La prueba no toca sus datos: sólo usa sus id.
  select id into eA from empleados order by id limit 1;
  select id into eB from empleados order by id offset 1 limit 1;
  select id into eC from empleados order by id offset 2 limit 1;
  select id into eD from empleados order by id offset 3 limit 1;
  select id into eE from empleados order by id offset 4 limit 1;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba', '10.0.0.1') returning id into disp;
  r := r || 'dispositivo=ok ';

  -- ── 1) El caso normal: dos marcas dan una jornada ────────────────────────────────────────
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '900', eA, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'900',eA,'2099-01-05T08:00:00-05:00',900001,'A'),
           (disp,'900',eA,'2099-01-05T14:00:00-05:00',900002,'A');
  perform huellero_derivar_asistencia(eA, '2099-01-05');
  select condicion, hora_entrada, hora_salida into cond, ent, sal
    from asistencias where empleado_id=eA and fecha='2099-01-05';
  if cond = 'trabajado' and ent = '08:00' and sal = '14:00' then r := r || '1=ok ';
  else r := r || format('1-JORNADA-NORMAL=FALLA(%s %s %s) ', cond, ent, sal); end if;

  -- ── 2) Una sola marca NO puede declararse trabajada ──────────────────────────────────────
  -- Si se declarara, violaría asistencias_trabajado_chk. Y si además se inventara la salida,
  -- la liquidación cobraría un día que nadie sabe cuánto duró.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '901', eB, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'901',eB,'2099-01-05T09:35:00-05:00',900003,'B');
  perform huellero_derivar_asistencia(eB, '2099-01-05');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eB and fecha='2099-01-05';
  if cond = 'sin_dato' and sal is null then r := r || '2=ok ';
  else r := r || format('2-UNA-MARCA=FALLA(%s %s) ', cond, sal); end if;

  -- ── 3) Una falta declarada no se toca, ni en otro turno del mismo día ────────────────────
  -- Una falta cuesta dos días de sueldo (RN-09) y la declara una persona.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion)
    values (eC,'2099-01-06','T','manual','falta');
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion)
    values (eC,'2099-01-06','M','reporte','sin_dato');
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '902', eC, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'902',eC,'2099-01-06T08:00:00-05:00',900004,'C'),
           (disp,'902',eC,'2099-01-06T20:00:00-05:00',900005,'C');
  perform huellero_derivar_asistencia(eC, '2099-01-06');
  select condicion, hora_entrada into cond, ent
    from asistencias where empleado_id=eC and fecha='2099-01-06' and turno='M';
  if cond = 'sin_dato' and ent is null then r := r || '3=ok ';
  else r := r || format('3-FALTA-EN-OTRO-TURNO=FALLA(%s %s) ', cond, ent); end if;

  -- ── 4) Una fila de reporte sin horas se completa Y transiciona ──────────────────────────
  -- Sin la transición el día queda invisible para la liquidación (0073:180) y bloquea el mes.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion)
    values (eD,'2099-01-07','T','reporte','sin_dato');
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '903', eD, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'903',eD,'2099-01-07T14:05:00-05:00',900006,'D'),
           (disp,'903',eD,'2099-01-07T21:00:00-05:00',900007,'D');
  perform huellero_derivar_asistencia(eD, '2099-01-07');
  select condicion, fuente into cond, obs
    from asistencias where empleado_id=eD and fecha='2099-01-07' and turno='T';
  if cond = 'trabajado' and obs = 'reporte' then r := r || '4=ok ';
  else r := r || format('4-TRANSICION-REPORTE=FALLA(%s %s) ', cond, obs); end if;

  -- ── 5) Las horas cargadas a mano no se pisan ────────────────────────────────────────────
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion)
    values (eA,'2099-01-08','M','09:00','18:00','manual','trabajado');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'900',eA,'2099-01-08T07:00:00-05:00',900008,'A'),
           (disp,'900',eA,'2099-01-08T22:00:00-05:00',900009,'A');
  perform huellero_derivar_asistencia(eA, '2099-01-08');
  select hora_entrada, hora_salida into ent, sal
    from asistencias where empleado_id=eA and fecha='2099-01-08';
  if ent = '09:00' and sal = '18:00' then r := r || '5=ok ';
  else r := r || format('5-PISA-MANUAL=FALLA(%s %s) ', ent, sal); end if;

  -- ── 6) Rellenar no puede dejar la salida antes que la entrada ───────────────────────────
  -- Fila de turno T con la entrada a mano y marcas de la mañana: quedaría 14:00 → 12:00, la
  -- transición lo bendeciría, y después sueldos.ts:546-548 lanza y el mes no se liquida.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, fuente, condicion)
    values (eE,'2099-01-09','T','14:00','manual','sin_dato');
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '904', eE, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'904',eE,'2099-01-09T08:00:00-05:00',900010,'E'),
           (disp,'904',eE,'2099-01-09T12:00:00-05:00',900011,'E');
  perform huellero_derivar_asistencia(eE, '2099-01-09');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eE and fecha='2099-01-09';
  if cond = 'sin_dato' and sal is null then r := r || '6=ok ';
  else r := r || format('6-ORDEN-INVERTIDO=FALLA(%s %s) ', cond, sal); end if;

  -- ── 7) La jornada imposible no se declara trabajada ─────────────────────────────────────
  -- JORDAN, 00:22 a 23:01: son 22,6 h y le pagarían 14,6 horas que nadie trabajó.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'900',eA,'2099-01-10T00:22:00-05:00',900012,'A'),
           (disp,'900',eA,'2099-01-10T23:01:00-05:00',900013,'A');
  perform huellero_derivar_asistencia(eA, '2099-01-10');
  select condicion, obs into cond, obs
    from asistencias where empleado_id=eA and fecha='2099-01-10';
  if cond = 'sin_dato' and obs like 'revisar:%' then r := r || '7=ok ';
  else r := r || format('7-JORNADA-22H=FALLA(%s %s) ', cond, obs); end if;

  -- ── 8) Dos marcas en el mismo minuto tampoco ────────────────────────────────────────────
  -- FERNANDO: entrada = salida hace que sueldos.ts:546-548 lance y el mes entero se trabe.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'901',eB,'2099-01-11T21:02:23-05:00',900014,'B'),
           (disp,'901',eB,'2099-01-11T21:02:38-05:00',900015,'B');
  perform huellero_derivar_asistencia(eB, '2099-01-11');
  select condicion into cond from asistencias where empleado_id=eB and fecha='2099-01-11';
  if cond = 'sin_dato' then r := r || '8=ok ';
  else r := r || format('8-JORNADA-0H=FALLA(%s) ', cond); end if;

  -- ── 9) El día en que el identificador cambia de dueño ───────────────────────────────────
  -- El 00000013 marcó como JAZMIN a las 08:45 del 28-ene y como NICOL a las 20:46. La vigencia
  -- es por fecha, así que las dos caen en la primera persona: colapsarlas le daría doce horas.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'902',eC,'2099-01-12T08:45:00-05:00',900016,'JAZMIN'),
           (disp,'902',eC,'2099-01-12T20:46:00-05:00',900017,'NICOL');
  perform huellero_derivar_asistencia(eC, '2099-01-12');
  select condicion into cond from asistencias where empleado_id=eC and fecha='2099-01-12';
  if cond = 'sin_dato' then r := r || '9=ok ';
  else r := r || format('9-REASIGNACION=FALLA(%s) ', cond); end if;

  -- ── 10) Una marca con nombre y otra sin nombre también manda a revisar ──────────────────
  -- count(distinct) ignora los NULL: si sólo se contaran nombres distintos, esto daría 1.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'903',eD,'2099-01-13T08:00:00-05:00',900018,null),
           (disp,'903',eD,'2099-01-13T20:00:00-05:00',900019,'D');
  perform huellero_derivar_asistencia(eD, '2099-01-13');
  select condicion into cond from asistencias where empleado_id=eD and fecha='2099-01-13';
  if cond = 'sin_dato' then r := r || '10=ok ';
  else r := r || format('10-MEZCLA-SIN-NOMBRE=FALLA(%s) ', cond); end if;

  -- ── 11) Acortar un mapeo NO puede dejar los días en las dos personas ────────────────────
  -- Es el doble pago: al acortar la vigencia de la primera para dar lugar a la segunda, los días
  -- que quedan fuera del rango tienen que salir de la primera.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '905', eA, '2099-02-01') returning id into map1;
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'905',eA,'2099-02-10T08:00:00-05:00',900020,'X'),
           (disp,'905',eA,'2099-02-10T20:00:00-05:00',900021,'X');
  perform huellero_derivar_asistencia(eA, '2099-02-10');

  update huellero_mapeos set vigente_hasta='2099-02-05' where id=map1;
  perform huellero_reprocesar_mapeo(map1);

  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '905', eB, '2099-02-06') returning id into map2;
  perform huellero_reprocesar_mapeo(map2);

  select count(*) into n from asistencias where empleado_id=eA and fecha='2099-02-10';
  if n = 0 then r := r || '11a=ok ';
  else r := r || format('11a-DOBLE-PAGO=FALLA(la primera conserva %s dia) ', n); end if;

  select count(*) into n from asistencias where empleado_id=eB and fecha='2099-02-10';
  if n = 1 then r := r || '11b=ok ';
  else r := r || format('11b-NO-REASIGNA=FALLA(la segunda tiene %s) ', n); end if;

  -- ── 12) Un mapeo ignorado no le asigna las marcas a nadie ───────────────────────────────
  -- El check permite `ignorado` con empleado_id cargado: es lo natural cuando se quiere dejar de
  -- contar un identificador sin borrar de quién era.
  update huellero_mapeos set ignorado=true where id=map2;
  perform huellero_reprocesar_mapeo(map2);
  select count(*) into n from marcas_huellero
   where dispositivo_id=disp and employee_no='905' and empleado_id is not null;
  if n = 0 then r := r || '12=ok ';
  else r := r || format('12-IGNORADO-ASIGNA=FALLA(%s marcas con dueno) ', n); end if;

  -- ── 13) Dos vigencias solapadas del mismo identificador no pueden existir ───────────────
  -- Si se solaparan, la misma marca resolvería a dos personas según el orden de lectura.
  begin
    insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde, vigente_hasta)
      values (disp, '900', eB, '2099-01-01', null);
    r := r || '13-SOLAPE-MAPEO=FALLA ';
  exception when others then r := r || '13=ok '; end;

  -- ── 14) El mismo evento dos veces no se duplica ────────────────────────────────────────
  -- Es lo que deja al colector pedir siempre diez minutos de solape sin ensuciar nada.
  begin
    insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial)
      values (disp,'900',eA,'2099-01-05T08:00:00-05:00',900001);
    r := r || '14-DUPLICA-EVENTO=FALLA ';
  exception when others then r := r || '14=ok '; end;

  -- ── 15) Un día sin marcas no deja asistencia del huellero colgada ──────────────────────
  delete from marcas_huellero where dispositivo_id=disp and employee_no='900'
    and (marcada_en at time zone 'America/Lima')::date = '2099-01-10';
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-01-10');
  select count(*) into n from asistencias where empleado_id=eA and fecha='2099-01-10';
  if n = 0 then r := r || '15=ok ';
  else r := r || format('15-ASISTENCIA-HUERFANA=FALLA(%s) ', n); end if;

  -- ── 16) …pero la limpieza NO borra lo que puso una persona ─────────────────────────────
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-01-08');
  select count(*) into n from asistencias
   where empleado_id=eA and fecha='2099-01-08' and fuente='manual';
  if n = 1 then r := r || '16=ok ';
  else r := r || format('16-BORRA-MANUAL=FALLA(%s) ', n); end if;

  -- ── 17) Mapear a la segunda persona NO puede borrar los días de la primera ─────────────
  -- El hueco del caso 11: allí no había marcas DENTRO del rango del mapeo viejo, que es la
  -- condición que disparaba la destrucción. Acá sí las hay.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde, vigente_hasta)
    values (disp, '906', eC, '2099-04-01', '2099-04-28');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'906',eC,'2099-04-15T08:00:00-05:00',900030,'P'),
           (disp,'906',eC,'2099-04-15T18:00:00-05:00',900031,'P'),
           (disp,'906',null,'2099-05-02T08:00:00-05:00',900032,'Q'),
           (disp,'906',null,'2099-05-02T18:00:00-05:00',900033,'Q');
  perform huellero_derivar_asistencia(eC, '2099-04-15');

  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '906', eD, '2099-04-29');
  perform huellero_reresolver_identificador(disp, '906');

  select count(*) into n from asistencias where empleado_id=eC and fecha='2099-04-15';
  if n = 1 then r := r || '17a=ok ';
  else r := r || format('17a-BORRA-A-LA-PRIMERA=FALLA(%s) ', n); end if;

  select count(*) into n from asistencias where empleado_id=eD and fecha='2099-05-02';
  if n = 1 then r := r || '17b=ok ';
  else r := r || format('17b-NO-ASIGNA-A-LA-SEGUNDA=FALLA(%s) ', n); end if;

  -- ── 18) Lo que el huellero escribió en una fila AJENA se revierte ───────────────────────
  -- Sin esto, un mapeo mal puesto y después corregido dejaba a la primera persona con días
  -- 'trabajado' llenos con las horas de la segunda: doble pago por la puerta de 'reporte'.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion, obs)
    values (eE,'2099-06-01','T','reporte','sin_dato','auto: trabajador del reporte R-1');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'907',eE,'2099-06-01T14:00:00-05:00',900040,'Z'),
           (disp,'907',eE,'2099-06-01T21:00:00-05:00',900041,'Z');
  perform huellero_derivar_asistencia(eE, '2099-06-01');

  delete from marcas_huellero where evento_serial in (900040, 900041);
  perform huellero_limpiar_dia_sin_marcas(eE, '2099-06-01');

  select condicion, hora_entrada, obs into cond, ent, obs
    from asistencias where empleado_id=eE and fecha='2099-06-01';
  if cond = 'sin_dato' and ent is null and obs = 'auto: trabajador del reporte R-1' then r := r || '18=ok ';
  else r := r || format('18-NO-REVIERTE-AJENA=FALLA(%s %s %s) ', cond, ent, obs); end if;

  -- ── 19) La pausa no se paga: cuatro marcas dan DOS tramos ──────────────────────────────
  -- C-01 (migración 0078). Si alguien sale y vuelve el mismo día, el rato de afuera no cuenta.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '908', eB, '2099-07-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'908',eB,'2099-07-01T08:00:00-05:00',900050,'W'),
           (disp,'908',eB,'2099-07-01T11:00:00-05:00',900051,'W'),
           (disp,'908',eB,'2099-07-01T13:00:00-05:00',900052,'W'),
           (disp,'908',eB,'2099-07-01T18:00:00-05:00',900053,'W');
  perform huellero_derivar_asistencia(eB, '2099-07-01');

  select count(*) into n from asistencias where empleado_id=eB and fecha='2099-07-01';
  if n = 2 then r := r || '19a=ok ';
  else r := r || format('19a-NO-PARTE-EN-TRAMOS=FALLA(%s filas) ', n); end if;

  select hora_entrada, hora_salida into ent, sal
    from asistencias where empleado_id=eB and fecha='2099-07-01' and turno='M';
  if ent = '08:00' and sal = '11:00' then r := r || '19b=ok ';
  else r := r || format('19b-TRAMO-1=FALLA(%s %s) ', ent, sal); end if;

  select hora_entrada, hora_salida into ent, sal
    from asistencias where empleado_id=eB and fecha='2099-07-01' and turno='T';
  if ent = '13:00' and sal = '18:00' then r := r || '19c=ok ';
  else r := r || format('19c-TRAMO-2=FALLA(%s %s) ', ent, sal); end if;

  -- ── 20) Apoyar el dedo dos veces NO parte el día ───────────────────────────────────────
  -- Sin el umbral de pausa se le descontarían dos minutos a alguien todos los días.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '909', eD, '2099-07-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'909',eD,'2099-07-02T08:00:00-05:00',900060,'V'),
           (disp,'909',eD,'2099-07-02T08:02:00-05:00',900061,'V'),
           (disp,'909',eD,'2099-07-02T14:00:00-05:00',900062,'V');
  perform huellero_derivar_asistencia(eD, '2099-07-02');
  select count(*), max(hora_entrada), max(hora_salida) into n, ent, sal
    from asistencias where empleado_id=eD and fecha='2099-07-02';
  if n = 1 and ent = '08:00' and sal = '14:00' then r := r || '20=ok ';
  else r := r || format('20-DEDO-REPETIDO=FALLA(%s filas, %s %s) ', n, ent, sal); end if;

  -- ── 21) Volver a los cinco minutos no es una salida ────────────────────────────────────
  -- Extender el cierre en vez de reabrir el tramo daba 08:00-13:05 más un tramo suelto.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '910', eE, '2099-07-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'910',eE,'2099-07-03T08:00:00-05:00',900070,'U'),
           (disp,'910',eE,'2099-07-03T13:00:00-05:00',900071,'U'),
           (disp,'910',eE,'2099-07-03T13:05:00-05:00',900072,'U'),
           (disp,'910',eE,'2099-07-03T18:00:00-05:00',900073,'U');
  perform huellero_derivar_asistencia(eE, '2099-07-03');
  select count(*), max(hora_entrada), max(hora_salida) into n, ent, sal
    from asistencias where empleado_id=eE and fecha='2099-07-03';
  if n = 1 and ent = '08:00' and sal = '18:00' then r := r || '21=ok ';
  else r := r || format('21-VUELVE-ENSEGUIDA=FALLA(%s filas, %s %s) ', n, ent, sal); end if;

  raise exception 'RESULTADO %', r;
end $$;
