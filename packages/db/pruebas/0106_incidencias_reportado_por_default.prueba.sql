-- Prueba de la migración 0106_incidencias_reportado_por_default.sql
--
-- Comprueba los tres casos del addendum
-- (docs/superpowers/specs/almacen/2026-08-25-incidencias-alcance-y-formulario-design.md
-- §6, "Cómo se comprueba"):
--   7. insert sin reportado_por_id, impersonando a un colaborador con auth.uid() real —
--      la columna queda con ESE auth.uid(), no null.
--   8. el mismo insert, pero mandando reportado_por_id explícito a otra persona distinta —
--      se respeta el valor explícito, el default no lo pisa.
--   9. el mismo insert corrido sin impersonar a nadie (dueño de la conexión, sin
--      set_config('request.jwt.claims', ...), así que auth.uid() es null) — la columna queda
--      en null, no se inventa un autor.
--
-- MONTAJE. Dos empleados de prueba SINTÉTICOS (ningún empleado real, mismo criterio que 0092 y
-- 0094): operativo_a es quien "reporta" en los casos 7 y 8; operativo_b es la persona distinta a
-- la que el caso 8 le atribuye la incidencia a propósito. Ambos con rol 'encargado_tienda' y la
-- MISMA sede asignada por empleado_tiendas, para que inc_insert (0046, sin cambios en esta
-- migración: admin, almacén, o `sede_cod in (select private.app_sedes())`) deje pasar el insert
-- de operativo_a sin depender de privilegios de admin/almacén.
--
-- El caso 9 corre PRIMERO, antes de tocar `role`/`request.jwt.claims`: es exactamente el estado
-- "dueño de la conexión" que describe la spec (psql o el editor SQL de Supabase, sin impersonar a
-- nadie), y es la única forma de que `auth.uid()` sea null de verdad — una vez que este mismo
-- bloque hace `set_config('request.jwt.claims', ...)` para los casos 7/8 no hay forma de "des-
-- impersonar" dentro de la misma transacción.
--
-- OJO — el montaje (los dos empleados + empleado_tiendas) va ANTES de tocar `role`, porque
-- `authenticated` no podría insertarlos con las políticas de esa tabla.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0106
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0106")

do $$
declare
  operativo_a uuid;  -- impersonado en los casos 7 y 8 (quien reporta)
  operativo_b uuid;  -- persona distinta, destino explícito del caso 8
  v_sede      text;  -- sede compartida por ambos, para que inc_insert los deje pasar
  inc_id      uuid;
  v_reportado uuid;
  r           text := '';
begin
  -- ── Montaje (todavía como dueño de las tablas) ────────────────────────────────────────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then
    raise exception 'La prueba necesita al menos una sede';
  end if;

  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0106-A', 'Prueba 0106 Operativo A', 'PA', 'encargado_tienda')
    returning id into operativo_a;
  insert into empleados (cod, nombre, iniciales, rol)
    values ('PRUEBA0106-B', 'Prueba 0106 Operativo B', 'PB', 'encargado_tienda')
    returning id into operativo_b;
  insert into empleado_tiendas (empleado_id, sede_cod) values (operativo_a, v_sede);
  insert into empleado_tiendas (empleado_id, sede_cod) values (operativo_b, v_sede);

  r := r || 'montaje=ok; ';

  -- ── 9) Sin impersonar a nadie: dueño de la conexión, auth.uid() es null ─────────────────────
  insert into incidencias (sede_cod, fecha, tipo, nivel, origen, puntos_penalidad)
    values (v_sede, '2099-02-19', 'Prueba 0106', 'Bajo', 'reporte', 1)
    returning id, reportado_por_id into inc_id, v_reportado;
  if v_reportado is null then
    r := r || '[ok] caso 9: sin impersonar a nadie, reportado_por_id queda en null (no se inventa autor);';
  else
    r := r || format('[FALLA] caso 9: reportado_por_id quedo en %s en vez de null;', v_reportado);
  end if;

  -- ── A PARTIR DE ACÁ SE DEJA DE SER DUEÑO DE LAS TABLAS: se impersona a operativo_a ──────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', operativo_a, 'role', 'authenticated')::text, true);

  if auth.uid() is distinct from operativo_a then
    raise exception 'La impersonacion de operativo_a no tomo: auth.uid() = %, esperaba %', auth.uid(), operativo_a;
  end if;

  -- ── 7) Insert sin reportado_por_id, impersonando a operativo_a (auth.uid() real) ────────────
  insert into incidencias (sede_cod, fecha, tipo, nivel, origen, puntos_penalidad)
    values (v_sede, '2099-02-20', 'Prueba 0106', 'Bajo', 'reporte', 1)
    returning id, reportado_por_id into inc_id, v_reportado;
  if v_reportado = operativo_a then
    r := r || '[ok] caso 7: sin mandar la columna, el default la llena con el auth.uid() de quien reporta;';
  else
    r := r || format('[FALLA] caso 7: reportado_por_id quedo en %s, esperaba el auth.uid() %s;', v_reportado, operativo_a);
  end if;

  -- ── 8) Mismo insert, pero mandando reportado_por_id explícito a OTRA persona distinta ───────
  --
  -- OJO: sin `returning` acá. Con `returning`, Postgres revalida la fila insertada contra la
  -- policy de SELECT (inc_select: admin OR responsable_id=auth.uid() OR reportado_por_id=auth.uid())
  -- antes de poder devolverla — y operativo_a (quien inserta) no es ninguna de las dos cuando el
  -- reportado_por_id que él mismo puso es OTRA persona (operativo_b), así que el `returning`
  -- fallaría con el mismo texto de error que una violación de `with check`, aunque el `insert` en
  -- sí sea perfectamente válido para `inc_insert`. Es exactamente lo que hace la app real: el
  -- insert de `crearIncidenciasDeReporte()` NO pide `.select()` de vuelta. Se relee después como
  -- administrador, que sí puede verla.
  insert into incidencias (id, sede_cod, fecha, tipo, nivel, origen, puntos_penalidad, reportado_por_id)
    values (gen_random_uuid(), v_sede, '2099-02-21', 'Prueba 0106', 'Bajo', 'reporte', 1, operativo_b);

  execute 'reset role';
  select reportado_por_id into v_reportado
    from incidencias where sede_cod = v_sede and fecha = '2099-02-21' and tipo = 'Prueba 0106';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', operativo_a, 'role', 'authenticated')::text, true);

  if v_reportado = operativo_b then
    r := r || '[ok] caso 8: un reportado_por_id explicito distinto se respeta, el default no lo pisa;';
  else
    r := r || format('[FALLA] caso 8: reportado_por_id quedo en %s, esperaba el valor explicito %s;', v_reportado, operativo_b);
  end if;

  raise exception 'RESULTADO 0106 --> %', r;
end $$;
