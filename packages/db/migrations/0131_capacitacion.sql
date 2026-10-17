-- 0131_capacitacion.sql — capacitación de personal nuevo: checklist bueno/regular/malo, examen y
-- capacitadores. Spec: docs/superpowers/specs/capacitacion/2026-10-17-capacitacion-checklist-design.md
-- Prueba: packages/db/pruebas/0131_capacitacion.prueba.sql
--
-- NO conecta con el pago al capacitador (valorCapacitacion): eso es cadena del sueldo y va aparte.
-- Aislamiento (no-negociable 3): admin/dueño ven todo; el capacitador, las que dicta; el nuevo, la
-- suya. Toda escritura pasa por RPC security definer; las tablas no aceptan escritura directa.
-- Idempotente: create ... if not exists, drop policy if exists, create or replace, on conflict.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): capacitacion_nota_aprobatoria = 14 y
-- los 5 ítems iniciales del checklist.

-- ── 1) Tablas ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.capacitacion_items (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null check (length(btrim(nombre)) > 0),
  orden   int  not null default 0,
  activo  boolean not null default true
);

create table if not exists public.capacitaciones (
  id             uuid primary key default gen_random_uuid(),
  nuevo_id       uuid not null references public.empleados(id) on delete cascade,
  capacitador_id uuid not null references public.empleados(id),
  inicio         date not null,
  estado         text not null default 'en_curso' check (estado in ('en_curso', 'completada', 'cancelada')),
  resultado      text check (resultado in ('aprobada', 'por_reforzar')),
  cierre         date,
  created_at     timestamptz not null default now(),
  check (nuevo_id <> capacitador_id)
);
create unique index if not exists capacitaciones_una_en_curso
  on public.capacitaciones (nuevo_id) where estado = 'en_curso';

create table if not exists public.capacitacion_avances (
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  item_id         uuid not null references public.capacitacion_items(id),
  estado          text not null check (estado in ('bueno', 'regular', 'malo')),
  obs             text,
  marcado_por     uuid references public.empleados(id),
  fecha           timestamptz not null default now(),
  primary key (capacitacion_id, item_id)
);

create table if not exists public.capacitacion_examenes (
  id              uuid primary key default gen_random_uuid(),
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  nombre          text not null check (length(btrim(nombre)) > 0),
  nota            numeric(4,2) not null check (nota >= 0 and nota <= 20),
  fecha           date not null,
  registrado_por  uuid references public.empleados(id),
  created_at      timestamptz not null default now()
);

-- ── 2) RLS: lectura acotada, escritura sólo por RPC ─────────────────────────────────────────
alter table public.capacitacion_items     enable row level security;
alter table public.capacitaciones         enable row level security;
alter table public.capacitacion_avances   enable row level security;
alter table public.capacitacion_examenes  enable row level security;

drop policy if exists cap_items_select on public.capacitacion_items;
create policy cap_items_select on public.capacitacion_items for select to authenticated using (true);

drop policy if exists cap_select on public.capacitaciones;
create policy cap_select on public.capacitaciones for select to authenticated
  using (private.app_es_admin() or nuevo_id = auth.uid() or capacitador_id = auth.uid());

-- Las subtablas heredan la visibilidad de la capacitación (el subselect ya pasa por cap_select).
drop policy if exists cap_avances_select on public.capacitacion_avances;
create policy cap_avances_select on public.capacitacion_avances for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));

drop policy if exists cap_examenes_select on public.capacitacion_examenes;
create policy cap_examenes_select on public.capacitacion_examenes for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));

revoke all on public.capacitacion_items, public.capacitaciones,
              public.capacitacion_avances, public.capacitacion_examenes from anon, authenticated;
grant select on public.capacitacion_items, public.capacitaciones,
                public.capacitacion_avances, public.capacitacion_examenes to authenticated;

-- ── 3) Defaults (PROVISIONALES, no confirmados por el dueño) ────────────────────────────────
insert into public.config (clave, valor) values
  ('capacitacion_nota_aprobatoria', '14')   -- PROVISIONAL: nota mínima del examen (/20) para «aprobada»
on conflict (clave) do nothing;

-- Ítems iniciales: punto de partida editable por el administrador desde /capacitacion.
insert into public.capacitacion_items (nombre, orden)
select v.nombre, v.orden
from (values
  ('Conoce el taller y las sedes', 1),
  ('Entiende el proceso de las prendas (pipeline)', 2),
  ('Usa el sistema sin ayuda', 3),
  ('Mantiene orden y limpieza', 4),
  ('Trato al equipo y puntualidad', 5)
) as v(nombre, orden)
where not exists (select 1 from public.capacitacion_items);

-- ── 4) RPC ──────────────────────────────────────────────────────────────────────────────────
-- Quien califica: el capacitador de esa capacitación o el administrador; nunca el propio nuevo.
create or replace function private.capacitacion_exigir_califica(p_cap uuid)
  returns public.capacitaciones language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare c public.capacitaciones;
begin
  select * into c from public.capacitaciones where id = p_cap;
  if not found or not (private.app_es_admin() or c.capacitador_id = auth.uid()) then
    raise exception 'Capacitación no encontrada';
  end if;
  if c.estado <> 'en_curso' then
    raise exception 'Esta capacitación ya está %', case c.estado when 'completada' then 'cerrada' else 'cancelada' end;
  end if;
  return c;
end;
$$;
revoke all on function private.capacitacion_exigir_califica(uuid) from public, anon, authenticated;

