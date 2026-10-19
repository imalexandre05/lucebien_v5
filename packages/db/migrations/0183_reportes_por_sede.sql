-- 0183 — Reportes: cada quien ve solo los de su sede (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-cada-quien-su-sede-design.md
-- Prueba: packages/db/pruebas/0183_reportes_por_sede.prueba.sql (escrita antes). Idempotente.
--
-- Antes: las cuatro políticas de lectura de reportes dejaban pasar a cualquier rol de almacén
-- (encargado_almacen y confeccionista) sobre TODAS las sedes. Ahora: admin, o la sede del reporte en
-- app_sedes(). Las escrituras no cambian (siguen por RPC / admin).
drop policy if exists rep_select on public.reportes;
create policy rep_select on public.reportes for select
  using (private.app_es_admin() or sede_cod in (select private.app_sedes()));

drop policy if exists rep_trab_select on public.reporte_trabajadores;
create policy rep_trab_select on public.reporte_trabajadores for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_trabajadores.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );

drop policy if exists rep_act_select on public.reporte_actividades;
create policy rep_act_select on public.reporte_actividades for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_actividades.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );

drop policy if exists rep_extras_select on public.reporte_extras;
create policy rep_extras_select on public.reporte_extras for select
  using (
    private.app_es_admin() or exists (
      select 1 from public.reportes r
      where r.id = reporte_extras.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );
