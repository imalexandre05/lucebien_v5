-- 0057_valores360_competencias_pagos.sql — Fase 12 del plan de perfeccionamiento: evaluación
-- mensual completa + Valores 360° + pagos. packages/core/src/evaluaciones.ts define el componente
-- `valores` con peso 0.25 (el más alto) desde hace varias fases, pero no había ninguna forma de
-- calcularlo — el módulo que lo alimentaba (routes/valores.js, sistema viejo) nunca se migró.
-- Idempotente: create table/index if not exists, create or replace en funciones, on conflict do
-- nothing en los seeds.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) evaluaciones_valores — peer review de 6 valores (tarea 1). Puerto del schema implícito de
--    routes/valores.js (tabla ya existía en SQLite desde antes de ese archivo, columnas inferidas
--    de sus queries: evaluador_id, evaluado_id, mes, integridad/respeto/honestidad/amabilidad/
--    relacion/actitud). Escala Likert 1-5 por valor (public/js/app.js:1587, default 3).
--    `mes` es texto 'YYYY-MM' — mismo criterio que evaluaciones_mensuales.mes (no ciclo por
--    aniversario: Valores 360° siempre fue mensual-calendario en el sistema viejo, ver
--    routes/valores.js, todos los endpoints reciben :mes).
--    Impide autoevaluarse en DOS capas: constraint aquí (defensa en profundidad) + validación en
--    la capa de repo/acción ANTES de llamar a la base (mensaje amigable en vez del error crudo de
--    Postgres) — mismo patrón que puedeEvaluarValores() en packages/core/src/valores360.ts.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists evaluaciones_valores (
  id           uuid primary key default gen_random_uuid(),
  evaluador_id uuid not null references empleados(id) on delete cascade,
  evaluado_id  uuid not null references empleados(id) on delete cascade,
  mes          text not null,
  integridad   smallint not null check (integridad between 1 and 5),
  respeto      smallint not null check (respeto between 1 and 5),
  honestidad   smallint not null check (honestidad between 1 and 5),
  amabilidad   smallint not null check (amabilidad between 1 and 5),
  relacion     smallint not null check (relacion between 1 and 5),
  actitud      smallint not null check (actitud between 1 and 5),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (evaluador_id, evaluado_id, mes),
  check (evaluador_id <> evaluado_id)
);

create index if not exists idx_eval_valores_evaluado  on evaluaciones_valores(evaluado_id, mes);
create index if not exists idx_eval_valores_evaluador on evaluaciones_valores(evaluador_id, mes);

alter table evaluaciones_valores enable row level security;

-- SELECT: admin/almacén ven todo (pantalla "Seguimiento"); cualquiera ve lo que recibió (la
-- columna evaluador_id queda oculta a propósito en la capa de repo del resumen individual, para
-- no revelar quién calificó — el sistema viejo tampoco lo mostraba, routes/valores.js:200-219) y
-- lo que envió (para no re-evaluar a quien ya evaluó este mes).
drop policy if exists eval_valores_select on evaluaciones_valores;
create policy eval_valores_select on evaluaciones_valores for select
  using (private.app_es_admin() or private.app_es_almacen() or evaluado_id = auth.uid() or evaluador_id = auth.uid());

-- INSERT: cualquier autenticado puede evaluar a un compañero (routes/valores.js:103 solo exigía
-- verifyToken, sin restricción de rol) — nunca a sí mismo, doble check con el constraint de arriba.
drop policy if exists eval_valores_insert on evaluaciones_valores;
create policy eval_valores_insert on evaluaciones_valores for insert
  with check (evaluador_id = auth.uid() and evaluado_id <> auth.uid());

-- UPDATE: el propio evaluador puede corregir su evaluación del mes (upsert, mismo criterio que el
-- INSERT OR REPLACE del sistema viejo); admin puede corregir cualquiera (moderación).
drop policy if exists eval_valores_update on evaluaciones_valores;
create policy eval_valores_update on evaluaciones_valores for update
  using (private.app_es_admin() or evaluador_id = auth.uid())
  with check (private.app_es_admin() or (evaluador_id = auth.uid() and evaluado_id <> auth.uid()));

