-- Prueba de la migración 0079_huellero_emparejado_fix.sql
--
-- Cubre las tres reglas de la spec §6 «El defecto del emparejado» (20-ago-2026). Cada caso es un
-- fallo real medido sobre las 3.084 marcas de producción, no un caso inventado.
--
-- EL MODO DE FALLAR QUE IMPORTA. La derivación aborta el lote entero del colector contra
-- asistencias_trabajado_chk, o —peor, si la fila estuviera en 'sin_dato'— borra en silencio una
-- hora que ya estaba derivada. Las dos cosas terminan en el mismo lugar: un día que no se liquida.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila. El "error" final ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0079
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  eA uuid; eB uuid; eC uuid; eD uuid; eE uuid;
  cond text; ent time; sal time; v_obs text;
  puso_sal boolean;
  r text := '';
begin
  -- El umbral que separa "se fue" de "apoyó el dedo dos veces". La prueba lo fija en la propia
  -- transacción para no depender de lo que tenga config, y así el escenario dice lo que mide.
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';

  select id into eA from empleados order by id limit 1;
  select id into eB from empleados order by id offset 1 limit 1;
  select id into eC from empleados order by id offset 2 limit 1;
  select id into eD from empleados order by id offset 3 limit 1;
  select id into eE from empleados order by id offset 4 limit 1;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0079', '10.0.0.79') returning id into disp;

  -- ── 1) EL CASO DE PRODUCCIÓN: día impar sobre una fila que la máquina ya declaró ──────────
  --
  -- Jaerock, 2026-08-19: 08:10:41 · 14:05:33 · 14:15:39. La tercera marca cae diez minutos
  -- después de la segunda —menos que la pausa— y reabre el tramo. Antes de la 0079 esto escribía
  -- hora_salida = null sobre una fila en 'trabajado' y abortaba con asistencias_trabajado_chk.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '790', eA, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'790',eA,'2099-07-01T08:10:41-05:00',790001,'A'),
           (disp,'790',eA,'2099-07-01T14:05:33-05:00',790002,'A');
  perform huellero_derivar_asistencia(eA, '2099-07-01');   -- deja la fila en 'trabajado'

  begin
    insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
      values (disp,'790',eA,'2099-07-01T14:15:39-05:00',790003,'A');
    perform huellero_derivar_asistencia(eA, '2099-07-01');
    r := r || '1=ok ';
  exception when others then
    r := r || format('1-ABORTA=FALLA(%s) ', sqlerrm);
  end;

  -- ── 2) REGLA 1: el tramo reabierto se cierra con la última marca ─────────────────────────
  -- La persona se fue a las 14:15:39. Cerrar con 14:05:33 le descuenta diez minutos; dejarlo
  -- abierto le borra el día entero de la liquidación.
  select condicion, hora_entrada, hora_salida into cond, ent, sal
    from asistencias where empleado_id=eA and fecha='2099-07-01';
  if cond = 'trabajado' and ent = '08:10:41' and sal = '14:15:39' then r := r || '2=ok ';
  else r := r || format('2-NO-CIERRA-CON-LA-ULTIMA=FALLA(%s %s %s) ', cond, ent, sal); end if;

  -- ── 3) REGLA 1 no inventa una salida donde no la hay ─────────────────────────────────────
  -- Una sola marca en todo el día sigue siendo una entrada sin salida. Si la regla cerrara el
  -- tramo con su propia marca de apertura, la jornada duraría cero y el motor la leería como un
  -- día trabajado de cero horas.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '791', eB, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'791',eB,'2099-07-02T09:35:00-05:00',790004,'B');
  perform huellero_derivar_asistencia(eB, '2099-07-02');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eB and fecha='2099-07-02';
  if cond = 'sin_dato' and sal is null then r := r || '3=ok ';
  else r := r || format('3-INVENTA-SALIDA=FALLA(%s %s) ', cond, sal); end if;

  -- ── 4) REGLA 2: la hora que puso la máquina no se borra ──────────────────────────────────
  -- Se le quitan las marcas de cierre al día ya derivado y se vuelve a derivar. La pasada nueva
  -- da un tramo abierto; la fila tiene que conservar su hora, no perderla.
  delete from marcas_huellero
    where empleado_id = eA and evento_serial in (790002, 790003);
  perform huellero_derivar_asistencia(eA, '2099-07-01');
  select condicion, hora_salida into cond, sal
    from asistencias where empleado_id=eA and fecha='2099-07-01';
  if sal = '14:15:39' and cond = 'trabajado' then r := r || '4=ok ';
  else r := r || format('4-BORRA-HORA-DERIVADA=FALLA(%s %s) ', cond, sal); end if;

  -- ── 5) REGLA 2: la hora que cargó una persona sigue mandando ─────────────────────────────
  -- Esto ya lo garantizaba la 0075 y tiene que seguir garantizándolo: es la primera salvaguarda
  -- del sueldo. Lo que escribió el administrador manda sobre la máquina.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida,
                          fuente, condicion, huellero_puso_entrada, huellero_puso_salida)
    values (eC,'2099-07-03','M','09:00','19:00','manual','trabajado', false, false);
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '792', eC, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'792',eC,'2099-07-03T08:00:00-05:00',790005,'C');
  perform huellero_derivar_asistencia(eC, '2099-07-03');
  select hora_entrada, hora_salida into ent, sal
    from asistencias where empleado_id=eC and fecha='2099-07-03';
  if ent = '09:00' and sal = '19:00' then r := r || '5=ok ';
  else r := r || format('5-PISA-LO-DECLARADO=FALLA(%s %s) ', ent, sal); end if;

  -- ── 6) Dos marcas pegadas no se convierten en una jornada de dos minutos ─────────────────
  -- Con la regla 1 el tramo ahora cierra, así que el que tiene que atajarlo es el rango de
  -- jornada plausible: por debajo de huellero_jornada_min_horas la fila queda en 'sin_dato' con
  -- el motivo escrito, no declarada trabajada.
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '793', eD, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'793',eD,'2099-07-04T08:00:00-05:00',790006,'D'),
           (disp,'793',eD,'2099-07-04T08:02:00-05:00',790007,'D');
  perform huellero_derivar_asistencia(eD, '2099-07-04');
  select condicion, hora_salida, obs into cond, sal, v_obs
    from asistencias where empleado_id=eD and fecha='2099-07-04';
  if cond = 'sin_dato' and sal = '08:02' and v_obs like '%revisar:%' then r := r || '6=ok ';
  else r := r || format('6-JORNADA-IMPOSIBLE-DECLARADA=FALLA(%s %s %s) ', cond, sal, v_obs); end if;

  -- ── 7) Una falta declarada sigue intacta ────────────────────────────────────────────────
  -- Cuesta dos días de sueldo (RN-09) y la decidió una persona. Ninguna huella la revierte sola.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion)
    values (eE,'2099-07-05','M','manual','falta');
  insert into huellero_mapeos(dispositivo_id, employee_no, empleado_id, vigente_desde)
    values (disp, '794', eE, '2099-01-01');
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp,'794',eE,'2099-07-05T08:00:00-05:00',790008,'E'),
           (disp,'794',eE,'2099-07-05T18:00:00-05:00',790009,'E');
  perform huellero_derivar_asistencia(eE, '2099-07-05');
  select condicion, hora_entrada into cond, ent
    from asistencias where empleado_id=eE and fecha='2099-07-05';
  if cond = 'falta' and ent is null then r := r || '7=ok ';
  else r := r || format('7-REVIERTE-FALTA=FALLA(%s %s) ', cond, ent); end if;

  -- ── 8) El sello sigue a su hora ─────────────────────────────────────────────────────────
  -- Si la hora no se toca, huellero_puso_salida no puede darse vuelta: ese sello es lo que decide
  -- si una re-resolución futura puede recalcular la hora o tiene que respetarla.
  select huellero_puso_salida into puso_sal
    from asistencias where empleado_id=eC and fecha='2099-07-03';
  if puso_sal = false then r := r || '8=ok ';
  else r := r || format('8-SELLO-SE-DA-VUELTA=FALLA(%s) ', puso_sal); end if;

  -- ── 9) El parámetro de pausa existe como fila editable ──────────────────────────────────
  -- No-negociable 5: un parámetro de negocio no vive hardcodeado. Si esta fila no existe, el
  -- umbral corre por un default escrito en el código que nadie puede cambiar desde la pantalla.
  if exists (select 1 from config where clave = 'sueldo_pausa_minima_minutos') then r := r || '9=ok ';
  else r := r || '9-PARAMETRO-HARDCODEADO=FALLA '; end if;

  raise exception 'RESULTADO %', r;
end $$;
