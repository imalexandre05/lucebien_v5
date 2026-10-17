-- 0138_examenes.sql — exámenes de software, escritos online y presencial de habilidades.
-- Spec: docs/superpowers/specs/capacitacion/2026-10-17-examenes-design.md
-- Prueba: packages/db/pruebas/0138_examenes.prueba.sql (escrita antes). ZONA CRÍTICA: alimenta la nota → pago.
-- Ticket: lucebien-tablero #12.
--
-- NO cambia la RPC de la evaluación (0132). Cada calificación inserta una fila «Examen integral» en
-- capacitacion_examenes con la nota consolidada; esa fila es la vigente (la última por fecha y
-- created_at) y la leen igual el cierre de la capacitación (0131) y la evaluación.
-- Aislamiento: el banco (con la respuesta correcta) solo lo lee el administrador; intentos y notas
-- presenciales hereden la visibilidad de la capacitación. Toda escritura es por RPC definer.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): ver sección 3.
-- Idempotente: create ... if not exists, drop policy if exists, create or replace, on conflict.

-- ── 1) Tablas ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.examen_preguntas (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('software', 'escrito')),
  tema       text not null default '',
  enunciado  text not null check (length(btrim(enunciado)) > 0),
  opciones   jsonb not null check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 6),
  correcta   int  not null check (correcta >= 0),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  check (correcta < jsonb_array_length(opciones))
);

create table if not exists public.examen_intentos (
  id              uuid primary key default gen_random_uuid(),
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  tipo            text not null check (tipo in ('software', 'escrito')),
  preguntas       jsonb not null,                       -- ids (texto) de las preguntas sorteadas, en orden
  respuestas      jsonb,
  nota            numeric(4,2) check (nota is null or (nota >= 0 and nota <= 20)),
  estado          text not null default 'en_curso' check (estado in ('en_curso', 'calificado')),
  creado_en       timestamptz not null default now(),
  calificado_en   timestamptz
);
create index if not exists examen_intentos_cap on public.examen_intentos (capacitacion_id, tipo);

create table if not exists public.examen_habilidades (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  orden  int  not null default 0,
  activo boolean not null default true
);

create table if not exists public.examen_presencial_notas (
  capacitacion_id uuid not null references public.capacitaciones(id) on delete cascade,
  habilidad_id    uuid not null references public.examen_habilidades(id),
  nota            numeric(4,2) not null check (nota >= 0 and nota <= 20),
  evaluador_id    uuid references public.empleados(id),
  fecha           timestamptz not null default now(),
  primary key (capacitacion_id, habilidad_id)
);

-- ── 2) RLS: lectura acotada, escritura solo por RPC ─────────────────────────────────────────
alter table public.examen_preguntas        enable row level security;
alter table public.examen_intentos         enable row level security;
alter table public.examen_habilidades      enable row level security;
alter table public.examen_presencial_notas enable row level security;

-- El banco trae la clave: solo el administrador lo lee.
drop policy if exists examen_preguntas_select on public.examen_preguntas;
create policy examen_preguntas_select on public.examen_preguntas for select to authenticated
  using (private.app_es_admin());
drop policy if exists examen_habilidades_select on public.examen_habilidades;
create policy examen_habilidades_select on public.examen_habilidades for select to authenticated
  using (auth.uid() is not null);   -- catálogo sin datos de personas
-- Intentos y notas heredan la visibilidad de la capacitación (el subselect ya pasa por cap_select).
drop policy if exists examen_intentos_select on public.examen_intentos;
create policy examen_intentos_select on public.examen_intentos for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));
drop policy if exists examen_presencial_select on public.examen_presencial_notas;
create policy examen_presencial_select on public.examen_presencial_notas for select to authenticated
  using (exists (select 1 from public.capacitaciones c where c.id = capacitacion_id));

revoke all on public.examen_preguntas, public.examen_intentos, public.examen_habilidades,
              public.examen_presencial_notas from anon, authenticated;
grant select on public.examen_preguntas, public.examen_intentos, public.examen_habilidades,
                public.examen_presencial_notas to authenticated;

