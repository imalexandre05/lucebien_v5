-- 0111_cierre_datos_actuales.sql — una liquidación sólo se cierra si su entrada guardada es
-- idéntica a la que se calcularía ahora.
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-04-cierre-con-datos-actuales-design.md
-- (plan: docs/superpowers/plans/2026-10-04-cierre-con-datos-actuales.md). Ticket
-- imalexandre05/lucebien-tablero#28.
--
-- EL PROBLEMA. `sueldo_liquidacion_cerrar` (0093, bloque C-7) detectaba que los datos cambiaron
-- contando filas y sumando cantidades. No compara MONTOS ni ASISTENCIA: un adelanto borrado y
-- recargado con otro monto, o una hora de asistencia corregida después de calcular, dejaban el
-- conteo igual, se cerraba con el dato viejo y se sellaba el nuevo sin descontarlo.
--
-- QUÉ CAMBIA.
--   · `private.sueldo_entrada_normalizada(jsonb)`: ordena los arreglos de PRIMER NIVEL (lo único
--     no determinista de la entrada: `sueldo_movimientos_lista` y las ventas ordenan sólo por
--     fecha, y dos movimientos del mismo día salen en cualquier orden; no hay marcas de tiempo,
--     plan §2) y lleva los números a doble precisión, que es lo que sobrevive al paso por
--     JavaScript de `crearBorrador`. No se toca `sueldo_entrada`.
--   · `sueldo_liquidacion_cerrar(uuid)`: cuerpo de la 0093 ÍNTEGRO (la spec la llama
--     «sueldo_cerrar»; el nombre real es éste) y, después del conteo —que se conserva como primera
--     barrera barata—, la comparación completa contra `sueldo_entrada(...)`. Si difieren, rechaza
--     con `DESACTUALIZADA` nombrando las claves que cambiaron y no sella nada.
--   · El mensaje del conteo pasa de «volvé» a «vuelve» (español neutral).
--
-- La firma no cambia: `create or replace` conserva el `revoke`/`grant` de la 0073.
--
-- Efectos a tener presentes: cambiar un parámetro en /configuracion después de calcular también
-- hace que el cierre se rechace (el `resultado` guardado se calculó con otros), y un borrador
-- anterior a la 0098 (sin entradaEstimada/salidaEstimada) pide recalcular. Ambos son correctos.
--
-- No agrega ningún parámetro de negocio: nada que anotar en docs/pendientes-negocio.md.
--
-- Idempotente: todo es `create or replace`.
--
-- Prueba: packages/db/pruebas/0111_cierre_datos_actuales.prueba.sql

-- ═══ 1) El normalizador ══════════════════════════════════════════════════════════════════════
-- Dos normalizaciones, las únicas que se aplican:
--   a) NÚMEROS a doble precisión. `crearBorrador` guarda la entrada tras pasarla por JavaScript,
--      que lee cada número como `double` y pierde los dígitos que pasan de ~16: un parámetro como
--      45.454545454545454545 vuelve recortado y nunca coincidiría con el `numeric` exacto que
--      devuelve `sueldo_entrada`, con lo que NINGUNA liquidación se podría cerrar. El motor
--      (packages/core) calcula con esos mismos `double`, así que a ellos se compara. Los montos
--      son numeric(12,2): caben enteros en un double y una diferencia real sigue detectándose.
--   b) ARREGLOS de primer nivel ordenados, con `order by e` (el orden total de jsonb, coherente
--      con su igualdad). Lo de adentro (p. ej. `tramos` de cada día) ya sale en un orden estable
--      y significativo, y se respeta.
create or replace function private.sueldo_jsonb_doble(p_valor jsonb)
  returns jsonb language plpgsql immutable set search_path = public as $fn$
begin
  case jsonb_typeof(p_valor)
    when 'number' then
      return to_jsonb((p_valor #>> '{}')::float8);
    when 'array' then
      return coalesce((
        select jsonb_agg(private.sueldo_jsonb_doble(e.v) order by e.n)
        from jsonb_array_elements(p_valor) with ordinality as e(v, n)
      ), '[]'::jsonb);
    when 'object' then
      return coalesce((
        select jsonb_object_agg(k.key, private.sueldo_jsonb_doble(k.value))
        from jsonb_each(p_valor) k
      ), '{}'::jsonb);
    else
      return p_valor;
  end case;
end;
$fn$;

create or replace function private.sueldo_entrada_normalizada(p_entrada jsonb)
  returns jsonb language sql immutable set search_path = public as $fn$
  select coalesce(
    jsonb_object_agg(
      k.key,
      case when jsonb_typeof(k.value) = 'array'
           then (select coalesce(jsonb_agg(e order by e), '[]'::jsonb) from jsonb_array_elements(k.value) e)
           else k.value
      end),
    '{}'::jsonb)
  from jsonb_each(private.sueldo_jsonb_doble(coalesce(p_entrada, '{}'::jsonb))) k;
$fn$;

revoke execute on function private.sueldo_jsonb_doble(jsonb) from public, anon;
grant  execute on function private.sueldo_jsonb_doble(jsonb) to authenticated, service_role;
revoke execute on function private.sueldo_entrada_normalizada(jsonb) from public, anon;
grant  execute on function private.sueldo_entrada_normalizada(jsonb) to authenticated, service_role;

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
  v_nueva     jsonb;   -- 0111: la entrada recalculada ahora
  v_vieja_n   jsonb;   -- la guardada, con los arreglos ordenados
  v_nueva_n   jsonb;   -- la recalculada, con los arreglos ordenados
  v_dif       text;    -- claves de primer nivel que difieren
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
  v_nueva := public.sueldo_entrada(l.acuerdo_id, l.periodo_desde, l.periodo_hasta);
  v_vieja_n := private.sueldo_entrada_normalizada(l.entrada);
  v_nueva_n := private.sueldo_entrada_normalizada(v_nueva);

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
  update sueldo_movimientos set liquidacion_id = p_liquidacion
  where empleado_id = l.empleado_id
    and fecha between l.periodo_desde and l.periodo_hasta
    and liquidacion_id is null;
  get diagnostics v_sellados = row_count;

  update sueldo_ventas set liquidacion_id = p_liquidacion
  where empleado_id = l.empleado_id
    and fecha between l.periodo_desde and l.periodo_hasta
    and liquidacion_id is null;

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
