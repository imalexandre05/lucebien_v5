-- 0053_reportes_extras_catalogo.sql — Fase 5 del plan de perfeccionamiento (tarea 3): catálogo
-- cerrado de actividades extras con puntaje, en vez de los 4 campos libres (cantidad + monto sin
-- explicación) que hay hoy. Aditiva e idempotente: no borra ni renombra ninguna columna existente.
--
-- ⚠️ HALLAZGO IMPORTANTE (verificado con select contra la base scilb antes de escribir esto):
-- el plan pedía portar el catálogo de 17 extras de database/seed.js:20-38 (códigos XR01/XR02/
-- XP01..XP15) porque "hoy no existe ningún catálogo EXT". Eso YA NO es cierto: actividades_config
-- YA TIENE un catálogo EXT sembrado en la base viva — 17 filas en LB/ST/TR y 11 en AL, códigos
-- XTR02..XTR18 — que no viene de ningún archivo de este repo (grep de "XTR0" en todo el repo: 0
-- resultados) ni de generarCod() (que produce prefijo 'EX', no 'XTR'), así que se sembró por fuera
-- del código versionado (SQL manual o antes de que este repo trackeara la migración de datos).
-- Sus valores NO coinciden con seed.js: p. ej. 'Confección de michis' es XR02/remunerada/S·3/0pts
-- en seed.js, pero XTR02/por_puntos/10pts en la base viva. AL además tiene un SUBCONJUNTO de 11
-- (no los 17), lo que parece deliberado (el almacén no hace ciertos arreglos de sastrería) y no un
-- catálogo incompleto a corregir.
--
-- Sin soporte del dueño para decidir cuál de los dos catálogos es el vigente, sembrar el de
-- seed.js encima habría creado un catálogo DUPLICADO y confuso (dos botones "Confección de
-- michis" con puntajes distintos) — eso SÍ sería inventar una regla de negocio. Se opta por NO
-- tocar el catálogo ya sembrado: el schema/RPC de abajo son agnósticos a qué códigos tenga
-- actividades_config (categoria='EXT') — funcionan igual con XTR* que con XR*/XP*. El bloque de
-- siembra queda como red de seguridad SOLO para una sede que no tenga NINGUNA fila EXT todavía
-- (hoy eso no pasa en ninguna de las 4 sedes reales, así que no se ejecuta en este entorno).
-- Ver docs/pendientes-negocio.md para el detalle y la pregunta pendiente para el dueño.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) reporte_extras: columnas para enlazar con el catálogo y no perder el puntaje.
--    - cod: código del catálogo (actividades_config.cod, categoria='EXT'). NULL en los extras
--      "libres" (el escape hatch de texto libre que sigue existiendo).
--    - peso_unitario: puntos por unidad, snapshot del catálogo AL MOMENTO de registrar el extra
--      (igual criterio que pesos_usados en evaluaciones_mensuales — si el admin cambia el peso
--      del catálogo después, los reportes ya guardados no se recalculan solos).
--    - puntos_total: columna generada (peso_unitario × cantidad) — una sola fuente de verdad,
--      no depende de que cada consumidor recuerde multiplicar.
--    - revisar: true cuando el extra NO tiene catálogo que lo respalde (libre, o cod que no
--      matcheó ninguna fila de actividades_config en esa sede) — precio/puntos quedan en 0 y
--      el admin lo revisa a mano en vez de inventarle un valor.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table reporte_extras
  add column if not exists cod            text,
  add column if not exists peso_unitario  numeric not null default 0,
  add column if not exists revisar        boolean not null default false,
  add column if not exists puntos_total   numeric generated always as (peso_unitario * cantidad) stored;

