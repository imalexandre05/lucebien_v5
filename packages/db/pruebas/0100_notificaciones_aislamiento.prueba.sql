-- Prueba de la migración 0100_notificaciones_aislamiento.sql
--
-- Comprueba los casos 7 y 8 de la §7 de la spec
-- (docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md),
-- más un tercero que agrega el encargo (el que más fácil se rompe con este cambio):
--
--   7. Un colaborador (no-admin) intenta insertar un aviso global (sede null, rol null,
--      destinatario_id null) → SE NIEGA (cierra A-2).
--   8. Un aviso con destinatario_rol='admin' y sede nula → lo ve el administrador; un colaborador
--      NO (cierra A-1).
--   9 (propio). Una persona marca como leído un aviso dirigido a ELLA (destinatario_id = su
--      propio id) → sigue funcionando (A-2 no debía romper esto). Extra: OTRO colaborador no
--      puede marcarlo leído (la política sigue aislando, no sólo "no rompió nada").
--
-- MONTAJE. Los dos avisos de prueba (caso 8 y el "propio") se insertan ANTES de cambiar de rol,
-- como dueño de las tablas — mismo criterio que 0094_incidencias_solo_a_su_nombre.prueba.sql: así
-- el montaje no depende de las políticas que se están probando (si notif_rw estuviera rota, el
-- montaje no lo escondería).
--
-- OJO — sin `set_config('role','authenticated', true)` las políticas de RLS NO SE EVALÚAN (el
-- editor SQL de Supabase, y psql sin sesión, corren como dueño de las tablas) y la prueba pasaría
-- en verde sin comprobar nada de verdad.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado. Eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0100
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0100")

do $$
declare
  admin_id  uuid;
  col1      uuid;  -- colaborador no-admin, el "dueño" del aviso propio
  col2      uuid;  -- otro colaborador no-admin, distinto de col1
  sufijo    text := gen_random_uuid()::text;
  dedup8    text;
  deduppro  text;
  n         int;
  v_leida   boolean;
  r         text := '';
begin
  -- ── Montaje (todavía como dueño de las tablas) ────────────────────────────────────────────
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  if admin_id is null then
    raise exception 'La prueba necesita al menos un administrador activo';
  end if;

  select id into col1 from empleados where rol not in ('admin','dueno') and activo order by id limit 1;
  if col1 is null then
    raise exception 'La prueba necesita al menos un colaborador no-admin activo';
  end if;

  select id into col2 from empleados
    where rol not in ('admin','dueno') and activo and id <> col1
    order by id limit 1;
  if col2 is null then
    raise exception 'La prueba necesita un SEGUNDO colaborador no-admin activo, distinto del primero';
  end if;

  dedup8   := 'test_0100:caso8:'  || sufijo;
  deduppro := 'test_0100:propio:' || sufijo;

  -- Caso 8: aviso "para el administrador", sin sede y sin destinatario_id.
  insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede,
                               destinatario_id, ref_tipo, ref_id, dedup_key)
    values ('test_0100', 'Prueba 0100 caso 8', 'Sólo el administrador debería verla.', 'info',
            'admin', null, null, null, null, dedup8);

  -- Caso propio: aviso dirigido en persona a col1, sin sede ni rol.
  insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede,
                               destinatario_id, ref_tipo, ref_id, dedup_key)
    values ('test_0100', 'Prueba 0100 propio', 'Dirigida a col1.', 'info',
            null, null, col1, null, null, deduppro);

  r := r || 'montaje=ok; ';

  -- ── A PARTIR DE ACÁ SE DEJA DE SER DUEÑO DE LAS TABLAS ────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', col1, 'role', 'authenticated')::text, true);

  if private.app_es_admin() then
    raise exception 'col1 SI tiene autoridad de admin; no comprobaria nada';
  end if;

  -- ── Caso 7: col1 intenta insertar un aviso GLOBAL (sede null, rol null, sin destinatario_id) ──
  begin
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede,
                                 destinatario_id, ref_tipo, ref_id, dedup_key)
      values ('test_0100', 'Intento de aviso global', 'No debería poder crearse.', 'info',
              null, null, null, null, null, 'test_0100:caso7:' || sufijo);
    r := r || '[FALLA] caso7: col1 (no-admin) SI pudo insertar un aviso global; ';
  exception when insufficient_privilege then
    r := r || '[ok] caso7: col1 (no-admin) NO pudo insertar un aviso global (RLS lo niega); ';
  end;

  -- ── Caso 8: col1 NO ve el aviso destinatario_rol='admin' con sede nula ────────────────────────
  select count(*) into n from notificaciones where dedup_key = dedup8;
  if n = 0 then
    r := r || '[ok] caso8a: col1 (no-admin) NO ve el aviso dirigido por rol al administrador; ';
  else
    r := r || format('[FALLA] caso8a: col1 ve %s fila(s) del aviso admin-only (esperaba 0); ', n);
  end if;

  -- ── Propio: col1 SÍ ve el aviso dirigido a su propio id (sanity antes de marcarlo leído) ─────
  select count(*), bool_and(leida) into n, v_leida from notificaciones where dedup_key = deduppro;
  if n = 1 and v_leida is false then
    r := r || '[ok] propio-select: col1 ve el aviso dirigido a ella, sin leer; ';
  else
    r := r || format('[FALLA] propio-select: col1 ve %s fila(s) (esperaba 1, sin leer); ', n);
  end if;

  -- ── Propio: col1 marca como leído SU PROPIO aviso ─────────────────────────────────────────────
  update notificaciones set leida = true, updated_at = now() where dedup_key = deduppro;
  get diagnostics n = row_count;
  if n = 1 then
    r := r || '[ok] propio-update: col1 marco como leido el aviso dirigido a ella; ';
  else
    r := r || format('[FALLA] propio-update: marcar leido afecto %s fila(s) (esperaba 1); ', n);
  end if;

  select leida into v_leida from notificaciones where dedup_key = deduppro;
  if v_leida is true then
    r := r || '[ok] propio-verificacion: la fila quedo leida=true; ';
  else
    r := r || format('[FALLA] propio-verificacion: leida=%s (esperaba true); ', v_leida);
  end if;

  -- ── Extra: col2 (OTRO colaborador) no puede marcar leído el aviso de col1 ────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', col2, 'role', 'authenticated')::text, true);
  if private.app_es_admin() then
    raise exception 'col2 SI tiene autoridad de admin; no comprobaria nada';
  end if;

  update notificaciones set leida = false where dedup_key = deduppro;
  get diagnostics n = row_count;
  if n = 0 then
    r := r || '[ok] extra: col2 (otro colaborador) NO pudo tocar el aviso dirigido a col1; ';
  else
    r := r || format('[FALLA] extra: col2 SI pudo modificar %s fila(s) del aviso ajeno; ', n);
  end if;

  -- ── Caso 8, del lado del administrador: SI la ve ─────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  select count(*) into n from notificaciones where dedup_key = dedup8;
  if n = 1 then
    r := r || '[ok] caso8b: el administrador SI ve el aviso dirigido por rol; ';
  else
    r := r || format('[FALLA] caso8b: el administrador ve %s fila(s) (esperaba 1); ', n);
  end if;

  raise exception 'RESULTADO 0100 --> %', r;
end $$;
