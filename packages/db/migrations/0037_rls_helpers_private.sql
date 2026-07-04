-- 0037_rls_helpers_private.sql — Endurecimiento: mover los helpers SECURITY DEFINER de RLS a un
-- schema privado (no expuesto por PostgREST) para que dejen de ser invocables vía /rest/v1/rpc
-- (lints 0028/0029). Verificado: las 41 policies que los usan siguen a la función por OID (no hay
-- que recrearlas); solo `app_es_admin` se referencia en cuerpos de funciones (5), que se recrean
-- apuntando a `private.app_es_admin`. `app_directorio` NO se mueve (la app lo llama por RPC).
-- Transaccional: si algo falla, revierte entero.

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- app_sedes y app_es_almacen solo se usan en policies → basta moverlos (las policies los siguen).
alter function public.app_es_admin()   set schema private;
alter function public.app_es_almacen() set schema private;
alter function public.app_sedes()      set schema private;

-- Las 5 funciones que llamaban a app_es_admin() → ahora private.app_es_admin(). (CREATE OR REPLACE
-- conserva grants y dueño; se mantienen firmas, search_path y cuerpos intactos salvo esa referencia.)
create or replace function public.dispositivo_autoaprobar(p_device_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_estado text;
begin
  if not private.app_es_admin() then
    raise exception 'solo un administrador puede aprobar equipos';
  end if;
  insert into public.dispositivos_autorizados (device_id, estado, aprobado_por, aprobado_en)
  values (p_device_id, 'aprobado', auth.uid(), now())
  on conflict (device_id) do update
    set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = now()
  returning estado into v_estado;
  return v_estado;
end;
$$;

create or replace function public.dispositivo_set_estado(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not private.app_es_admin() then
    raise exception 'solo un administrador puede cambiar el estado de un equipo';
  end if;
  if p_estado not in ('pendiente', 'aprobado', 'rechazado', 'revocado') then
    raise exception 'estado inválido';
  end if;
  update public.dispositivos_autorizados
    set estado = p_estado,
        aprobado_por = case when p_estado = 'aprobado' then auth.uid() else aprobado_por end,
        aprobado_en  = case when p_estado = 'aprobado' then now() else aprobado_en end
    where id = p_id;
end;
$$;

create or replace function public.reportes_anular(p_id text)
returns void language plpgsql set search_path to 'public' as $$
begin
  if not private.app_es_admin() then raise exception 'Solo admin/dueño puede anular'; end if;
  delete from reporte_trabajadores where reporte_id = p_id;
  delete from reporte_actividades  where reporte_id = p_id;
  delete from reporte_extras       where reporte_id = p_id;
  delete from reportes where id = p_id;
end;
$$;

create or replace function public.reportes_anular_eval(p_id text)
returns void language plpgsql set search_path to 'public' as $$
begin
  if not private.app_es_admin() then raise exception 'Solo admin/dueño'; end if;
  update reporte_actividades set calificacion = null, obs_eval = null where reporte_id = p_id;
  update reportes
  set evaluado = false, evaluador_id = null, puntaje_eval = null, puntaje = 0, bloqueado = true
  where id = p_id;
end;
$$;

create or replace function public.reportes_evaluar(p_id text, p_calificaciones jsonb)
returns integer language plpgsql set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_pun int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from reportes where id = p_id) then
    raise exception 'Reporte % no encontrado', p_id;
  end if;
  if not private.app_es_admin()
     and exists (select 1 from reporte_trabajadores where reporte_id = p_id and empleado_id = v_actor) then
    raise exception 'No puedes evaluar este reporte: estuviste en el turno (el evaluador debe ser externo).';
  end if;

  update reporte_actividades ra
  set calificacion = (c->>'cal')::numeric,
      obs_eval     = coalesce(c->>'obs', '')
  from jsonb_array_elements(p_calificaciones) c
  where ra.reporte_id = p_id and ra.cod = c->>'cod';

  select coalesce(round(sum(peso * calificacion) / nullif(sum(peso), 0) * 100), 0)::int
    into v_pun
  from reporte_actividades where reporte_id = p_id;

  update reportes
  set evaluado = true, evaluador_id = v_actor, puntaje_eval = v_pun, puntaje = v_pun, bloqueado = false
  where id = p_id;

  return v_pun;
end;
$$;