create index if not exists idx_reporte_extras_cod on reporte_extras(cod) where cod is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Catálogo EXT de seed.js — SOLO como red de seguridad para una sede sin NINGÚN EXT sembrado
--    (instalación nueva / sede nueva). El `where not exists (...)` hace que este bloque sea un
--    no-op contra las 4 sedes reales de hoy (todas ya tienen EXT propio, ver hallazgo arriba) —
--    no pisa ni duplica el catálogo XTR* ya vigente. Idempotente por (sede_cod, cod) además.
--    orden arranca en 900 para no interleavearse con las obligatorias PO/SO/IND (que usan
--    números bajos) en cualquier listado combinado del catálogo completo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into actividades_config (sede_cod, cod, nombre, categoria, tipo_act, peso, precio_unitario, unidad, activa, turno, orden)
select s.cod, x.cod, x.nombre, 'EXT', x.tipo_act, x.peso, x.precio_unitario, x.unidad, true, 'ambos', 900 + x.orden
from (values
  ('XR01', 'Lavado al agua a mano',                    'remunerada', 0, 5, 'prenda',   1),
  ('XR02', 'Confección de michis',                     'remunerada', 0, 3, 'unidad',   2),
  ('XP01', 'Planchado de prendas',                      'por_puntos', 2, 0, 'prenda',   3),
  ('XP02', 'Planchado de pantalones nuevos',             'por_puntos', 2, 0, 'unidad',   4),
  ('XP03', 'Lavado al seco',                             'por_puntos', 3, 0, 'unidad',   5),
  ('XP04', 'Confección de pañuelos',                     'por_puntos', 2, 0, 'unidad',   6),
  ('XP05', 'Reporte clientes deudores (INFOCORP)',       'por_puntos', 3, 0, 'reporte',  7),
  ('XP06', 'Seguimiento clientes potenciales',           'por_puntos', 3, 0, 'reporte',  8),
  ('XP07', 'Apertura/Cierre locales anexos',             'por_puntos', 2, 0, 'vez',      9),
  ('XP08', 'Capacitación a nuevos trabajadores',         'por_puntos', 4, 0, 'sesión',  10),
  ('XP09', 'Sellado con vela de terno',                  'por_puntos', 2, 0, 'unidad',  11),
  ('XP10', 'Entalle de pantalón (excepto basta)',        'por_puntos', 3, 0, 'unidad',  12),
  ('XP11', 'Entalle de saco',                            'por_puntos', 3, 0, 'unidad',  13),
  ('XP12', 'Costura de cintas',                          'por_puntos', 1, 0, 'unidad',  14),
  ('XP13', 'Lavado al agua de zapatos',                  'por_puntos', 2, 0, 'par',     15),
  ('XP14', 'Lustrado de zapatos',                        'por_puntos', 1, 0, 'par',     16),
  ('XP15', 'Planchado y doblado de camisas',             'por_puntos', 1, 0, 'unidad',  17)
) as x(cod, nombre, tipo_act, peso, precio_unitario, unidad, orden)
cross join (select cod from sedes where cod in ('LB', 'ST', 'TR', 'AL')) as s
where not exists (select 1 from actividades_config ac where ac.sede_cod = s.cod and ac.categoria = 'EXT')
on conflict (sede_cod, cod) do nothing;

-- Verificación (correr manualmente tras aplicar):
--   select sede_cod, count(*) from actividades_config where categoria='EXT' group by 1 order by 1;
--   -- esperado (contra scilb HOY): LB 17 · ST 17 · TR 17 · AL 11 — el catálogo XTR* ya existente,
--   -- SIN cambios (el insert de arriba no debería agregar nada: las 4 sedes ya tienen EXT).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) reportes_crear: MISMA firma que 0052 (create or replace, sin romper el call site de
--    reportes-repo.ts). Ahora, para cada extra con `cod`, deriva precio_unitario/peso desde el
--    catálogo de la SEDE (nunca confía en lo que mande el cliente para estos dos campos — son
--    insumo de pago/desempeño). Si el cod no matchea ninguna fila (catálogo no sembrado aún en
--    esa sede, o extra "libre" sin cod) cae a precio=0/peso=0 y revisar=true — degrada con
--    elegancia en vez de fallar (mismo patrón que baseReporte()/getPerfilSede() de fases previas).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null
) returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_encargado   uuid := coalesce(p_encargado, auth.uid());
  v_m           text[];
  v_fecha       date;
  v_bloqueantes text[];
  v_conflicto_id text;
  v_pendiente_id text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from reportes where id = p_id) then
    raise exception 'El reporte % ya existe', p_id;
  end if;

  v_m := regexp_match(p_id, '^(\d{2})-(\d{2})-(\d{2})_');
  if v_m is null then raise exception 'id de reporte inválido: %', p_id; end if;
  v_fecha := make_date((case when v_m[3]::int < 70 then 2000 else 1900 end) + v_m[3]::int,
                       v_m[2]::int, v_m[1]::int);

  v_bloqueantes := case when p_turno = 'C' then array['M', 'T'] else array['C'] end;
  select id into v_conflicto_id from reportes
    where sede_cod = p_sede and fecha = v_fecha and turno = any(v_bloqueantes)
      and not coalesce(no_evaluable, false)
    limit 1;
  if v_conflicto_id is not null then
    raise exception 'TURNO_CONFLICTO:%', v_conflicto_id;
  end if;

  select id into v_pendiente_id from reportes
    where sede_cod = p_sede and not evaluado and not coalesce(no_evaluable, false)
    order by fecha desc, created_at desc
    limit 1;
  if v_pendiente_id is not null then
    raise exception 'REPORTE_PENDIENTE:%', v_pendiente_id;
  end if;

  insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje,
                        act_total, act_done, evaluado, bloqueado, estado_envio)
  values (p_id, p_sede, p_turno, v_fecha, v_encargado, 0,
          coalesce(p_act_total, 0), coalesce(p_act_done, 0), false, true, 'enviado');

  insert into reporte_trabajadores (reporte_id, empleado_id)
  select distinct p_id, t from unnest(
    coalesce(p_trabajadores, array[]::uuid[])
    || case when v_encargado is not null then array[v_encargado] else array[]::uuid[] end
  ) t;

  if p_actividades is not null then
    insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
    select p_id, e->>'cod', e->>'nombre', e->>'cat',
           coalesce((e->>'peso')::numeric, 0), true, coalesce(e->>'obs', '')
    from jsonb_array_elements(p_actividades) e;
  end if;

  -- Fase 5 tarea 3: left join contra el catálogo EXT de la sede — `cat.cod is null` cubre TANTO
  -- el extra "libre" (sin cod) COMO un cod que no matcheó (catálogo no sembrado en esa sede).
  if p_extras is not null then
    insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                peso_unitario, monto_total, revisar, detalle, registrado_por_id)
    select
      p_id,
      coalesce(nullif(e->>'tipo', ''), cat.tipo_act, 'libre'),
      coalesce(nullif(e->>'nombre', ''), cat.nombre, 'Extra'),
      nullif(e->>'cod', ''),
      coalesce((e->>'cantidad')::int, 1),
      coalesce(cat.precio_unitario, 0),
      coalesce(cat.peso, 0),
      coalesce(cat.precio_unitario, 0) * coalesce((e->>'cantidad')::int, 1),
      (cat.cod is null),
      coalesce(e->>'detalle', ''),
      coalesce(nullif(e->>'registrado_por_id', '')::uuid, v_actor)
    from jsonb_array_elements(p_extras) e
    left join actividades_config cat
      on cat.sede_cod = p_sede and cat.cod = nullif(e->>'cod', '') and cat.categoria = 'EXT'
    where coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null;
  end if;

  return p_id;
