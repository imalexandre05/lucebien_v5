-- 0029_sedes_rls.sql — sedes es un catálogo: lectura para autenticados, escritura admin.
-- Cierra el último aviso INFO "RLS sin policy" (todas las tablas de módulos ya tienen policy).

drop policy if exists sedes_select on sedes;
create policy sedes_select on sedes for select using (auth.uid() is not null);

drop policy if exists sedes_admin_write on sedes;
create policy sedes_admin_write on sedes for all using (app_es_admin()) with check (app_es_admin());
