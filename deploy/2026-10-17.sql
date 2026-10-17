-- Despliegue 2026-10-17: migraciones 0130 (retrabajo no paga), 0131 (capacitación) y 0132 (evaluación: exámenes).
-- Pegar completo en el SQL Editor de Supabase. Va en una sola transacción: si algo falla, no queda nada a medias.
-- Idempotente: se puede reaplicar. Antes de pegar, confirmar que 0128 ya está aplicada en producción.
begin;

-- ===== 0130_retrabajo_no_paga.sql =====
-- 0130_retrabajo_no_paga.sql — una etapa ya pagada para una prenda no vuelve a pagarse.
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-retrabajo-no-paga-design.md (decisión del dueño,
-- 13-oct-2026). Prueba: packages/db/pruebas/0130_retrabajo_no_paga.prueba.sql
--
-- Hoy una prenda observada en tienda vuelve a una etapa y al re-avanzarla se pagan otra vez los
-- puntos (+7 por ciclo). Se corrige en el único camino de escritura de puntos positivos del avance:
-- private.pipeline_registrar_punto devuelve null (sin insertar) si la prenda ya tiene un punto
-- positivo en esa etapa; pipeline_avanzar ya trata null como «avanza pero no cobra».
--
-- Deshacer borra el punto de su movimiento, así que re-avanzar tras deshacer sí paga (una vez).
-- La penalización por rechazo (etapa `<etapa>_rechazo`, negativa) no cuenta como pago y reabre la etapa.
--
-- `create or replace` con la misma firma de la 0115. Conserva H-4, security definer, search_path y
-- grants. Idempotente. No agrega ningún parámetro de negocio.

create or replace function private.pipeline_registrar_punto(
  p_empleado uuid, p_pasada uuid, p_etapa text, p_puntos numeric, p_detalle text, p_historial uuid default null)
  returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  -- H-4: sólo cobra (o se descuenta) quien tiene rol de pipeline. Sin rol → no se escribe nada.
  if not exists (
    select 1 from public.empleados e
    where e.id = p_empleado and e.rol in ('admin', 'dueno', 'encargado_almacen', 'confeccionista')
  ) then
    return null;
  end if;
  -- 0130: el retrabajo no paga. Una etapa ya pagada para esta prenda (o para su madre, si es una hija
  -- de dividir) no se vuelve a pagar. Un `<etapa>_rechazo` posterior al pago devuelve la etapa a
  -- «sin pagar»: el rechazo de calidad queda como antes (decisión del dueño pendiente).
  if p_puntos > 0 and exists (
    select 1 from public.pipeline_puntos pp
    where pp.etapa = p_etapa and pp.puntos > 0
      and pp.pasada_id in (
        select p_pasada
        union
        select m.id from public.prenda_pasada m
         where m.dividida and m.dividida_en like '%' || p_pasada::text || '%')
      and not exists (
        select 1 from public.pipeline_puntos r
        where r.etapa = p_etapa || '_rechazo' and r.fecha >= pp.fecha
          and r.pasada_id in (
            select p_pasada
            union
            select m.id from public.prenda_pasada m
             where m.dividida and m.dividida_en like '%' || p_pasada::text || '%'))
  ) then
    return null;
  end if;
  insert into public.pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
    values (p_empleado, p_pasada, p_etapa, p_puntos, p_detalle, now(), p_historial)
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) from public, anon;
grant  execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) to authenticated;

insert into supabase_migrations.schema_migrations(version,name) values (to_char(now(),'YYYYMMDDHH24MISS')||'0130','retrabajo_no_paga') on conflict do nothing;

-- ===== 0131_capacitacion.sql =====
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
create policy cap_items_select on public.capacitacion_items for select to authenticated using (auth.uid() is not null);  -- catálogo sin datos de personas

drop policy if exists cap_select on public.capacitaciones;
create policy cap_select on public.capacitaciones for select to authenticated
  using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo)   -- suspendido: no lee
    and (private.app_es_admin() or nuevo_id = auth.uid() or capacitador_id = auth.uid())
  );

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
  -- Activa, y nunca sobre su propia capacitación como «nuevo» (ni siquiera el administrador).
  if not found
     or not exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo)
     or c.nuevo_id = auth.uid()
     or not (private.app_es_admin() or c.capacitador_id = auth.uid()) then
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

insert into supabase_migrations.schema_migrations(version,name) values (to_char(now(),'YYYYMMDDHH24MISS')||'0131','capacitacion') on conflict do nothing;

-- ===== 0132_evaluacion_examenes.sql =====
-- 0132_evaluacion_examenes.sql — la RPC de componentes de la evaluación trae `examenes`.
--
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-17-componentes-automaticos-design.md
-- Prueba: packages/db/pruebas/0132_evaluacion_examenes.prueba.sql   ZONA CRÍTICA (verificador antes de mergear).
-- Depende de la 0131 (capacitaciones y exámenes).
--
-- `create or replace` de private.evaluacion_componentes_datos con el cuerpo EXACTO de la 0110 más dos
-- claves nuevas: `examenes` (promedio de la nota vigente de las capacitaciones completadas con cierre
-- en el ciclo, o null) y `examenesCantidad`. No cambia ninguna otra clave ni `puntosTotal`.
-- Firma, security definer, search_path y permisos intactos (create or replace conserva el ACL de la
-- 0067; el portero public.evaluacion_componentes no se toca). Idempotente. Sin parámetros nuevos.

