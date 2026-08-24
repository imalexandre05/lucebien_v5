-- 0092_incidencias_rls_por_sede.sql — inc_select deja de ser admin-only y lee por el mismo criterio que inc_insert
--
-- Implementa docs/superpowers/specs/almacen/2026-08-24-incidencias-reportante-solo-admin-design.md
-- §5 Addendum — 24-ago-2026 (C-3).
--
-- QUÉ PASABA. La política `inc_select` (0046_incidencias_admin_only_y_fixes.sql) dejaba leer
-- `incidencias` sólo a admin/dueño. La 0065 le dio a `confeccionista`, `ventas_junior` y
-- `ventas_junior_2` el permiso de MÓDULO (`permisos_modulos`) para ver Incidencias, así que esos
-- roles entran a /incidencias sin rebotar — pero `inc_select` seguía admin-only, así que el
-- `select('*')` de `listarIncidencias()` les devolvía siempre cero filas, sin importar la sede.
-- La pantalla mostraba «0 registradas» aunque hubiera incidencias reales de esa sede. Verificado
-- contra `pg_policies` en scilb el 24-ago-2026 (addendum de la spec).
--
-- QUÉ CAMBIA. `inc_select` pasa a usar la misma condición que ya tiene `inc_insert` (0046) para
-- esta misma tabla: admin, o el rol de almacén, o la sede de quien pregunta. Es el mismo criterio
-- que ya usan `rep_select` (0081_reportes_escritura_directa.sql) y `solicitudes_select`
-- (0087_solicitudes_escritura_directa.sql) — no es un patrón nuevo, es alinear esta tabla con el
-- resto del sistema por sede. `inc_update` e `inc_delete` NO se tocan: siguen admin-only, como hoy.
--
-- Idempotente: se puede reaplicar sin fallar. `drop policy if exists` antes de recrearla.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · `private.app_es_almacen()` devuelve true también para 'confeccionista', no sólo para
--     'encargado_almacen' (0006_pipeline_rls.sql:22-25). Acá se usa a propósito: `inc_insert`
--     (0046) ya la usa para esta misma tabla, y esta migración sólo alinea `inc_select` con ese
--     criterio vigente del módulo — no introduce una regla nueva sobre datos de personas.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. `incidencias` ya tiene las
--     cuatro (inc_select/inc_insert/inc_update/inc_delete, desde la 0046); esta migración
--     reemplaza únicamente `inc_select`.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5) — esta migración no agrega ningún parámetro
--     nuevo, sólo iguala una política a otra que ya existía en la misma tabla.

drop policy if exists inc_select on incidencias;
create policy inc_select on incidencias for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));
