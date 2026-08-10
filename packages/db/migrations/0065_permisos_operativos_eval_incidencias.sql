-- 0065_permisos_operativos_eval_incidencias.sql — el dueño confirmó que los 3 roles operativos
-- (confeccionista, ventas_junior, ventas_junior_2) deben ver, además de lo que ya tienen:
--   · evaluar_reportes: la evaluación es cruzada ENTRE OPERARIOS de distinto turno (el de la
--     tarde evalúa al de la mañana y viceversa) — hoy solo la ven encargados/admin/dueño (0045).
--     reportes_evaluar (0033) ya impide autoevaluarse (el evaluador no puede ser del turno), así
--     que ampliar este permiso no abre ningún hueco de integridad.
--   · incidencias: 0046 lo dejó admin-only a propósito; el dueño pidió explícitamente que los
--     operativos SÍ vean el módulo (antes solo las reportaban a ciegas desde su turno).
-- Idempotente (on conflict do nothing, no pisa ediciones ya hechas desde /configuracion/permisos).

insert into permisos_modulos (rol, modulo, acciones) values
  ('confeccionista',  'evaluar_reportes', array['ver']),
  ('ventas_junior',   'evaluar_reportes', array['ver']),
  ('ventas_junior_2', 'evaluar_reportes', array['ver']),
  ('confeccionista',  'incidencias',      array['ver']),
  ('ventas_junior',   'incidencias',      array['ver']),
  ('ventas_junior_2', 'incidencias',      array['ver'])
on conflict (rol, modulo) do nothing;
