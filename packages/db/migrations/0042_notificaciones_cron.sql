-- 0042_notificaciones_cron.sql — genera alertas automáticamente con pg_cron (S21).
-- Calca el patrón del auto-cierre del FR-01 (0021/0022): una función SQL SECURITY DEFINER que
-- corre desde pg_cron (service_role, sin auth.uid()) y debe evaluar TODAS las sedes.
--
-- La función replica 1:1 el motor de reglas del core (packages/core/src/alertas.ts) y usa el
-- MISMO dedup_key (`tipo:ref_id`) + `on conflict do nothing` que el camino manual
-- (lib/notificaciones-repo.ts → generarAlertas). Por eso los dos caminos (botón admin y cron)
-- son idempotentes y consistentes: quien inserte primero gana, nunca se duplica ni re-alerta lo
-- ya leído. Umbrales y activación se leen de `alertas_reglas` (todo configurable).
-- ⚠️ Si cambian las reglas en alertas.ts, actualizar también esta función (dos caminos espejo).
-- Idempotente.

create or replace function generar_alertas()
  returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Lima')::date;
  v_total int  := 0;
  v_n     int;
  v_dp_umbral int := coalesce((select umbral from alertas_reglas where tipo = 'devolucion_proxima'), 2)::int;
  v_re_umbral int := coalesce((select umbral from alertas_reglas where tipo = 'reporte_sin_evaluar'), 2)::int;
  v_rol   text;
begin
  -- ── Devoluciones vencidas ──
  if coalesce((select activa from alertas_reglas where tipo = 'devolucion_vencida'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'devolucion_vencida');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'devolucion_vencida', 'Devolución vencida',
           'La devolución' || coalesce(' de ' || c.nombre, '') || ' venció hace ' || (v_hoy - p.fecha_devolucion) || ' día(s).',
           'critica', v_rol, p.sede_cod, 'pedido', p.id::text, 'devolucion_vencida:' || p.id::text
    from pedidos p left join clientes c on c.id = p.cliente_id
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion < v_hoy
    on conflict (dedup_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  -- ── Devoluciones por vencer (0..umbral días) ──
  if coalesce((select activa from alertas_reglas where tipo = 'devolucion_proxima'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'devolucion_proxima');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'devolucion_proxima', 'Devolución por vencer',
           case when p.fecha_devolucion = v_hoy
                then 'La devolución' || coalesce(' de ' || c.nombre, '') || ' es hoy.'
                else 'La devolución' || coalesce(' de ' || c.nombre, '') || ' vence en ' || (p.fecha_devolucion - v_hoy) || ' día(s).' end,
           'warn', v_rol, p.sede_cod, 'pedido', p.id::text, 'devolucion_proxima:' || p.id::text
    from pedidos p left join clientes c on c.id = p.cliente_id
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion >= v_hoy and (p.fecha_devolucion - v_hoy) <= v_dp_umbral
    on conflict (dedup_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  -- ── Stock bajo mínimo (activo, mínimo > 0, actual < mínimo) ──
  if coalesce((select activa from alertas_reglas where tipo = 'stock_bajo'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'stock_bajo');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'stock_bajo', 'Stock bajo mínimo',
           m.nombre || ': ' || (m.stock_actual::float8)::text || ' (mínimo ' || (m.stock_minimo::float8)::text || ').',
           'warn', v_rol, m.sede_cod, 'material', m.id::text, 'stock_bajo:' || m.id::text
    from materiales m
    where coalesce(m.activo, true) and m.stock_minimo > 0 and m.stock_actual < m.stock_minimo
    on conflict (dedup_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  -- ── Caja de un día anterior que sigue abierta ──
  if coalesce((select activa from alertas_reglas where tipo = 'caja_sin_cerrar'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'caja_sin_cerrar');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'caja_sin_cerrar', 'Caja sin cerrar',
           'La caja de ' || s.sede_cod || ' del ' || to_char(s.fecha, 'YYYY-MM-DD') || ' sigue abierta.',
           'warn', v_rol, s.sede_cod, 'caja', s.id::text, 'caja_sin_cerrar:' || s.id::text
    from caja_sesiones s
    where s.estado = 'abierta' and (v_hoy - s.fecha) >= 1
    on conflict (dedup_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  -- ── Reportes FR-01 sin evaluar pasado el margen ──
  if coalesce((select activa from alertas_reglas where tipo = 'reporte_sin_evaluar'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'reporte_sin_evaluar');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'reporte_sin_evaluar', 'FR-01 sin evaluar',
           'El reporte de ' || r.sede_cod || ' del ' || to_char(r.fecha, 'YYYY-MM-DD') || ' lleva ' || (v_hoy - r.fecha) || ' día(s) sin evaluar.',
           'info', v_rol, r.sede_cod, 'reporte', r.id, 'reporte_sin_evaluar:' || r.id
    from reportes r
    where not r.evaluado and not coalesce(r.no_evaluable, false) and (v_hoy - r.fecha) >= v_re_umbral
    on conflict (dedup_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

revoke execute on function generar_alertas() from public, anon, authenticated;
grant execute on function generar_alertas() to service_role;

-- ── Agenda pg_cron (corre en UTC; Perú = UTC-5) ──
create extension if not exists pg_cron;

-- Mañana 08:00 Perú = 13:00 UTC (al abrir tiendas).
select cron.schedule('generar-alertas-am', '0 13 * * *', $$select generar_alertas()$$);

-- Noche 20:00 Perú = 01:00 UTC (cierre de día: devoluciones/stock frescos).
select cron.schedule('generar-alertas-pm', '0 1 * * *', $$select generar_alertas()$$);