-- ── 3) Defaults (PROVISIONALES, no confirmados por el dueño; editables en /configuracion) ───
insert into public.config (clave, valor) values
  ('examen_preguntas_por_intento', '10'),   -- PROVISIONAL: cuántas preguntas se sortean por intento
  ('examen_intentos_max',          '3'),    -- PROVISIONAL: intentos por tipo y capacitación
  ('examen_peso_software',         '1'),    -- PROVISIONAL: pesos iguales = promedio simple
  ('examen_peso_escrito',          '1'),
  ('examen_peso_presencial',       '1')
on conflict (clave) do nothing;

-- Habilidades iniciales: las dos que nombró el cliente; el administrador agrega el resto.
insert into public.examen_habilidades (nombre, orden)
select v.nombre, v.orden from (values ('Planchado', 1), ('Costura', 2)) as v(nombre, orden)
where not exists (select 1 from public.examen_habilidades);

-- ── 4) Funciones privadas ──────────────────────────────────────────────────────────────────
-- Parámetro numérico de config tolerando basura: si falta o no es número, el default.
create or replace function private.examen_param(p_clave text, p_defecto numeric)
  returns numeric language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select case when valor ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then btrim(valor)::numeric end
                     from public.config where clave = p_clave), p_defecto);
$$;
revoke all on function private.examen_param(text, numeric) from public, anon, authenticated;

-- Solo la persona nueva, sobre su capacitación en curso.
create or replace function private.examen_exigir_nuevo(p_cap uuid)
  returns public.capacitaciones language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare c public.capacitaciones;
begin
  select * into c from public.capacitaciones where id = p_cap;
  if not found or c.nuevo_id <> auth.uid()
     or not exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo) then
    raise exception 'Capacitación no encontrada';
  end if;
  if c.estado <> 'en_curso' then
    raise exception 'Esta capacitación ya está %', case c.estado when 'completada' then 'cerrada' else 'cancelada' end;
  end if;
  return c;
end;
$$;
revoke all on function private.examen_exigir_nuevo(uuid) from public, anon, authenticated;

-- Nota consolidada: promedio ponderado de lo que haya entre software, escrito y presencial (último valor
-- de cada tipo). Inserta una fila nueva en capacitacion_examenes, que pasa a ser la vigente.
create or replace function private.examen_consolidar(p_cap uuid)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sw numeric; v_es numeric; v_pr numeric; v_tot int; v_hechas int;
  w_sw numeric := private.examen_param('examen_peso_software', 1);
  w_es numeric := private.examen_param('examen_peso_escrito', 1);
  w_pr numeric := private.examen_param('examen_peso_presencial', 1);
  v_suma numeric := 0; v_pesos numeric := 0;
begin
  select nota into v_sw from examen_intentos where capacitacion_id = p_cap and tipo = 'software' and estado = 'calificado'
    order by calificado_en desc, creado_en desc limit 1;
  select nota into v_es from examen_intentos where capacitacion_id = p_cap and tipo = 'escrito' and estado = 'calificado'
    order by calificado_en desc, creado_en desc limit 1;
  select count(*) into v_tot from examen_habilidades where activo;
  select count(*), avg(n.nota) into v_hechas, v_pr
    from examen_presencial_notas n join examen_habilidades h on h.id = n.habilidad_id and h.activo
   where n.capacitacion_id = p_cap;
  if v_tot = 0 or v_hechas < v_tot then v_pr := null; end if;   -- el presencial cuenta con todas las habilidades

  if v_sw is not null then v_suma := v_suma + w_sw * v_sw; v_pesos := v_pesos + w_sw; end if;
  if v_es is not null then v_suma := v_suma + w_es * v_es; v_pesos := v_pesos + w_es; end if;
  if v_pr is not null then v_suma := v_suma + w_pr * v_pr; v_pesos := v_pesos + w_pr; end if;
  if v_pesos <= 0 then return; end if;

  -- created_at con clock_timestamp(): dos calificaciones en una misma transacción no pueden empatar,
  -- porque la nota vigente es la última por (fecha, created_at).
  insert into capacitacion_examenes (capacitacion_id, nombre, nota, fecha, registrado_por, created_at)
    values (p_cap, 'Examen integral', round(v_suma / v_pesos, 2), (now() at time zone 'America/Lima')::date,
            auth.uid(), clock_timestamp());
