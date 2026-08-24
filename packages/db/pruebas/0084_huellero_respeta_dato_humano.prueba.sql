-- Prueba de la migración 0084_huellero_respeta_dato_humano.sql
--
-- Comprueba la regla RN-H1.b de la spec
-- (docs/superpowers/specs/asistencias/2026-08-23-huellero-respeta-dato-humano-design.md §4, D-2):
-- la reversión del huellero borra una fila SÓLO si ninguna de sus horas es de autor humano, y a
-- las que sí lo son les quita únicamente las horas de la máquina.
--
-- Y comprueba de paso el mecanismo del que depende el cambio hermano D-1 —que `declararDia()`
-- baje los sellos al corregir una hora— porque ese cambio vive en TypeScript y este repositorio
-- corre vitest sólo sobre `packages/core`. Los casos F y G miden lo mismo por el otro lado: con
-- el sello en `false` la hora humana sobrevive a la derivación, y con el sello en `true` la
-- máquina la recalcula. Si G pasara a comportarse como F, el sello habría dejado de mandar y D-1
-- sería inofensivo; si F se comportara como G, D-1 no alcanzaría para nada.
--
-- POR QUÉ ESTA PRUEBA NO CAMBIA DE ROL. Las otras pruebas de este directorio hacen
-- `set local role authenticated` porque miden políticas de RLS, y sin ese cambio las políticas no
-- se evalúan y la prueba pasa siempre sin comprobar nada. Acá lo que se mide es el cuerpo de dos
-- funciones `security definer` que NO son llamables por `authenticated` —están revocadas desde la
-- 0075:960— así que el escenario se monta con el rol dueño de la conexión. Lo que sí se comprueba
-- sobre permisos es exactamente eso: el caso H verifica que la revocación siga puesta después de
-- recrear la función, que es la forma en que un `create or replace` puede aflojar la puerta sin
-- que nadie lo note.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado: eso aborta la transacción y no queda ni una fila — ni asistencias, ni marcas,
-- ni el dispositivo de prueba, ni el valor de `config` que se fija más abajo. El "error" final ES
-- la salida esperada; se lee la línea RESULTADO 0084.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0084
-- (o pegar el archivo entero de una sola vez en el SQL editor de Supabase, proyecto scilb).
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  disp uuid;
  eA uuid; eB uuid; eC uuid;
  v_n     int;
  v_cond  text;
  v_ent   time;
  v_sal   time;
  v_se    boolean;
  v_ss    boolean;
  r text := '';
