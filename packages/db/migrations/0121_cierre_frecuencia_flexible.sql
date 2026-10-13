-- 0121_cierre_frecuencia_flexible.sql — el cierre (0111) compara los datos que deciden la cuota de
-- la frecuencia flexible (0120), en vez de una cuota que ya no es la del contrato.
--
-- Implementa la enmienda §9.3 de docs/superpowers/specs/sueldos/2026-10-06-frecuencia-pago-flexible-design.md
-- (auditoría docs/auditorias/2026-10-06-sueldos.md, D-1 y D-10). Depende de la 0111 (PR #44) y de
-- la 0120 (PR #57): #57 se mergea DESPUÉS de #44.
--
-- EL PROBLEMA (D-1). Con la 0120 la cuota de un tramo deja de ser `sueldo_acuerdos.sueldo_pactado`:
-- un último tramo corto se prorratea y un tramo posterior a un cambio de frecuencia usa la cuota del
-- cambio. El repo la calcula en el core y la guarda en `entrada.sueldoPactado`. El cierre de la 0111
-- recalcula `sueldo_entrada(...)`, que sigue devolviendo la cuota del contrato, y exige igualdad:
-- esos tramos respondían DESACTUALIZADA para siempre, y «Recalcular» producía lo mismo.
--
-- EL ARREGLO. Una sola fuente de verdad para la cuota: el core (`cuotaDeLiquidacion`), alimentado
-- por datos que vienen de UNA función de la base y que el cierre compara.
--   · `sueldo_entrada_pago(acuerdo)`: el contrato (inicio, fin, frecuencia, N, cuota) y sus cambios
--     de frecuencia. El repo la llama al armar la entrada, la guarda en el borrador y calcula la
--     cuota con ESOS datos. Security invoker: la RLS de sueldo_acuerdos y sueldo_acuerdo_cambios
--     decide quién la ve (cada quien lo suyo, el admin todo).
--   · `sueldo_liquidacion_cerrar`: cuerpo de la 0111 ÍNTEGRO salvo la comparación, que (a) bloquea
--     antes la fila del contrato, (b) suma `sueldo_entrada_pago` a la entrada recalculada y (c) deja
--     fuera `sueldoPactado` (derivada) y `cuotaFijada` (marca de una corrección).
--   · `sueldo_cambio_coherente` (trigger de 0120): toma el mismo bloqueo del contrato, y también
--     corre al BORRAR un cambio (no se puede borrar uno que cae en lo ya pagado). Con eso un cambio
--     de frecuencia y un cierre del mismo contrato se serializan (D-10).
--
-- Efecto: un borrador calculado antes de esta migración (sin `contratoPago`) pide recalcular una
-- vez. Correcto: no se sabe con qué calendario se calculó.
--
-- No agrega ningún parámetro de negocio: nada que anotar en docs/pendientes-negocio.md.
-- La firma de las funciones existentes no cambia: `create or replace` conserva sus grants.
-- Idempotente: todo es `create or replace` / `drop ... if exists`.
--
-- Prueba: packages/db/pruebas/0121_cierre_frecuencia_flexible.prueba.sql

-- ═══ 1) Los datos que deciden la cuota ═══════════════════════════════════════════════════════
-- Forma fija (el repo la pasa tal cual al core y el cierre la compara normalizada):
--   contratoPago:      { fechaInicio, fechaFin, modalidad, cadaDias, sueldoPactado }
--   cambiosFrecuencia: [ { desde, modalidad, cadaDias, sueldoPactado }, ... ] ordenados por desde
create or replace function public.sueldo_entrada_pago(p_acuerdo uuid)
  returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'contratoPago', jsonb_build_object(
      'fechaInicio',   to_char(a.fecha_inicio, 'YYYY-MM-DD'),
      'fechaFin',      to_char(a.fecha_fin, 'YYYY-MM-DD'),
      'modalidad',     a.modalidad,
      'cadaDias',      a.cada_dias,
      'sueldoPactado', a.sueldo_pactado),
    'cambiosFrecuencia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'desde',         to_char(c.desde, 'YYYY-MM-DD'),
               'modalidad',     c.modalidad,
               'cadaDias',      c.cada_dias,
               'sueldoPactado', c.sueldo_pactado) order by c.desde)
      from sueldo_acuerdo_cambios c where c.acuerdo_id = a.id), '[]'::jsonb))
  from sueldo_acuerdos a
  where a.id = p_acuerdo;
