-- 0048_pedidos_pos.sql — Fase 9 del plan de mejora (POS: Caja + Pedidos unificados).
--
-- 1) Campos nuevos en `pedidos` para alquiler/venta/confección a medida. No se inventan fórmulas:
--    son datos de captura (fechas, tela, notas, monto de garantía) que ya se pedían en el flujo
--    de negocio pero no tenían dónde persistirse. El adelanto/cobro real de la garantía se sigue
--    registrando en `caja_movimientos` (categoría 'garantia'), tal como ya funcionaba — aquí solo
--    se guarda el monto ACORDADO en el pedido para referencia y para el contrato/seguimiento.
--    `etapa_confeccion` sigue la decisión E4 (corte → armado → ajuste → entrega): es un dato de
--    seguimiento del pedido, DISTINTO del pipeline de 9 pasos de lavandería (prenda_pasada).
alter table pedidos
  add column if not exists fecha_entrega date,
  add column if not exists notas text not null default '',
  add column if not exists garantia_monto numeric(10,2) not null default 0,
  add column if not exists tela text,
  add column if not exists fecha_prueba date,
  add column if not exists fecha_segunda_prueba date,
  add column if not exists etapa_confeccion text;

-- 2) Cajero como permiso configurable (no un rol nuevo): módulo pseudo 'pos_cobro' en la misma
--    tabla `permisos_modulos` de la Fase 4 — sin cambios de esquema, se reusa el mecanismo
--    genérico (modulo es texto libre). Sin esta fila, nadie más que admin/dueño puede cobrar.
--    Default sembrado (ajustable desde /configuracion/permisos, no es una regla fija): se asume
--    que "encargado_tienda" es quien atiende el mostrador y cobra — el usuario puede reasignarlo
--    a otros roles o convertirlo en rol propio si lo prefiere.
insert into permisos_modulos (rol, modulo, acciones) values
  ('encargado_tienda', 'pos_cobro', array['ver'])
on conflict (rol, modulo) do nothing;
