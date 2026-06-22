-- 0016_reportes_actividades_peso_numeric.sql — corrige el tipo de `peso`.
-- En el SQLite viejo la columna se declaró INTEGER pero (tipado laxo) guarda REALes
-- como 1.5 en 645/1679 filas. En Postgres `integer` rechaza "1.5" → el ETL fallaba.
-- Se alinea con actividades_config.peso, que ya es numeric.

alter table reporte_actividades
  alter column peso type numeric using peso::numeric;
