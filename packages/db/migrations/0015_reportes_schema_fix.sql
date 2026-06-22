-- 0015_reportes_schema_fix.sql — completa 2 columnas con datos reales que el schema
-- nuevo no tenía, para que el ETL de Reportes FR-01 no pierda nada del origen:
--   reporte_actividades.obs_eval  → observación del evaluador por actividad (1 fila en origen).
--   actividades_config.descuento  → peso de descuento por actividad (datos reales en muchas filas).
-- Aditivo e idempotente.

alter table reporte_actividades
  add column if not exists obs_eval text;

alter table actividades_config
  add column if not exists descuento numeric default 0;
