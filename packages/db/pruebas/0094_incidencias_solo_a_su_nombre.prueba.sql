-- Prueba de la migración 0094_incidencias_solo_a_su_nombre.sql
--
-- Comprueba las seis promesas de C-1
-- (docs/superpowers/specs/almacen/2026-08-25-incidencias-alcance-y-formulario-design.md §5):
--   1. un no-admin lee una incidencia donde ÉL es responsable_id — la ve.
--   2. el mismo lee una donde él es reportado_por_id, pero no responsable — la ve.
--   3. el mismo lee una de SU MISMA SEDE, donde no es ni responsable ni reportante — NO la ve.
--      Es el cambio central: antes de esta migración, la sede sola alcanzaba (0092).
--   4. el administrador lee las tres, de cualquier sede — sin cambios.
--   5. inc_insert sigue dejando registrar a un operativo de su sede — sin cambios, esta migración
--      no la toca.
--   6. inc_update / inc_delete siguen admin-only, incluso sobre SU PROPIA incidencia — sin
--      cambios, esta migración no las toca.
--
-- MONTAJE. Un empleado de prueba SINTÉTICO (ningún empleado real), rol 'encargado_tienda'
-- —explícitamente NO admin/dueño y NO almacén (ni 'encargado_almacen' ni 'confeccionista')— con
-- UNA sola sede asignada por empleado_tiendas. Es a propósito que no se reutiliza un empleado
-- real: las once personas activas tienen las CUATRO sedes en empleado_tiendas (spec §2, "Lo que
-- pasa hoy, verificado"), así que un empleado real vería las tres incidencias de prueba sin que la
-- política nueva tuviera nada que ver, y el caso 3 no comprobaría nada.
--
-- Las tres incidencias de prueba comparten LA MISMA SEDE que el operativo, a propósito: si
-- estuvieran en otra sede, el caso 3 probaría sólo lo que la política YA probaba antes de esta
-- migración (que una sede ajena no se ve) y no lo nuevo (que la sede PROPIA ya no alcanza sin ser
-- responsable o reportante).
--
-- El montaje (empleado + las tres incidencias) va ANTES del cambio de rol, como dueño de las
-- tablas: así no depende de las políticas que se están probando, y un problema en `inc_insert` no
-- puede esconder ni disfrazar un fallo real en `inc_select`.
--
-- OJO — sin `set_config('role','authenticated', true)` las políticas de RLS NO SE EVALÚAN (el
-- editor SQL de Supabase, y psql sin sesión, corren como dueño de las tablas) y la prueba pasaría
-- en verde sin comprobar nada de verdad.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0094
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0094")

do $$
declare
  admin_id        uuid;
  operativo       uuid;
  v_sede_a        text;  -- la única sede asignada al operativo de prueba
  inc_responsable uuid;  -- operativo = responsable_id, admin = reportado_por_id
  inc_reportante  uuid;  -- admin = responsable_id, operativo = reportado_por_id
  inc_ajena       uuid;  -- misma sede que el operativo; ni responsable ni reportante es él
  inc_insertada   uuid;  -- la que el operativo intenta registrar en el caso 5
  n               int;
  v_nivel         text;
  r               text := '';
begin
  -- ── Montaje (todavía como dueño de las tablas) ────────────────────────────────────────────
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  if admin_id is null then
    raise exception 'La prueba necesita al menos un administrador activo';
  end if;

  select cod into v_sede_a from sedes order by cod limit 1;
  if v_sede_a is null then
    raise exception 'La prueba necesita al menos una sede';
  end if;

  -- Empleado sintético: NO admin, NI almacén. Con esta migración `app_es_almacen()` ya no
  -- interviene en inc_select, pero sigue interviniendo en inc_insert (caso 5) — se descarta acá
  -- para que ese caso pruebe de verdad la rama de sede, no la de almacén.
  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0094-OPE', 'Prueba 0094 Operativo', 'P4', 'encargado_tienda')
    returning id into operativo;
  insert into empleado_tiendas (empleado_id, sede_cod) values (operativo, v_sede_a);

  insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                            reportado_por_id, puntos_penalidad, reporte_id, origen)
    values (v_sede_a, '2099-01-15', 'Prueba 0094', 'El operativo es el responsable',
            'Medio', operativo, admin_id, 2, null, 'manual')
    returning id into inc_responsable;

  insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                            reportado_por_id, puntos_penalidad, reporte_id, origen)
    values (v_sede_a, '2099-01-16', 'Prueba 0094', 'El operativo es quien la reportó',
            'Medio', admin_id, operativo, 2, null, 'manual')
    returning id into inc_reportante;

  insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                            reportado_por_id, puntos_penalidad, reporte_id, origen)
    values (v_sede_a, '2099-01-17', 'Prueba 0094', 'Misma sede, el operativo no participa',
            'Medio', admin_id, admin_id, 2, null, 'manual')
    returning id into inc_ajena;

  r := r || 'montaje=ok; ';

  -- ── A PARTIR DE ACÁ SE DEJA DE SER DUEÑO DE LAS TABLAS ────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', operativo, 'role', 'authenticated')::text, true);

  if private.app_es_admin() or private.app_es_almacen() then
    raise exception 'El empleado de prueba SI tiene autoridad de admin o almacen; no comprobaria nada';
  end if;

  -- ── 1) El no-admin lee la incidencia donde ÉL es responsable_id ─────────────────────────────
  select count(*) into n from incidencias where id = inc_responsable;
  if n = 1 then
    r := r || '[ok] el no-admin lee la incidencia donde es responsable;';
  else
    r := r || format('[FALLA] el no-admin ve %s fila(s) donde es responsable (esperaba 1);', n);
  end if;

  -- ── 2) El mismo lee la incidencia donde es reportado_por_id, sin ser responsable ────────────
  select count(*) into n from incidencias where id = inc_reportante;
  if n = 1 then
    r := r || '[ok] el no-admin lee la incidencia donde es reportante (sin ser responsable);';
  else
    r := r || format('[FALLA] el no-admin ve %s fila(s) donde es reportante (esperaba 1);', n);
  end if;

  -- ── 3) El cambio central: SU MISMA SEDE ya no alcanza si no es responsable ni reportante ────
  select count(*) into n from incidencias where id = inc_ajena;
  if n = 0 then
    r := r || '[ok] el no-admin NO ve la incidencia de su sede donde no participa (la sede ya no alcanza);';
  else
    r := r || format('[FALLA] el no-admin ve %s fila(s) de su sede sin ser responsable ni reportante (esperaba 0);', n);
  end if;

  -- ── 5) inc_insert sigue dejando registrar a un operativo de su sede (sin cambios) ───────────
  begin
    insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                              reportado_por_id, puntos_penalidad, reporte_id, origen)
      values (v_sede_a, '2099-01-18', 'Prueba 0094', 'Registrada por el propio operativo de su sede',
              'Bajo', admin_id, operativo, 1, null, 'manual')
      returning id into inc_insertada;
    r := r || '[ok] inc_insert sigue dejando registrar a un operativo de su sede;';
  exception when insufficient_privilege then
    r := r || '[FALLA] inc_insert ya no deja registrar a un operativo de su sede (esta migracion no debia tocarla);';
  end;

  -- ── 6a) inc_update sigue admin-only: ni siquiera sobre SU PROPIA incidencia como responsable ─
  update incidencias set nivel = 'Alto' where id = inc_responsable;
  get diagnostics n = row_count;
  select nivel into v_nivel from incidencias where id = inc_responsable;
  if n = 0 and v_nivel = 'Medio' then
    r := r || '[ok] inc_update sigue admin-only: el operativo no pudo editar su propia incidencia;';
  else
    r := r || format('[FALLA] inc_update dejo escribir al operativo (%s fila(s), nivel=%s);', n, v_nivel);
  end if;

  -- ── 6b) inc_delete sigue admin-only: ni siquiera sobre la que él mismo reportó ───────────────
  delete from incidencias where id = inc_reportante;
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from incidencias where id = inc_reportante) then
    r := r || '[ok] inc_delete sigue admin-only: el operativo no pudo borrar la que el mismo reportó;';
  else
    r := r || format('[FALLA] inc_delete dejo borrar al operativo (%s fila(s));', n);
  end if;

  -- ── 4) El administrador lee las tres, de cualquier sede ──────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  select count(*) into n from incidencias where id in (inc_responsable, inc_reportante, inc_ajena);
  if n = 3 then
    r := r || '[ok] el administrador sigue leyendo las tres incidencias de prueba;';
  else
    r := r || format('[FALLA] el administrador ve %s de las 3 incidencias de prueba;', n);
  end if;

  -- ── 6c) inc_update / inc_delete: el administrador SI puede (nada se rompió) ─────────────────
  update incidencias set nivel = 'Alto' where id = inc_responsable;
  get diagnostics n = row_count;
  if n = 1 then
    r := r || '[ok] inc_update sigue funcionando para el administrador;';
  else
    r := r || format('[FALLA] el administrador no pudo actualizar la incidencia (%s fila(s));', n);
  end if;

  delete from incidencias where id in (inc_responsable, inc_reportante, inc_ajena);
  get diagnostics n = row_count;
  if n = 3 then
    r := r || '[ok] inc_delete sigue funcionando para el administrador;';
  else
    r := r || format('[FALLA] el administrador no pudo borrar las incidencias de prueba (%s fila(s), esperaba 3);', n);
  end if;

  raise exception 'RESULTADO 0094 --> %', r;
end $$;
