-- 0028_pagos_rls.sql — RLS de pagos (sensible por empleado): admin/almacén ven todo,
-- cada empleado ve los suyos; escritura solo admin. Cierra el último aviso INFO de módulos.

drop policy if exists pago_select on pagos;
create policy pago_select on pagos for select
  using (app_es_admin() or app_es_almacen() or empleado_id = auth.uid());

drop policy if exists pago_admin_write on pagos;
create policy pago_admin_write on pagos for all
  using (app_es_admin()) with check (app_es_admin());

create index if not exists idx_pagos_empleado on pagos(empleado_id);
