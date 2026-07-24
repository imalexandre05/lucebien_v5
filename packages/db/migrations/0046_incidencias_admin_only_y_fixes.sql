-- 0046_incidencias_admin_only_y_fixes.sql — Fase 7 del plan de mejora (incidencias solo-admin
-- a nivel de BASE DE DATOS, no solo UI) + dos arreglos menores encontrados al revisar RLS.

-- ── 1) Incidencias: SELECT solo admin/dueño (Fase 7) ────────────────────────────────────────
-- La política inc_rw (0024) era "for all" por SEDE: un operativo de esa sede podía LEER todas
-- las incidencias (incluido quién reportó a quién) por API directa, aunque la UI ya lo bloquee
-- desde la Fase 4 (gating por matriz de permisos). El plan pide restringirlo también en la BD.
-- Se separa en 4 políticas: SELECT admin-only; INSERT sigue por sede (los operativos SÍ crean
-- incidencias desde su reporte de turno, Fase 2 — crearIncidenciasDeReporte); UPDATE/DELETE
-- admin-only (ya lo eran solo en la UI vía accionEliminarIncidencia).
drop policy if exists inc_rw on incidencias;

drop policy if exists inc_select on incidencias;
create policy inc_select on incidencias for select
  using (private.app_es_admin());

drop policy if exists inc_insert on incidencias;
create policy inc_insert on incidencias for insert
  with check (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));

drop policy if exists inc_update on incidencias;
create policy inc_update on incidencias for update
  using (private.app_es_admin()) with check (private.app_es_admin());

drop policy if exists inc_delete on incidencias;
create policy inc_delete on incidencias for delete
  using (private.app_es_admin());

-- ── 2) Fix: permisos_modulos (migración 0045) llamaba a app_es_admin() sin calificar. Desde la
-- migración 0037 esa función vive en el schema `private`; toda migración posterior (0039, 0041)
-- la referencia como private.app_es_admin(). 0045 se saltó esa convención — sin este fix, la
-- policy fallaría al aplicarse (aún no se había aplicado por la caída del MCP en esta sesión).
drop policy if exists permisos_admin_write on permisos_modulos;
create policy permisos_admin_write on permisos_modulos for all
  using (private.app_es_admin()) with check (private.app_es_admin());

-- ── 3) Fix: el título de la notificación de reportes sin evaluar seguía diciendo "FR-01" —
-- desde la Fase 2 el módulo se renombró a "Reporte de Actividades" en toda la UI, pero esta
-- función (pg_cron, 0042) no se tocó en ese momento. create or replace con el mismo cuerpo,
-- solo cambia el título.
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

  -- ── Reportes de actividades sin evaluar pasado el margen ──
  if coalesce((select activa from alertas_reglas where tipo = 'reporte_sin_evaluar'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'reporte_sin_evaluar');
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'reporte_sin_evaluar', 'Reporte de Actividades sin evaluar',
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

-- El fix de arriba solo cambia el título de las notificaciones NUEVAS (on conflict do nothing
-- nunca reescribe dedup_key existentes). Esta actualización puntual corrige el texto de las
-- filas que ya estén en la tabla con el título viejo — acotada por tipo+título exacto, segura
-- de correr más de una vez (no toca nada si ya no queda ninguna con el texto viejo).
update notificaciones
   set titulo = 'Reporte de Actividades sin evaluar'
 where tipo = 'reporte_sin_evaluar' and titulo = 'FR-01 sin evaluar';
