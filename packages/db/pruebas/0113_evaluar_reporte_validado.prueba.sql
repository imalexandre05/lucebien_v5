-- Prueba de la migración 0113_evaluar_reporte_validado.sql
--
-- Spec: docs/superpowers/specs/reportes/2026-10-04-evaluar-reporte-validado-design.md
-- Se escribió ANTES de la migración: contra la 0081 fallan los casos 2-6 y 8.
--
--   1. Caso feliz: calificaciones 1 / 0.5 / 0 con pesos 2 / 1 / 1 → puntaje 63, igual que la 0081.
--   2. Rango: 1.5, -0.1, null y texto → 'DATO: calificación fuera de rango'; nada se escribe.
--   3. Doble evaluación → 'ESTADO: el reporte ya fue evaluado'; nota y puntaje intactos.
--   4. Reporte no_evaluable → 'ESTADO: …'.
--   5. Actividad omitida → 'DATO: las calificaciones no coinciden…'; nada se escribe.
--   6. Código sobrante o repetido → el mismo 'DATO'.
--   7. Reporte sin actividades con arreglo vacío → se evalúa en 0 (comportamiento actual).
--   8. Tras un rechazo, el reporte sigue sin evaluar y puede evaluarse bien después.
--
-- MONTAJE. Sólo reportes sintéticos 'PRUEBA0113-*' sobre una sede y un administrador
-- sintéticos; el evaluador es ese administrador (la regla del evaluador externo no se toca en esta migración).
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0113
--                 (o bash tools/postgres-local.sh probar 0113)

create or replace function pg_temp.intentar(p_id text, p_cal jsonb) returns text
language plpgsql as $f$
begin
  return 'ok:' || reportes_evaluar(p_id, p_cal);
exception when others then
  return sqlerrm;
end $f$;

do $$
declare
  v_admin uuid;
  v_sede  text;
  v_res   text;
  v_pun   int;
  v_ev    boolean;
  v_cals  text;
  r       text := '';

