-- Guardia de base vacía/obsoleta: la 0093 retiró sueldo_entrada(uuid) a propósito; lo cubren las pruebas 0093 y posteriores
select to_regprocedure('public.sueldo_entrada(uuid)') is null as omitir \gset
\if :omitir
do $$ begin raise exception 'RESULTADO 0078: OMITIDA — la 0093 retiró sueldo_entrada(uuid) a propósito; lo cubren las pruebas 0093 y posteriores'; end $$;
\quit
\endif

-- Prueba de la migración 0078_tramos_asistencia_pausas.sql
--
-- Lo único que esta migración tiene que garantizar del lado de la base es que `sueldo_entrada`
-- EMITA los tramos. La suma, el orden y el umbral de pausa viven en el core y ya tienen sus tests
-- (packages/core/src/sueldos.test.ts, describe «RN-05 — suma de tramos continuos»). Duplicarlos acá
-- sería tener dos verdades sobre la misma regla.
--
-- El modo de fallar que importa: la función se reemplaza sin la línea de `tramos`, el motor recibe
-- sólo el par de punta a punta, sigue liquidando sin romperse y **paga las pausas**. Nadie se
-- entera hasta que alguien compare una boleta a mano.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0078
--
-- Todo `ok` = la migración cumple. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  emp    uuid;
  acu    uuid;
  ent    jsonb;
  dia    jsonb;
  p      jsonb;
  r      text := '';
begin
  -- PRESTAR LA IDENTIDAD DE UN ADMINISTRADOR, SÓLO PARA ESTA TRANSACCIÓN.
  --
  -- `sueldo_entrada()` tiene portero: sólo el administrador puede liquidar. Eso está bien y es lo
  -- que protege el sueldo. Pero el editor SQL de Supabase corre sin usuario logueado —`auth.uid()`
  -- devuelve null— así que la prueba moría con «PERMISO: sólo el administrador puede liquidar»
  -- antes de comprobar una sola cosa.
  --
  -- `is_local = true` ata el préstamo a esta transacción: la excepción con la que termina el bloque
  -- lo deshace junto con todo lo demás. No queda ninguna conexión del pool con identidad prestada,
  -- que es lo único que haría de esto un problema de seguridad y no una comodidad de prueba.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',
      (select id::text from empleados where rol in ('admin', 'dueno') order by id limit 1)
    )::text,
    true
  );

  select id into emp from empleados order by id limit 1;

  -- Un acuerdo de un solo lunes, con el turno partido de LuceBien.
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado)
    values (emp, '2099-03-02', '2099-03-02', 'mensual', 600, 'borrador')  -- 2099-03-02 es lunes
    returning id into acu;
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (acu, 1, '09:00', '13:00'), (acu, 1, '15:00', '20:00');

  -- Dos filas del mismo día: dos tramos, con una pausa de dos horas en el medio.
  insert into asistencias(empleado_id, fecha, turno, hora_entrada, hora_salida, fuente, condicion)
    values (emp, '2099-03-02', 'M', '09:00', '13:00', 'manual', 'trabajado'),
           (emp, '2099-03-02', 'T', '15:00', '20:00', 'manual', 'trabajado');

  ent := sueldo_entrada(acu);
  dia := ent -> 'asistencia' -> 0;

  -- ── 1) El día emite DOS tramos, no uno ───────────────────────────────────────────────────
  if jsonb_array_length(dia -> 'tramos') = 2 then r := r || '1=ok ';
  else r := r || format('1-NO-EMITE-TRAMOS=FALLA(%s) ', coalesce(dia ->> 'tramos', 'ausente')); end if;

  -- ── 2) Los tramos salen ordenados por hora de entrada ────────────────────────────────────
  -- El core los ordena igual, pero que salgan ordenados hace legible el snapshot que queda
  -- guardado para siempre en sueldo_liquidaciones.entrada.
  if (dia -> 'tramos' -> 0 ->> 'ingreso') = '09:00' and (dia -> 'tramos' -> 1 ->> 'ingreso') = '15:00'
  then r := r || '2=ok ';
  else r := r || format('2-DESORDENADOS=FALLA(%s) ', dia ->> 'tramos'); end if;

  -- ── 3) Se sigue emitiendo el par de punta a punta ────────────────────────────────────────
  -- La tardanza (RN-08) se mide contra el primer ingreso, y un snapshot viejo tiene que seguir
  -- leyéndose. Si esto desaparece, todo día pasa a leerse como falta: dos días de sueldo cada uno.
  if (dia ->> 'horaIngreso') = '09:00' and (dia ->> 'horaSalida') = '20:00' then r := r || '3=ok ';
  else r := r || format('3-SIN-PAR=FALLA(%s %s) ', dia ->> 'horaIngreso', dia ->> 'horaSalida'); end if;

  -- ── 4) Un día declarado 'falta' no emite tramos ──────────────────────────────────────────
  -- Una falta se declara con el ingreso en null. Mandar tramos además la contradiría con el dato
  -- de una carga anterior, y el motor pagaría horas de un día que la persona no vino.
  update asistencias set condicion = 'falta' where empleado_id = emp and fecha = '2099-03-02' and turno = 'T';
  ent := sueldo_entrada(acu);
  dia := ent -> 'asistencia' -> 0;
  if jsonb_array_length(dia -> 'tramos') = 0 and dia -> 'horaIngreso' = 'null'::jsonb then r := r || '4=ok ';
  else r := r || format('4-FALTA-CON-TRAMOS=FALLA(%s) ', dia::text); end if;

  -- ── 5) El umbral de pausa llega al motor ─────────────────────────────────────────────────
  -- Sin él, dos marcas a las 09:00 y 09:02 parten el día y descuentan dos minutos todos los días.
  p := ent -> 'parametros';
  if (p ->> 'pausaMinimaMinutos')::numeric = 15 then r := r || '5=ok ';
  else r := r || format('5-UMBRAL-NO-LLEGA=FALLA(%s) ', coalesce(p ->> 'pausaMinimaMinutos', 'ausente')); end if;

  -- ── 6) Se puede pactar otro umbral por contrato ──────────────────────────────────────────
  update sueldo_acuerdos set parametros = '{"pausaMinimaMinutos": 30}'::jsonb where id = acu;
  ent := sueldo_entrada(acu);
  if (ent -> 'parametros' ->> 'pausaMinimaMinutos')::numeric = 30 then r := r || '6=ok ';
  else r := r || format('6-OVERRIDE-NO-PISA=FALLA(%s) ', ent -> 'parametros' ->> 'pausaMinimaMinutos'); end if;

  raise exception 'RESULTADO %', r;
end $$;