$fn$;

revoke execute on function public.sueldo_entrada_pago(uuid) from public, anon;
grant  execute on function public.sueldo_entrada_pago(uuid) to authenticated, service_role;

comment on function public.sueldo_entrada_pago(uuid) is
  'Contrato y cambios de frecuencia de un acuerdo: los datos con los que el core calcula la cuota de cada tramo (0121). El repo los guarda en la entrada del borrador y el cierre los compara.';

-- ═══ 2) El cierre ════════════════════════════════════════════════════════════════════════════
create or replace function sueldo_liquidacion_cerrar(p_liquidacion uuid)
  returns jsonb language plpgsql volatile security invoker set search_path = public as $fn$
declare
  l           record;
  v_lineas    int;
  v_mov       int;   -- adelantos + reportes + bonos, que van como lista
  v_alm       int;   -- almuerzos entregados, que van como CONTEO
  v_cap       int;   -- personas capacitadas, ídem
  v_ven       int;
  v_esp_mov   int;
  v_esp_ven   int;
  v_sellados  int;
  v_nueva     jsonb;   -- 0111: la entrada recalculada ahora (0121: más los datos del calendario)
  v_vieja_n   jsonb;   -- la guardada, con los arreglos ordenados
  v_nueva_n   jsonb;   -- la recalculada, con los arreglos ordenados
  v_dif       text;    -- claves de primer nivel que difieren
  v_sellado   jsonb;   -- 0111: lo que quedó sellado, con la forma de la entrada
  v_ids_mov   uuid[];  -- 0111: ids de movimientos pendientes que se sellan
  v_ids_ven   uuid[];  -- 0111: ids de ventas pendientes que se sellan
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede cerrar una liquidación';
  end if;

  select * into l from sueldo_liquidaciones where id = p_liquidacion for update;
  if not found then
    raise exception 'DATO:la liquidación no existe o no es visible';
  end if;
  if l.estado <> 'borrador' then
    raise exception 'ESTADO:esta liquidación ya está %; sólo se cierra un borrador', l.estado;
  end if;
  if jsonb_typeof(l.resultado -> 'lineas') <> 'array' then
    raise exception 'DATO:el resultado guardado no tiene el desglose de líneas';
  end if;

  -- ── La carrera ───────────────────────────────────────────────────────────────────────────
  -- MovimientoAdmin no lleva id (sueldos.ts:180-184), así que el sellado va por rango: el mismo
  -- criterio con el que sueldo_entrada() los juntó. Si alguien cargó un adelanto entre el cálculo
  -- y el cierre, esa fila quedaría sellada SIN ESTAR en el snapshot que se paga. Se recuenta
  -- contra la entrada guardada y se corta si no coincide.
  v_esp_mov := jsonb_array_length(coalesce(l.entrada -> 'adelantos',   '[]'::jsonb))
             + jsonb_array_length(coalesce(l.entrada -> 'reportes',    '[]'::jsonb))
             + jsonb_array_length(coalesce(l.entrada -> 'bonosExtras', '[]'::jsonb));
  v_esp_ven := jsonb_array_length(coalesce(l.entrada -> 'ventas', '[]'::jsonb));

  select count(*) into v_mov from sueldo_movimientos m
  where m.empleado_id = l.empleado_id
    and m.fecha between l.periodo_desde and l.periodo_hasta
    and m.tipo in ('adelanto', 'reporte', 'bono_extra')
    and m.liquidacion_id is null;

  -- Los dos tipos de CONTEO se comparan por suma de cantidad, no por cantidad de filas: así es
  -- como el motor los recibió. Sin esto quedaba un agujero de la misma familia que el de arriba —
  -- el sellado toca los CINCO tipos, así que un almuerzo cargado entre el cálculo y el cierre se
  -- sellaba sin estar en el snapshot y sin que nada avisara.
  v_alm := private.sueldo_movimientos_conteo(l.empleado_id, l.periodo_desde, l.periodo_hasta, 'almuerzo_entregado');
  v_cap := private.sueldo_movimientos_conteo(l.empleado_id, l.periodo_desde, l.periodo_hasta, 'capacitacion');

  select count(*) into v_ven from sueldo_ventas v
  where v.empleado_id = l.empleado_id
    and v.fecha between l.periodo_desde and l.periodo_hasta
    and v.liquidacion_id is null;

  if v_mov <> v_esp_mov
     or v_ven <> v_esp_ven
     or v_alm <> coalesce((l.entrada ->> 'almuerzosEntregados')::int, 0)
     or v_cap <> coalesce((l.entrada ->> 'personasCapacitadas')::int, 0)
  then
    raise exception 'DESACTUALIZADA:los datos cambiaron desde que se calculó (movimientos % contra %, ventas % contra %, almuerzos % contra %, capacitaciones % contra %); vuelve a calcular antes de cerrar',
      v_mov, v_esp_mov, v_ven, v_esp_ven,
      v_alm, coalesce((l.entrada ->> 'almuerzosEntregados')::int, 0),
      v_cap, coalesce((l.entrada ->> 'personasCapacitadas')::int, 0);
  end if;

  -- ── La comparación completa (0111) ───────────────────────────────────────────────────────
  -- El conteo de arriba sólo detecta filas que aparecen o desaparecen. Un adelanto borrado y
  -- recargado con otro monto, o un día de asistencia corregido, dejan el conteo igual y se pagaba
  -- con el dato viejo. Acá se recalcula la entrada con LA MISMA función que armó el borrador y se
  -- compara entera: o es idéntica, o no se sella nada.
  --
  -- 0121: antes de comparar se BLOQUEA la fila del contrato. El trigger de sueldo_acuerdo_cambios
  -- toma el mismo bloqueo, así que un cambio de frecuencia y este cierre se serializan: si el cambio
  -- llegó antes, la lectura de abajo ya lo ve y se rechaza; si llega después, espera y el trigger lo
  -- rechaza por caer en lo ya pagado (auditoría D-10).
  perform 1 from sueldo_acuerdos where id = l.acuerdo_id for update;

  -- 0121: a la entrada se suman los datos que DECIDEN la cuota (contrato y cambios de frecuencia),
  -- leídos con la misma función que usa el repo al armar el borrador. La cuota en sí
  -- (`sueldoPactado`) es DERIVADA: la calcula el core con esos datos y no se compara contra el
  -- `sueldo_pactado` del contrato, que es lo que devuelve sueldo_entrada (auditoría D-1).
  -- `cuotaFijada` marca la cuota de una corrección, que conserva la pagada.
  v_nueva := public.sueldo_entrada(l.acuerdo_id, l.periodo_desde, l.periodo_hasta)
             || public.sueldo_entrada_pago(l.acuerdo_id);
  v_vieja_n := private.sueldo_entrada_normalizada(l.entrada - 'sueldoPactado' - 'cuotaFijada');
  v_nueva_n := private.sueldo_entrada_normalizada(v_nueva - 'sueldoPactado');

  if v_vieja_n is distinct from v_nueva_n then
    select string_agg(c.k, ', ' order by c.k) into v_dif
    from (
      select jsonb_object_keys(v_vieja_n) as k
      union
      select jsonb_object_keys(v_nueva_n)
    ) c
    where (v_vieja_n -> c.k) is distinct from (v_nueva_n -> c.k);

    raise exception 'DESACTUALIZADA:los datos cambiaron desde que se calculó (%); vuelve a calcular antes de cerrar',
      coalesce(v_dif, 'entrada');
  end if;

  -- ── 1) Las líneas, desde el resultado congelado ──────────────────────────────────────────
  delete from sueldo_liquidacion_lineas where liquidacion_id = p_liquidacion;

  insert into sueldo_liquidacion_lineas (liquidacion_id, orden, grupo, concepto, detalle, regla, monto)
  select p_liquidacion,
         (ord - 1)::int,
         ln ->> 'grupo',
         ln ->> 'concepto',
         coalesce(ln ->> 'detalle', ''),
         coalesce(ln ->> 'regla', ''),
         (ln ->> 'monto')::numeric
  from jsonb_array_elements(l.resultado -> 'lineas') with ordinality as t(ln, ord);

  get diagnostics v_lineas = row_count;
  if v_lineas = 0 then
    raise exception 'DATO:el resultado guardado no tiene ninguna línea; no hay nada que congelar';
  end if;

  -- ── 2) El sellado, todavía en borrador ───────────────────────────────────────────────────
  -- Se sellan los CINCO tipos: los tres de plata y los dos de conteo. Todos fueron consumidos.
  --
  -- Por LISTA EXPLÍCITA DE IDS, no por rango (0111). Las filas pendientes se capturan en una sola
  -- sentencia y se sella exactamente esa lista: un adelanto que otra sesión inserta después de la
  -- captura NO se sella: queda huérfana en un período ya cerrado (ticket
  -- imalexandre05/lucebien-tablero#29, fuera de alcance). (Un `for update` sobre
  -- las pendientes no serviría: no frena un INSERT nuevo.) La fila que entró entre la comparación
  -- de arriba y esta captura sí quedaría sellada sin estar en la entrada: la verificación de abajo
  -- lo detecta y aborta.
  v_ids_mov := array(
    select m.id from sueldo_movimientos m
     where m.empleado_id = l.empleado_id
       and m.fecha between l.periodo_desde and l.periodo_hasta
       and m.liquidacion_id is null);
  v_ids_ven := array(
    select v.id from sueldo_ventas v
     where v.empleado_id = l.empleado_id
       and v.fecha between l.periodo_desde and l.periodo_hasta
       and v.liquidacion_id is null);

  update sueldo_movimientos set liquidacion_id = p_liquidacion
  where id = any(v_ids_mov) and liquidacion_id is null;
  get diagnostics v_sellados = row_count;

  update sueldo_ventas set liquidacion_id = p_liquidacion
  where id = any(v_ids_ven) and liquidacion_id is null;

  -- ── 2b) Verificación posterior al sellado (0111) ─────────────────────────────────────────
  -- Lo que quedó sellado contra esta liquidación tiene que ser EXACTAMENTE lo que la entrada
  -- guardada pagó, con la misma forma que arma sueldo_entrada(). Si otra sesión confirmó una fila
  -- nueva entre la comparación y la captura de ids, se selló sin que entrara en el pago: acá se
  -- detecta y se aborta, y al lanzar la excepción se deshace TODO (líneas y sellos).
  v_sellado := jsonb_build_object(
    'adelantos',   (select coalesce(jsonb_agg(jsonb_build_object(
                      'fecha', to_char(m.fecha, 'YYYY-MM-DD'), 'motivo', m.motivo, 'monto', m.monto)), '[]'::jsonb)
                    from sueldo_movimientos m where m.liquidacion_id = p_liquidacion and m.tipo = 'adelanto'),
    'reportes',    (select coalesce(jsonb_agg(jsonb_build_object(
                      'fecha', to_char(m.fecha, 'YYYY-MM-DD'), 'motivo', m.motivo, 'monto', m.monto)), '[]'::jsonb)
                    from sueldo_movimientos m where m.liquidacion_id = p_liquidacion and m.tipo = 'reporte'),
    'bonosExtras', (select coalesce(jsonb_agg(jsonb_build_object(
                      'fecha', to_char(m.fecha, 'YYYY-MM-DD'), 'motivo', m.motivo, 'monto', m.monto)), '[]'::jsonb)
                    from sueldo_movimientos m where m.liquidacion_id = p_liquidacion and m.tipo = 'bono_extra'),
    'almuerzosEntregados', (select coalesce(sum(m.cantidad), 0)::int
                    from sueldo_movimientos m where m.liquidacion_id = p_liquidacion and m.tipo = 'almuerzo_entregado'),
    'personasCapacitadas', (select coalesce(sum(m.cantidad), 0)::int
                    from sueldo_movimientos m where m.liquidacion_id = p_liquidacion and m.tipo = 'capacitacion'),
    'ventas',      (select coalesce(jsonb_agg(jsonb_build_object(
                      'fecha', to_char(v.fecha, 'YYYY-MM-DD'), 'monto', v.monto,
                      'tipo', v.tipo, 'tiendaId', v.sede_cod)), '[]'::jsonb)
                    from sueldo_ventas v where v.liquidacion_id = p_liquidacion)
  );

  if private.sueldo_entrada_normalizada(v_sellado)
     is distinct from private.sueldo_entrada_normalizada(jsonb_build_object(
          'adelantos',   coalesce(l.entrada -> 'adelantos',   '[]'::jsonb),
          'reportes',    coalesce(l.entrada -> 'reportes',    '[]'::jsonb),
          'bonosExtras', coalesce(l.entrada -> 'bonosExtras', '[]'::jsonb),
          'almuerzosEntregados', coalesce((l.entrada ->> 'almuerzosEntregados')::int, 0),
          'personasCapacitadas', coalesce((l.entrada ->> 'personasCapacitadas')::int, 0),
          'ventas',      coalesce(l.entrada -> 'ventas',      '[]'::jsonb)))
  then
    raise exception 'DESACTUALIZADA:se cargó un dato mientras se cerraba; no se selló nada, vuelve a calcular antes de cerrar';
  end if;

  -- ── 3) Recién ahora, cerrar ──────────────────────────────────────────────────────────────
  update sueldo_liquidaciones
     set estado = 'cerrada', cerrada_en = now(), cerrada_por = auth.uid()
   where id = p_liquidacion;

  -- Addendum F-2: sólo pasa a 'liquidado' cuando el tramo que se cierra llega hasta el FINAL real
  -- del acuerdo (periodo_hasta >= fecha_fin). Antes no llevaba condición: cerrar cualquier tramo
  -- —el primero de tres— marcaba el acuerdo entero como liquidado y lo sacaba de "Declarar
  -- asistencia" antes de tiempo (spec addendum F-2).
  update sueldo_acuerdos
     set estado = 'liquidado'
   where id = l.acuerdo_id
     and l.periodo_hasta >= (select fecha_fin from sueldo_acuerdos where id = l.acuerdo_id);

  -- Se informa lo que REALMENTE se selló, no el subconjunto que se contó para la carrera: un
  -- número que no coincide con la base es peor que no informar nada.
  return jsonb_build_object('id', p_liquidacion, 'estado', 'cerrada', 'lineas', v_lineas,
                            'movimientosSellados', v_sellados, 'ventasSelladas', v_ven);
