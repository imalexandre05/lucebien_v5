-- Prueba de la migración 0111_cierre_datos_actuales.sql
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-04-cierre-con-datos-actuales-design.md §4.
-- Plan: docs/superpowers/plans/2026-10-04-cierre-con-datos-actuales.md.
--
-- QUÉ PRUEBA. Que `sueldo_liquidacion_cerrar` sólo cierre un borrador cuya entrada guardada es
-- idéntica a la que `sueldo_entrada(...)` calcularía ahora, y que cuando no lo es, rechace con
-- `DESACTUALIZADA` nombrando qué cambió y sin sellar nada.
--
--   1. Un adelanto de S/100 se borra y se carga uno de S/300 el mismo día (mismo CONTEO, otro
--      MONTO): el cierre se rechaza, nombra `adelantos`, el borrador sigue en borrador y el
--      adelanto de S/300 NO queda sellado. Es el agujero que motivó la spec.
--   2. Se corrige una hora de asistencia después de calcular: el cierre se rechaza y nombra
--      `asistencia`.
--   3. Nada cambió: el cierre sale bien, con el mismo resultado de siempre (regresión).
--   4. Datos cambiados → se descarta el borrador, se vuelve a calcular y se cierra: sale bien y
--      sella el adelanto NUEVO (S/300), que va dentro de la entrada guardada.
--   5. La comparación ignora SÓLO el orden de los arreglos de primer nivel (lo único no
--      determinista de la entrada: `sueldo_movimientos_lista` ordena sólo por fecha, y dos
--      adelantos del mismo día salen en cualquier orden):
--        5a. dos adelantos del mismo día guardados en el orden inverso → cierra;
--        5b. el helper `private.sueldo_entrada_normalizada` iguala los dos órdenes;
--        5c. `sueldo_entrada` llamada dos veces seguidas da lo mismo (no hay marcas de tiempo);
--        5e. los números se comparan en doble precisión (lo que sobrevive al paso por JavaScript
--            de crearBorrador): un parámetro de más de 16 dígitos no bloquea el cierre;
--        5d. cambiar un escalar (`modalidad`) en la entrada guardada NO se ignora: se rechaza y
--            nombra `modalidad`.
--   6. El mensaje va en español neutral: dice «vuelve a calcular», nunca «volvé».
--
-- QUÉ NO PRUEBA. El desglose del motor (packages/core/src/sueldos.ts): `resultado` lleva UNA línea
-- fake, porque `sueldo_liquidacion_cerrar` corta con «no hay nada que congelar» si no hay líneas.
-- Tampoco prueba el botón de la pantalla (es TypeScript).
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. Todo en el año 2099.
--
-- OJO — mismo aviso que las pruebas de la 0073/0093: `sueldo_entrada` y `sueldo_liquidacion_cerrar`
-- exigen `private.app_es_admin()`, que lee `auth.uid()`. El editor SQL corre con `auth.uid()` en
-- null, así que sin el `set_config('request.jwt.claims', ...)` de más abajo todo devuelve PERMISO.
-- Correr el archivo ENTERO de una sola vez.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0111
-- (o pegar el archivo entero en el SQL editor de Supabase y leer el error P0001 «RESULTADO 0111»)

-- Dos ayudantes de montaje, temporales (mueren con la sesión; no dejan nada en el esquema).
create or replace function pg_temp.montar(p_adm uuid, p_desde date, p_hasta date)
returns uuid language plpgsql as $f$
declare ac uuid;
begin
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (p_adm, p_desde, p_hasta, 'semanal', 440, 'vigente', p_adm)
    returning id into ac;

  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, h.desde, h.hasta
  from generate_series(1,7) d,
       (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);

  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
  select p_adm, d::date, t.turno, 'trabajado', t.desde, t.hasta, 'manual'
  from generate_series(p_desde, p_hasta, interval '1 day') d,
       (values ('M', time '09:00', time '13:00'), ('T', time '13:00', time '20:00')) as t(turno, desde, hasta);

  return ac;
end $f$;