drop policy if exists eval_valores_delete on evaluaciones_valores;
create policy eval_valores_delete on evaluaciones_valores for delete
  using (private.app_es_admin());

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) competencias_config — catálogo editable de las 8 competencias con rúbrica Likert de 5
--    niveles (tarea 2). Antes hardcodeado en public/js/data.js:75-84 (constante COMPETENCIAS);
--    ahora vive en tabla, gestionable desde /configuracion (mismo patrón que producto_tipos,
--    migración 0055). `rubrica` es un array jsonb de 5 strings (nivel 0 = peor, nivel 4 = mejor —
--    el índice ES el puntaje, ver packages/core/src/competencias.ts).
--    Textos copiados literalmente de public/js/data.js:75-84, incluidas sus abreviaturas
--    ("3 malas coord.") — no se reescriben para no inventar contenido que el dueño no pidió.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists competencias_config (
  cod        text primary key,
  nombre     text not null,
  orden      int not null default 0,
  rubrica    jsonb not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table competencias_config enable row level security;

drop policy if exists competencias_config_select on competencias_config;
create policy competencias_config_select on competencias_config for select
  using (auth.uid() is not null);
drop policy if exists competencias_config_admin on competencias_config;
create policy competencias_config_admin on competencias_config for all
  using (private.app_es_admin())
  with check (private.app_es_admin());

insert into competencias_config (cod, nombre, orden, rubrica) values
  ('C1', 'Resolución de Problemas',  1, '["Más de 3 sin resolver","3 sin resolver","2 sin resolver","1 sin resolver","Todos resueltos"]'::jsonb),
  ('C2', 'Trabajo en Equipo',        2, '["Más de 3 conflictos","3 conflictos","2 conflictos","1 conflicto","Sin conflictos"]'::jsonb),
  ('C3', 'Buena Comunicación',       3, '["Más de 3 malas coord.","3 malas coord.","2 malas coord.","1 mala coord.","Sin malas coord."]'::jsonb),
  ('C4', 'Manejo de Clientes',       4, '["Más de 3 conflictos","3 conflictos","2 conflictos","1 conflicto","Sin percances"]'::jsonb),
  ('C5', 'Cumplimiento de Metas',    5, '["Faltó +S/300","Faltó S/200-300","Faltó S/100-200","Faltó S/1-100","Cumplió meta"]'::jsonb),
  ('C6', 'Relación con Clientes',    6, '["< 7.0","7.0–7.5","7.5–8.0","8.0–8.5","8.5–10"]'::jsonb),
  ('C7', 'Habilidades Técnicas',     7, '["Todas mal","3 a medias","1 correcta","2 correctas","Plancha+basta+examen>15"]'::jsonb),
  ('C8', 'Habilidad de Adaptación',  8, '["No se adapta","Casi nada","Pocas intenciones","Tiene intención","Buena actitud"]'::jsonb)
on conflict (cod) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) app_directorio_activos — directorio MINIMO (id, nombre) filtrado a activo=true, para la
--    pantalla "Evaluar compañeros": cualquier empleado necesita ver a TODOS sus compañeros
--    activos (no solo a sí mismo — la RLS de `empleados` se lo impediría). Deliberadamente
--    SEPARADO de app_directorio() (migración 0031, que expone también rol/sede y NO filtra activo
--    a propósito, para resolver nombres históricos) — tocar esa función habría afectado a todos
--    sus call sites existentes; esta es de un solo uso, acotada, igual criterio que el viejo
--    (routes/valores.js:70 y :120: `WHERE e.activo=1 AND e.id!=?`).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function app_directorio_activos()
  returns table(id uuid, nombre text)
  language sql stable security definer set search_path = public
as $$
  select e.id, e.nombre from empleados e where e.activo order by e.nombre;
$$;

