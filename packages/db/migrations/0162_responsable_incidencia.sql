-- 0162_responsable_incidencia.sql — valida el responsable de una incidencia sin abrir `empleados`.
--
-- Spec: docs/superpowers/specs/2026-10-18-release-arreglos-verificador-design.md §1.
-- Un encargado solo ve su propia fila de `empleados` (RLS, 0002), así que la validación del
-- responsable hecha desde la app rechazaba todo reporte con un responsable ajeno. Esta función
-- decide por dentro y devuelve únicamente un booleano: no expone ningún dato de la persona.
-- Idempotente.

create or replace function public.incidencia_responsable_valido(p_empleado uuid, p_sede text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'PERMISO: inicia sesión para continuar';
  end if;
  if p_empleado is null or coalesce(p_sede, '') = '' then
    return false;
  end if;
  -- Solo el administrador o quien trabaja en esa sede puede preguntar por una persona de esa sede.
  if not (private.app_es_admin() or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no tienes acceso a esta sede';
  end if;
  return exists (
    select 1 from empleados e
    where e.id = p_empleado
      and e.activo
      and (e.sede_cod = p_sede
           or exists (select 1 from empleado_tiendas t where t.empleado_id = e.id and t.sede_cod = p_sede))
  );
end;
$$;

revoke execute on function public.incidencia_responsable_valido(uuid, text) from public, anon;
grant  execute on function public.incidencia_responsable_valido(uuid, text) to authenticated;

comment on function public.incidencia_responsable_valido(uuid, text) is
  '0162: ¿el empleado está activo y pertenece a la sede? Solo devuelve un booleano; exige ser admin o de esa sede.';
