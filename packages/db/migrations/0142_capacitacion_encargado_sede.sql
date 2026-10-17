-- 0142: el encargado de tienda ve el avance de la capacitación de la gente de SU sede.
-- Decisión del dueño (17-oct-2026): la persona nueva ve sólo la suya; el encargado ve a su gente
-- (sólo su sede); el admin ve todo. Antes de esto el encargado sólo veía lo que él mismo dictaba.
-- Sólo lectura: calificar sigue siendo del capacitador asignado o del admin (0131).
-- Idempotente: create or replace + drop policy if exists.

create or replace function private.capacitacion_encargado_ve(p_nuevo uuid)
  returns boolean language sql stable security definer set search_path = ''
as $$
  select private.app_mi_rol() = 'encargado_tienda'
     and exists (
       select 1 from public.empleados n
        where n.id = p_nuevo
          and (n.sede_cod in (select private.app_sedes())
               or exists (select 1 from public.empleado_tiendas t
                           where t.empleado_id = n.id and t.sede_cod in (select private.app_sedes())))
     );
$$;
revoke all on function private.capacitacion_encargado_ve(uuid) from public, anon;
grant execute on function private.capacitacion_encargado_ve(uuid) to authenticated;

drop policy if exists cap_select on public.capacitaciones;
create policy cap_select on public.capacitaciones for select to authenticated
  using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo)   -- suspendido: no lee
    and (private.app_es_admin() or nuevo_id = auth.uid() or capacitador_id = auth.uid()
         or private.capacitacion_encargado_ve(nuevo_id))
  );
-- avances y exámenes heredan la visibilidad vía el subselect sobre capacitaciones (sin cambios).
