-- 0031_directorio_empleados.sql — directorio de nombres visible para todos los autenticados.
-- Decisión del responsable: paridad con el viejo (cualquiera ve nombres/roles del equipo).
-- SECURITY DEFINER expone SOLO id/nombre/rol/sede (NUNCA salario, dni, etc.). La RLS de
-- empleados sigue intacta (un no-admin solo se ve a sí mismo en la tabla; los nombres de
-- terceros salen por esta función). Se suma al lote 0029 diferido (schema privado).

create or replace function app_directorio()
  returns table(id uuid, nombre text, rol text, sede_cod text)
  language sql stable security definer set search_path = public
as $$
  -- Sin filtro activo: el directorio resuelve nombres también en registros históricos
  -- (un encargado/responsable que luego se desactiva debe seguir mostrando su nombre).
  select e.id, e.nombre, e.rol, e.sede_cod from empleados e;
$$;

revoke execute on function app_directorio() from public, anon;
grant execute on function app_directorio() to authenticated;
