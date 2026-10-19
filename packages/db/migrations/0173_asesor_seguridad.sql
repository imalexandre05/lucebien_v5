-- 0173 — Ajustes del asesor de seguridad de Supabase (auditoría 1, 19-oct-2026).
-- Prueba: packages/db/pruebas/0173_asesor_seguridad.prueba.sql (escrita antes). Idempotente.
-- No cambia ninguna regla de negocio ni la cadena del sueldo: sólo search_path, una cerradura que
-- faltaba y dos tablas de respaldo que salen de la API.
--
-- Revisado y SIN cambio (lo marca el asesor, pero es deliberado):
--   · public.prendas_despachadas (0151): corre con los permisos de su dueño a propósito y filtra por
--     dentro (admin, almacén o sede destino en app_sedes()); security_barrier; sólo SELECT para
--     authenticated, nada para anon. Pasarla a security_invoker obligaría a abrir prenda_pasada.
--   · public.v_catalogo_publico (0074): catálogo público para LB-Web; sólo columnas publicables de
--     prendas publicable/disponibles. Si LB-Web ya no la usa, la decisión de retirarla es del dueño.
--   · public.schema_migrations (0103): RLS sin policies = sólo service_role. Es lo buscado.

-- 1) WARN function_search_path_mutable: private.sueldo_mes_es (0144).
alter function private.sueldo_mes_es(date) set search_path = '';

-- 2) private.app_es_gestor_solicitudes (0087) no exigía e.activo, la tercera cerradura de la 0083:
--    un encargado de almacén suspendido con su JWT aún vivo podía aprobar o rechazar solicitudes.
create or replace function private.app_es_gestor_solicitudes()
  returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from empleados e
    where e.id = auth.uid() and e.activo and e.rol in ('admin', 'dueno', 'encargado_almacen')
  );
$$;

-- 3) Respaldos creados a mano (ver 0082): RLS sin policies en public. Se mueven al esquema private,
--    que PostgREST no expone; los datos no se tocan. Borrarlos es decisión del dueño.
do $$
declare t text;
begin
  foreach t in array array['asistencias_respaldo_0075', 'asistencias_respaldo_20260821'] loop
    if to_regclass('public.' || t) is not null and to_regclass('private.' || t) is null then
      execute format('alter table public.%I set schema private', t);
      execute format('revoke all on private.%I from public, anon, authenticated', t);
    end if;
  end loop;
end $$;
