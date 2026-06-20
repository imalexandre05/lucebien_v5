-- 0004_rls_comercial.sql — policies RLS que faltaban para el flujo comercial cuando
-- los repos pasaron a usar el cliente `server` (antes usaban service_role, que bypaseaba
-- la RLS — hallazgo H1). Aplicada vía MCP en W13.

-- empleado_tiendas: cada empleado ve sus propias sedes; admin/dueño todo.
-- (la usa getSesion() para armar la lista de sedes del usuario)
drop policy if exists emp_tiendas_select on empleado_tiendas;
create policy emp_tiendas_select on empleado_tiendas for select
  using (app_es_admin() or empleado_id = auth.uid());

-- pedido_items: hereda la visibilidad/escritura del pedido padre (filtrado por sede).
drop policy if exists pedido_items_all on pedido_items;
create policy pedido_items_all on pedido_items for all
  using (
    app_es_admin() or exists (
      select 1 from pedidos p
      where p.id = pedido_items.pedido_id and p.sede_cod in (select app_sedes())
    )
  )
  with check (
    app_es_admin() or exists (
      select 1 from pedidos p
      where p.id = pedido_items.pedido_id and p.sede_cod in (select app_sedes())
    )
  );
