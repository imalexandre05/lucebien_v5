-- 0134_candidatos.sql — ingreso de personal: candidatos, entrevista y prueba (ticket 14).
-- Spec: docs/superpowers/specs/empleados/2026-10-11-candidatos-entrevista-prueba-design.md
-- Prueba: packages/db/pruebas/0134_candidatos.prueba.sql
--
-- Datos personales (DNI, teléfono) de gente que aún no es colaboradora: SÓLO administrador/dueño
-- (private.app_es_admin()) leen y escriben, y toda escritura pasa por RPC. Sin escritura directa.
-- Default no confirmado (docs/pendientes-negocio.md): personal_prueba_dias = 3 (dato del Excel).
-- Idempotente: create ... if not exists, drop policy/trigger if exists, create or replace, on conflict.

create table if not exists public.candidatos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) > 0),
  dni              text,
  telefono         text,
  rol_cod          text,
  sede_cod         text,
  estado           text not null default 'por_entrevistar'
                   check (estado in ('por_entrevistar','entrevistado','en_prueba','prueba_cerrada','contratado','descartado')),
  entrevista_fecha date,
  entrevista_obs   text,
  prueba_desde     date,
  prueba_hasta     date,
  resultado        text check (resultado in ('bueno','regular','malo')),
  resultado_obs    text,
  empleado_id      uuid unique references public.empleados(id) on delete restrict,
  creado_por       uuid references public.empleados(id) on delete set null,
  creado_en        timestamptz not null default now()
);

alter table public.candidatos enable row level security;
drop policy if exists candidatos_select on public.candidatos;
create policy candidatos_select on public.candidatos for select to authenticated using (private.app_es_admin());

revoke all on public.candidatos from anon, authenticated;
grant select on public.candidatos to authenticated;

drop trigger if exists trg_audit_candidatos on public.candidatos;
create trigger trg_audit_candidatos after insert or update or delete on public.candidatos
  for each row execute function private.audit_log_trigger();

insert into public.config (clave, valor) values
  ('personal_prueba_dias', '3')   -- DEFAULT del Excel («Prueba (3 días)»), editable en /configuracion
on conflict (clave) do nothing;

-- Guard común: admin + candidato existente + transición válida. Devuelve la fila bloqueada.
create or replace function private.candidato_cargar(p_id uuid, p_hacia text)
  returns public.candidatos language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.candidatos;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona candidatos'; end if;
  select * into c from public.candidatos where id = p_id for update;
  if not found then raise exception 'Candidato no encontrado'; end if;
  if not (
    (c.estado = 'por_entrevistar' and p_hacia in ('entrevistado','descartado')) or
    (c.estado = 'entrevistado'    and p_hacia in ('en_prueba','descartado')) or
    (c.estado = 'en_prueba'       and p_hacia in ('prueba_cerrada','descartado')) or
    (c.estado = 'prueba_cerrada'  and p_hacia in ('contratado','entrevistado','descartado')) or
    (c.estado = 'descartado'      and p_hacia = 'por_entrevistar')
  ) then
    raise exception 'No se puede pasar de «%» a «%»: primero entrevista y prueba, en ese orden (transición no válida)', c.estado, p_hacia;
  end if;
  return c;
end;
$$;
revoke all on function private.candidato_cargar(uuid, text) from public, anon, authenticated;

create or replace function public.candidato_crear(p_nombre text, p_dni text, p_telefono text, p_rol text, p_sede text)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona candidatos'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'El candidato necesita un nombre'; end if;
  insert into candidatos (nombre, dni, telefono, rol_cod, sede_cod, creado_por)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_dni, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
            nullif(p_rol, ''), nullif(p_sede, ''), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.candidato_entrevistar(p_id uuid, p_obs text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'entrevistado');
  update candidatos set estado = 'entrevistado', entrevista_fecha = (now() at time zone 'America/Lima')::date,
         entrevista_obs = nullif(btrim(coalesce(p_obs, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_iniciar_prueba(p_id uuid, p_desde date)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_dias int;
begin
  perform private.candidato_cargar(p_id, 'en_prueba');
  if p_desde is null then raise exception 'Indica desde qué día empieza la prueba'; end if;
  select coalesce(nullif(btrim(valor), '')::int, 3) into v_dias from config where clave = 'personal_prueba_dias';
  v_dias := greatest(coalesce(v_dias, 3), 1);
  update candidatos set estado = 'en_prueba', prueba_desde = p_desde, prueba_hasta = p_desde + (v_dias - 1),
         resultado = null, resultado_obs = null where id = p_id;
end;
$$;

create or replace function public.candidato_cerrar_prueba(p_id uuid, p_resultado text, p_obs text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.candidatos;
begin
  c := private.candidato_cargar(p_id, 'prueba_cerrada');
  if p_resultado is null or p_resultado not in ('bueno','regular','malo') then
    raise exception 'El resultado debe ser bueno, regular o malo';
  end if;
  if (now() at time zone 'America/Lima')::date < c.prueba_hasta then
    raise exception 'La prueba termina el %: se cierra desde el día de fin en adelante', to_char(c.prueba_hasta, 'DD/MM/YYYY');
  end if;
  update candidatos set estado = 'prueba_cerrada', resultado = p_resultado,
         resultado_obs = nullif(btrim(coalesce(p_obs, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_repetir_prueba(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'entrevistado');
  update candidatos set estado = 'entrevistado' where id = p_id;
end;
$$;

create or replace function public.candidato_descartar(p_id uuid, p_motivo text)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'descartado');
  update candidatos set estado = 'descartado', resultado_obs = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_id;
end;
$$;

create or replace function public.candidato_reactivar(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'por_entrevistar');
  update candidatos set estado = 'por_entrevistar' where id = p_id;   -- el rastro queda en la auditoría
end;
$$;

-- Pasar a alta: se llama DESPUÉS de crear al empleado. Un candidato se vincula una sola vez.
create or replace function public.candidato_vincular(p_id uuid, p_empleado uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform private.candidato_cargar(p_id, 'contratado');
  if not exists (select 1 from empleados where id = p_empleado) then raise exception 'Persona no encontrada'; end if;
  update candidatos set estado = 'contratado', empleado_id = p_empleado where id = p_id;
end;
$$;

revoke execute on function public.candidato_crear(text, text, text, text, text)  from public, anon;
revoke execute on function public.candidato_entrevistar(uuid, text)             from public, anon;
revoke execute on function public.candidato_iniciar_prueba(uuid, date)          from public, anon;
revoke execute on function public.candidato_cerrar_prueba(uuid, text, text)     from public, anon;
revoke execute on function public.candidato_repetir_prueba(uuid)                from public, anon;
revoke execute on function public.candidato_descartar(uuid, text)               from public, anon;
revoke execute on function public.candidato_reactivar(uuid)                     from public, anon;
revoke execute on function public.candidato_vincular(uuid, uuid)                from public, anon;
grant  execute on function public.candidato_crear(text, text, text, text, text)  to authenticated;
grant  execute on function public.candidato_entrevistar(uuid, text)             to authenticated;
grant  execute on function public.candidato_iniciar_prueba(uuid, date)          to authenticated;
grant  execute on function public.candidato_cerrar_prueba(uuid, text, text)     to authenticated;
grant  execute on function public.candidato_repetir_prueba(uuid)                to authenticated;
grant  execute on function public.candidato_descartar(uuid, text)               to authenticated;
grant  execute on function public.candidato_reactivar(uuid)                     to authenticated;
grant  execute on function public.candidato_vincular(uuid, uuid)                to authenticated;