create or replace function private.evaluacion_componentes_datos(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb language sql stable security definer set search_path = public
as $$
  with reps as (
    -- C-1: cualquiera que trabajó el turno lo suma, no sólo quien lo encargó.
    select r.id
    from reportes r
    where r.evaluado
      and r.fecha between p_desde and p_hasta
      and (
        r.encargado_id = p_empleado
        or exists (
          select 1 from reporte_trabajadores rt
          where rt.reporte_id = r.id and rt.empleado_id = p_empleado
        )
      )
  ),
  acts as (
    select a.cod, a.cat, a.calificacion
    from reporte_actividades a
    join reps r on r.id = a.reporte_id
    where a.calificacion is not null
  ),
  cats as (
    select
      coalesce(avg(calificacion) filter (where cat = 'IND'), 0) * 20            as limpieza,
      coalesce(avg(calificacion) filter (where cod ~ '^(AS|BS)'), 0) * 20       as software,
      coalesce(avg(calificacion) filter (where cod ~ '^(AT|BT)'), 0) * 20       as operaciones
    from acts
  ),
  div as (
    select coalesce((select valor::numeric from config where clave = 'eval_tardanza_min_por_punto'), 15) as v
  ),
  -- C-2: la tolerancia es la MISMA que usa el motor de sueldos para decidir si un ingreso cuenta
  -- como tardanza (RN-08). No se inventa una tolerancia distinta para la evaluación.
  tol as (
    select coalesce((select valor::numeric from config where clave = 'sueldo_tolerancia_minutos'), 10) as v
  ),
  -- Un día por fila, con la entrada MÁS TEMPRANA entre todos los tramos de asistencia de ese día
  -- (mismo criterio que sueldo_entrada, migración 0085: `min(s.hora_entrada)` colapsa el día para
  -- que un día partido en tramos se mida contra su primer ingreso). Y, aparte, el inicio del turno
  -- contratado más temprano de ese mismo día de la semana, tomado del acuerdo que cubre esa fecha
  -- — a lo sumo uno, gracias a la restricción de exclusión `sueldo_acuerdos_sin_solape`.
  dias_trabajados as (
    select
      s.fecha,
      min(s.hora_entrada)             as entrada,
      bool_or(s.tardanza_justificada) as justificada,
      (
        select min(t.hora_inicio)
        from sueldo_acuerdos a
        join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
        where a.empleado_id = p_empleado
          and s.fecha between a.fecha_inicio and a.fecha_fin
          and t.dia_semana = extract(isodow from s.fecha)
      ) as inicio_turno
    from asistencias s
    where s.empleado_id = p_empleado
      and s.fecha between p_desde and p_hasta
      and s.condicion = 'trabajado'
    group by s.fecha
  ),
  -- La diferencia se calcula una sola vez, en minutos, restando dos `time` (da un `interval`) y
  -- extrayendo sus segundos — así no hay que multiplicar un `interval` por un `numeric`, operación
  -- ambigua en Postgres. Los minutos que se acumulan son contra la hora PACTADA, no contra la
  -- ajustada por tolerancia: la tolerancia decide si el día cuenta, no cuánto pesa.
  dias_diff as (
    select
      fecha, justificada,
      case when entrada is not null and inicio_turno is not null
           then (extract(epoch from (entrada - inicio_turno)) / 60.0)::numeric
           else null
      end as diff_min
    from dias_trabajados
  ),
  tard as (
    select coalesce(sum(
      case
        -- Un día sin acuerdo vigente o sin turno contratado ese día de la semana llega acá con
        -- diff_min en null (la subconsulta de inicio_turno no encontró fila) y no aporta minutos.
        when diff_min is not null and not justificada and diff_min > (select v from tol)
        then diff_min
        else 0
      end
    ), 0) as min
    from dias_diff
  ),
  inc as (
    select coalesce(sum(puntos_penalidad), 0) as descuento
    from incidencias where responsable_id = p_empleado and fecha between p_desde and p_hasta
  ),
  pipe as (
    select coalesce(sum(puntos), 0) as total
    from pipeline_puntos
    where empleado_id = p_empleado
      and (fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  -- Los extras NO se tocan: siguen siendo de quien los registró, no de todo el equipo.
  extr as (
    select coalesce(sum(re.monto_total), 0) as total, count(*) as cantidad,
           coalesce(sum(re.puntos_total), 0) as puntos
    from reporte_extras re
    join reportes r on r.id = re.reporte_id
    where re.registrado_por_id = p_empleado and r.fecha between p_desde and p_hasta
  ),
  val as (
    select
      avg(integridad)::numeric as integridad, avg(respeto)::numeric as respeto,
      avg(honestidad)::numeric as honestidad, avg(amabilidad)::numeric as amabilidad,
      avg(relacion)::numeric as relacion, avg(actitud)::numeric as actitud,
      count(*) as cantidad
    from evaluaciones_valores
    where evaluado_id = p_empleado and mes = to_char(p_desde, 'YYYY-MM')
  ),
  -- 🆕 (0095, spec puntos-como-moneda §5) — pts_actividad_cumplida: default 1, mismo criterio de
  -- coalesce que div/tol arriba, con `nullif` por si el administrador la deja vacía desde
  -- /configuracion en vez de borrar la fila (ver el comentario grande al principio del archivo).
  cfg_act as (
    select coalesce(nullif((select valor from config where clave = 'pts_actividad_cumplida'), '')::numeric, 1) as v
  ),
  -- 🆕 pts_por_sol_vendido: a propósito SIN default. `v` queda null tanto si la fila no existe como
  -- si existe vacía — ese `is null` es lo que decide puntosVentas = 0 y alimenta ventasSinTasa.
  tasa_venta as (
    select nullif((select valor from config where clave = 'pts_por_sol_vendido'), '') as v
  ),
  -- 🆕 Todas las filas de sueldo_ventas del período, sin filtrar por tipo ('venta'/'alquiler') ni
  -- por si ya se liquidaron: acá es "trabajo hecho que da puntos", no el mismo filtro que arma una
  -- liquidación nueva (ese vive en sueldo_entrada, 0073/0093, y sí excluye lo ya liquidado).
  ventas as (
    select coalesce(sum(monto), 0) as total, count(*) as cantidad
    from sueldo_ventas
    where empleado_id = p_empleado and fecha between p_desde and p_hasta
  ),
  -- 🆕 sum(calificacion) sobre la MISMA cte `acts` de arriba (spec: "la CTE existe, reusala") — no
  -- se filtra por categoría: cada actividad calificada del turno cuenta, tal como ya la ve `acts`.
  -- 🆕 (0132) Nota vigente (último examen) de cada capacitación COMPLETADA de la persona como nueva con
  -- cierre dentro del ciclo; se promedia. Cancelada o en curso no cuentan. Sin ninguna → null (manual).
  exa as (
    select avg(n.nota) as promedio, count(*) as cantidad
    from (
      select (select x.nota from capacitacion_examenes x
               where x.capacitacion_id = c.id order by x.fecha desc, x.created_at desc limit 1) as nota
      from capacitaciones c
      where c.nuevo_id = p_empleado and c.estado = 'completada'
        and c.cierre between p_desde and p_hasta
    ) n
    where n.nota is not null
  ),
  desglose as (
    select
      coalesce((select sum(calificacion) from acts), 0) * (select v from cfg_act)          as actividades,
      case when (select v from tasa_venta) is null then 0::numeric
           else (select total from ventas) * (select v from tasa_venta)::numeric
      end                                                                                   as ventas
  )
  select jsonb_build_object(
    'operaciones',      round((select operaciones from cats), 2),
    'software',         round((select software from cats), 2),
    'limpieza',         round((select limpieza from cats), 2),
    'tardanza',         greatest(0, 20 - floor((select min from tard) / (select v from div))),
    'descuento',        (select descuento from inc),
    'puntosPipeline',   round((select total from pipe), 2),
    'extrasMonto',      round((select total from extr), 2),
    'extrasCantidad',   (select cantidad from extr),
    'extrasPuntos',     round((select puntos from extr), 2),
    'valores',
      case when (select cantidad from val) > 0 then
        round((
          ( coalesce((select integridad from val), 0) + coalesce((select respeto from val), 0)
          + coalesce((select honestidad from val), 0) + coalesce((select amabilidad from val), 0)
          + coalesce((select relacion from val), 0)   + coalesce((select actitud from val), 0)
          ) / 6.0 / 5 * 20
        ), 1)
      else null end,
    'valoresCantidad',  (select cantidad from val),
    'bonusVentas',      0,
    -- 🆕 (0132) examenes: null si no hay capacitación cerrada en el ciclo (entrada manual).
    'examenes',         round((select promedio from exa), 2),
    'examenesCantidad', (select cantidad from exa),
    -- 🆕 (0095) — puntos como moneda, spec §2 C-1.
    'puntosActividades', round((select actividades from desglose), 2),
    'puntosVentas',      round((select ventas from desglose), 2),
    'ventasSinTasa',     (select v from tasa_venta) is null and (select cantidad from ventas) > 0,
    'puntosTotal',       round(
                            (select total from pipe) + (select puntos from extr)
                            + (select actividades from desglose) + (select ventas from desglose)
                            - (select descuento from inc)
                          , 2)
  );
$$;

insert into supabase_migrations.schema_migrations(version,name) values (to_char(now(),'YYYYMMDDHH24MISS')||'0132','evaluacion_examenes') on conflict do nothing;

commit;