begin
  -- Sede y administrador sintéticos: la prueba corre igual en una base vacía o en la real.
  v_sede := 'PRUEBA0113';
  insert into sedes (cod, nombre) values (v_sede, 'Sede prueba 0113');
  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0113-ADM', 'Prueba 0113 Admin', 'PA', 'admin') returning id into v_admin;

  -- Reportes sintéticos: A (feliz/doble), B (rango), C (no_evaluable), D (omitida/sobrante), E (vacío)
  insert into reportes (id, sede_cod, turno, fecha, evaluado, no_evaluable) values
    ('PRUEBA0113-A', v_sede, 'M', date '2001-01-01', false, false),
    ('PRUEBA0113-B', v_sede, 'M', date '2001-01-02', false, false),
    ('PRUEBA0113-C', v_sede, 'M', date '2001-01-03', false, true),
    ('PRUEBA0113-D', v_sede, 'M', date '2001-01-04', false, false),
    ('PRUEBA0113-E', v_sede, 'M', date '2001-01-05', false, false);
  insert into reporte_actividades (reporte_id, cod, nombre, cat, peso)
    select rid, cod, cod, 'IND', peso
    from (values ('A'),('B'),('C'),('D')) t(l),
         lateral (select 'PRUEBA0113-' || t.l as rid) x,
         (values ('X1', 2), ('X2', 1), ('X3', 1)) a(cod, peso);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1. caso feliz
  v_res := pg_temp.intentar('PRUEBA0113-A',
    '[{"cod":"X1","cal":1,"obs":""},{"cod":"X2","cal":0.5,"obs":"ok"},{"cod":"X3","cal":0,"obs":""}]');
  select puntaje_eval, evaluado into v_pun, v_ev from reportes where id = 'PRUEBA0113-A';
  r := r || case when v_res = 'ok:63' and v_pun = 63 and v_ev then '1 ok · ' else '1 FALLA (' || v_res || ', pun=' || coalesce(v_pun::text,'null') || ') · ' end;

  -- 2. rango (cada valor en su propia llamada; el reporte B debe quedar intacto)
  v_res := '';
  for v_cals in select unnest(array[
    '[{"cod":"X1","cal":1.5},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]',
    '[{"cod":"X1","cal":-0.1},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]',
    '[{"cod":"X1","cal":null},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]',
    '[{"cod":"X1","cal":"abc"},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]',
    '[{"cod":"X1"},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]'])
  loop
    v_res := v_res || case when pg_temp.intentar('PRUEBA0113-B', v_cals::jsonb) = 'DATO: calificación fuera de rango' then 'y' else 'n' end;
  end loop;
  select evaluado, (select string_agg(calificacion::text, ',' order by cod) from reporte_actividades where reporte_id = 'PRUEBA0113-B')
    into v_ev, v_cals from reportes where id = 'PRUEBA0113-B';
  r := r || case when v_res = 'yyyyy' and not v_ev and v_cals = '1.00,1.00,1.00' then '2 ok · ' else '2 FALLA (' || v_res || ', ev=' || v_ev || ', cals=' || v_cals || ') · ' end;

  -- 3. doble evaluación
  v_res := pg_temp.intentar('PRUEBA0113-A',
    '[{"cod":"X1","cal":0},{"cod":"X2","cal":0},{"cod":"X3","cal":0}]');
  select puntaje_eval into v_pun from reportes where id = 'PRUEBA0113-A';
  select string_agg(calificacion::text, ',' order by cod) into v_cals from reporte_actividades where reporte_id = 'PRUEBA0113-A';
  r := r || case when v_res = 'ESTADO: el reporte ya fue evaluado' and v_pun = 63 and v_cals = '1.00,0.50,0.00' then '3 ok · ' else '3 FALLA (' || v_res || ', pun=' || coalesce(v_pun::text,'null') || ', cals=' || v_cals || ') · ' end;

  -- 4. no_evaluable
  v_res := pg_temp.intentar('PRUEBA0113-C',
    '[{"cod":"X1","cal":1},{"cod":"X2","cal":1},{"cod":"X3","cal":1}]');
  r := r || case when v_res = 'ESTADO: el reporte ya fue evaluado' then '4 ok · ' else '4 FALLA (' || v_res || ') · ' end;

  -- 5. omitida (falta X3): no se escribe nada, ni siquiera X1/X2
  v_res := pg_temp.intentar('PRUEBA0113-D', '[{"cod":"X1","cal":0},{"cod":"X2","cal":0}]');
  select evaluado into v_ev from reportes where id = 'PRUEBA0113-D';
  select string_agg(calificacion::text, ',' order by cod) into v_cals from reporte_actividades where reporte_id = 'PRUEBA0113-D';
  r := r || case when v_res = 'DATO: las calificaciones no coinciden con las actividades del reporte' and not v_ev and v_cals = '1.00,1.00,1.00'
                 then '5 ok · ' else '5 FALLA (' || v_res || ', ev=' || v_ev || ', cals=' || v_cals || ') · ' end;

  -- 6. sobrante y repetido
  v_res := pg_temp.intentar('PRUEBA0113-D',
    '[{"cod":"X1","cal":1},{"cod":"X2","cal":1},{"cod":"X3","cal":1},{"cod":"ZZ","cal":1}]');
  v_cals := pg_temp.intentar('PRUEBA0113-D',
    '[{"cod":"X1","cal":1},{"cod":"X1","cal":1},{"cod":"X2","cal":1}]');
  r := r || case when v_res = 'DATO: las calificaciones no coinciden con las actividades del reporte'
                  and v_cals = 'DATO: las calificaciones no coinciden con las actividades del reporte'
                 then '6 ok · ' else '6 FALLA (' || v_res || ' / ' || v_cals || ') · ' end;

  -- 7. reporte sin actividades, arreglo vacío
  v_res := pg_temp.intentar('PRUEBA0113-E', '[]');
  r := r || case when v_res = 'ok:0' then '7 ok · ' else '7 FALLA (' || v_res || ') · ' end;

  -- 8. tras los rechazos D sigue sin evaluar y se evalúa bien: (2*1+1*1+1*0)/4 = 75
  v_res := pg_temp.intentar('PRUEBA0113-D',
    '[{"cod":"X1","cal":1},{"cod":"X2","cal":1},{"cod":"X3","cal":0}]');
  r := r || case when v_res = 'ok:75' then '8 ok' else '8 FALLA (' || v_res || ')' end;

  raise exception 'RESULTADO 0113: %', r;
end $$;
