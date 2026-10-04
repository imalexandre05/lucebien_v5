-- 0112_personal_ultimo_admin.sql — empleado_actualizar no deja la empresa sin administrador activo
--
-- Implementa docs/superpowers/specs/2026-10-04-personal-ultimo-admin-alta-design.md §1.
--
-- `empleado_actualizar` (última definición: 0050) cambia `empleados.rol` sin comprobar cuántos
-- administradores quedan. Se le suma la comprobación que ya usan empleado_borrar_alta (0099 §3) y
-- actualizarEstadoEmpleado() (suspender): si la persona es admin/dueño activo, el rol nuevo no es
-- admin/dueño y no hay otro admin/dueño activo, se lanza excepción y no se escribe nada.
--
-- Es `create or replace` de la MISMA firma (no hay sobrecarga) y conserva el grant: idempotente.
-- El resto del cuerpo es idéntico al de 0050.

create or replace function empleado_actualizar(
  p_id            uuid,
  p_nombre        text,
  p_rol_base      text,
  p_rol_cod       text,
  p_sede_cod      text,
  p_tiendas       text[],
  p_fecha_ingreso date,
  p_notas         text,
  p_telefono      text,
  p_dni           text,
  p_direccion     text,
  p_salario_base  numeric
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_rol    text;
  v_nombre text := trim(p_nombre);
begin
  if not private.app_es_admin() then
    raise exception 'Solo administradores pueden editar colaboradores';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if not exists (select 1 from empleados where id = p_id) then
    raise exception 'Colaborador no encontrado';
  end if;
  if exists (select 1 from empleados where lower(nombre) = lower(v_nombre) and id <> p_id) then
    raise exception 'Ya existe un colaborador con ese nombre';
  end if;

  if p_rol_cod is not null then
    select rol_base into v_rol from roles where cod = p_rol_cod and activo;
    if not found then
      raise exception 'El rol derivado % no existe o está inactivo', p_rol_cod;
    end if;
  else
    if p_rol_base is null or p_rol_base not in (
      'admin', 'dueno', 'encargado_tienda', 'encargado_almacen',
      'confeccionista', 'ventas_junior', 'ventas_junior_2'
    ) then
      raise exception 'Rol base inválido: %', p_rol_base;
    end if;
    v_rol := p_rol_base;
  end if;

  -- No dejar la empresa sin administrador activo (0112; mismo criterio que empleado_borrar_alta,
  -- 0099 §3): si la persona es admin/dueño activo, el rol nuevo ya no lo es y no queda ningún otro
  -- admin/dueño activo, se niega. Pasar de admin a dueño (o al revés) sí se permite.
  if exists (
       select 1 from empleados where id = p_id and rol in ('admin', 'dueno') and activo
     )
     and v_rol not in ('admin', 'dueno')
     and not exists (
       select 1 from empleados where rol in ('admin', 'dueno') and activo and id <> p_id
     )
  then
    raise exception 'ESTADO:no se puede quitar el rol de administrador al último administrador activo. Nombra a otro administrador antes de cambiar el rol de este.';
  end if;

  update empleados set
    nombre        = v_nombre,
    rol           = v_rol,
    rol_cod       = p_rol_cod,
    sede_cod      = p_sede_cod,
    fecha_ingreso = p_fecha_ingreso,
    notas         = coalesce(p_notas, ''),
    telefono      = coalesce(p_telefono, ''),
    dni           = coalesce(p_dni, ''),
    direccion     = coalesce(p_direccion, ''),
    salario_base  = coalesce(p_salario_base, 0)
  where id = p_id;

  -- Tiendas: reemplazo completo. La sede primaria SIEMPRE queda incluida en sus propias tiendas
  -- (evita el estado inconsistente de "sede primaria X" + "sin acceso a X").
  delete from empleado_tiendas where empleado_id = p_id;
  insert into empleado_tiendas (empleado_id, sede_cod)
  select distinct p_id, s
  from unnest(array_append(coalesce(p_tiendas, '{}'::text[]), p_sede_cod)) as s
  where s is not null and s <> '';
end;
$$;

revoke execute on function empleado_actualizar(uuid, text, text, text, text, text[], date, text, text, text, text, numeric) from public;
grant execute on function empleado_actualizar(uuid, text, text, text, text, text[], date, text, text, text, text, numeric) to authenticated;