begin
  -- El umbral que separa "se fue" de "apoyó el dedo dos veces". Se fija en la propia transacción
  -- para que el escenario no dependa de lo que tenga `config` el día que se corra.
  insert into config (clave, valor) values ('sueldo_pausa_minima_minutos', '15')
    on conflict (clave) do update set valor = '15';

  select id into eA from empleados order by id limit 1;
  select id into eB from empleados order by id offset 1 limit 1;
  select id into eC from empleados order by id offset 2 limit 1;
  if eA is null or eB is null or eC is null then
    raise exception 'La prueba necesita al menos tres empleados';
  end if;

  insert into dispositivos_huellero(nombre, ip) values ('Prueba 0084', '10.0.0.84') returning id into disp;

  -- Las fechas son de 2099 a propósito: así ninguno de los tres tiene marcas ese día y
  -- `huellero_limpiar_dia_sin_marcas` no se corta por la guarda de la primera línea.

  -- ── A) No se rompió lo que funcionaba: la fila 100 % de la máquina se sigue borrando ──────
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida)
    values (eA, '2099-07-01', 'M', '08:00', '14:00', 'huellero', 'trabajado', true, true);
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-07-01');
  select count(*) into v_n from asistencias where empleado_id = eA and fecha = '2099-07-01';
  if v_n = 0 then r := r || 'A=ok ';
  else r := r || 'A-NO-BORRA-LA-FILA-DE-LA-MAQUINA=FALLA ';  end if;

  -- ── B) EL CASO QUE ESTA MIGRACIÓN EXISTE PARA ARREGLAR ────────────────────────────────────
  -- Fila nacida del huellero, con la ENTRADA corregida a mano (sello abajo) y la salida de la
  -- máquina. Antes de la 0084 se borraba entera: se perdía la entrada humana, la condición
  -- declarada y el motivo. Ahora tiene que sobrevivir conservando la entrada, perder sólo la
  -- salida de la máquina, y bajar a 'sin_dato' para que la liquidación corte nombrando la fecha.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida, motivo_justificacion)
    values (eA, '2099-07-02', 'M', '09:00', '14:00', 'huellero', 'trabajado', false, true,
            'entró tarde con permiso');
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-07-02');
  select count(*) into v_n from asistencias where empleado_id = eA and fecha = '2099-07-02';
  if v_n = 0 then
    r := r || 'B-BORRA-LA-HORA-HUMANA=FALLA ';
  else
    select condicion, hora_entrada, hora_salida, huellero_puso_entrada, huellero_puso_salida
      into v_cond, v_ent, v_sal, v_se, v_ss
      from asistencias where empleado_id = eA and fecha = '2099-07-02';
    if v_ent = '09:00' and v_sal is null and v_cond = 'sin_dato' and not v_se and not v_ss then
      r := r || 'B=ok ';
    else
      r := r || format('B-ESTADO-EQUIVOCADO=FALLA(cond=%s ent=%s sal=%s se=%s ss=%s) ',
                       v_cond, v_ent, v_sal, v_se, v_ss);
    end if;
  end if;

  -- ── C) Una falta declarada no se toca nunca ──────────────────────────────────────────────
  -- Con los dos sellos arriba y sin horas: si la exclusión de 'falta' se hubiera perdido en la
  -- reescritura, el `delete` se la llevaría. Es la declaración que dice que ese día no se paga.
  insert into asistencias(empleado_id, fecha, turno, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida)
    values (eA, '2099-07-03', 'M', 'huellero', 'falta', true, true);
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-07-03');
  select count(*), max(condicion) into v_n, v_cond
    from asistencias where empleado_id = eA and fecha = '2099-07-03';
  if v_n = 1 and v_cond = 'falta' then r := r || 'C=ok ';
  else r := r || format('C-TOCA-UNA-FALTA=FALLA(n=%s cond=%s) ', v_n, v_cond); end if;

  -- ── D) La fila de otra fuente sigue comportándose igual que antes de la 0084 ──────────────
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida, obs)
    values (eA, '2099-07-04', 'M', '08:00', '14:00', 'reporte', 'trabajado', false, true,
            'revisar: algo');
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-07-04');
  select count(*) into v_n from asistencias where empleado_id = eA and fecha = '2099-07-04';
  if v_n = 0 then
    r := r || 'D-BORRA-UNA-FILA-AJENA=FALLA ';
  else
    select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
      from asistencias where empleado_id = eA and fecha = '2099-07-04';
    if v_ent = '08:00' and v_sal is null and v_cond = 'sin_dato' then r := r || 'D=ok ';
    else r := r || format('D-ESTADO-EQUIVOCADO=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal); end if;
  end if;

  -- ── E) Fila del huellero con las DOS horas ya corregidas a mano: no se toca nada ──────────
  -- No hay nada de la máquina que revertir. Ni el `delete` ni el `update` tienen por qué
  -- alcanzarla, y bajarla a 'sin_dato' sería quitarle a la persona un día que ya está bien.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida)
    values (eA, '2099-07-05', 'M', '08:15', '18:40', 'huellero', 'trabajado', false, false);
  perform huellero_limpiar_dia_sin_marcas(eA, '2099-07-05');
  select count(*) into v_n from asistencias where empleado_id = eA and fecha = '2099-07-05';
  if v_n = 0 then
    r := r || 'E-BORRA-UN-DIA-ENTERO-ESCRITO-A-MANO=FALLA ';
  else
    select condicion, hora_entrada, hora_salida into v_cond, v_ent, v_sal
      from asistencias where empleado_id = eA and fecha = '2099-07-05';
    if v_ent = '08:15' and v_sal = '18:40' and v_cond = 'trabajado' then r := r || 'E=ok ';
    else r := r || format('E-ESTADO-EQUIVOCADO=FALLA(cond=%s ent=%s sal=%s) ', v_cond, v_ent, v_sal); end if;
  end if;

  -- ── F) El sello abajo protege la hora humana de la derivación (razón de ser de D-1) ───────
  -- La persona se quedó hasta las 18:30 cerrando el almacén; el equipo sólo tiene su marca de las
  -- 14:00. Alguien corrigió la salida a mano, y por eso el sello está en `false`. El siguiente
  -- lote del colector NO puede volver a poner 14:00.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '840', eB, '2099-07-11T08:00:00-05:00', 840001, 'B'),
           (disp, '840', eB, '2099-07-11T14:00:00-05:00', 840002, 'B');
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida)
    values (eB, '2099-07-11', 'M', '08:00', '18:30', 'huellero', 'trabajado', true, false);
  perform huellero_derivar_asistencia(eB, '2099-07-11');
  select hora_salida, huellero_puso_salida into v_sal, v_ss
    from asistencias where empleado_id = eB and fecha = '2099-07-11';
  if v_sal = '18:30' and not v_ss then r := r || 'F=ok ';
  else r := r || format('F-LA-MAQUINA-PISA-LA-CORRECCION=FALLA(sal=%s ss=%s) ', v_sal, v_ss); end if;

  -- ── G) El mismo día con el sello ARRIBA sí se recalcula ───────────────────────────────────
  -- Es el estado en que `declararDia()` dejaba la fila antes de D-1: la corrección se escribía
  -- bien y el colector la deshacía sola. Si este caso dejara de recalcular, el sello habría
  -- dejado de mandar y D-1 no estaría protegiendo nada.
  insert into marcas_huellero(dispositivo_id, employee_no, empleado_id, marcada_en, evento_serial, nombre_equipo)
    values (disp, '841', eC, '2099-07-12T08:00:00-05:00', 841001, 'C'),
           (disp, '841', eC, '2099-07-12T14:00:00-05:00', 841002, 'C');
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion,
                          huellero_puso_entrada, huellero_puso_salida)
    values (eC, '2099-07-12', 'M', '08:00', '18:30', 'huellero', 'trabajado', true, true);
  perform huellero_derivar_asistencia(eC, '2099-07-12');
  select hora_salida into v_sal from asistencias where empleado_id = eC and fecha = '2099-07-12';
  if v_sal = '14:00' then r := r || 'G=ok ';
  else r := r || format('G-EL-SELLO-DEJO-DE-MANDAR=FALLA(sal=%s) ', v_sal); end if;

  -- ── H) La puerta sigue cerrada después de recrear la función ─────────────────────────────
  -- `create or replace function` conserva los privilegios, pero recrear una función es
  -- justamente la ocasión en que una puerta se abre sin que nadie lo note. Esta función escribe
  -- y borra asistencias de terceros por encima de la RLS: nadie la llama por HTTP.
  if not has_function_privilege('authenticated', 'huellero_limpiar_dia_sin_marcas(uuid,date)', 'execute')
     and not has_function_privilege('anon', 'huellero_limpiar_dia_sin_marcas(uuid,date)', 'execute') then
    r := r || 'H=ok ';
  else
    r := r || 'H-LLAMABLE-POR-HTTP=FALLA ';
  end if;

  raise exception 'RESULTADO 0084 >>> %', r;
end $$;