end;
$$;
revoke all on function private.examen_consolidar(uuid) from public, anon, authenticated;

-- ── 5) RPC ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.examen_pregunta_guardar(
  p_id uuid, p_tipo text, p_tema text, p_enunciado text, p_opciones jsonb, p_correcta int, p_activa boolean)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador edita el banco de preguntas'; end if;
  if p_tipo not in ('software', 'escrito') then raise exception 'El tipo debe ser software o escrito'; end if;
  if p_enunciado is null or length(btrim(p_enunciado)) = 0 then raise exception 'La pregunta necesita un enunciado'; end if;
  if p_opciones is null or jsonb_typeof(p_opciones) <> 'array' or jsonb_array_length(p_opciones) not between 2 and 6 then
    raise exception 'Una pregunta lleva entre 2 y 6 opciones';
  end if;
  if p_correcta is null or p_correcta < 0 or p_correcta >= jsonb_array_length(p_opciones) then
    raise exception 'La opción correcta no existe';
  end if;
  if p_id is null then
    insert into examen_preguntas (tipo, tema, enunciado, opciones, correcta, activa)
      values (p_tipo, coalesce(btrim(p_tema), ''), btrim(p_enunciado), p_opciones, p_correcta, coalesce(p_activa, true))
      returning id into v_id;
  else
    update examen_preguntas set tipo = p_tipo, tema = coalesce(btrim(p_tema), ''), enunciado = btrim(p_enunciado),
           opciones = p_opciones, correcta = p_correcta, activa = coalesce(p_activa, activa)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Pregunta no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.examen_habilidad_guardar(p_id uuid, p_nombre text, p_orden int, p_activo boolean)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not private.app_es_admin() then raise exception 'Sólo el administrador edita las habilidades'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'La habilidad necesita un nombre'; end if;
  if p_id is null then
    insert into examen_habilidades (nombre, orden, activo)
      values (btrim(p_nombre), coalesce(p_orden, 0), coalesce(p_activo, true)) returning id into v_id;
  else
    update examen_habilidades set nombre = btrim(p_nombre), orden = coalesce(p_orden, orden),
           activo = coalesce(p_activo, activo) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Habilidad no encontrada'; end if;
  end if;
  return v_id;
end;
$$;

-- Empieza (o retoma) un examen online. Devuelve las preguntas SIN la respuesta correcta.
create or replace function public.examen_iniciar(p_cap uuid, p_tipo text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.capacitaciones; it public.examen_intentos; v_max int; v_n int; v_ids text[]; v_por int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  c := private.examen_exigir_nuevo(p_cap);
  if p_tipo not in ('software', 'escrito') then raise exception 'El tipo debe ser software o escrito'; end if;

  select * into it from examen_intentos where capacitacion_id = p_cap and tipo = p_tipo and estado = 'en_curso'
    order by creado_en desc limit 1;
  if not found then
    v_max := greatest(floor(private.examen_param('examen_intentos_max', 3))::int, 1);
    select count(*) into v_n from examen_intentos where capacitacion_id = p_cap and tipo = p_tipo;
    if v_n >= v_max then
      raise exception 'Ya usaste los % intentos de este examen', v_max;
    end if;
    v_por := greatest(floor(private.examen_param('examen_preguntas_por_intento', 10))::int, 1);
    select coalesce(array_agg(id::text), '{}') into v_ids from (
      select id from examen_preguntas where tipo = p_tipo and activa order by random() limit v_por) s;
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'Todavía no hay preguntas para este examen';
    end if;
    insert into examen_intentos (capacitacion_id, tipo, preguntas, creado_en)
      values (p_cap, p_tipo, to_jsonb(v_ids), clock_timestamp()) returning * into it;
  end if;

  return jsonb_build_object(
    'intento_id', it.id, 'tipo', it.tipo,
    'preguntas', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'enunciado', p.enunciado, 'opciones', p.opciones)
                                            order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements_text(it.preguntas) with ordinality t(pid, ord)
                    join examen_preguntas p on p.id = t.pid::uuid));
