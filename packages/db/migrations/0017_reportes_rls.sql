-- 0017_reportes_rls.sql — RLS del módulo Reportes FR-01 (Fase 4).
-- Regla (espeja 0006_pipeline_rls): admin/dueño y almacén/confección ven TODO;
--   las tiendas ven solo lo de SU sede. FOR ALL (lectura+escritura con el mismo filtro de sede);
--   las reglas finas de quién escribe qué las aplican las server actions.
--   Las hijas (trabajadores/actividades/extras) heredan la sede del reporte padre por FK.
--   actividades_config: catálogo → lectura por sede, escritura solo admin.
--   actividades_pendientes: por sede.
--
-- Estado previo:
--   · reportes            → RLS + policy rep_rw (solo admin OR sede, 0002) → se REEMPLAZA p/ incluir almacén.
--   · reporte_trabajadores / reporte_actividades / reporte_extras → RLS habilitada SIN policy (0003)
--                            → solo entraba service_role; aquí reciben política por sede del padre.
--   · actividades_config / actividades_pendientes → RLS habilitada SIN policy (0014) → política por sede.
-- Idempotente: drop policy if exists antes de cada create.

-- ── reportes: reemplaza rep_rw (0002, solo sede) para incluir al almacén ──
drop policy if exists rep_rw on reportes;
create policy rep_rw on reportes for all
  using      (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));

-- ── reporte_trabajadores: hereda la sede del reporte padre ──
drop policy if exists rep_trab_rw on reporte_trabajadores;
create policy rep_trab_rw on reporte_trabajadores for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_trabajadores.reporte_id and r.sede_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_trabajadores.reporte_id and r.sede_cod in (select app_sedes())
    )
  );

-- ── reporte_actividades: hereda la sede del reporte padre ──
drop policy if exists rep_act_rw on reporte_actividades;
create policy rep_act_rw on reporte_actividades for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_actividades.reporte_id and r.sede_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_actividades.reporte_id and r.sede_cod in (select app_sedes())
    )
  );

-- ── reporte_extras: hereda la sede del reporte padre ──
drop policy if exists rep_extras_rw on reporte_extras;
create policy rep_extras_rw on reporte_extras for all
  using (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_extras.reporte_id and r.sede_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or app_es_almacen() or exists (
      select 1 from reportes r where r.id = reporte_extras.reporte_id and r.sede_cod in (select app_sedes())
    )
  );

-- ── actividades_config: catálogo. Lectura por sede (admin/almacén todo); escritura solo admin ──
drop policy if exists act_config_select on actividades_config;
create policy act_config_select on actividades_config for select
  using (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));
drop policy if exists act_config_admin_write on actividades_config;
create policy act_config_admin_write on actividades_config for all
  using (app_es_admin()) with check (app_es_admin());

-- ── actividades_pendientes: por sede ──
drop policy if exists act_pend_rw on actividades_pendientes;
create policy act_pend_rw on actividades_pendientes for all
  using      (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()))
  with check (app_es_admin() or app_es_almacen() or sede_cod in (select app_sedes()));

-- (El endurecimiento de los helpers SECURITY DEFINER vive en 0018_helpers_revoke_anon.sql:
--  los grants a anon/authenticated son explícitos, no vía PUBLIC, así que hay que revocar de
--  `anon` directamente — un `revoke ... from public` aquí sería un no-op.)