create or replace function public.capacitacion_iniciar(p_nuevo uuid, p_capacitador uuid)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador asigna capacitaciones'; end if;
  if p_nuevo is null or p_capacitador is null or p_nuevo = p_capacitador then
    raise exception 'El capacitador debe ser otra persona distinta del nuevo';
  end if;
  if not exists (select 1 from empleados where id = p_nuevo and activo)
     or not exists (select 1 from empleados where id = p_capacitador and activo) then
    raise exception 'Persona no encontrada o inactiva';
  end if;
  if exists (select 1 from capacitaciones where nuevo_id = p_nuevo and estado = 'en_curso') then
    raise exception 'Esa persona ya tiene una capacitación en curso';
  end if;
  insert into capacitaciones (nuevo_id, capacitador_id, inicio)
    values (p_nuevo, p_capacitador, (now() at time zone 'America/Lima')::date)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.capacitacion_marcar(p_cap uuid, p_item uuid, p_estado text, p_obs text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.capacitacion_exigir_califica(p_cap);
  if p_estado is null or p_estado not in ('bueno', 'regular', 'malo') then
    raise exception 'El estado debe ser bueno, regular o malo';
  end if;
  if not exists (select 1 from capacitacion_items where id = p_item and activo) then
    raise exception 'Ese ítem no existe o está desactivado';
  end if;
  insert into capacitacion_avances (capacitacion_id, item_id, estado, obs, marcado_por)
    values (p_cap, p_item, p_estado, nullif(btrim(coalesce(p_obs, '')), ''), auth.uid())
  on conflict (capacitacion_id, item_id) do update
    set estado = excluded.estado, obs = excluded.obs, marcado_por = excluded.marcado_por, fecha = now();
end;
$$;

create or replace function public.capacitacion_examen(p_cap uuid, p_nombre text, p_nota numeric)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform private.capacitacion_exigir_califica(p_cap);
  if p_nota is null or p_nota < 0 or p_nota > 20 then raise exception 'La nota debe estar entre 0 y 20'; end if;
  insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha, registrado_por)
    values (p_cap, coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), 'Examen'), p_nota,
            (now() at time zone 'America/Lima')::date, auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

-- Cierra: todos los ítems activos marcados y al menos un examen. Devuelve el resultado.
create or replace function public.capacitacion_cerrar(p_cap uuid)
  returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.capacitaciones; v_total int; v_marcados int; v_malos int; v_nota numeric; v_min numeric; v_res text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  c := private.capacitacion_exigir_califica(p_cap);
  select count(*) into v_total from capacitacion_items where activo;
  select count(*), count(*) filter (where a.estado = 'malo') into v_marcados, v_malos
    from capacitacion_avances a join capacitacion_items i on i.id = a.item_id and i.activo
    where a.capacitacion_id = p_cap;
  if v_total = 0 then raise exception 'El checklist no tiene ítems activos'; end if;
  if v_marcados < v_total then
    raise exception 'Faltan marcar % de % ítems', v_total - v_marcados, v_total;
  end if;
  select nota into v_nota from capacitacion_examenes
    where capacitacion_id = p_cap order by fecha desc, created_at desc limit 1;
  if v_nota is null then raise exception 'Falta registrar al menos un examen'; end if;
  -- Mínimo aprobatorio de /configuracion; si falta o no es número cae al default 14, nunca a 0.
  select coalesce((select case when valor ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then btrim(valor)::numeric end
                     from config where clave = 'capacitacion_nota_aprobatoria'), 14) into v_min;
  v_res := case when v_nota >= v_min and v_malos = 0 then 'aprobada' else 'por_reforzar' end;
  update capacitaciones set estado = 'completada', resultado = v_res,
         cierre = (now() at time zone 'America/Lima')::date where id = p_cap;
  return v_res;
end;
$$;

create or replace function public.capacitacion_cancelar(p_cap uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador cancela una capacitación'; end if;
  update capacitaciones set estado = 'cancelada' where id = p_cap and estado = 'en_curso';
  if not found then raise exception 'Capacitación no encontrada o ya cerrada'; end if;
end;
$$;

-- Catálogo del checklist: sólo el administrador. p_id null = ítem nuevo.
create or replace function public.capacitacion_item_guardar(p_id uuid, p_nombre text, p_orden int, p_activo boolean)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador edita el checklist'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'El ítem necesita un nombre'; end if;
  if p_id is null then
    insert into capacitacion_items (nombre, orden, activo)
      values (btrim(p_nombre), coalesce(p_orden, 0), coalesce(p_activo, true)) returning id into v_id;
  else
    update capacitacion_items set nombre = btrim(p_nombre), orden = coalesce(p_orden, orden),
           activo = coalesce(p_activo, activo) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ítem no encontrado'; end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.capacitacion_iniciar(uuid, uuid)                from public, anon;
revoke execute on function public.capacitacion_marcar(uuid, uuid, text, text)     from public, anon;
revoke execute on function public.capacitacion_examen(uuid, text, numeric)        from public, anon;
revoke execute on function public.capacitacion_cerrar(uuid)                       from public, anon;
revoke execute on function public.capacitacion_cancelar(uuid)                     from public, anon;
revoke execute on function public.capacitacion_item_guardar(uuid, text, int, boolean) from public, anon;
grant  execute on function public.capacitacion_iniciar(uuid, uuid)                to authenticated;
grant  execute on function public.capacitacion_marcar(uuid, uuid, text, text)     to authenticated;
grant  execute on function public.capacitacion_examen(uuid, text, numeric)        to authenticated;
grant  execute on function public.capacitacion_cerrar(uuid)                       to authenticated;
grant  execute on function public.capacitacion_cancelar(uuid)                     to authenticated;
grant  execute on function public.capacitacion_item_guardar(uuid, text, int, boolean) to authenticated;
