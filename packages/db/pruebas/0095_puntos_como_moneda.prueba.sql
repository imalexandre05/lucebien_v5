-- Prueba de la migración 0095_puntos_como_moneda.sql
--
-- Ataca los casos "contra la base" de la spec
-- (docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-design.md §7 y §8.1) sobre
-- `private.evaluacion_componentes_datos` — la misma función que ya probó packages/db/pruebas/
-- 0091_evaluacion_equipo_y_puntualidad.prueba.sql; acá sólo se cubren las claves nuevas del
-- desglose de puntos. El envoltorio `public.evaluacion_componentes` no se toca y no hace falta
-- simular ningún usuario ni setear `request.jwt.claims` para comprobar la LÓGICA que cambió.
--
--   · puntosActividades: la MISMA cte `acts` que ya usa la función, multiplicada por
--     `pts_actividad_cumplida` — y, sin otra fuente de puntos, puntosTotal coincide con ella.
--   · puntosVentas / ventasSinTasa: las TRES formas de "sin tasa" que describe la migración —
--     la clave no existe, la clave existe pero está vacía — dan 0 puntos y ventasSinTasa=true; con
--     un valor real da el producto y ventasSinTasa vuelve a false.
--   · puntosTotal: pipeline + extras + actividades + ventas − descuento(incidencias), combinado.
--   · evaluaciones_mensuales.metodo: una fila nueva sin especificarlo cae en 'ponderado' — el mismo
--     default que protege a cualquier fila que ya existiera antes de esta migración — y
--     puntos_total queda nulo.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila — incluidos los cambios que
-- este archivo le hace a `config` (pts_actividad_cumplida / pts_por_sol_vendido quedan tal como
-- estaban en la base real antes de correr esta prueba).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0095
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0095")

do $$
declare
  v_sede         text;
  emp_act        uuid;
  emp_total      uuid;
  emp_vta        uuid;
  v_rep_act      text;
  v_rep_total    text;
  v_fecha        date := date '2099-09-10';
  j              jsonb;
  v_metodo       text;
  v_puntos_total numeric;
  r              text := '';