-- Guarda el borrador como lo hace crearBorrador(): la entrada es la que devuelve sueldo_entrada.
create or replace function pg_temp.guardar_borrador(p_ac uuid, p_adm uuid, p_desde date, p_hasta date)
returns uuid language plpgsql as $f$
declare liq uuid;
begin
  insert into sueldo_liquidaciones(
    acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
    entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
  ) values (
    p_ac, p_adm, p_desde, p_hasta, 'borrador',
    sueldo_entrada(p_ac, p_desde, p_hasta), '{}'::jsonb,
    '{"lineas":[{"grupo":"ingreso","concepto":"Sueldo","detalle":"prueba 0111","regla":"RN-19","monto":440}]}'::jsonb,
    440, 5.000000, 'prueba-0111'
  ) returning id into liq;
  return liq;
end $f$;

do $$
declare
  adm      uuid;
  ac       uuid;
  liq      uuid;
  v_msg    text;
  v_estado text;
  v_sell   int;
  v_json   jsonb;
  v_otro   jsonb;
  r        text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ═══ Caso 1 — adelanto borrado y recargado con OTRO monto (mismo conteo) ═════════════════════
  begin
    ac := pg_temp.montar(adm, '2099-11-01', '2099-11-04');
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2099-11-02', 'adelanto', 100, 'prueba 0111 caso 1: adelanto original', adm);
    liq := pg_temp.guardar_borrador(ac, adm, '2099-11-01', '2099-11-04');

    delete from sueldo_movimientos
     where empleado_id = adm and fecha = '2099-11-02' and tipo = 'adelanto' and liquidacion_id is null;
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2099-11-02', 'adelanto', 300, 'prueba 0111 caso 1: adelanto recargado', adm);

    begin
      perform sueldo_liquidacion_cerrar(liq);
      r := r || '[FALLA] caso1: cerro con un adelanto de S/300 que el borrador no tiene (sellaba el monto equivocado); ';
    exception when others then
      v_msg := sqlerrm;
      select estado into v_estado from sueldo_liquidaciones where id = liq;
      select count(*) into v_sell from sueldo_movimientos where liquidacion_id = liq;
      if v_msg like 'DESACTUALIZADA:%' and v_msg like '%adelantos%' and v_estado = 'borrador' and v_sell = 0 then
        r := r || '[ok] caso1: mismo conteo y otro monto se rechaza, nombra adelantos y no sella nada; ';
      else
        r := r || format('[FALLA] caso1: esperaba DESACTUALIZADA nombrando adelantos, borrador y 0 sellados; vino "%s", estado=%s, sellados=%s; ',
                         v_msg, v_estado, v_sell);
      end if;
      -- OJO: el estado y los sellados se leen DESPUÉS de que el subbloque volvió a su savepoint, así
      -- que `borrador` y `0 sellados` se cumplirían aunque la función hubiera sellado antes de
      -- lanzar. Lo que garantiza «no sella nada» es el ORDEN: la comparación va antes de «1) Las
      -- líneas» y del sellado en la función (revisado en el cuerpo de la migración).
      -- Caso 6 — el texto va en español neutral.
      if v_msg like '%vuelve a calcular%' and v_msg not like '%volvé%' then
        r := r || '[ok] caso6: el mensaje dice "vuelve a calcular", sin voseo; ';
      else
        r := r || format('[FALLA] caso6: el mensaje deberia decir "vuelve a calcular" y vino "%s"; ', v_msg);
      end if;
    end;
  exception when others then
    r := r || format('[FALLA] caso1: el montaje no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 2 — una hora de asistencia cambia después de calcular ═══════════════════════════════
  begin
    ac := pg_temp.montar(adm, '2099-11-11', '2099-11-14');
    liq := pg_temp.guardar_borrador(ac, adm, '2099-11-11', '2099-11-14');

    update asistencias set hora_salida = time '19:00'
     where empleado_id = adm and fecha = '2099-11-12' and turno = 'T';

    begin
      perform sueldo_liquidacion_cerrar(liq);
      r := r || '[FALLA] caso2: cerro con la asistencia vieja; ';
    exception when others then
      v_msg := sqlerrm;
      select estado into v_estado from sueldo_liquidaciones where id = liq;
      if v_msg like 'DESACTUALIZADA:%' and v_msg like '%asistencia%' and v_estado = 'borrador' then
        r := r || '[ok] caso2: la asistencia corregida despues de calcular se rechaza y nombra asistencia; ';
      else
        r := r || format('[FALLA] caso2: esperaba DESACTUALIZADA nombrando asistencia y vino "%s" (estado=%s); ',
                         v_msg, v_estado);
      end if;
    end;
  exception when others then
    r := r || format('[FALLA] caso2: el montaje no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 3 — nada cambió: cierra igual que hoy (regresión) ═══════════════════════════════════
  begin
    ac := pg_temp.montar(adm, '2099-11-21', '2099-11-24');
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2099-11-22', 'adelanto', 100, 'prueba 0111 caso 3', adm);
    liq := pg_temp.guardar_borrador(ac, adm, '2099-11-21', '2099-11-24');

    v_json := sueldo_liquidacion_cerrar(liq);
    select estado into v_estado from sueldo_liquidaciones where id = liq;
    select count(*) into v_sell from sueldo_movimientos where liquidacion_id = liq;
    if v_estado = 'cerrada' and v_json->>'estado' = 'cerrada' and (v_json->>'lineas')::int = 1 and v_sell = 1 then
      r := r || '[ok] caso3: sin cambios cierra, congela 1 linea y sella el adelanto; ';
    else
      r := r || format('[FALLA] caso3: esperaba cerrada, 1 linea y 1 sellado; vino estado=%s lineas=%s sellados=%s; ',
                       v_estado, v_json->>'lineas', v_sell);
    end if;
  exception when others then
    r := r || format('[FALLA] caso3: cerrar sin cambios no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 4 — datos cambiados → descartar, recalcular, cerrar: sella el monto NUEVO ═══════════
  begin
    ac := pg_temp.montar(adm, '2099-12-01', '2099-12-04');
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2099-12-02', 'adelanto', 100, 'prueba 0111 caso 4: original', adm);
    liq := pg_temp.guardar_borrador(ac, adm, '2099-12-01', '2099-12-04');

    delete from sueldo_movimientos
     where empleado_id = adm and fecha = '2099-12-02' and tipo = 'adelanto' and liquidacion_id is null;
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2099-12-02', 'adelanto', 300, 'prueba 0111 caso 4: recargado', adm);

    -- Es lo que hace «Recalcular borrador»: descartar el borrador y guardar uno nuevo.
    delete from sueldo_liquidaciones where id = liq;
    liq := pg_temp.guardar_borrador(ac, adm, '2099-12-01', '2099-12-04');

    perform sueldo_liquidacion_cerrar(liq);
    select estado into v_estado from sueldo_liquidaciones where id = liq;
    select entrada into v_json from sueldo_liquidaciones where id = liq;
    select count(*) into v_sell from sueldo_movimientos
     where liquidacion_id = liq and monto = 300;
    if v_estado = 'cerrada' and (v_json->'adelantos'->0->>'monto')::numeric = 300 and v_sell = 1 then
      r := r || '[ok] caso4: recalcular y cerrar sale bien y sella el adelanto nuevo de S/300; ';
    else
      r := r || format('[FALLA] caso4: esperaba cerrada con el adelanto de 300 dentro de la entrada y sellado; vino estado=%s monto_en_entrada=%s sellados_300=%s; ',
                       v_estado, v_json->'adelantos'->0->>'monto', v_sell);
    end if;
  exception when others then
    r := r || format('[FALLA] caso4: recalcular y cerrar no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 5 — qué se ignora (sólo el orden de los arreglos) y qué no ══════════════════════════
  begin
    ac := pg_temp.montar(adm, '2100-01-01', '2100-01-04');
    insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
      values (adm, '2100-01-02', 'adelanto', 100, 'prueba 0111 caso 5: primero', adm),
             (adm, '2100-01-02', 'adelanto', 200, 'prueba 0111 caso 5: segundo', adm);
    liq := pg_temp.guardar_borrador(ac, adm, '2100-01-01', '2100-01-04');

    -- 5c — sin marcas de tiempo: dos llamadas seguidas dan lo mismo.
    v_json := sueldo_entrada(ac, '2100-01-01', '2100-01-04');
    v_otro := sueldo_entrada(ac, '2100-01-01', '2100-01-04');
    if private.sueldo_entrada_normalizada(v_json) = private.sueldo_entrada_normalizada(v_otro) then
      r := r || '[ok] caso5c: dos llamadas seguidas a sueldo_entrada dan la misma entrada; ';
    else
      r := r || '[FALLA] caso5c: sueldo_entrada tiene un campo que cambia entre llamadas; ';
    end if;

    -- 5b — el helper iguala los dos órdenes de los adelantos del mismo día.
    -- Los dos órdenes se arman EXPLÍCITOS: el que sale de sueldo_entrada no está garantizado.
    v_json := jsonb_set(v_json, '{adelantos}',
                (select jsonb_agg(e order by e) from jsonb_array_elements(v_json->'adelantos') e));
    v_otro := jsonb_set(v_json, '{adelantos}',
                (select jsonb_agg(e order by e desc) from jsonb_array_elements(v_json->'adelantos') e));
    if v_otro->'adelantos' <> v_json->'adelantos'
       and private.sueldo_entrada_normalizada(v_otro) = private.sueldo_entrada_normalizada(v_json) then
      r := r || '[ok] caso5b: el helper iguala dos ordenes distintos de los adelantos; ';
    else
      r := r || '[FALLA] caso5b: el helper deberia igualar los dos ordenes (y el montaje deberia haberlos invertido); ';
    end if;

    -- 5e — los números se comparan como los ve el motor (double): un parámetro con más de 16
    -- dígitos, que pierde precisión al pasar por JavaScript en crearBorrador, NO es un cambio.
    -- Un monto distinto sí lo es.
    if private.sueldo_entrada_normalizada('{"parametros":{"metaPorHora":45.454545454545454545}}'::jsonb)
         = private.sueldo_entrada_normalizada('{"parametros":{"metaPorHora":45.45454545454545}}'::jsonb)
       and private.sueldo_entrada_normalizada('{"adelantos":[{"monto":100}]}'::jsonb)
         <> private.sueldo_entrada_normalizada('{"adelantos":[{"monto":300}]}'::jsonb) then
      r := r || '[ok] caso5e: la precision extra de un numero no cuenta como cambio, un monto distinto si; ';
    else
      r := r || '[FALLA] caso5e: los numeros deberian compararse en doble precision; ';
    end if;

    -- 5a — guardado en el orden inverso, cierra.
    update sueldo_liquidaciones set entrada = v_otro where id = liq;
    perform sueldo_liquidacion_cerrar(liq);
    select estado into v_estado from sueldo_liquidaciones where id = liq;
    if v_estado = 'cerrada' then
      r := r || '[ok] caso5a: dos adelantos del mismo dia en otro orden no bloquean el cierre; ';
    else
      r := r || format('[FALLA] caso5a: esperaba cerrada y quedo %s; ', v_estado);
    end if;
  exception when others then
    r := r || format('[FALLA] caso5a/b/c: no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- 5d — un escalar distinto NO se ignora.
  begin
    ac := pg_temp.montar(adm, '2100-01-11', '2100-01-14');
    liq := pg_temp.guardar_borrador(ac, adm, '2100-01-11', '2100-01-14');
    update sueldo_liquidaciones set entrada = jsonb_set(entrada, '{modalidad}', '"mensual"') where id = liq;

    begin
      perform sueldo_liquidacion_cerrar(liq);
      r := r || '[FALLA] caso5d: cerro con una modalidad distinta a la que se calcularia ahora; ';
    exception when others then
      v_msg := sqlerrm;
      if v_msg like 'DESACTUALIZADA:%' and v_msg like '%modalidad%' then
        r := r || '[ok] caso5d: un escalar distinto no se ignora y se nombra en el mensaje; ';
      else
        r := r || format('[FALLA] caso5d: esperaba DESACTUALIZADA nombrando modalidad y vino "%s"; ', v_msg);
      end if;
    end;
  exception when others then
    r := r || format('[FALLA] caso5d: el montaje no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0111 --> %', r;
end $$;
