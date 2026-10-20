-- 0185 — Gestión rápida de usuarios (Personal): cambiar el código de una persona y dejar rastro.
-- Spec: docs/superpowers/specs/empleados/2026-10-20-usuarios-gestion-rapida-design.md
-- Prueba: packages/db/pruebas/0185_usuarios_gestion_rapida.prueba.sql (escrita antes). Idempotente.
--
-- · empleado_codigo_cambiar: sólo admin; 4 dígitos; único. El trigger de audit_log de `empleados`
--   deja quién y qué cambió. El correo de Auth ({cod}@lucebien.local) lo sincroniza el servidor.
-- · empleado_auditar_accion: deja en audit_log una acción sin secretos (p. ej. contraseña temporal
--   generada). La contraseña nunca se guarda.

create or replace function public.empleado_codigo_cambiar(p_id uuid, p_cod text)
  returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ant text;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO: sólo el administrador cambia códigos';
  end if;
  if p_cod is null or p_cod !~ '^[0-9]{4}$' then
    raise exception 'DATO: el código debe tener exactamente 4 dígitos';
  end if;
  select cod into v_ant from empleados where id = p_id for update;
  if not found then
    raise exception 'DATO: la persona no existe';
  end if;
  if v_ant = p_cod then
    return v_ant;
  end if;
  if exists (select 1 from empleados where cod = p_cod and id <> p_id) then
    raise exception 'DATO: ese código ya lo tiene otra persona';
  end if;
  update empleados set cod = p_cod where id = p_id;
  return v_ant;
end;
$$;
revoke execute on function public.empleado_codigo_cambiar(uuid, text) from public, anon;
grant  execute on function public.empleado_codigo_cambiar(uuid, text) to authenticated;

create or replace function public.empleado_auditar_accion(p_id uuid, p_accion text)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO: sólo el administrador';
  end if;
  if not exists (select 1 from empleados where id = p_id) then
    raise exception 'DATO: la persona no existe';
  end if;
  insert into audit_log (tabla, operacion, fila_id, actor, antes, despues)
  values ('empleados', 'UPDATE', p_id::text, auth.uid(), null,
          jsonb_build_object('accion', left(coalesce(p_accion, ''), 120)));
end;
$$;
revoke execute on function public.empleado_auditar_accion(uuid, text) from public, anon;
grant  execute on function public.empleado_auditar_accion(uuid, text) to authenticated;
