-- 0026_eval_config.sql — parámetros de evaluación EDITABLES en config (filosofía: todo configurable)
-- + RLS de evaluaciones_mensuales. Los pesos NO se hardcodean: viven en config y se editan desde
-- la página Configuración. Defaults de CONTEXTO-PROYECTO.md §5 (el responsable los ajusta).

insert into config (clave, valor) values
  ('peso_competencias', '0.25'),
  ('peso_valores',      '0.25'),
  ('peso_operaciones',  '0.10'),
  ('peso_software',     '0.10'),
  ('peso_limpieza',     '0.10'),
  ('peso_examenes',     '0.15'),
  ('peso_tardanza',     '0.05'),
  ('eval_tardanza_min_por_punto', '15'),
  ('eval_bonus_ventas_max',       '2')
on conflict (clave) do nothing;

-- evaluaciones_mensuales: dato sensible por empleado. admin/almacén ven todo; cada empleado la suya.
drop policy if exists eval_select on evaluaciones_mensuales;
create policy eval_select on evaluaciones_mensuales for select
  using (app_es_admin() or app_es_almacen() or empleado_id = auth.uid());

drop policy if exists eval_admin_write on evaluaciones_mensuales;
create policy eval_admin_write on evaluaciones_mensuales for all
  using (app_es_admin()) with check (app_es_admin());
