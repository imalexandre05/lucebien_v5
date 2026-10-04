-- Prueba de la migración 0093_liquidacion_por_tramos.sql
--
-- Ataca los ocho casos de la tabla de la spec
-- (docs/superpowers/specs/sueldos/2026-08-24-liquidacion-por-tramos-design.md §5) MÁS los tres del
-- addendum §7 (F-2 y F-6), agregados tras la revisión adversarial del 24-ago-2026:
--   1. liquidar sólo julio de un acuerdo mensual de 3 meses devuelve el TRAMO exacto, no el acuerdo
--      entero (sueldoPactado viaja tal cual, sin prorratear — es el motor quien lo divide).
--   2. julio (cerrada) y agosto (borrador) del mismo acuerdo conviven, sin chocar.
--   3. un tramo que se pisa con julio Y con agosto (15-jul a 15-ago) rechaza por la restricción de
--      exclusión nueva, nombrándola — es lo que sueldos-repo.ts busca en el mensaje para traducirlo.
--   4. p_desde/p_hasta iguales a fecha_inicio/fecha_fin del acuerdo da el mismo resultado que la
--      llamada de un solo parámetro que reemplaza esta migración (sin regresión).
--   5. un rango que se sale de los bordes del acuerdo (o con p_hasta antes de p_desde) corta con
--      DATO:, antes de llegar al trigger sueldo_liq_coherente.
--   6. anular la liquidación de julio y volver a liquidar el mismo período funciona.
--   7. agosto sin ninguna asistencia declarada no impide liquidar julio (el control de "día sin
--      declarar" de la 0085 sólo mira el rango pedido, no el acuerdo completo).
--   8. (fuera de alcance, documentado) un día con dos tramos no se puede partir entre dos
--      liquidaciones: el rango se resuelve por fecha completa.
--   F6. liquidar sólo julio no arrastra el adelanto ni la venta que el montaje deja en agosto, y el
--       día de agosto declarado 'trabajado' Y 'sin_dato' a la vez (día a medio declarar) no corta
--       la liquidación de julio porque queda FUERA del rango pedido. Sin este caso, los ocho de
--       arriba seguirían en [ok] aunque alguna de las cinco conversiones a p_desde/p_hasta (los
--       tres `private.sueldo_movimientos_*`, el `between` de sueldo_ventas o el de v_mixtos) se
--       hubiera quedado sin convertir.
--   F2a. cerrar el tramo de julio (1 de 3) NO marca el acuerdo completo como liquidado: sigue
--       'vigente', porque ese tramo no llega a fecha_fin del acuerdo.
--   F2b. cerrar un tramo cuyo periodo_hasta SÍ llega a fecha_fin del acuerdo (septiembre, el tramo
--       final) recién ahí lo marca 'liquidado'.
--
-- QUÉ NO PRUEBA. No reproduce el desglose real del motor (packages/core/src/sueldos.ts, sin
-- cambios, spec §1). Los casos 2/3/6/F2a/F2b insertan directo en `sueldo_liquidaciones` (bypaseando
-- RLS como superusuario, igual que el resto del montaje de esta prueba) con snapshots mínimos —
-- F2a/F2b con UNA línea fake en `resultado`, porque `sueldo_liquidacion_cerrar` corta con "no hay
-- nada que congelar" si el array viene vacío. Lo que se está probando en 2/3/6 es la restricción de
-- exclusión `sueldo_liq_periodo_sin_solape`; en F2a/F2b, la condición nueva sobre
-- `sueldo_acuerdos.estado` (addendum F-2). Ninguno de los dos reproduce el cálculo. Tampoco prueba
-- la TRADUCCIÓN del mensaje en sueldos-repo.ts (es TypeScript, no corre acá): prueba el
-- PREREQUISITO del que depende esa traducción — que el error real sea 23P01 y mencione el nombre de
-- la restricción nueva.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la salida
-- esperada.
--
-- OJO — mismo aviso que las pruebas de la 0073/0080/0085 (docs/aprendizajes.md, fila del 22-ago):
-- `sueldo_entrada` exige `private.app_es_admin()` adentro, que lee `auth.uid()`. El editor SQL de
-- Supabase corre con `auth.uid()` en null, así que sin el `set_config('request.jwt.claims', ...)`
-- de más abajo TODO devuelve PERMISO y la prueba no comprueba nada. Correr el archivo ENTERO de una
-- sola vez: ese `set_config(..., true)` vale sólo dentro de esta misma transacción.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0093
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0093")

do $$
declare
  adm            uuid;
  ac             uuid;   -- acuerdo largo (3 meses, mensual) — casos 1,2,3,5,6,7,8,F6,F2a,F2b
  ac2            uuid;   -- acuerdo corto (4 días), mismo patrón que 0085 — caso 4 (sin regresión)
  liq_julio      uuid;
  liq_agosto     uuid;
  liq_julio2     uuid;   -- la liquidacion de julio que deja el caso 6 (anular + reliquidar); F2a la cierra
  liq_septiembre uuid;   -- tramo final del acuerdo, addendum F2b
  v_json         jsonb;
  v_msg          text;
  v_dias         int;
  v_tramos       int;
  v_estado       text;   -- addendum F2a/F2b: estado de sueldo_acuerdos despues de cerrar un tramo
  r              text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje 1: acuerdo largo, escenario de Marylin tras C-5 (mensual, sueldo_pactado=600) ────
  -- Sólo julio queda con asistencia declarada. Agosto y septiembre se dejan VACÍOS a propósito:
  -- es lo que necesita el caso 7 (liquidar julio no puede exigir que agosto ya esté cargado).
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (adm, '2099-07-01', '2099-09-30', 'mensual', 600, 'vigente', adm)
    returning id into ac;

  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, h.desde, h.hasta
  from generate_series(1,7) d,
       (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);

  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
  select adm, d::date, t.turno, 'trabajado', t.desde, t.hasta, 'manual'
  from generate_series('2099-07-01'::date, '2099-07-31'::date, interval '1 day') d,
       (values ('M', time '09:00', time '13:00'), ('T', time '13:00', time '20:00')) as t(turno, desde, hasta);

  -- ── Montaje 2: acuerdo corto (4 días), mismo patrón que 0085 — para el caso 4 ────────────────
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (adm, '2099-10-01', '2099-10-04', 'semanal', 440, 'vigente', adm)
    returning id into ac2;

  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac2, d, h.desde, h.hasta
  from generate_series(1,7) d,
       (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);

  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
  select adm, d::date, t.turno, 'trabajado', t.desde, t.hasta, 'manual'
  from generate_series('2099-10-01'::date, '2099-10-04'::date, interval '1 day') d,
       (values ('M', time '09:00', time '13:00'), ('T', time '13:00', time '20:00')) as t(turno, desde, hasta);

  -- ── Montaje 3 (addendum F-6): un adelanto y una venta en AGOSTO, y un día de agosto declarado a
  --    medias ('trabajado' Y 'sin_dato' el mismo día) — nada de esto lo toca julio, así que sirve
  --    para comprobar que liquidar julio no arrastra nada de agosto y no corta por el día mixto.
  insert into sueldo_movimientos(empleado_id, fecha, tipo, monto, motivo, creado_por)
    values (adm, '2099-08-10', 'adelanto', 50, 'prueba 0093 addendum F-6: adelanto de agosto', adm);

  insert into sueldo_ventas(origen, fecha, monto, tipo, empleado_id)
    values ('manual', '2099-08-12', 300, 'venta', adm);

  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    values
      (adm, '2099-08-15', 'M', 'trabajado', time '09:00', time '13:00', 'manual'),
      (adm, '2099-08-15', 'T', 'sin_dato',  null,         null,         'manual');

  r := r || 'montaje=ok; ';

  -- ═══ Caso 1 + Caso 7 — liquidar sólo julio; agosto/septiembre siguen sin declarar ═══════════
  begin
    v_json := sueldo_entrada(ac, '2099-07-01', '2099-07-31');
    v_dias := jsonb_array_length(v_json->'asistencia');

    if v_json->>'fechaInicio' <> '2099-07-01' or v_json->>'fechaFin' <> '2099-07-31' then
      r := r || format('[FALLA] caso1: fechaInicio/fechaFin del snapshot deberian ser las del tramo y vino %s a %s; ',
                        v_json->>'fechaInicio', v_json->>'fechaFin');
    elsif (v_json->>'sueldoPactado')::numeric <> 600 then
      r := r || format('[FALLA] caso1: sueldoPactado deberia viajar tal cual (600, sin prorratear) y vino %s; ',
                        v_json->>'sueldoPactado');
    elsif v_dias <> 31 then
      r := r || format('[FALLA] caso1: julio tiene 31 dias contratados y vinieron %s; ', v_dias);
    else
      r := r || '[ok] caso1: liquidar solo julio devuelve el tramo exacto (31 dias, sueldoPactado=600 sin prorratear); ';
    end if;

    -- Si llegó hasta acá sin lanzar DATO por dias sin declarar, es porque agosto/septiembre
    -- (vacíos a propósito) no se exigieron: eso es exactamente el caso 7.
    r := r || '[ok] caso7: no exigio declarar agosto/septiembre para poder liquidar julio; ';
  exception when others then
    r := r || format('[FALLA] caso1/caso7: liquidar julio con agosto sin declarar no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 2 — julio (cerrada) y agosto (borrador) del mismo acuerdo conviven ═════════════════
  begin
    insert into sueldo_liquidaciones(
      acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
    ) values (
      ac, adm, '2099-07-01', '2099-07-31', 'cerrada',
      '{}'::jsonb, '{}'::jsonb, '{"lineas":[]}'::jsonb, 600, 3.870000, 'prueba-0093'
    ) returning id into liq_julio;

    insert into sueldo_liquidaciones(
      acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
    ) values (
      ac, adm, '2099-08-01', '2099-08-31', 'borrador',
      '{}'::jsonb, '{}'::jsonb, '{"lineas":[]}'::jsonb, 600, 3.870000, 'prueba-0093'
    ) returning id into liq_agosto;

    r := r || '[ok] caso2: julio (cerrada) y agosto (borrador) del mismo acuerdo conviven, sin choque; ';
  exception when others then
    r := r || format('[FALLA] caso2: dos tramos que NO se pisan deberian convivir y choco con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 3 — 15-jul a 15-ago se pisa con julio Y con agosto: rechaza nombrando la restricción
  --     nueva (sueldo_liq_periodo_sin_solape) — es lo que sueldos-repo.ts busca para traducir el
  --     mensaje crudo de Postgres en uno legible (no se prueba la traducción en sí: es TypeScript,
  --     no corre acá) ═══════════════════════════════════════════════════════════════════════════
  begin
    insert into sueldo_liquidaciones(
      acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
    ) values (
      ac, adm, '2099-07-15', '2099-08-15', 'borrador',
      '{}'::jsonb, '{}'::jsonb, '{"lineas":[]}'::jsonb, 600, 3.870000, 'prueba-0093'
    );
    r := r || '[FALLA] caso3: un tramo que se pisa con julio y con agosto no deberia poder insertarse; ';
  exception when others then
    if sqlstate = '23P01' and sqlerrm like '%sueldo_liq_periodo_sin_solape%' then
      r := r || '[ok] caso3: el solape rechaza con 23P01 nombrando sueldo_liq_periodo_sin_solape; ';
    else
      r := r || format('[FALLA] caso3: esperaba 23P01 mencionando sueldo_liq_periodo_sin_solape y vino sqlstate=%s "%s"; ',
                        sqlstate, sqlerrm);
    end if;
  end;

  -- ═══ Caso 4 — p_desde/p_hasta = bordes del acuerdo: idéntico a la llamada de un solo parámetro
  --     que esta migración reemplaza (mismo escenario que ya probaba 0085: 4 días, 2 tramos) ═════
  begin
    v_json := sueldo_entrada(ac2, '2099-10-01', '2099-10-04');
    v_dias := jsonb_array_length(v_json->'asistencia');
    select jsonb_array_length(elem->'tramos') into v_tramos
    from jsonb_array_elements(v_json->'asistencia') elem
    where elem->>'fecha' = '2099-10-01';

    if v_dias = 4 and v_tramos = 2 then
      r := r || '[ok] caso4: p_desde/p_hasta iguales a los bordes del acuerdo da el mismo resultado que antes (4 dias, 2 tramos); ';
    else
      r := r || format('[FALLA] caso4: esperaba 4 dias y 2 tramos, vino dias=%s tramos=%s; ', v_dias, v_tramos);
    end if;
  exception when others then
    r := r || format('[FALLA] caso4: con el rango completo no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 5 — el rango pedido se sale de los bordes del acuerdo, o p_hasta es anterior a
  --     p_desde: corta con DATO, sin llegar al trigger sueldo_liq_coherente ═══════════════════════
  begin
    v_json := sueldo_entrada(ac, '2099-06-25', '2099-07-10');
    r := r || '[FALLA] caso5: un p_desde anterior a fecha_inicio del acuerdo no corto; ';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'DATO:%' and v_msg like '%se sale del acuerdo%' then
      r := r || '[ok] caso5: p_desde anterior al inicio del acuerdo corta con DATO, antes del trigger; ';
    else
      r := r || format('[FALLA] caso5: esperaba "DATO:...se sale del acuerdo..." y vino "%s"; ', v_msg);
    end if;
  end;

  begin
    v_json := sueldo_entrada(ac, '2099-07-10', '2099-07-05');
    r := r || '[FALLA] caso5b: p_hasta anterior a p_desde no corto; ';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'DATO:el rango pedido no es válido%' then
      r := r || '[ok] caso5b: p_hasta anterior a p_desde corta con su propio DATO, antes de tocar ninguna tabla; ';
    else
      r := r || format('[FALLA] caso5b: esperaba "DATO:el rango pedido no es válido..." y vino "%s"; ', v_msg);
    end if;
  end;

  -- ═══ Caso 6 — anular la liquidación de julio y volver a liquidar el mismo período ═══════════
  -- La liquidacion nueva queda en liq_julio2 (antes no se guardaba el id) con UNA linea real en
  -- `resultado`, no vacio: el caso F2a de mas abajo la va a cerrar, y sueldo_liquidacion_cerrar
  -- corta con "no hay nada que congelar" si el array de lineas viene vacio. Este mismo caso 6 no
  -- verifica el contenido de `resultado`, asi que no cambia nada de lo que ya prueba.
  begin
    update sueldo_liquidaciones
       set estado = 'anulada', anulada_en = now(), anulada_por = adm,
           anulada_motivo = 'prueba 0093: anular para reliquidar'
     where id = liq_julio;

    insert into sueldo_liquidaciones(
      acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
    ) values (
      ac, adm, '2099-07-01', '2099-07-31', 'borrador',
      -- Desde la 0110 el cierre recalcula la entrada y la compara: un `{}` ya no cierra. Se guarda
      -- la entrada real, como hace crearBorrador().
      sueldo_entrada(ac, '2099-07-01', '2099-07-31'), '{}'::jsonb,
      '{"lineas":[{"grupo":"ingreso","concepto":"Sueldo","detalle":"prueba 0093","regla":"RN-19","monto":600}]}'::jsonb,
      600, 3.870000, 'prueba-0093'
    ) returning id into liq_julio2;

    r := r || '[ok] caso6: anular julio y volver a liquidar el mismo periodo funciona, igual que con un acuerdo entero; ';
  exception when others then
    r := r || format('[FALLA] caso6: anular y reliquidar julio no deberia chocar y choco con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso 8 (fuera de alcance, documentado) — un día con dos tramos no se puede partir entre
  --     dos liquidaciones: el rango se resuelve por FECHA completa, no por medio día. No hay forma
  --     de pedir "sólo la mañana del 31" vía p_desde/p_hasta — se documenta el límite, no se
  --     bloquea (spec §5, caso 8) ════════════════════════════════════════════════════════════════
  begin
    v_json := sueldo_entrada(ac, '2099-07-01', '2099-07-31');
    select jsonb_array_length(elem->'tramos') into v_tramos
    from jsonb_array_elements(v_json->'asistencia') elem
    where elem->>'fecha' = '2099-07-31';

    if v_tramos = 2 then
      r := r || '[ok] caso8 (fuera de alcance, documentado): el ultimo dia del rango trae sus dos tramos completos; un dia no se puede partir entre dos liquidaciones; ';
    else
      r := r || format('[FALLA] caso8: el ultimo dia del rango deberia traer 2 tramos completos y trajo %s; ', v_tramos);
    end if;
  exception when others then
    r := r || format('[FALLA] caso8: no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Casos del addendum (24-ago-2026, revisión adversarial) ══════════════════════════════════

  -- ═══ Caso F6 — liquidar julio no arrastra el adelanto ni la venta de agosto (montaje 3), y el
  --     dia mixto del 15 de agosto (trabajado + sin_dato) no corta por "tramos sin cerrar" porque
  --     queda FUERA del rango pedido. Si alguna de las conversiones a p_desde/p_hasta se hubiera
  --     quedado sin hacer, este caso fallaria aunque los 8 de arriba sigan en [ok] ═══════════════
  begin
    v_json := sueldo_entrada(ac, '2099-07-01', '2099-07-31');
    if v_json->'adelantos' = '[]'::jsonb and v_json->'ventas' = '[]'::jsonb then
      r := r || '[ok] casoF6: liquidar julio no arrastra el adelanto ni la venta de agosto; ';
    else
      r := r || format('[FALLA] casoF6: liquidar julio deberia dar adelantos y ventas vacios (son de agosto) y vino adelantos=%s ventas=%s; ',
                        v_json->'adelantos', v_json->'ventas');
    end if;
  exception when others then
    r := r || format('[FALLA] casoF6: liquidar julio no deberia cortar por el dia mixto de agosto (esta fuera del rango) y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso F2a — cerrar el tramo de julio (1 de 3) NO marca el acuerdo completo como liquidado:
  --     el tramo cerrado no llega a fecha_fin del acuerdo (2099-09-30), asi que sigue 'vigente' ═══
  begin
    perform sueldo_liquidacion_cerrar(liq_julio2);

    select estado into v_estado from sueldo_acuerdos where id = ac;
    if v_estado = 'vigente' then
      r := r || '[ok] casoF2a: cerrar el tramo de julio (1 de 3) deja el acuerdo en vigente, no en liquidado; ';
    else
      r := r || format('[FALLA] casoF2a: cerrar julio deberia dejar el acuerdo en vigente y quedo en "%s"; ', v_estado);
    end if;
  exception when others then
    r := r || format('[FALLA] casoF2a: cerrar el tramo de julio no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  -- ═══ Caso F2b — cerrar un tramo cuyo periodo_hasta SI llega a fecha_fin del acuerdo (septiembre,
  --     el tramo final) recien ahi lo marca 'liquidado' ══════════════════════════════════════════
  begin
    -- Desde la 0110 el cierre recalcula la entrada: septiembre necesita su asistencia declarada
    -- (si no, sueldo_entrada corta con DATO) y el borrador guarda la entrada real.
    insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    select adm, d::date, t.turno, 'trabajado', t.desde, t.hasta, 'manual'
    from generate_series('2099-09-01'::date, '2099-09-30'::date, interval '1 day') d,
         (values ('M', time '09:00', time '13:00'), ('T', time '13:00', time '20:00')) as t(turno, desde, hasta);

    insert into sueldo_liquidaciones(
      acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado,
      entrada, parametros_usados, resultado, total, valor_por_hora, motor_version
    ) values (
      ac, adm, '2099-09-01', '2099-09-30', 'borrador',
      sueldo_entrada(ac, '2099-09-01', '2099-09-30'), '{}'::jsonb,
      '{"lineas":[{"grupo":"ingreso","concepto":"Sueldo","detalle":"prueba 0093","regla":"RN-19","monto":600}]}'::jsonb,
      600, 3.870000, 'prueba-0093'
    ) returning id into liq_septiembre;

    perform sueldo_liquidacion_cerrar(liq_septiembre);

    select estado into v_estado from sueldo_acuerdos where id = ac;
    if v_estado = 'liquidado' then
      r := r || '[ok] casoF2b: cerrar el tramo que llega a fecha_fin del acuerdo lo marca liquidado; ';
    else
      r := r || format('[FALLA] casoF2b: cerrar el tramo final deberia dejar el acuerdo en liquidado y quedo en "%s"; ', v_estado);
    end if;
  exception when others then
    r := r || format('[FALLA] casoF2b: cerrar el tramo de septiembre no deberia cortar y corto con "%s"; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0093 --> %', r;
end $$;
