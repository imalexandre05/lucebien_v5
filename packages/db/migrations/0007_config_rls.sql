-- 0007_config_rls.sql — el catálogo `config` (pesos de puntos pts_*, precios) tenía RLS
-- habilitada SIN policy → nadie salvo service_role podía leerlo. La acción de avanzar
-- prenda necesita leer el peso de la etapa con el cliente `server` (RLS).
-- Diseño del plan: catálogos = lectura a cualquier autenticado, escritura solo admin/dueño.

drop policy if exists config_select on config;
create policy config_select on config for select
  using (auth.uid() is not null);

drop policy if exists config_admin on config;
create policy config_admin on config for all
  using (app_es_admin())
  with check (app_es_admin());
