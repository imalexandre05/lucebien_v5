-- 0036_dispositivos_autorizados.sql — Acceso restringido a EQUIPOS AUTORIZADOS.
-- Enfoque elegido con el responsable: dispositivos registrados con aprobación de admin.
--   · El navegador guarda un token aleatorio de dispositivo (cookie httpOnly `sci_device`).
--   · El middleware (detrás del flag DEVICE_GATE) solo deja pasar equipos en estado 'aprobado'.
--   · Un equipo nuevo se registra solo como 'pendiente'; un admin lo aprueba desde el ERP.
-- Bootstrap sin lock-out: mientras NO exista ningún equipo aprobado, el estado es 'setup'
-- (se permite el acceso) para que el primer admin pueda entrar y aprobar su equipo.

create table if not exists dispositivos_autorizados (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null unique,
  nombre       text,
  sede_cod     text,
  user_agent   text,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'aprobado', 'rechazado', 'revocado')),
  aprobado_por uuid references empleados(id),
  creado_en    timestamptz not null default now(),
  aprobado_en  timestamptz,
  ultimo_visto timestamptz not null default now()
);
create index if not exists idx_disp_estado on dispositivos_autorizados(estado);

alter table dispositivos_autorizados enable row level security;

-- Solo admin gestiona la tabla directamente (pantalla de gestión). Los equipos aún no
-- aprobados NO leen la tabla: usan las RPC SECURITY DEFINER de abajo.
drop policy if exists disp_admin_rw on dispositivos_autorizados;
create policy disp_admin_rw on dispositivos_autorizados for all
  using (public.app_es_admin())
  with check (public.app_es_admin());

-- ── RPCs ──────────────────────────────────────────────────────────────────────
-- Estado del equipo (la llama el middleware en cada navegación y la página /dispositivo).
-- Registra el equipo como 'pendiente' si es nuevo y refresca ultimo_visto. Devuelve:
--   'setup'    → aún no hay NINGÚN equipo aprobado (bootstrap: se permite)
--   'aprobado' | 'pendiente' | 'rechazado' | 'revocado' → estado real del equipo
--   'none'     → device_id vacío
create or replace function public.dispositivo_estado(p_device_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_hay_aprobados boolean;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return 'none';
  end if;

  insert into public.dispositivos_autorizados (device_id, estado)
  values (p_device_id, 'pendiente')
  on conflict (device_id) do update set ultimo_visto = now()
  returning estado into v_estado;

  select exists(select 1 from public.dispositivos_autorizados where estado = 'aprobado')
    into v_hay_aprobados;

  if not v_hay_aprobados then
    return 'setup';
  end if;
  return v_estado;
end;
$$;

-- Completa datos amables del equipo (nombre, sede, user agent) desde /dispositivo.
create or replace function public.dispositivo_registrar(
  p_device_id text, p_nombre text, p_user_agent text, p_sede text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_estado text;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    return 'none';
  end if;
  insert into public.dispositivos_autorizados (device_id, nombre, user_agent, sede_cod, estado)
  values (p_device_id, nullif(trim(p_nombre), ''), nullif(p_user_agent, ''), nullif(trim(p_sede), ''), 'pendiente')
  on conflict (device_id) do update
    set nombre = coalesce(nullif(trim(excluded.nombre), ''), public.dispositivos_autorizados.nombre),
        user_agent = coalesce(excluded.user_agent, public.dispositivos_autorizados.user_agent),
        sede_cod = coalesce(excluded.sede_cod, public.dispositivos_autorizados.sede_cod),
        ultimo_visto = now()
  returning estado into v_estado;
  return v_estado;
end;
$$;

-- Aprueba el equipo ACTUAL por su token (autoaprobación de un admin — bootstrap sin lock-out).
create or replace function public.dispositivo_autoaprobar(p_device_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_estado text;
begin
  if not public.app_es_admin() then
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

-- Cambia el estado por id (admin): aprobar / rechazar / revocar desde la gestión.
create or replace function public.dispositivo_set_estado(p_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.app_es_admin() then
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

-- Permisos: el device-gate corre SOLO para usuarios ya autenticados (orden auth→device en el
-- middleware), así que ninguna RPC necesita el rol anon. Todas quedan solo para authenticated;
-- las de administración además validan app_es_admin() adentro.
revoke all on function public.dispositivo_estado(text) from public, anon;
revoke all on function public.dispositivo_registrar(text, text, text, text) from public, anon;
revoke all on function public.dispositivo_autoaprobar(text) from public, anon;
revoke all on function public.dispositivo_set_estado(uuid, text) from public, anon;
grant execute on function public.dispositivo_estado(text) to authenticated;
grant execute on function public.dispositivo_registrar(text, text, text, text) to authenticated;
grant execute on function public.dispositivo_autoaprobar(text) to authenticated;
grant execute on function public.dispositivo_set_estado(uuid, text) to authenticated;
