-- Prueba de la migración 0092_incidencias_rls_por_sede.sql
--
-- Comprueba las promesas de C-3
-- (docs/superpowers/specs/almacen/2026-08-24-incidencias-reportante-solo-admin-design.md
-- §5 Addendum, C-3, y su "Cómo se comprueba"):
--   1. una persona NO admin, con la sede de la incidencia entre sus sedes (empleado_tiendas),
--      la lee — antes de esta migración no podía (inc_select era admin-only).
--   2. la misma política sigue negando fuera de sede: esa misma persona NO lee una incidencia de
--      una sede que no tiene asignada.
--   3. el administrador sigue leyendo todo, como antes.
--   4. inc_update e inc_delete siguen intactas: el administrador sigue pudiendo escribir, la
--      persona no-admin sigue sin poder — esta migración no las toca.
--
-- MONTAJE. Un empleado de prueba SINTÉTICO (ningún empleado real), con rol 'encargado_tienda'
-- —explícitamente NO admin/dueño y NO almacén (ni 'encargado_almacen' ni 'confeccionista')— y UNA
-- sola sede asignada por empleado_tiendas. Es a propósito que no se reutiliza un empleado real: la
-- spec deja constancia de que hoy las once personas activas tienen las CUATRO sedes en
-- empleado_tiendas (addendum, "Efecto práctico hoy"), así que un empleado real no serviría para
-- probar el caso negativo (sede sin asignar) — siempre vería todo, y el caso 2 pasaría sin
-- comprobar nada. Dos incidencias de prueba con fecha de 2099, una en cada sede.
--
-- OJO — sin `set_config('role','authenticated', true)` las políticas de RLS NO SE EVALÚAN (el
-- editor SQL de Supabase, y psql sin sesión, corren como dueño de las tablas) y la prueba pasaría
-- en verde sin comprobar nada de verdad. El montaje (empleado + las dos incidencias) va ANTES del
-- cambio de rol, porque `authenticated` no podría insertarlos con la política de este mismo módulo.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0092
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0092")

do $$
declare
  admin_id   uuid;
  operativo  uuid;
  v_sede_a   text;  -- la sede asignada al operativo de prueba
  v_sede_b   text;  -- una sede distinta, NO asignada a nadie de prueba
  inc_propia uuid;  -- incidencia en v_sede_a
  inc_ajena  uuid;  -- incidencia en v_sede_b
  n          int;
  v_nivel    text;
  r          text := '';
begin
  -- ── Montaje (todavía como dueño de las tablas) ────────────────────────────────────────────
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  if admin_id is null then
    raise exception 'La prueba necesita al menos un administrador activo';
  end if;

  select cod into v_sede_a from sedes order by cod limit 1;
  select cod into v_sede_b from sedes where cod <> v_sede_a order by cod limit 1;
  if v_sede_a is null or v_sede_b is null then
    raise exception 'La prueba necesita al menos dos sedes';
  end if;

  -- Empleado sintético: NO admin, NI almacén. Así el caso positivo prueba de verdad la rama
  -- "sede_cod in (select private.app_sedes())" de la política, no la rama "app_es_almacen()"
  -- (que dejaría pasar cualquier sede sin decir nada del filtro por sede en sí).
  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0092-OPE', 'Prueba 0092 Operativo', 'P1', 'encargado_tienda')
    returning id into operativo;
  insert into empleado_tiendas (empleado_id, sede_cod) values (operativo, v_sede_a);

  insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                            reportado_por_id, puntos_penalidad, reporte_id, origen)
    values (v_sede_a, '2099-01-15', 'Prueba 0092', 'Incidencia de prueba en la sede propia',
            'Medio', operativo, admin_id, 2, null, 'manual')
    returning id into inc_propia;

  insert into incidencias (sede_cod, fecha, tipo, descripcion, nivel, responsable_id,
                            reportado_por_id, puntos_penalidad, reporte_id, origen)
    values (v_sede_b, '2099-01-16', 'Prueba 0092', 'Incidencia de prueba en sede ajena',
            'Medio', admin_id, admin_id, 2, null, 'manual')
    returning id into inc_ajena;

  r := r || 'montaje=ok; ';

  -- ── A PARTIR DE ACÁ SE DEJA DE SER DUEÑO DE LAS TABLAS ────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', operativo, 'role', 'authenticated')::text, true);

  if private.app_es_admin() or private.app_es_almacen() then
    raise exception 'El empleado de prueba SI tiene autoridad de admin o almacen; no comprobaria la sede';
  end if;

  -- ── 1) No-admin con la sede entre las suyas: hoy no puede, con esta migración sí ────────────
  select count(*) into n from incidencias where id = inc_propia;
  if n = 1 then
    r := r || '[ok] no-admin con la sede asignada lee la incidencia de su sede (antes veia 0);';
  else
    r := r || format('[FALLA] no-admin con la sede asignada ve %s fila(s) (esperaba 1);', n);
  end if;

  -- ── 2) La misma persona sigue sin ver una incidencia de una sede que no tiene asignada ──────
  select count(*) into n from incidencias where id = inc_ajena;
  if n = 0 then
    r := r || '[ok] la misma persona no lee la incidencia de la sede ajena;';
  else
    r := r || format('[FALLA] la persona ve %s fila(s) de una sede que no tiene asignada;', n);
  end if;

  -- ── 4a) inc_update sigue intacta: el no-admin no puede escribir, ni su propia incidencia ────
  update incidencias set nivel = 'Alto' where id = inc_propia;
  get diagnostics n = row_count;
  select nivel into v_nivel from incidencias where id = inc_propia;
  if n = 0 and v_nivel = 'Medio' then
    r := r || '[ok] inc_update sigue admin-only: el no-admin no pudo escribir su propia incidencia;';
  else
    r := r || format('[FALLA] inc_update dejo escribir a un no-admin (%s fila(s), nivel=%s);', n, v_nivel);
  end if;

  -- ── 4b) inc_delete sigue intacta: el no-admin no puede borrar ────────────────────────────────
  delete from incidencias where id = inc_propia;
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from incidencias where id = inc_propia) then
    r := r || '[ok] inc_delete sigue admin-only: el no-admin no pudo borrar;';
  else
    r := r || format('[FALLA] inc_delete dejo borrar a un no-admin (%s fila(s));', n);
  end if;

  -- ── 3) El administrador sigue leyendo todo, de cualquier sede, como antes ───────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  select count(*) into n from incidencias where id in (inc_propia, inc_ajena);
  if n = 2 then
    r := r || '[ok] el administrador sigue leyendo las dos incidencias, de cualquier sede;';
  else
    r := r || format('[FALLA] el administrador ve %s de las 2 incidencias de prueba;', n);
  end if;

  -- ── 4c) inc_update/inc_delete: el administrador SI puede escribir (no se rompio nada) ───────
  update incidencias set nivel = 'Alto' where id = inc_propia;
  get diagnostics n = row_count;
  if n = 1 then
    r := r || '[ok] inc_update sigue funcionando para el administrador;';
  else
    r := r || format('[FALLA] el administrador no pudo actualizar la incidencia (%s fila(s));', n);
  end if;

  delete from incidencias where id in (inc_propia, inc_ajena);
  get diagnostics n = row_count;
  if n = 2 then
    r := r || '[ok] inc_delete sigue funcionando para el administrador;';
  else
    r := r || format('[FALLA] el administrador no pudo borrar las incidencias de prueba (%s fila(s));', n);
  end if;

  raise exception 'RESULTADO 0092 --> %', r;
end $$;
