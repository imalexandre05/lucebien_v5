-- 0133_temporadas.sql — temporadas con pago por hora y metas propios (ticket 15).
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-temporadas-pago-y-metas-design.md
-- Prueba: packages/db/pruebas/0133_temporadas.prueba.sql
--
-- Sin temporadas inventadas: la tabla nace VACÍA. El administrador crea las suyas.
-- Lectura: cualquier usuario activo (parámetros de la empresa, no datos de una persona).
-- Escritura: sólo administrador/dueño, por RPC; la tabla no acepta escritura directa.
-- Idempotente: create ... if not exists, drop policy/trigger if exists, create or replace.

create table if not exists public.temporadas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) > 0),
  desde         date not null,
  hasta         date not null,
  pago_por_hora numeric(8,2) check (pago_por_hora is null or pago_por_hora >= 0),
  meta_semanal  numeric(10,2) check (meta_semanal is null or meta_semanal >= 0),
  meta_por_hora numeric(10,4) check (meta_por_hora is null or meta_por_hora >= 0),
  creado_por    uuid references public.empleados(id) on delete set null,
  creado_en     timestamptz not null default now(),
  check (hasta >= desde)
);

alter table public.temporadas enable row level security;
drop policy if exists temporadas_select on public.temporadas;
create policy temporadas_select on public.temporadas for select to authenticated
  using (exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo));

revoke all on public.temporadas from anon, authenticated;
grant select on public.temporadas to authenticated;

drop trigger if exists temporadas_audit on public.temporadas;
create trigger temporadas_audit after insert or update or delete on public.temporadas
  for each row execute function private.audit_log_trigger();

create or replace function public.temporada_guardar(
  p_id uuid, p_nombre text, p_desde date, p_hasta date,
  p_pago_por_hora numeric, p_meta_semanal numeric, p_meta_por_hora numeric
) returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona las temporadas'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'La temporada necesita un nombre'; end if;
  if p_desde is null or p_hasta is null then raise exception 'Indica desde y hasta'; end if;
  if p_hasta < p_desde then raise exception 'La fecha «hasta» no puede ser anterior a «desde»'; end if;
  if coalesce(p_pago_por_hora, 0) < 0 or coalesce(p_meta_semanal, 0) < 0 or coalesce(p_meta_por_hora, 0) < 0 then
    raise exception 'Los montos no pueden ser negativos';
  end if;
  if exists (
    select 1 from temporadas t
    where t.id is distinct from p_id and t.desde <= p_hasta and p_desde <= t.hasta
  ) then
    raise exception 'Esas fechas se cruzan con otra temporada';
  end if;
  if p_id is null then
    insert into temporadas (nombre, desde, hasta, pago_por_hora, meta_semanal, meta_por_hora, creado_por)
      values (btrim(p_nombre), p_desde, p_hasta, p_pago_por_hora, p_meta_semanal, p_meta_por_hora, auth.uid())
      returning id into v_id;
  else
    update temporadas
       set nombre = btrim(p_nombre), desde = p_desde, hasta = p_hasta,
           pago_por_hora = p_pago_por_hora, meta_semanal = p_meta_semanal, meta_por_hora = p_meta_por_hora
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Temporada no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.temporada_eliminar(p_id uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador gestiona las temporadas'; end if;
  delete from temporadas where id = p_id;
end;
$$;

revoke execute on function public.temporada_guardar(uuid, text, date, date, numeric, numeric, numeric) from public, anon;
revoke execute on function public.temporada_eliminar(uuid) from public, anon;
grant  execute on function public.temporada_guardar(uuid, text, date, date, numeric, numeric, numeric) to authenticated;
grant  execute on function public.temporada_eliminar(uuid) to authenticated;