revoke execute on function app_directorio_activos() from public, anon;
grant execute on function app_directorio_activos() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) evaluacion_componentes (0032/0044/0053) — se extiende (tarea 4, MISMA firma, create or
--    replace) para devolver también:
--      - valores: nota /20 real, calculada de evaluaciones_valores del mes de p_desde (mismo
--        criterio de agrupación que el sistema viejo: routes/evaluaciones.js:360 deriva
--        `mes = desde.slice(0,7)` para consultar valores dentro de /calcular; routes/valores.js:
--        96-97 y :170-171 hacen el promedio de los 6 valores y lo escalan a /20). null si nadie
--        evaluó a esta persona todavía en el mes (igual que el original).
--      - bonusVentas: SIEMPRE 0. No hay fuente de datos real: el módulo de metas de venta
--        (routes/ventas.js, tabla ventas_metas) queda EXPLÍCITAMENTE fuera de alcance de este loop
--        (ver plan, Fase 13 "Fuera de alcance") — no se migra su schema ni su lógica de bonus por
--        cumplimiento. Se agrega la CLAVE (no el cálculo) para que el autollenado del cliente no
--        la deje undefined; el campo sigue siendo 100% manual/editable, como ya lo era antes de
--        esta migración. Ver docs/pendientes-negocio.md.
--    `competencias` NO se agrega aquí a propósito: en el sistema viejo nunca fue un valor que se
--    "recuperara" de historial — el jefe lo puntúa en vivo en cada evaluación (public/js/
--    admin.js:1554), no hay una tabla de donde autocompletarlo. El catálogo (rúbrica) se lee
--    aparte, directo de competencias_config (sección 2), no por esta RPC.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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
  ),
  val as (
    select
      avg(integridad)::numeric as integridad, avg(respeto)::numeric as respeto,
      avg(honestidad)::numeric as honestidad, avg(amabilidad)::numeric as amabilidad,
      avg(relacion)::numeric as relacion, avg(actitud)::numeric as actitud,
      count(*) as cantidad
    from evaluaciones_valores
    where evaluado_id = p_empleado and mes = to_char(p_desde, 'YYYY-MM')
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
    'bonusVentas',      0
  );
$$;

revoke execute on function evaluacion_componentes(uuid, date, date) from public, anon;
grant execute on function evaluacion_componentes(uuid, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5) permisos_modulos — 'valores' (Evaluar compañeros) es operativo: TODO el mundo evalúa a sus
--    compañeros, no solo encargados/admin (a diferencia de 'evaluaciones'/'pagos', que siguen
--    siendo confidenciales). admin/dueno no necesitan fila (puede() los deja pasar siempre).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into permisos_modulos (rol, modulo, acciones) values
  ('confeccionista',    'valores', array['ver']),
  ('ventas_junior',     'valores', array['ver']),
  ('ventas_junior_2',   'valores', array['ver']),
  ('encargado_tienda',  'valores', array['ver']),
  ('encargado_almacen', 'valores', array['ver'])
on conflict (rol, modulo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6) pagos — columnas para cerrar el ciclo evaluación → pago desde una sola pantalla (tarea 6):
--    snapshot del salario base y del ciclo evaluado al momento de registrar el pago (igual
--    criterio que pesos_usados en evaluaciones_mensuales — si el salario cambia después, el
--    comprobante ya emitido no se recalcula solo). `evaluacion_id` YA existía (0001_init.sql);
--    estas son aditivas, nunca rompen pagos ya registrados (quedan NULL en los históricos).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table pagos
  add column if not exists monto_base    numeric(10,2),
  add column if not exists observaciones text,
  add column if not exists ciclo_desde   date,
  add column if not exists ciclo_hasta   date;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Verificación (correr manualmente tras aplicar):
--   select count(*) from competencias_config;                    -- esperado: 8
--   select cod, nombre, jsonb_array_length(rubrica) from competencias_config order by orden;
--     -- esperado: 8 filas, jsonb_array_length siempre 5
--   select evaluacion_componentes(id, '2026-07-01', '2026-07-31') from empleados limit 1;
--     -- esperado: jsonb con las claves de siempre + valores/valoresCantidad/bonusVentas, sin error
--   select proname from pg_proc where proname = 'app_directorio_activos';  -- esperado: 1 fila
-- ─────────────────────────────────────────────────────────────────────────────────────────────
