-- Prueba de la migración 0081_reportes_escritura_directa.sql
--
-- No comprueba que las policies existan: comprueba que CUMPLAN lo que prometen. Monta un
-- administrador, un colaborador sin ninguna autoridad, y unos reportes de mentira fechados en
-- 1999 (más dos de hoy, que el auto-cierre necesita para poder equivocarse), y ataca cada promesa
-- de la spec §5:
--
--   · el colaborador NO puede escribir ni borrar un puntaje por PostgREST — pero sigue leyendo
--     los reportes de su sede, y sigue pudiendo enviar y evaluar turnos por las RPC;
--   · las RPC que pasaron a `security definer` siguen negando la sede ajena (es el guard que
--     reemplaza a la policy que ya no las cubre — si esto se rompe, la conversión abrió un agujero
--     peor que el que cerró);
--   · el auto-cierre ya no monta un turno C encima de un M que envió una persona;
--   · la asistencia derivada del reporte deja una sola fila por día, con turno 'C'.
--
-- Cada falla se verifica por su SÍNTOMA exacto —cuántas filas tocó, o el prefijo `PERMISO:` del
-- error—, no por "lanzó algo": una policy que se rompe y falla por otro motivo tiene que
-- reportarse como hallazgo, no pasar por "ok" de casualidad.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- OJO — mismo aviso que la prueba de la 0080 (docs/aprendizajes.md, fila del 22-ago): sin el
-- `set_config('request.jwt.claims', ...)` de más abajo, `auth.uid()` es null, todas las RPC
-- devuelven "No autenticado" y la prueba no comprueba nada. Y sin el `set local role
-- authenticated` de los ataques directos, las consultas corren con el rol dueño de la conexión,
-- que BYPASSA la RLS: los ataques "pasarían" aunque las policies estuvieran perfectas. Hacen falta
-- las dos cosas. Quien la corra tiene que dejar los dos bloques intactos y correr el archivo
-- ENTERO de una sola vez (el `set_config(..., true)` y el `set local` valen sólo dentro de esta
-- misma transacción).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0081
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0081")

do $$
declare
  adm        uuid; col uuid;
  v_sede     text; v_ajena text;
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_sede_m   text; v_sede_libre text;
  id_propio  text; id_otro text; id_ajeno text; id_borrable text;
  id_hoy_m   text; id_c_pisado text; id_c_control text;
  id_asis1   text; id_asis2 text;
  v_pun      int;
  v_cnt      int;
  v_turno    text;
  r          text := '';