end;
$$;

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid) from public;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) reportes_auto_cierre: mismo tratamiento de catálogo para los extras que vinieran en el
--    draft de un turno que venció (misma firma que 0052, create or replace).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function reportes_auto_cierre(p_turnos text[] default array['M', 'T', 'C'])
  returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_now         timestamptz := now() at time zone 'America/Lima';
  v_hoy         date := v_now::date;
  v_hora_actual time := v_now::time;
  v_cierre_m    time;
  v_cierre_t    time;
  v_cierre_c    time;
  v_cierre      time;
  v_sede        text;
  v_turno       text;
  v_id          text;
  v_draft       reporte_drafts%rowtype;
  v_acts        jsonb;
  v_trabs       jsonb;
  v_extras      jsonb;
  v_limp        jsonb;
  v_total       int;
  v_done        int;
  v_contenido   boolean;
  v_estado_envio text;
  v_res         jsonb := '[]'::jsonb;
begin
  select coalesce((select valor from config where clave = 'turno_m_cierre'), '15:00')::time into v_cierre_m;
  select coalesce((select valor from config where clave = 'turno_t_cierre'), '23:00')::time into v_cierre_t;
  select coalesce((select valor from config where clave = 'turno_c_cierre'), '23:00')::time into v_cierre_c;

  for v_sede in select cod from sedes loop
    foreach v_turno in array p_turnos loop
      v_cierre := case v_turno when 'M' then v_cierre_m when 'T' then v_cierre_t else v_cierre_c end;
      if v_hora_actual < v_cierre then continue; end if;
      if exists (select 1 from reportes where sede_cod = v_sede and fecha = v_hoy and turno = v_turno) then
        continue;
      end if;

      v_id := to_char(v_hoy, 'DD-MM-YY') || '_' || v_turno || '-' || v_sede;
      if exists (select 1 from reportes where id = v_id) then continue; end if;

      select * into v_draft from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;
      v_acts   := coalesce(v_draft.payload -> 'actividades', '[]'::jsonb);
      v_trabs  := coalesce(v_draft.payload -> 'trabajadores', '[]'::jsonb);
      v_extras := coalesce(v_draft.payload -> 'extras', '[]'::jsonb);
      v_limp   := coalesce(v_draft.payload -> 'limpieza', '[]'::jsonb);
      v_total  := jsonb_array_length(v_acts);
      select count(*) into v_done from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

      v_contenido := jsonb_array_length(v_trabs) > 0 or v_done > 0 or jsonb_array_length(v_extras) > 0
                     or jsonb_array_length(v_limp) > 0 or v_draft.encargado_id is not null;
      v_estado_envio := case when v_contenido then 'no_enviado' else 'sin_actividad' end;

      insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje, act_total, act_done,
                            evaluado, bloqueado, auto_enviado, auto_enviado_razon, no_evaluable,
                            estado_envio)
      values (v_id, v_sede, v_turno, v_hoy, v_draft.encargado_id, 0, coalesce(v_total, 0), coalesce(v_done, 0),
              false, v_contenido, true,
              case when v_contenido then 'auto-cierre-deadline' else 'sin-draft-no-evaluable' end,
              not v_contenido, v_estado_envio);

      if v_contenido then
        insert into reporte_trabajadores (reporte_id, empleado_id)
        select distinct v_id, t from (
          select t::uuid as t from jsonb_array_elements_text(v_trabs) t
          union
          select v_draft.encargado_id where v_draft.encargado_id is not null
        ) u;

        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, e ->> 'cod', e ->> 'nombre', e ->> 'cat',
               coalesce((e ->> 'peso')::numeric, 0), true, coalesce(e ->> 'obs', '')
        from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, 'OL_' || z.cod, 'Limpieza: ' || z.nombre, 'IND', z.peso, true, ''
        from layout_zonas z
        where z.sede_cod = v_sede and z.tipo <> 'area'
          and z.cod in (select jsonb_array_elements_text(v_limp));

        -- Fase 5 tarea 3: mismo derivado de catálogo que reportes_crear (ver comentario arriba).
        insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                    peso_unitario, monto_total, revisar, detalle, registrado_por_id)
        select
          v_id,
          coalesce(nullif(e ->> 'tipo', ''), cat.tipo_act, 'libre'),
          coalesce(nullif(e ->> 'nombre', ''), cat.nombre, 'Extra'),
          nullif(e ->> 'cod', ''),
          coalesce((e ->> 'cantidad')::int, 1),
          coalesce(cat.precio_unitario, 0),
          coalesce(cat.peso, 0),
          coalesce(cat.precio_unitario, 0) * coalesce((e ->> 'cantidad')::int, 1),
          (cat.cod is null),
          '',
          v_draft.encargado_id
        from jsonb_array_elements(v_extras) e
        left join actividades_config cat
          on cat.sede_cod = v_sede and cat.cod = nullif(e ->> 'cod', '') and cat.categoria = 'EXT'
        where coalesce(e ->> 'nombre', '') <> '' or nullif(e ->> 'cod', '') is not null;
      end if;

      delete from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;

      v_res := v_res || jsonb_build_object('id', v_id, 'sede', v_sede, 'turno', v_turno,
                                            'estado_envio', v_estado_envio, 'no_evaluable', not v_contenido);
    end loop;
  end loop;
  return v_res;