end;
$fn$;

-- ═══ 3) El trigger de los cambios: mismo bloqueo, y también al borrar ════════════════════════
create or replace function sueldo_cambio_coherente() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_ini date; v_fin date; v_pagado date; v_acuerdo uuid;
begin
  v_acuerdo := case when tg_op = 'DELETE' then old.acuerdo_id else new.acuerdo_id end;
  -- 0121: el mismo bloqueo que toma sueldo_liquidacion_cerrar. Si un cierre de este contrato está
  -- en curso, esto espera a que termine y la consulta de lo pagado de abajo ya lo ve.
  select fecha_inicio, fecha_fin into v_ini, v_fin from sueldo_acuerdos where id = v_acuerdo for update;
  select max(periodo_hasta) into v_pagado from sueldo_liquidaciones
    where acuerdo_id = v_acuerdo and estado = 'cerrada';

  -- Lo que se borra o se reemplaza tampoco puede caer en lo ya pagado.
  if tg_op in ('UPDATE', 'DELETE') and v_pagado is not null and old.desde <= v_pagado then
    raise exception 'ESTADO:ese cambio de frecuencia ya rige sobre lo pagado (hasta %); no se puede modificar ni borrar', v_pagado;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.desde <= v_ini or new.desde > v_fin then
    raise exception 'DATO:el cambio de frecuencia tiene que caer después del inicio y hasta el fin del contrato (% a %)', v_ini, v_fin;
  end if;
  if v_pagado is not null and new.desde <= v_pagado then
    raise exception 'ESTADO:el cambio de frecuencia tiene que empezar después de lo ya pagado (hasta %)', v_pagado;
  end if;
  return new;
end $$;

drop trigger if exists sueldo_cambio_coherente on sueldo_acuerdo_cambios;
create trigger sueldo_cambio_coherente before insert or update or delete on sueldo_acuerdo_cambios
  for each row execute function sueldo_cambio_coherente();
