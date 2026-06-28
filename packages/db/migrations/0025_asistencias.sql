-- 0025_asistencias.sql — módulo Asistencias: columna obs + unicidad + RLS.
-- La tabla asistencias ya existe (0001) con RLS habilitada SIN policy. Registro manual = admin
-- (paridad con el viejo requireAdmin). Datos sensibles por empleado: cada uno ve los suyos.
-- El índice único habilita además una futura auto-asistencia idempotente desde el reporte.

alter table asistencias add column if not exists obs text;

create unique index if not exists uq_asistencia_emp_fecha_turno
  on asistencias(empleado_id, fecha, turno);

-- Lectura: admin/almacén ven todo; cada empleado ve solo sus asistencias.
drop policy if exists asist_select on asistencias;
create policy asist_select on asistencias for select
  using (app_es_admin() or app_es_almacen() or empleado_id = auth.uid());

-- Escritura: solo admin/dueño (registro manual).
drop policy if exists asist_admin_write on asistencias;
create policy asist_admin_write on asistencias for all
  using (app_es_admin()) with check (app_es_admin());

create index if not exists idx_asistencias_fecha on asistencias(fecha);
