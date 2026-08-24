-- Prueba de la migración 0088_auditoria_config_y_tablas.sql
--
-- Comprueba las siete promesas de la spec
-- (docs/superpowers/specs/auditoria/2026-08-23-auditoria-alcance-y-config-design.md §4):
--   P1. cambiar un parámetro de `config` deja una fila en `audit_log`,
--   P2. esa fila dice QUÉ parámetro cambió (fila_id = la clave, no la cadena vacía),
--   P3. esa fila dice QUIÉN lo cambió,
--   P4. guardar sin cambiar nada NO escribe ruido,
--   P5. el alta y la baja de un parámetro también quedan registradas,
--   P6. las trece tablas ya auditadas no cambian de comportamiento,
--   P7. `audit_log` sigue cerrada a la escritura directa.
--
-- La P4 es la que hace que el registro sirva para buscar: /configuracion manda los 45 parámetros
-- en cada «Guardar», así que sin la cláusula `when (old.* is distinct from new.*)` cada clic
-- dejaría 45 filas, 44 de ellas sin ningún cambio, y encontrar quién movió un peso de la
-- evaluación sería tan imposible como antes de auditar.
--
-- La P7 es la que hace que el registro sea prueba y no un cuaderno que cualquiera puede reescribir.
--
-- SE DESCARTA SOLA: escribe un parámetro de prueba y termina lanzando una excepción con el
-- resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la salida
-- esperada.
--
-- OJO 1: sin `set_config('request.jwt.claims', …)` la columna `actor` queda en null y la P3 pasaría
-- sin comprobar nada — `auth.uid()` lee ese claim y nada más.
-- OJO 2: sin `set_config('role','authenticated')` las políticas no se evalúan (el editor de
-- Supabase corre como superusuario) y la P7 pasaría siempre. Por eso ese cambio de rol va al final:
-- todo el montaje de arriba necesita escribir en `config`, que `authenticated` no puede.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0088

do $$
declare
  admin_id uuid;
  asis_id  uuid;
  base     bigint;
  n        int;
  v_fila   text;
  v_actor  uuid;
  r        text := '';
begin
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  if admin_id is null then
    raise exception 'La prueba necesita un administrador activo';
  end if;

  -- ── P0) El trigger existe, y existe partido en dos ────────────────────────────────────────
  select count(*) into n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'config'
     and t.tgname in ('trg_audit_config_alta_baja', 'trg_audit_config_edicion');
  if n = 2 then
    r := r || ' [ok] config tiene sus dos triggers de auditoria;';
  else
    r := r || format(' [FALLA] config tiene %s de los 2 triggers de auditoria;', n);
  end if;

  -- El actor sale de auth.uid(); sin este claim el registro no diría quién.
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  select coalesce(max(id), 0) into base from audit_log;

  -- ── P5a) El alta de un parámetro queda registrada ─────────────────────────────────────────
  insert into config (clave, valor) values ('prueba_0088_no_deberia_quedar', 'uno');
  select count(*) into n from audit_log
   where id > base and tabla = 'config' and operacion = 'INSERT';
  if n = 1 then
    r := r || ' [ok] el alta de un parametro queda;';
  else
    r := r || format(' [FALLA] el alta dejo %s filas en vez de 1;', n);
  end if;

  -- ── P1/P2/P3) La edición queda, dice qué y dice quién ─────────────────────────────────────
  update config set valor = 'dos' where clave = 'prueba_0088_no_deberia_quedar';

  select count(*) into n from audit_log
   where id > base and tabla = 'config' and operacion = 'UPDATE';
  if n = 1 then
    r := r || ' [ok] la edicion de un parametro queda;';
  else
    r := r || format(' [FALLA] la edicion dejo %s filas en vez de 1;', n);
  end if;

  select fila_id, actor into v_fila, v_actor from audit_log
   where id > base and tabla = 'config' and operacion = 'UPDATE'
   order by id desc limit 1;

  if v_fila = 'prueba_0088_no_deberia_quedar' then
    r := r || ' [ok] el registro dice QUE parametro cambio;';
  else
    r := r || format(' [FALLA] fila_id quedo en %L: el registro no dice que parametro cambio;', v_fila);
  end if;

  if v_actor = admin_id then
    r := r || ' [ok] el registro dice QUIEN lo cambio;';
  else
    r := r || format(' [FALLA] actor quedo en %L en vez del administrador;', v_actor);
  end if;

  -- ── P4) Guardar sin cambiar nada no escribe ruido ─────────────────────────────────────────
  -- Es literalmente lo que hace /configuracion con los otros 44 parámetros en cada clic.
  update config set valor = valor where clave = 'prueba_0088_no_deberia_quedar';
  select count(*) into n from audit_log
   where id > base and tabla = 'config' and operacion = 'UPDATE';
  if n = 1 then
    r := r || ' [ok] guardar sin cambiar nada no escribe ruido;';
  else
    r := r || format(' [FALLA] un guardado sin cambios dejo %s filas de UPDATE en total;', n);
  end if;

  -- ── P5b) La baja de un parámetro queda registrada ─────────────────────────────────────────
  delete from config where clave = 'prueba_0088_no_deberia_quedar';
  select count(*) into n from audit_log
   where id > base and tabla = 'config' and operacion = 'DELETE';
  if n = 1 then
    r := r || ' [ok] la baja de un parametro queda;';
  else
    r := r || format(' [FALLA] la baja dejo %s filas en vez de 1;', n);
  end if;

  -- ── P6) Lo que ya funcionaba sigue igual ──────────────────────────────────────────────────
  -- La tabla que más escribe en audit_log (4.809 filas) tiene columna `id`: la clave `clave` que
  -- agrega la 0088 va después en el coalesce y no debe robarle el identificador a nadie.
  select id into asis_id from asistencias order by id limit 1;
  if asis_id is null then
    r := r || ' [aviso] sin asistencias para comprobar el resto de las tablas auditadas;';
  else
    select coalesce(max(id), 0) into base from audit_log;
    update asistencias set condicion = condicion where id = asis_id;
    select fila_id into v_fila from audit_log
     where id > base and tabla = 'asistencias' order by id desc limit 1;
    if v_fila = asis_id::text then
      r := r || ' [ok] las tablas con columna id siguen identificando por id;';
    else
      r := r || format(' [FALLA] asistencias quedo con fila_id %L en vez de su id;', v_fila);
    end if;
  end if;

  -- ── P7) audit_log sigue cerrada a la escritura directa ────────────────────────────────────
  -- A PARTIR DE ACÁ SE DEJA DE SER SUPERUSUARIO: sin esto las políticas no se evalúan y la
  -- comprobación pasaría siempre. Todo el montaje de arriba tiene que quedar antes.
  perform set_config('role', 'authenticated', true);
  begin
    insert into audit_log (tabla, operacion, fila_id) values ('prueba_0088', 'INSERT', 'x');
    r := r || ' [FALLA] authenticated pudo escribir a mano en audit_log;';
  exception when others then
    r := r || ' [ok] audit_log sigue cerrada a la escritura directa;';
  end;

  raise exception 'RESULTADO 0088 -->%', r;
end $$;
