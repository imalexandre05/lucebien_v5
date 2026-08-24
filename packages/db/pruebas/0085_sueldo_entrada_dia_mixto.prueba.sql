-- Prueba de la migración 0085_sueldo_entrada_dia_mixto.sql
--
-- Comprueba la promesa de la spec (docs/superpowers/specs/sueldos/2026-08-23-dia-mixto-design.md):
-- un día que tiene un tramo declarado y otro sin cerrar NO se liquida a medias — se corta y se
-- nombra la fecha.
--
-- Monta un contrato de cuatro días del año 2099 con los dos turnos reales de LuceBien (09:00–13:00
-- y 13:00–20:00) y ataca los cinco casos de la tabla de la spec §4. Cada falla se verifica por el
-- MENSAJE del error, no sólo por "lanzó algo": un control que se rompe y lanza otra cosa tiene que
-- reportarse como hallazgo, no pasar por ok de casualidad.
--
-- SE DESCARTA SOLA. Todo vive dentro de un bloque que termina lanzando una excepción con el
-- resultado: eso aborta la transacción y no queda ni una fila. El "error" final ES la salida
-- esperada — se lee la línea RESULTADO.
--
-- OJO — mismo aviso que las pruebas de la 0073 y la 0080 (docs/aprendizajes.md, fila del 22-ago):
-- `sueldo_entrada` es `security invoker` y exige `private.app_es_admin()` adentro. El editor SQL de
-- Supabase corre con `auth.uid()` en null, así que sin el `set_config('request.jwt.claims', ...)`
-- de más abajo TODO devuelve PERMISO y la prueba no comprueba nada. Correr el archivo ENTERO de una
-- sola vez: ese `set_config(..., true)` vale sólo dentro de esta misma transacción.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0085

do $$
declare
  adm      uuid;
  ac       uuid;
  r        text := '';
  v_json   jsonb;
  v_msg    text;
  v_dias   int;
  v_tramos int;
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: cuatro días de 2099 con los dos turnos cada día ──────────────────────────────
  -- 2099-04-01 es miércoles; el contrato cubre miércoles a sábado. Se cargan los siete días de la
  -- semana en el horario para no depender del cálculo de isodow en la prueba.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (adm, '2099-04-01', '2099-04-04', 'semanal', 440, 'vigente', adm)
    returning id into ac;

  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, h.desde, h.hasta
  from generate_series(1,7) d,
       (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);

  -- Los cuatro días, los dos turnos, todo cerrado y puntual.
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
  select adm, d::date, t.turno, 'trabajado', t.desde, t.hasta, 'manual'
  from generate_series('2099-04-01'::date, '2099-04-04'::date, interval '1 day') d,
       (values ('M', time '09:00', time '13:00'), ('T', time '13:00', time '20:00')) as t(turno, desde, hasta);

  -- ── Caso 1: todo declarado → liquida, y el día trae sus dos tramos ────────────────────────
  begin
    v_json := sueldo_entrada(ac);
    v_dias := jsonb_array_length(v_json->'asistencia');
    select jsonb_array_length(elem->'tramos') into v_tramos
    from jsonb_array_elements(v_json->'asistencia') elem
    where elem->>'fecha' = '2099-04-01';

    if v_dias <> 4 then
      r := r || format(' [FALLA] con todo declarado esperaba 4 dias y vinieron %s;', v_dias);
    elsif v_tramos <> 2 then
      r := r || format(' [FALLA] el dia completo tendria que traer 2 tramos y trajo %s;', v_tramos);
    else
      r := r || ' [ok] dia completo: 4 dias, 2 tramos;';
    end if;
  exception when others then
    r := r || format(' [FALLA] con todo declarado no tendria que cortar y corto con "%s";', sqlerrm);
  end;

  -- ── Caso 2: el día a medio declarar → corta y nombra la fecha ─────────────────────────────
  -- Se deja el turno de la tarde del 2 con la entrada puesta y sin salida, que es exactamente lo
  -- que escribe el huellero cuando alguien vuelve del almuerzo y se va sin marcar.
  update asistencias
     set condicion = 'sin_dato', hora_salida = null
   where empleado_id = adm and fecha = '2099-04-02' and turno = 'T';

  begin
    v_json := sueldo_entrada(ac);
    r := r || ' [FALLA] el dia a medio declarar se liquido en vez de cortar;';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'DATO:hay tramos sin cerrar%' and v_msg like '%2099-04-02%' then
      r := r || ' [ok] dia mixto: corta con DATO y nombra la fecha;';
    else
      r := r || format(' [FALLA] esperaba "DATO:hay tramos sin cerrar ... 2099-04-02" y vino "%s";', v_msg);
    end if;
  end;

  -- ── Caso 3: el día sin ninguna fila sigue cortando con el mensaje de siempre ──────────────
  -- Se borran las dos filas del 3 y se repara el 2, para que el único problema sea el día vacío.
  delete from asistencias where empleado_id = adm and fecha = '2099-04-03';
  update asistencias
     set condicion = 'trabajado', hora_salida = time '20:00'
   where empleado_id = adm and fecha = '2099-04-02' and turno = 'T';

  begin
    v_json := sueldo_entrada(ac);
    r := r || ' [FALLA] un dia contratado sin ninguna fila tendria que cortar;';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'DATO:falta declarar la asistencia%' and v_msg like '%2099-04-03%' then
      r := r || ' [ok] dia sin cargar: mensaje de siempre, sin cambios;';
    else
      r := r || format(' [FALLA] esperaba el mensaje de dia sin cargar y vino "%s";', v_msg);
    end if;
  end;

  -- ── Caso 4: una falta DECLARADA no es un tramo sin cerrar ────────────────────────────────
  insert into asistencias(empleado_id, fecha, turno, condicion, fuente)
    values (adm, '2099-04-03', 'C', 'falta', 'manual');

  begin
    v_json := sueldo_entrada(ac);
    if (select count(*) from jsonb_array_elements(v_json->'asistencia') e
         where e->>'fecha' = '2099-04-03' and e->>'horaIngreso' is null) = 1 then
      r := r || ' [ok] falta declarada: liquida y llega con el ingreso en null;';
    else
      r := r || ' [FALLA] la falta declarada no llego al motor como falta;';
    end if;
  exception when others then
    r := r || format(' [FALLA] una falta declarada no tendria que cortar y corto con "%s";', sqlerrm);
  end;

  -- ── Caso 5: un día NO contratado con un tramo sin cerrar tampoco se paga a medias ─────────
  -- El 2099-04-05 queda fuera del periodo del contrato, así que se usa el 4 quitándole el turno
  -- contratado no es posible sin tocar el horario entero: en su lugar se comprueba que el control
  -- mire TODOS los días del periodo, contratados o no, agregando un tercer turno al día 4.
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, fuente)
    values (adm, '2099-04-04', 'X', 'sin_dato', time '20:30', 'huellero');

  begin
    v_json := sueldo_entrada(ac);
    r := r || ' [FALLA] un tramo sin cerrar el 04 tendria que cortar;';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'DATO:hay tramos sin cerrar%' and v_msg like '%2099-04-04%' then
      r := r || ' [ok] tramo extra sin cerrar: tambien corta;';
    else
      r := r || format(' [FALLA] esperaba el corte del tramo sin cerrar y vino "%s";', v_msg);
    end if;
  end;

  raise exception 'RESULTADO 0085 -->%', r;
end $$;
