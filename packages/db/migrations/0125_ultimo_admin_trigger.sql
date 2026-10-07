-- 0125_ultimo_admin_trigger.sql — la empresa no se queda sin administrador activo, por ninguna vía
--
-- Implementa la «Enmienda del 06-oct-2026» (b) de
-- docs/superpowers/specs/2026-10-04-personal-ultimo-admin-alta-design.md.
--
-- El guard del último admin vivía sólo en la RPC `empleado_actualizar` (0114). La policy
-- `emp_admin_write` (0002, FOR ALL) deja a cualquier admin hacer `update empleados set
-- rol='confeccionista'` o `activo=false` — o un `delete` — directo por PostgREST, y dejar 0 admins.
--
-- Trigger AFTER UPDATE OR DELETE, por fila (AFTER y no BEFORE: así la comprobación ve el resultado
-- completo de la sentencia; un único update que degrade a los dos últimos admins no se cuela fila
-- por fila). Si la fila era admin/dueño activo y ya no lo es (cambio de rol, activo=false —que es
-- lo que mantiene sincronizado `estado`— o delete) y no queda ningún otro empleado activo con rol
-- admin/dueño, lanza `ULTIMO_ADMIN: …` y la sentencia se revierte.
--
-- Concurrencia: pg_advisory_xact_lock serializa las degradaciones; la segunda espera a que la
-- primera confirme y su conteo (sentencia nueva, READ COMMITTED) ya ve el resultado: no dejan 0.
--
-- La función es security definer (cuenta todos los admins aunque la RLS del que ejecuta no los
-- deje ver) y vive en `private`, sin execute para public/anon/authenticated. Los guards de
-- empleado_actualizar (0114), empleado_borrar_alta (0099) y actualizarEstadoEmpleado se conservan
-- por su mensaje amistoso; esto es la red de seguridad. Idempotente.

create or replace function private.empleados_guardar_ultimo_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_era_admin boolean := old.activo and old.rol in ('admin', 'dueno');
  v_sigue     boolean := false;
  v_quedan    int;
begin
  if tg_op = 'UPDATE' then
    v_sigue := new.activo and new.rol in ('admin', 'dueno');
  end if;

  -- Sólo importa cuando una fila que era admin activo deja de serlo.
  if not v_era_admin or v_sigue then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('empleados_ultimo_admin'));

  select count(*) into v_quedan
    from empleados
   where activo and rol in ('admin', 'dueno');

  if v_quedan = 0 then
    raise exception 'ULTIMO_ADMIN: no se puede dejar a la empresa sin ningún administrador activo. Nombra a otro administrador antes de cambiar el rol, suspender o borrar a este.'
      using errcode = 'P0001';
  end if;
  return null;
end $$;

revoke execute on function private.empleados_guardar_ultimo_admin() from public, anon, authenticated;

drop trigger if exists empleados_guardar_ultimo_admin on empleados;
create trigger empleados_guardar_ultimo_admin
  after update or delete on empleados
  for each row execute function private.empleados_guardar_ultimo_admin();