end;
$$;

-- Califica en la base. Devuelve nota y aciertos; no revela cuáles fallaron ni la clave.
create or replace function public.examen_responder(p_intento uuid, p_respuestas jsonb)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  it public.examen_intentos; c public.capacitaciones; v_total int; v_ok int; v_nota numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into it from examen_intentos where id = p_intento for update;
  if not found then raise exception 'Intento no encontrado'; end if;
  c := private.examen_exigir_nuevo(it.capacitacion_id);
  if it.estado <> 'en_curso' then raise exception 'Este intento ya fue calificado'; end if;
  if p_respuestas is null or jsonb_typeof(p_respuestas) <> 'object' then raise exception 'Faltan las respuestas'; end if;

  select count(*), count(*) filter (where (p_respuestas ->> p.id::text) ~ '^[0-9]+$'
                                      and (p_respuestas ->> p.id::text)::int = p.correcta)
    into v_total, v_ok
    from jsonb_array_elements_text(it.preguntas) t(pid) join examen_preguntas p on p.id = t.pid::uuid;
  v_nota := case when v_total = 0 then 0 else round(20.0 * v_ok / v_total, 2) end;

  update examen_intentos set respuestas = p_respuestas, nota = v_nota, estado = 'calificado', calificado_en = clock_timestamp()
   where id = p_intento;
  perform private.examen_consolidar(it.capacitacion_id);
  return jsonb_build_object('nota', v_nota, 'aciertos', v_ok, 'total', v_total);
end;
$$;

-- Presencial: el capacitador (o el administrador, nunca la persona evaluada) pone nota a cada habilidad.
create or replace function public.examen_presencial_calificar(p_cap uuid, p_notas jsonb)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.capacitaciones; x jsonb; v_h uuid; v_nota numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  c := private.capacitacion_exigir_califica(p_cap);
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'Faltan las notas';
  end if;
  for x in select * from jsonb_array_elements(p_notas) loop
    v_h := (x ->> 'habilidad')::uuid;
    v_nota := (x ->> 'nota')::numeric;
    if v_nota is null or v_nota < 0 or v_nota > 20 then raise exception 'La nota debe estar entre 0 y 20'; end if;
    if not exists (select 1 from examen_habilidades where id = v_h and activo) then
      raise exception 'Habilidad no encontrada';
    end if;
    insert into examen_presencial_notas (capacitacion_id, habilidad_id, nota, evaluador_id)
      values (p_cap, v_h, v_nota, auth.uid())
      on conflict (capacitacion_id, habilidad_id)
      do update set nota = excluded.nota, evaluador_id = excluded.evaluador_id, fecha = now();
  end loop;
  perform private.examen_consolidar(p_cap);
end;
$$;

revoke execute on function public.examen_pregunta_guardar(uuid, text, text, text, jsonb, int, boolean) from public, anon;
revoke execute on function public.examen_habilidad_guardar(uuid, text, int, boolean)                    from public, anon;
revoke execute on function public.examen_iniciar(uuid, text)                                           from public, anon;
revoke execute on function public.examen_responder(uuid, jsonb)                                        from public, anon;
revoke execute on function public.examen_presencial_calificar(uuid, jsonb)                             from public, anon;
grant  execute on function public.examen_pregunta_guardar(uuid, text, text, text, jsonb, int, boolean) to authenticated;
grant  execute on function public.examen_habilidad_guardar(uuid, text, int, boolean)                    to authenticated;
grant  execute on function public.examen_iniciar(uuid, text)                                           to authenticated;
grant  execute on function public.examen_responder(uuid, jsonb)                                        to authenticated;
grant  execute on function public.examen_presencial_calificar(uuid, jsonb)                             to authenticated;
