-- 0104_empleados_recomendaciones.sql — columna `recomendaciones` + RPC chica para guardarla (C-2).
--
-- Implementa docs/superpowers/specs/empleados/2026-09-08-contrato-datos-completos-design.md.
--
-- RPC nueva, no extiende `empleado_actualizar` (spec §3): agregarle un parámetro con `create or
-- replace` no la reemplaza, crea una sobrecarga nueva al lado de la vieja porque cambia la firma
-- completa — y PostgREST resolviendo por nombres de JSON es exactamente la ambigüedad que este
-- repo ya aprendió a evitar. Se agrega una RPC separada, chica, con el mismo guard de admin.
--
-- Idempotente: `add column if not exists` y `create or replace function` sobre una firma que no
-- cambia.

alter table empleados add column if not exists recomendaciones text default '';

create or replace function empleado_actualizar_recomendaciones(p_id uuid, p_texto text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not private.app_es_admin() then
    raise exception 'Solo administradores pueden editar colaboradores';
  end if;
  if not exists (select 1 from empleados where id = p_id) then
    raise exception 'Colaborador no encontrado';
  end if;

  update empleados set recomendaciones = coalesce(p_texto, '') where id = p_id;
end;
$$;
revoke execute on function empleado_actualizar_recomendaciones(uuid, text) from public;
grant execute on function empleado_actualizar_recomendaciones(uuid, text) to authenticated;
