-- Prueba de la migración 0110_puntos_hora_peru.sql
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-04-puntos-dia-hora-peru-design.md §6.
-- `pipeline_puntos.fecha` es timestamptz y la base corre en UTC: el día de un punto se toma en
-- hora Perú, no en UTC. Se comprueba en las dos funciones que filtraban `fecha::date`:
--   · private.evaluacion_componentes_datos → clave puntosPipeline
--   · est_productividad
--
--   A. Punto del 2026-09-30 23:30-05 (= 2026-10-01 04:30 UTC): cuenta en septiembre y NO en octubre.
--   B. Punto del 2026-10-01 00:30-05 (= 2026-10-01 05:30 UTC): cuenta en octubre y NO en septiembre.
--   C. Punto del 2026-09-30 23:30-05 con el rango de un solo día 30-sep: cuenta (último día, noche).
--
-- Cada caso usa un empleado propio y puntos distintos (4, 8) para que no se puedan confundir.
--
-- SE DESCARTA SOLA: todo vive dentro de un bloque que termina lanzando una excepción con el
-- resultado; la transacción se aborta y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0110
-- (o pegar el archivo entero en el SQL editor de Supabase y leer el mensaje P0001 que empieza con
-- "RESULTADO 0110")

do $$
declare
  emp_sep uuid;
  emp_oct uuid;
  v_ev_sep   numeric;
  v_ev_oct   numeric;
  v_est_sep  numeric;
  v_est_oct  numeric;
  v_dia_sep  numeric;
  r          text := '';
begin
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0110-SEP', 'Prueba 0110 Septiembre', 'Q1') returning id into emp_sep;
  insert into empleados (cod, nombre, iniciales) values ('PRUEBA0110-OCT', 'Prueba 0110 Octubre',    'Q2') returning id into emp_oct;

  insert into pipeline_puntos (empleado_id, etapa, puntos, detalle, fecha)
    values (emp_sep, 'lavado', 4, 'prueba 0110', timestamptz '2026-09-30 23:30:00-05');
  insert into pipeline_puntos (empleado_id, etapa, puntos, detalle, fecha)
    values (emp_oct, 'lavado', 8, 'prueba 0110', timestamptz '2026-10-01 00:30:00-05');

  -- ── evaluacion_componentes_datos ─────────────────────────────────────────────────────────
  v_ev_sep := (private.evaluacion_componentes_datos(emp_sep, date '2026-09-01', date '2026-09-30') ->> 'puntosPipeline')::numeric;
  r := r || 'A-eval-sep=' || (case when v_ev_sep = 4 then 'ok' else 'FALLA(' || coalesce(v_ev_sep::text, 'null') || ')' end) || '; ';
  v_ev_oct := (private.evaluacion_componentes_datos(emp_sep, date '2026-10-01', date '2026-10-31') ->> 'puntosPipeline')::numeric;
  r := r || 'A-eval-oct-sin-punto-sep=' || (case when v_ev_oct = 0 then 'ok' else 'FALLA(' || coalesce(v_ev_oct::text, 'null') || ')' end) || '; ';

  v_ev_oct := (private.evaluacion_componentes_datos(emp_oct, date '2026-10-01', date '2026-10-31') ->> 'puntosPipeline')::numeric;
  r := r || 'B-eval-oct=' || (case when v_ev_oct = 8 then 'ok' else 'FALLA(' || coalesce(v_ev_oct::text, 'null') || ')' end) || '; ';
  v_ev_sep := (private.evaluacion_componentes_datos(emp_oct, date '2026-09-01', date '2026-09-30') ->> 'puntosPipeline')::numeric;
  r := r || 'B-eval-sep-sin-punto-oct=' || (case when v_ev_sep = 0 then 'ok' else 'FALLA(' || coalesce(v_ev_sep::text, 'null') || ')' end) || '; ';

  v_dia_sep := (private.evaluacion_componentes_datos(emp_sep, date '2026-09-30', date '2026-09-30') ->> 'puntosPipeline')::numeric;
  r := r || 'C-eval-ultimo-dia=' || (case when v_dia_sep = 4 then 'ok' else 'FALLA(' || coalesce(v_dia_sep::text, 'null') || ')' end) || '; ';

  -- ── est_productividad ────────────────────────────────────────────────────────────────────
  select coalesce(sum(puntos), 0) into v_est_sep from est_productividad(date '2026-09-01', date '2026-09-30') where empleado_id = emp_sep;
  r := r || 'A-est-sep=' || (case when v_est_sep = 4 then 'ok' else 'FALLA(' || v_est_sep || ')' end) || '; ';
  select coalesce(sum(puntos), 0) into v_est_oct from est_productividad(date '2026-10-01', date '2026-10-31') where empleado_id = emp_sep;
  r := r || 'A-est-oct-sin-punto-sep=' || (case when v_est_oct = 0 then 'ok' else 'FALLA(' || v_est_oct || ')' end) || '; ';

  select coalesce(sum(puntos), 0) into v_est_oct from est_productividad(date '2026-10-01', date '2026-10-31') where empleado_id = emp_oct;
  r := r || 'B-est-oct=' || (case when v_est_oct = 8 then 'ok' else 'FALLA(' || v_est_oct || ')' end) || '; ';
  select coalesce(sum(puntos), 0) into v_est_sep from est_productividad(date '2026-09-01', date '2026-09-30') where empleado_id = emp_oct;
  r := r || 'B-est-sep-sin-punto-oct=' || (case when v_est_sep = 0 then 'ok' else 'FALLA(' || v_est_sep || ')' end) || '; ';

  raise exception 'RESULTADO 0110: %', r;
end $$;
