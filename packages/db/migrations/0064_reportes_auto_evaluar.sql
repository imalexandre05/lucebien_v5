-- 0064_reportes_auto_evaluar.sql — evaluación automática de reportes cuando nadie evalúa a
-- tiempo. Antes, reportes_crear (0052) bloqueaba CUALQUIER reporte nuevo de una sede si el
-- reporte anterior (de cualquier fecha) seguía sin evaluar, y solo admin/dueño/encargados podían
-- evaluar — si nadie lo hacía, la sede quedaba bloqueada para siempre. Esta migración da un
-- ciclo completo de gracia (el turno opuesto del mismo día + la mañana siguiente) y, si sigue sin
-- evaluarse, lo cierra sola con una nota neutral en vez de trabar la operación.
--
-- ⚠️ Regla de negocio NO confirmada por el dueño: la calificación por defecto cuando el sistema
-- evalúa solo. Se marca aquí como pendiente (ver docs/pendientes-negocio.md).
-- La escala REAL (verificada contra evaluaciones humanas reales en producción, no la que parecía
-- a simple vista por el ícono ⭐ del panel) es un control de 3 estados por actividad
-- (app/reportes/[id]/acciones.tsx: Estado3) — 1 = aprobar, 0.5 = observar, 0 = rechazar; NO es
-- una escala de 1 a 5. Default de arranque: 1 (aprobar/crédito completo) — no castiga al
-- operario por una falla administrativa ajena a él (que nadie evaluó a tiempo), y coincide con
-- el DEFAULT propio de la columna reporte_actividades.calificacion.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) auto_evaluado: transparencia — distingue una nota puesta por una persona de una puesta por
--    el sistema al vencer el plazo. Aditiva, no toca evaluado/evaluador_id/puntaje_eval.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table reportes
  add column if not exists auto_evaluado boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Config: nota por defecto de la auto-evaluación (pendiente de confirmar, ver nota arriba).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into config (clave, valor) values
  ('reportes_auto_eval_calificacion', '1')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) reportes_auto_evaluar_vencidos: mismo patrón que reportes_auto_cierre (0021) — security
--    definer porque corre desde pg_cron (service_role) sin auth.uid(), solo accesible a
--    service_role. Evalúa cualquier reporte de un día ANTERIOR al de hoy (hora Perú) que siga
--    sin evaluar y no sea un cascarón sin actividad: ya tuvo un ciclo completo para evaluarse.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function reportes_auto_evaluar_vencidos()
  returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_hoy     date := (now() at time zone 'America/Lima')::date;
  v_default numeric := coalesce((select valor from config where clave = 'reportes_auto_eval_calificacion'), '1')::numeric;
  v_rep     record;
  v_pun     int;
  v_res     jsonb := '[]'::jsonb;
begin
  for v_rep in
    select id, sede_cod, fecha from reportes
    where not evaluado and not coalesce(no_evaluable, false) and fecha < v_hoy
  loop
    -- ⚠️ reporte_actividades.calificacion tiene DEFAULT 1 (no null) — no sirve como centinela de
    -- "sin evaluar". La verdad de que nadie tocó las calificaciones es el propio filtro del loop
    -- (reportes.evaluado = false): reportes_evaluar (0033) solo escribe calificacion Y pone
    -- evaluado=true en la MISMA sentencia, así que si evaluado=false ninguna fila de este reporte
    -- fue tocada por una persona — se sobreescriben todas, sin condición extra.
    update reporte_actividades
    set calificacion = v_default,
        obs_eval = 'Evaluación automática (plazo vencido, nadie evaluó a tiempo)'
    where reporte_id = v_rep.id;

    select coalesce(round(sum(peso * calificacion) / nullif(sum(peso), 0) * 100), 0)::int
      into v_pun
    from reporte_actividades where reporte_id = v_rep.id;

    update reportes
    set evaluado = true, evaluador_id = null, puntaje_eval = v_pun, puntaje = v_pun,
        bloqueado = false, auto_evaluado = true
    where id = v_rep.id;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    values (
      'reporte_auto_evaluado', 'Reporte evaluado automáticamente',
      'El reporte de ' || v_rep.sede_cod || ' del ' || to_char(v_rep.fecha, 'YYYY-MM-DD') ||
        ' se evaluó solo (nota ' || v_pun || '/100) porque nadie lo evaluó a tiempo.',
      'warn', 'admin', v_rep.sede_cod, 'reporte', v_rep.id, 'reporte_auto_evaluado:' || v_rep.id
    )
    on conflict (dedup_key) do nothing;

    v_res := v_res || jsonb_build_object('id', v_rep.id, 'sede', v_rep.sede_cod, 'puntaje', v_pun);
  end loop;
  return v_res;
end;
$$;

revoke execute on function reportes_auto_evaluar_vencidos() from public, anon, authenticated;
grant execute on function reportes_auto_evaluar_vencidos() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) Enganchar a los cron jobs ya existentes (0022): re-cron.schedule con el mismo nombre
--    reemplaza el job en pg_cron, así que basta con re-declarar el comando con la llamada extra.
--    Mismos horarios (15:05 y 23:05 hora Perú) — corre 2 veces al día junto al auto-cierre.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'reportes-auto-cierre-M', '5 20 * * *',
  $$select reportes_auto_cierre(array['M']); select reportes_auto_evaluar_vencidos();$$
);

select cron.schedule(
  'reportes-auto-cierre-TC', '5 4 * * *',
  $$select reportes_auto_cierre(array['T','C']); select reportes_auto_evaluar_vencidos();$$
);
