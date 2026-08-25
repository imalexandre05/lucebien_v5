-- Prueba de la migración 0098_liquidacion_muestra_horas_estimadas.sql
--
-- Ataca los tres casos que pidió el encargo (docs/pendientes-negocio.md, sección "Huellero decide
-- por horario", "Detalle honesto de la pantalla"):
--   1. un día con UN tramo y `salida_estimada = true` llega marcado (`salidaEstimada: true`) a la
--      salida de `sueldo_entrada`, con `entradaEstimada: false` porque esa hora sí es real.
--   2. un día normal (sin ninguna hora estimada) llega SIN marcar en las dos claves.
--   3. un día con DOS tramos donde sólo uno tiene una hora estimada llega con el día ENTERO
--      marcado (`bool_or` agrupado por fecha, no por tramo) — es el caso que un `max`/`bool_and`
--      mal elegido dejaría pasar en falso.
--
-- QUÉ NO PRUEBA. No reproduce el desglose real del motor (packages/core/src/sueldos.ts): la
-- advertencia que arma liquidarPeriodo() con estas fechas la prueba sueldos.test.ts, no SQL.
-- Tampoco vuelve a probar los guards de PERMISO/DATO ni el control de "día sin declarar"/"día a
-- medio declarar" (0085): ya los prueban 0085_sueldo_entrada_dia_mixto.prueba.sql y
-- 0093_liquidacion_por_tramos.prueba.sql, y esta migración no les cambia ni una línea.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- OJO — mismo aviso que las pruebas de la 0073/0080/0085/0093 (docs/aprendizajes.md, fila del
-- 22-ago): `sueldo_entrada` exige `private.app_es_admin()` adentro, que lee `auth.uid()`. El
-- editor SQL de Supabase corre con `auth.uid()` en null, así que sin el `set_config(...)` de más
-- abajo TODO devuelve PERMISO y la prueba no comprueba nada. Correr el archivo ENTERO de una sola
-- vez: ese `set_config(..., true)` vale sólo dentro de esta misma transacción.
--
-- OJO 2 — aviso propio de esta prueba, aprendido corriendo pruebas contra la base real
-- (docs/aprendizajes.md): `asistencias` tiene `unique (empleado_id, fecha, turno)`. Los tres días
-- del montaje usan combinaciones (fecha, turno) distintas — una fila 'M' por día, y el día 3 le
-- suma una 'T' — para que ninguna choque contra otra ni contra algo que ya exista.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0098
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0098")

do $$
declare
  adm       uuid;
  ac        uuid;
  v_json    jsonb;
  v_ent1    boolean;
  v_sal1    boolean;
  v_ent2    boolean;
  v_sal2    boolean;
  v_ent3    boolean;
  v_sal3    boolean;
  v_tramos3 int;
  r         text := '';
begin
  select id into adm from empleados where rol in ('admin','dueno') order by id limit 1;
  if adm is null then raise exception 'La prueba necesita al menos un empleado con rol admin'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role','authenticated')::text, true);
  if not private.app_es_admin() then
    raise exception 'No pude hacerme pasar por el administrador; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: un acuerdo corto de 10 días, horario todos los días (M 09-13, T 13-20) ─────────
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, creado_por)
    values (adm, '2099-02-01', '2099-02-10', 'semanal', 100, 'vigente', adm)
    returning id into ac;

  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
  select ac, d, h.desde, h.hasta
  from generate_series(1,7) d,
       (values (time '09:00', time '13:00'), (time '13:00', time '20:00')) as h(desde, hasta);

  -- Día 1 (2099-02-02): un tramo, con la SALIDA estimada — la entrada sí es real.
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente,
                           entrada_estimada, salida_estimada)
    values (adm, '2099-02-02', 'M', 'trabajado', time '09:00', time '13:00', 'huellero', false, true);

  -- Día 2 (2099-02-03): un tramo normal, ninguna hora estimada.
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente,
                           entrada_estimada, salida_estimada)
    values (adm, '2099-02-03', 'M', 'trabajado', time '09:00', time '13:00', 'huellero', false, false);

  -- Día 3 (2099-02-04): DOS tramos — el de la mañana normal, el de la tarde con la ENTRADA
  -- estimada. El día entero tiene que salir marcado por el tramo de la tarde (bool_or).
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente,
                           entrada_estimada, salida_estimada)
    values
      (adm, '2099-02-04', 'M', 'trabajado', time '09:00', time '13:00', 'huellero', false, false),
      (adm, '2099-02-04', 'T', 'trabajado', time '13:00', time '20:00', 'huellero', true,  false);

  r := r || 'montaje=ok; ';

  -- ═══ Los tres casos, en una sola llamada a sueldo_entrada ═══════════════════════════════════
  begin
    v_json := sueldo_entrada(ac, '2099-02-02', '2099-02-04');

    select (elem->>'entradaEstimada')::boolean, (elem->>'salidaEstimada')::boolean
      into v_ent1, v_sal1
      from jsonb_array_elements(v_json->'asistencia') elem
      where elem->>'fecha' = '2099-02-02';

    select (elem->>'entradaEstimada')::boolean, (elem->>'salidaEstimada')::boolean
      into v_ent2, v_sal2
      from jsonb_array_elements(v_json->'asistencia') elem
      where elem->>'fecha' = '2099-02-03';

    select (elem->>'entradaEstimada')::boolean, (elem->>'salidaEstimada')::boolean,
           jsonb_array_length(elem->'tramos')
      into v_ent3, v_sal3, v_tramos3
      from jsonb_array_elements(v_json->'asistencia') elem
      where elem->>'fecha' = '2099-02-04';

    -- Caso 1
    if v_ent1 is false and v_sal1 is true then
      r := r || '[ok] caso1: un dia con salida_estimada=true llega marcado en salidaEstimada, sin marcar entradaEstimada; ';
    else
      r := r || format('[FALLA] caso1: esperaba entradaEstimada=false y salidaEstimada=true, vino entradaEstimada=%s salidaEstimada=%s; ', v_ent1, v_sal1);
    end if;

    -- Caso 2
    if v_ent2 is false and v_sal2 is false then
      r := r || '[ok] caso2: un dia normal llega sin marcar en las dos claves; ';
    else
      r := r || format('[FALLA] caso2: esperaba entradaEstimada=false y salidaEstimada=false, vino entradaEstimada=%s salidaEstimada=%s; ', v_ent2, v_sal2);
    end if;

    -- Caso 3
    if v_ent3 is true and v_sal3 is false and v_tramos3 = 2 then
      r := r || '[ok] caso3: un dia con dos tramos y solo uno con hora estimada llega con el DIA ENTERO marcado (bool_or por fecha, no por tramo); ';
    else
      r := r || format('[FALLA] caso3: esperaba entradaEstimada=true salidaEstimada=false con 2 tramos, vino entradaEstimada=%s salidaEstimada=%s tramos=%s; ', v_ent3, v_sal3, v_tramos3);
    end if;
  exception when others then
    r := r || format('[FALLA] los tres casos: sueldo_entrada no deberia cortar con este montaje y corto con "%s"; ', sqlerrm);
  end;

  raise exception 'RESULTADO 0098 --> %', r;
end $$;