begin
  -- ── Actores ────────────────────────────────────────────────────────────────────────────────
  select id into adm from empleados where rol in ('admin', 'dueno') and activo order by id limit 1;
  if adm is null then raise exception 'La prueba necesita un empleado con rol admin'; end if;

  -- El colaborador con MENOS sedes: así se garantiza que exista una sede ajena con la que probar
  -- el guard de las RPC convertidas a definer. Se excluyen los roles de almacén porque
  -- private.app_es_almacen() les abre las cuatro sedes y el ataque no probaría nada.
  select e.id into col
  from empleados e
  where e.rol not in ('admin', 'dueno', 'encargado_almacen', 'confeccionista') and e.activo
  order by (select count(*) from empleado_tiendas t where t.empleado_id = e.id), e.id
  limit 1;
  if col is null then raise exception 'La prueba necesita un empleado SIN autoridad'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', col, 'role', 'authenticated')::text, true);
  if private.app_es_admin() or private.app_es_almacen() then
    raise exception 'El empleado elegido tiene autoridad; la prueba no comprobaria nada';
  end if;

  select s into v_sede from private.app_sedes() s order by s limit 1;
  if v_sede is null then raise exception 'El empleado elegido no tiene ninguna sede'; end if;
  select cod into v_ajena from sedes where cod not in (select private.app_sedes()) order by cod limit 1;

  id_propio   := '01-01-99_M-' || v_sede;
  id_otro     := '02-01-99_M-' || v_sede;
  id_borrable := '03-01-99_T-' || v_sede;
  id_asis1    := '05-01-99_M-' || v_sede;
  id_asis2    := '06-01-99_M-' || v_sede;

  -- ── Montaje ────────────────────────────────────────────────────────────────────────────────
  -- reportes_crear rechaza un reporte nuevo si la sede tiene alguno sin evaluar, y en producción
  -- los hay. Se limpia el pendiente DENTRO de esta transacción, que se descarta entera.
  update reportes set evaluado = true
   where sede_cod = v_sede and not evaluado and not coalesce(no_evaluable, false);

  -- Un reporte ajeno al colaborador (encargado y único trabajador: el administrador). Es el que
  -- va a poder evaluar por la RPC y NO va a poder tocar por PostgREST.
  --
  -- NACEN CON evaluado=true, y no es un detalle: el guard REPORTE_PENDIENTE de reportes_crear
  -- rechaza un reporte nuevo si la sede tiene CUALQUIERA sin evaluar — incluidos estos dos, que
  -- los pone la prueba. Sin esto, el camino feliz (G) falla por culpa del propio montaje y la
  -- prueba reporta un defecto que no existe.
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, act_total, act_done,
                        estado_envio, bloqueado, no_evaluable, evaluado)
    values (id_otro, v_sede, 'M', date '1999-01-02', adm, 1, 1, 'enviado', true, false, true);
  insert into reporte_trabajadores (reporte_id, empleado_id) values (id_otro, adm);
  insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada)
    values (id_otro, 'A1', 'Actividad de prueba', 'IND', 1, true);
  insert into reporte_extras (reporte_id, tipo, nombre, cantidad, monto_total)
    values (id_otro, 'libre', 'Extra de prueba', 1, 0);

  -- Uno de descarte, para que el administrador pueda probar el DELETE sin arruinar el resto.
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, estado_envio, evaluado)
    values (id_borrable, v_sede, 'T', date '1999-01-03', adm, 'enviado', true);

  if v_ajena is not null then
    id_ajeno := '04-01-99_M-' || v_ajena;
    insert into reportes (id, sede_cod, turno, fecha, encargado_id, act_total, act_done, estado_envio)
      values (id_ajeno, v_ajena, 'M', date '1999-01-04', adm, 1, 1, 'enviado');
    insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada)
      values (id_ajeno, 'A1', 'Actividad de prueba', 'IND', 1, true);
  end if;

  r := r || 'montaje=ok(sede=' || v_sede || ',ajena=' || coalesce(v_ajena, 'NINGUNA') || ') ';

  -- ═══ Camino legítimo: las RPC siguen funcionando para quien corresponde ═══════════════════
  execute 'set local role authenticated';

  -- G) Enviar el turno de la propia sede: es lo que hace una encargada cada día.
  begin
    perform reportes_crear(
      id_propio, v_sede, 'M', 1, 1, array[]::uuid[],
      jsonb_build_array(jsonb_build_object('cod', 'A1', 'nombre', 'Actividad de prueba',
                                           'cat', 'IND', 'peso', 1)),
      null, col);
    if exists (select 1 from reportes where id = id_propio) then r := r || 'G=ok ';
    else r := r || 'G-CREAR-NO-INSERTO=FALLA '; end if;
  exception when others then
    r := r || 'G-CREAR-EN-MI-SEDE=FALLA(' || sqlerrm || ') ';
  end;

  -- H) La misma llamada contra una sede ajena. Es el guard que reemplaza a la policy que la
  --    conversión a `definer` le quitó de encima: si esto pasa, el arreglo abrió un agujero.
  if v_ajena is not null then
    begin
      perform reportes_crear('07-01-99_M-' || v_ajena, v_ajena, 'M', 0, 0,
                             array[]::uuid[], null, null, col);
      r := r || 'H-CREAR-SEDE-AJENA=FALLA ';
    exception when others then
      if sqlerrm like 'PERMISO:%' then r := r || 'H=ok ';
      else r := r || 'H-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
    end;
  else
    r := r || 'H=INFO-sin-sede-ajena ';
  end if;

  -- I) Evaluar el turno propio: el evaluador tiene que ser externo, y sigue siéndolo.
  begin
    perform reportes_evaluar(id_propio,
      jsonb_build_array(jsonb_build_object('cod', 'A1', 'cal', 1)));
    r := r || 'I-EVALUAR-MI-PROPIO-TURNO=FALLA ';
  exception when others then
    if sqlerrm like '%estuviste en el turno%' then r := r || 'I=ok ';
    else r := r || 'I-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
  end;

  -- J) Evaluar un turno ajeno de la propia sede: el camino legítimo de la nota.
  begin
    v_pun := reportes_evaluar(id_otro,
      jsonb_build_array(jsonb_build_object('cod', 'A1', 'cal', 1)));
    if v_pun = 100 then r := r || 'J=ok ';
    else r := r || 'J-PUNTAJE-INESPERADO=FALLA(' || coalesce(v_pun::text, 'NULL') || ') '; end if;
  exception when others then
    r := r || 'J-EVALUAR-TURNO-AJENO=FALLA(' || sqlerrm || ') ';
  end;

  -- K) Evaluar un reporte de una sede que no es suya.
  if v_ajena is not null then
    begin
      perform reportes_evaluar(id_ajeno,
        jsonb_build_array(jsonb_build_object('cod', 'A1', 'cal', 1)));
      r := r || 'K-EVALUAR-SEDE-AJENA=FALLA ';
    exception when others then
      if sqlerrm like 'PERMISO:%' then r := r || 'K=ok ';
      else r := r || 'K-CODIGO-EQUIVOCADO(' || sqlerrm || ')=FALLA '; end if;
    end;
  else
    r := r || 'K=INFO-sin-sede-ajena ';
  end if;

  -- ═══ Ataques directos por PostgREST, con el rol y la sesión de un colaborador ═════════════
  -- Es el ataque que se reprodujo en vivo el 23-ago: 18 reportes a puntaje=100 y 6 borrados.

  -- A) El puntaje que decide el pago.
  update reportes set puntaje = 100, puntaje_eval = 100, evaluado = true where id = id_otro;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then r := r || 'A=ok ';
  else r := r || 'A-UPDATE-PASO=FALLA(' || v_cnt || ' filas) '; end if;

  -- B) Borrar el reporte entero.
  delete from reportes where id = id_otro;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then r := r || 'B=ok ';
  else r := r || 'B-DELETE-PASO=FALLA(' || v_cnt || ' filas) '; end if;

  -- C) Las calificaciones, que son de donde sale el puntaje.
  update reporte_actividades set calificacion = 1, obs_eval = 'tocado a mano' where reporte_id = id_otro;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then r := r || 'C=ok ';
  else r := r || 'C-UPDATE-ACTIVIDADES-PASO=FALLA(' || v_cnt || ' filas) '; end if;

  -- D) Las tres hijas, por borrado.
  delete from reporte_actividades where reporte_id = id_otro;
  get diagnostics v_cnt = row_count;
  delete from reporte_trabajadores where reporte_id = id_otro;
  get diagnostics v_pun = row_count;
  v_cnt := v_cnt + v_pun;
  delete from reporte_extras where reporte_id = id_otro;
  get diagnostics v_pun = row_count;
  v_cnt := v_cnt + v_pun;
  if v_cnt = 0 then r := r || 'D=ok ';
  else r := r || 'D-DELETE-HIJAS-PASO=FALLA(' || v_cnt || ' filas) '; end if;

  -- E) Fabricar un reporte a mano, sin pasar por la RPC (y por lo tanto sin sus guards).
  begin
    insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje, evaluado, estado_envio)
      values ('09-09-99_M-' || v_sede, v_sede, 'M', date '1999-09-09', col, 100, true, 'enviado');
    r := r || 'E-INSERT-DIRECTO=FALLA ';
  exception when others then
    -- 42501 cubre las dos formas de negarlo: "permission denied for table" (el privilegio
    -- revocado) y "new row violates row-level security policy" (la policy que ya no existe).
    -- Cualquier otro código sería un fallo distinto colándose como si fuera el guard.
    if sqlstate = '42501' then r := r || 'E=ok ';
    else r := r || 'E-CODIGO-EQUIVOCADO(' || sqlstate || ':' || sqlerrm || ')=FALLA '; end if;
  end;

  -- F) Y sin embargo sigue viendo los reportes de su sede: cerrar la escritura no puede romper la
  --    lectura, o la pantalla de turnos queda vacía.
  select count(*) into v_cnt from reportes where id in (id_propio, id_otro);
  if v_cnt = 2 then r := r || 'F=ok ';
  else r := r || 'F-LECTURA-ROTA=FALLA(vio ' || v_cnt || ' de 2) '; end if;

  execute 'reset role';

  -- ═══ El administrador conserva su puerta (reportes_anular / reportes_anular_eval) ═════════
  perform set_config('request.jwt.claims',
    json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update reportes set puntaje = 0, evaluado = false where id = id_otro;
  get diagnostics v_cnt = row_count;
  if v_cnt = 1 then r := r || 'L-update=ok ';
  else r := r || 'L-ADMIN-SIN-UPDATE=FALLA(' || v_cnt || ' filas) '; end if;

  delete from reportes where id = id_borrable;
  get diagnostics v_cnt = row_count;
  if v_cnt = 1 then r := r || 'L-delete=ok ';
  else r := r || 'L-ADMIN-SIN-DELETE=FALLA(' || v_cnt || ' filas) '; end if;

  execute 'reset role';

  -- ═══ Privilegios de tabla: lo que la RLS no puede frenar ══════════════════════════════════
  -- TRUNCATE no pasa por las policies. Se comprueba el privilegio en vez de ejecutarlo: correr un
  -- truncate de verdad contra la tabla de producción, aunque sea dentro de una transacción que se
  -- descarta, no vale el riesgo.
  if has_table_privilege('authenticated', 'reportes', 'TRUNCATE')
     or has_table_privilege('authenticated', 'reporte_actividades', 'TRUNCATE')
     or has_table_privilege('anon', 'reportes', 'TRUNCATE') then
    r := r || 'P-TRUNCATE-SIGUE-CONCEDIDO=FALLA ';
  else r := r || 'P-truncate=ok '; end if;

  if has_table_privilege('authenticated', 'reportes', 'INSERT')
     or has_table_privilege('anon', 'reportes', 'UPDATE')
     or has_table_privilege('anon', 'reportes', 'DELETE') then
    r := r || 'P-PRIVILEGIOS-SIGUEN-CONCEDIDOS=FALLA ';
  else r := r || 'P-privilegios=ok '; end if;

  if has_table_privilege('authenticated', 'reportes', 'SELECT') then r := r || 'P-select=ok ';
  else r := r || 'P-SELECT-REVOCADO-DE-MAS=FALLA '; end if;

  -- ═══ F51 — el auto-cierre no monta un C sobre un turno que envió una persona ══════════════
  -- Se baja la hora de cierre del turno C dentro de esta transacción para que la función tenga
  -- que decidir de verdad; si no, a cualquier hora anterior a las 23:00 se iría por el `continue`
  -- del horario y la prueba pasaría sin haber comprobado nada.
  update config set valor = '00:00' where clave = 'turno_c_cierre';

  select cod into v_sede_m     from sedes order by cod limit 1;
  select cod into v_sede_libre from sedes where cod <> v_sede_m order by cod limit 1;

  delete from reporte_extras       where reporte_id in (select id from reportes where fecha = v_hoy);
  delete from reporte_actividades  where reporte_id in (select id from reportes where fecha = v_hoy);
  delete from reporte_trabajadores where reporte_id in (select id from reportes where fecha = v_hoy);
  delete from reportes where fecha = v_hoy;

  id_hoy_m     := to_char(v_hoy, 'DD-MM-YY') || '_M-' || v_sede_m;
  id_c_pisado  := to_char(v_hoy, 'DD-MM-YY') || '_C-' || v_sede_m;
  id_c_control := to_char(v_hoy, 'DD-MM-YY') || '_C-' || v_sede_libre;

  insert into reportes (id, sede_cod, turno, fecha, encargado_id, act_total, act_done,
                        estado_envio, no_evaluable)
    values (id_hoy_m, v_sede_m, 'M', v_hoy, adm, 1, 1, 'enviado', false);

  perform reportes_auto_cierre(array['C']);

  if exists (select 1 from reportes where id = id_c_pisado) then
    r := r || 'M-C-MONTADO-SOBRE-M=FALLA ';
  else r := r || 'M=ok '; end if;

  -- Control de que la prueba no pasó por vacía: en la sede que NO tenía reporte, el C sí se crea.
  if exists (select 1 from reportes where id = id_c_control) then r := r || 'M-control=ok ';
  else r := r || 'M-CONTROL-VACIO=FALLA(el auto-cierre no corrio: M no comprobo nada) '; end if;

  -- ═══ F55 — la asistencia derivada deja UNA fila por día, con turno 'C' ════════════════════
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, estado_envio)
    values (id_asis1, v_sede, 'M', date '1999-01-05', col, 'enviado');
  insert into reporte_trabajadores (reporte_id, empleado_id) values (id_asis1, col);
  perform reportes_marcar_asistencia(id_asis1);

  select count(*), min(turno) into v_cnt, v_turno
    from asistencias where empleado_id = col and fecha = date '1999-01-05';
  if v_cnt = 1 and v_turno = 'C' then r := r || 'N=ok ';
  else r := r || 'N-ASISTENCIA-MAL=FALLA(' || v_cnt || ' filas, turno ' || coalesce(v_turno, 'NULL') || ') '; end if;

  -- O) El día que el huellero ya cubrió con su fila por tramo (turno 'M'): no se agrega ninguna.
  --    Sin este guard, escribir siempre 'C' habría duplicado los 1.105 días que el huellero cubre.
  insert into asistencias (empleado_id, fecha, turno, fuente)
    values (col, date '1999-01-06', 'M', 'huellero');
  insert into reportes (id, sede_cod, turno, fecha, encargado_id, estado_envio)
    values (id_asis2, v_sede, 'M', date '1999-01-06', col, 'enviado');
  insert into reporte_trabajadores (reporte_id, empleado_id) values (id_asis2, col);
  perform reportes_marcar_asistencia(id_asis2);

  select count(*) into v_cnt
    from asistencias where empleado_id = col and fecha = date '1999-01-06';
  if v_cnt = 1 then r := r || 'O=ok ';
  else r := r || 'O-DIA-DUPLICADO=FALLA(' || v_cnt || ' filas) '; end if;

  -- ═══ F56 — el auto-cierre sigue desagendado ══════════════════════════════════════════════
  select count(*) into v_cnt from cron.job where jobname like 'reportes-auto-cierre%';
  if v_cnt = 0 then r := r || 'Q-cron=ok ';
  else r := r || 'Q-CRON-AGENDADO=FALLA(' || v_cnt || ' jobs) '; end if;

  raise exception 'RESULTADO 0081 >>> %', r;
end $$;