begin
  -- ── Una sede real para colgar los reportes de prueba (la FK de `reportes` lo exige) ──────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  -- ── Tres empleados de prueba. Ninguno real, ninguno queda: la transacción se descarta ─────────
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0095-ACT', 'Prueba 0095 Actividades', 'Q1') returning id into emp_act;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0095-TOT', 'Prueba 0095 Total',       'Q2') returning id into emp_total;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0095-VTA', 'Prueba 0095 Ventas',      'Q3') returning id into emp_vta;

  r := r || 'montaje-empleados=ok; ';

  -- ═══ puntosActividades — reusa la CTE `acts`, sin otra fuente de puntos ══════════════════════
  -- pts_actividad_cumplida pineado a 2 (no al default 1) para que la multiplicación no se pueda
  -- confundir con una identidad. Suma de calificaciones: 1.00 + 0.60 = 1.60 → esperado 3.20.
  insert into config (clave, valor) values ('pts_actividad_cumplida', '2')
    on conflict (clave) do update set valor = excluded.valor;

  v_rep_act := to_char(v_fecha, 'DD-MM-YY') || '_M-ACT-' || v_sede;
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, evaluado)
    values (v_rep_act, v_sede, 'M', v_fecha, emp_act, true);
  insert into reporte_actividades (reporte_id, cod, nombre, cat, calificacion) values
    (v_rep_act, 'IND1', 'Limpieza de prueba', 'IND',  1.00),
    (v_rep_act, 'AS1',  'Software de prueba',  'SOFT', 0.60);

  begin
    j := private.evaluacion_componentes_datos(emp_act, v_fecha, v_fecha);
    if (j->>'puntosActividades')::numeric = 3.20 then
      r := r || '[ok] puntosActividades: (1.00+0.60) x 2 = 3.20; ';
    else
      r := r || format('[FALLA] puntosActividades=%s (esperaba 3.20); ', j->>'puntosActividades');
    end if;
    -- Sin ninguna otra fuente de puntos, el total del período tiene que coincidir exactamente.
    if (j->>'puntosTotal')::numeric = 3.20 then
      r := r || '[ok] puntosTotal: sin otra fuente, coincide con puntosActividades; ';
    else
      r := r || format('[FALLA] puntosTotal=%s (esperaba 3.20, sin otra fuente de puntos); ', j->>'puntosTotal');
    end if;
  exception when others then
    r := r || format('[FALLA] puntosActividades lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- ═══ puntosVentas / ventasSinTasa — las dos formas de "sin tasa" y la del valor real ═════════
  insert into sueldo_ventas (empleado_id, fecha, monto) values
    (emp_vta, v_fecha, 100),
    (emp_vta, v_fecha, 150);
  -- total = 250

  -- 1) La clave no existe en absoluto.
  delete from config where clave = 'pts_por_sol_vendido';
  begin
    j := private.evaluacion_componentes_datos(emp_vta, v_fecha, v_fecha);
    if (j->>'puntosVentas')::numeric = 0 and (j->>'ventasSinTasa')::boolean = true then
      r := r || '[ok] ventas sin fila de config: 0 puntos, ventasSinTasa=true; ';
    else
      r := r || format('[FALLA] sin fila: puntosVentas=%s ventasSinTasa=%s (esperaba 0/true); ',
                        j->>'puntosVentas', j->>'ventasSinTasa');
    end if;
  exception when others then
    r := r || format('[FALLA] ventas sin fila de config lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- 2) La clave existe pero está vacía (el caso real: "vacía a propósito" desde /configuracion).
  insert into config (clave, valor) values ('pts_por_sol_vendido', '')
    on conflict (clave) do update set valor = excluded.valor;
  begin
    j := private.evaluacion_componentes_datos(emp_vta, v_fecha, v_fecha);
    if (j->>'puntosVentas')::numeric = 0 and (j->>'ventasSinTasa')::boolean = true then
      r := r || '[ok] ventas con fila vacia: 0 puntos, ventasSinTasa=true; ';
    else
      r := r || format('[FALLA] fila vacia: puntosVentas=%s ventasSinTasa=%s (esperaba 0/true); ',
                        j->>'puntosVentas', j->>'ventasSinTasa');
    end if;
  exception when others then
    r := r || format('[FALLA] ventas con fila vacia exploto en vez de dar 0: %s; ', sqlerrm);
  end;

  -- 3) La clave tiene un valor real: el producto, y ventasSinTasa vuelve a false.
  insert into config (clave, valor) values ('pts_por_sol_vendido', '2')
    on conflict (clave) do update set valor = excluded.valor;
  begin
    j := private.evaluacion_componentes_datos(emp_vta, v_fecha, v_fecha);
    if (j->>'puntosVentas')::numeric = 500 and (j->>'ventasSinTasa')::boolean = false then
      r := r || '[ok] ventas con tasa 2: 250 x 2 = 500 puntos, ventasSinTasa=false; ';
    else
      r := r || format('[FALLA] con tasa: puntosVentas=%s ventasSinTasa=%s (esperaba 500/false); ',
                        j->>'puntosVentas', j->>'ventasSinTasa');
    end if;
  exception when others then
    r := r || format('[FALLA] ventas con tasa lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- ═══ puntosTotal — combina pipeline + extras − incidencias, sin actividades ni ventas ════════
  -- Turno 'T', no 'M': `idx_reportes_turno_unico` es unique sobre (sede_cod, fecha, turno) y el
  -- reporte de puntosActividades de más arriba ya ocupó el turno M de esta sede y esta fecha.
  -- Con 'M' los dos, la prueba entera aborta con 23505 antes de comprobar nada — lo cual no se ve
  -- leyendo el archivo, sólo corriéndolo contra la base.
  v_rep_total := to_char(v_fecha, 'DD-MM-YY') || '_T-TOT-' || v_sede;
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, evaluado)
    values (v_rep_total, v_sede, 'T', v_fecha, emp_total, true);
  insert into reporte_extras (reporte_id, tipo, nombre, cantidad, peso_unitario, monto_total, registrado_por_id)
    values (v_rep_total, 'libre', 'Extra de prueba total', 5, 10, 100, emp_total);
  -- puntos_total generado = 5 x 10 = 50

  insert into pipeline_puntos (empleado_id, etapa, puntos, fecha)
    values (emp_total, 'planchado', 100, (v_fecha::text || ' 12:00:00-05:00')::timestamptz);

  insert into incidencias (sede_cod, fecha, tipo, nivel, responsable_id, puntos_penalidad)
    values (v_sede, v_fecha, 'Prueba', 'Alto', emp_total, 30);

  begin
    j := private.evaluacion_componentes_datos(emp_total, v_fecha, v_fecha);
    if (j->>'extrasPuntos')::numeric = 50 and (j->>'puntosPipeline')::numeric = 100
       and (j->>'descuento')::numeric = 30 then
      r := r || '[ok] puntosTotal: insumos correctos (extras=50 pipeline=100 descuento=30); ';
    else
      r := r || format('[FALLA] insumos de puntosTotal: extras=%s pipeline=%s descuento=%s; ',
                        j->>'extrasPuntos', j->>'puntosPipeline', j->>'descuento');
    end if;
    -- 100 (pipeline) + 50 (extras) + 0 (actividades, sin reporte_actividades) + 0 (ventas, sin
    -- filas de sueldo_ventas para este empleado) - 30 (incidencias) = 120.
    if (j->>'puntosTotal')::numeric = 120 then
      r := r || '[ok] puntosTotal: 100+50+0+0-30 = 120; ';
    else
      r := r || format('[FALLA] puntosTotal=%s (esperaba 120); ', j->>'puntosTotal');
    end if;
  exception when others then
    r := r || format('[FALLA] puntosTotal lanzo un error inesperado: %s; ', sqlerrm);
  end;

  -- ═══ evaluaciones_mensuales.metodo — una fila nueva sin especificarlo cae en 'ponderado' ═════
  begin
    insert into evaluaciones_mensuales (empleado_id, mes, nota_final)
      values (emp_act, '2099-09', 16)
      returning metodo, puntos_total into v_metodo, v_puntos_total;

    if v_metodo = 'ponderado' and v_puntos_total is null then
      r := r || '[ok] evaluaciones_mensuales: metodo default ponderado, puntos_total nulo; ';
    else
      r := r || format('[FALLA] evaluaciones_mensuales: metodo=%s puntos_total=%s (esperaba ponderado/null); ',
                        v_metodo, v_puntos_total);
    end if;
  exception when others then
    r := r || format('[FALLA] insertar en evaluaciones_mensuales lanzo un error inesperado: %s; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0095 --> %', r;
end $$;
