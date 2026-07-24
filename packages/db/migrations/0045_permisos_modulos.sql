-- 0045_permisos_modulos.sql — matriz de permisos configurable por rol (Fase 4 del plan de mejora).
-- Reemplaza el placeholder hardcodeado de packages/adapter-lucebien/src/permisos-config.ts por una
-- tabla editable desde Configuración. Mecanismo de evaluación (puede()) ya existe en
-- packages/core/src/auth.ts — sin cambios ahí, solo se cambia DE DÓNDE sale la matriz.
-- admin/dueno tienen acceso total por mecanismo (puede() los deja pasar siempre); no se siembran filas
-- para ellos. Cada fila = (rol, modulo) → array de acciones ('ver' es lo que gatea la navegación).
--
-- Defaults sembrados (ajustables desde /configuracion/permisos, no son reglas fijas):
--   Operativo puro (confeccionista, ventas_junior, ventas_junior_2): pipeline, reportes, pedidos, caja.
--   Encargados (tienda/almacén, ya "supervisores" en el core): lo operativo + dashboard/estadísticas/
--     finanzas/evaluar_reportes/pagos/evaluaciones — NO empleados/configuracion/dispositivos (esos
--     quedan solo admin/dueno por ausencia de filas: puede() no tiene entrada → false).
--   incidencias: nadie más que admin/dueno ve el MÓDULO (decisión del plan: los operativos ENVÍAN
--     incidencias desde su propio reporte de turno, no navegan el listado completo).

create table if not exists permisos_modulos (
  rol      text not null,
  modulo   text not null,
  acciones text[] not null default '{}',
  primary key (rol, modulo)
);
alter table permisos_modulos enable row level security;

drop policy if exists permisos_select on permisos_modulos;
create policy permisos_select on permisos_modulos for select
  using (auth.uid() is not null);
drop policy if exists permisos_admin_write on permisos_modulos;
create policy permisos_admin_write on permisos_modulos for all
  using (app_es_admin()) with check (app_es_admin());

-- Idempotente: upsert de los defaults (no pisa lo que el admin ya haya editado a mano, salvo que
-- borre la fila antes — on conflict do nothing preserva ediciones existentes).
insert into permisos_modulos (rol, modulo, acciones) values
  ('confeccionista',    'pipeline',      array['ver']),
  ('confeccionista',    'reportes',      array['ver']),
  ('confeccionista',    'pedidos',       array['ver']),
  ('confeccionista',    'caja',          array['ver']),
  ('confeccionista',    'notificaciones',array['ver']),
  ('ventas_junior',     'pipeline',      array['ver']),
  ('ventas_junior',     'reportes',      array['ver']),
  ('ventas_junior',     'pedidos',       array['ver']),
  ('ventas_junior',     'caja',          array['ver']),
  ('ventas_junior',     'notificaciones',array['ver']),
  ('ventas_junior_2',   'pipeline',      array['ver']),
  ('ventas_junior_2',   'reportes',      array['ver']),
  ('ventas_junior_2',   'pedidos',       array['ver']),
  ('ventas_junior_2',   'caja',          array['ver']),
  ('ventas_junior_2',   'notificaciones',array['ver']),
  ('encargado_tienda',  'pipeline',        array['ver']),
  ('encargado_tienda',  'reportes',        array['ver']),
  ('encargado_tienda',  'pedidos',         array['ver']),
  ('encargado_tienda',  'caja',            array['ver']),
  ('encargado_tienda',  'notificaciones',  array['ver']),
  ('encargado_tienda',  'dashboard',       array['ver']),
  ('encargado_tienda',  'estadisticas',    array['ver']),
  ('encargado_tienda',  'finanzas',        array['ver']),
  ('encargado_tienda',  'evaluar_reportes',array['ver']),
  ('encargado_tienda',  'pagos',           array['ver']),
  ('encargado_tienda',  'evaluaciones',    array['ver']),
  ('encargado_tienda',  'clientes',        array['ver']),
  ('encargado_almacen', 'pipeline',        array['ver']),
  ('encargado_almacen', 'reportes',        array['ver']),
  ('encargado_almacen', 'pedidos',         array['ver']),
  ('encargado_almacen', 'caja',            array['ver']),
  ('encargado_almacen', 'notificaciones',  array['ver']),
  ('encargado_almacen', 'dashboard',       array['ver']),
  ('encargado_almacen', 'estadisticas',    array['ver']),
  ('encargado_almacen', 'finanzas',        array['ver']),
  ('encargado_almacen', 'evaluar_reportes',array['ver']),
  ('encargado_almacen', 'pagos',           array['ver']),
  ('encargado_almacen', 'evaluaciones',    array['ver']),
  ('encargado_almacen', 'inventario',      array['ver']),
  ('encargado_almacen', 'proveedores',     array['ver']),
  ('encargado_almacen', 'materiales',      array['ver']),
  ('encargado_almacen', 'compras',         array['ver'])
on conflict (rol, modulo) do nothing;