end;
$$;

revoke execute on function reportes_auto_cierre(text[]) from public, anon, authenticated;
grant execute on function reportes_auto_cierre(text[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5) evaluacion_componentes (0044): agrega extrasPuntos (suma de puntos_total de los extras
--    'por_puntos' registrados por el empleado en el rango) al mismo ledger informativo donde ya
--    viven puntosPipeline/extrasMonto/extrasCantidad. Sigue sin entrar a la fórmula de la nota
--    (no hay regla de negocio confirmada para convertir esto a la escala /20) — el admin lo ve
--    al lado de los componentes editables, mismo patrón que 0044.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function evaluacion_componentes(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb language sql stable security definer set search_path = public
as $$
  with reps as (
    select id from reportes
    where encargado_id = p_empleado and evaluado and fecha between p_desde and p_hasta
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
  tard as (
    select coalesce(sum(minutos_tardanza), 0) as min
    from asistencias where empleado_id = p_empleado and fecha between p_desde and p_hasta
  ),
  inc as (
    select coalesce(sum(puntos_penalidad), 0) as descuento
    from incidencias where responsable_id = p_empleado and fecha between p_desde and p_hasta
  ),
  pipe as (
    select coalesce(sum(puntos), 0) as total
    from pipeline_puntos
    where empleado_id = p_empleado and fecha::date between p_desde and p_hasta
  ),
  extr as (
    select coalesce(sum(re.monto_total), 0) as total, count(*) as cantidad,
           coalesce(sum(re.puntos_total), 0) as puntos
    from reporte_extras re
    join reportes r on r.id = re.reporte_id
    where re.registrado_por_id = p_empleado and r.fecha between p_desde and p_hasta
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
    'extrasPuntos',     round((select puntos from extr), 2)
  );
$$;

revoke execute on function evaluacion_componentes(uuid, date, date) from public, anon;
grant execute on function evaluacion_componentes(uuid, date, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Nota de negocio pendiente (ver docs/pendientes-negocio.md): esta migración deliberadamente NO
-- decide entre el catálogo de seed.js y el catálogo XTR* ya vigente en la base — ver el hallazgo
-- al inicio del archivo. El extra "libre" (sin catálogo) queda a propósito en precio=0/puntos=0/
-- revisar=true en vez de inventarle un valor.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
