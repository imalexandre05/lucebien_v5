-- Prueba de la migración 0128_pipeline_carrera_y_puntos_ajenos.sql
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-09-pipeline-carrera-y-puntos-ajenos-design.md
-- (sección «Pruebas»). Origen: registro de la verificación de la release 0112–0127, hallazgos 1, 2 y 5.
-- Esta prueba se escribió ANTES que la migración (Zone Guard): si falla, se corrige el código,
-- nunca se afloja la prueba sin antes corregir y confirmar la spec.
--
-- QUÉ COMPRUEBA (cada caso deja un [ok] o un [FALLA] en la línea RESULTADO):
--   1. F1: pipeline_avanzar, pipeline_dividir y pipeline_enviar leen prenda_pasada con `for update`.
--   3. F2: un movimiento SIN puntos propios por diseño (tienda por H-4, o clave pts_* en 0) se deshace
--      y un punto antiguo sin ligar de esa prenda y etapa, de otro día, NO se borra. Incluye el borde
--      de medianoche: mismo día UTC pero distinto día Perú → no se borra.
--   4. F2: el respaldo legítimo se conserva: un movimiento antiguo con su punto sin ligar del MISMO
--      día Perú sí se deshace (incluido mismo día Perú pero distinto día UTC). Con puntos ligados
--      (historial_id) el comportamiento no cambia.
--   6. F5: pipeline_enviar a una sede inexistente, vacía o nula falla con el mensaje de la 0122
--      («La sede de destino % no existe») y no deja envío, historial ni cambio de etapa.
--   8. Una sola firma por RPC del pipeline (las de la 0127, con p_operador) y por función privada;
--      las tres RPC tocadas conservan security definer, search_path, portero, token y grants; y
--      siguen funcionando para un rol de pipeline.
--
-- QUÉ NO ESTÁ EN ESTE ARCHIVO, Y POR QUÉ:
--   2. Carrera con dos sesiones concurrentes: no cabe en un solo script (la spec lo pide a mano).
--      Procedimiento: dos psql como `authenticated` con dos confeccionistas distintos; la sesión 1
--      hace `begin; select pipeline_avanzar(<prenda>, 'lavado'); select pg_sleep(5); commit;` y la
--      sesión 2, mientras la 1 duerme, `select pipeline_avanzar(<prenda>, 'lavado');`. Esperado:
--      la 2 espera, falla con TRANSICION y queda UN movimiento y UN punto. Igual con dividir y enviar.
--   5. F4 (reportes_crear y registrado_por_id): DETENIDO antes de escribirse. La pantalla
--      /reportes/nuevo ofrece en «¿Quién lo hizo?» a todo el directorio (app_directorio), no sólo al
--      equipo del reporte, así que manda ids que la regla rechazaría. La spec manda parar y reportar.
--   7. F8 (quitar execute a authenticated en las tres funciones privadas): DETENIDO. Comprobado en
--      Postgres local: con ese revoke la prueba 0115 da [FALLA] en sus casos 5a, 5c y 6, que llaman a
--      esas funciones directamente como authenticated; la spec exige a la vez F8 y que la 0115 siga
--      pasando (caso 9). Necesita decisión antes de escribirse.
--   8b. Reaplicar la 0128 sola es inocuo: se comprueba aplicando el archivo dos veces y comparando
--      pg_get_functiondef y proacl de las funciones del pipeline antes y después.
--   9. Las pruebas 0112, 0115, 0122 y 0127 se corren aparte sobre 0001→0128.
--
-- MONTAJE. Todo sintético con el prefijo 'P0128': dos sedes propias, una encargada de almacén,
-- una confeccionista y una encargada de tienda de la sede A. Se ataca COMO `authenticated`
-- de verdad (role + claims), igual que la 0115 y la 0122; se siembra y se mide como dueño.
-- Las horas «de borde» se construyen relativas a hoy en hora Perú (America/Lima), sin fechas fijas.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; eso aborta la transacción y no
-- queda ni una fila. El «error» final ES la salida esperada: se lee la línea RESULTADO.
--
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0128

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;

create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;

-- Ejecuta una sentencia y devuelve 'ok' o el mensaje con que falló.
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $f$;

do $$
declare
  r text := '';
  v_a text := 'P128A'; v_b text := 'P128B';
  e_alm uuid; e_cf uuid; e_ta uuid;
  p uuid; v_pt uuid; v_h uuid;
  v_def text; v_err text; v_err2 text; v_err3 text; v_pts numeric;
  v_n int; v_n2 int; v_etapa text; v_fallas text; v_f text;
  v_dia date;
  t_mov_madrugada timestamptz; t_pt_vispera timestamptz;
  t_mov_noche timestamptz; t_pt_tarde timestamptz; t_viejo timestamptz;
  v_rx text := 'from\s+(public\.)?prenda_pasada\s+where\s+id\s*=\s*p_id\s+for\s+update';
  v_firmas text[] := array['pipeline_avanzar(uuid, text, uuid)', 'pipeline_dividir(uuid, uuid)',
                           'pipeline_enviar(uuid, text, uuid)'];
  v_nombres text[] := array['pipeline_avanzar','pipeline_avanzar_tanda','pipeline_enviar','pipeline_rechazar',
                            'pipeline_deshacer','pipeline_dividir','pipeline_deshacer_division','pipeline_calificar'];
  v_oid oid;
begin
  -- ── Montaje (como dueño) ───────────────────────────────────────────────────────────────────
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0128 Sede A'), (v_b, 'P0128 Sede B');
  insert into empleados (cod, nombre, iniciales, rol) values ('P0128-AL', 'Prueba 0128 Almacen', 'AL', 'encargado_almacen') returning id into e_alm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0128-CF', 'Prueba 0128 Confeccionista', 'CF', 'confeccionista') returning id into e_cf;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0128-TA', 'Prueba 0128 Tienda A', 'TA', 'encargado_tienda', v_a) returning id into e_ta;

  -- Pesos conocidos (se descartan con la transacción).
  insert into config (clave, valor) values
    ('pts_recepcion','1'), ('pts_lavado_normal','1'), ('pts_empatado','1'), ('pts_refaccion','1'),
    ('pts_compostura','1'), ('pts_planchado','1'), ('pts_control_calidad','1')
  on conflict (clave) do update set valor = excluded.valor;

  -- Horas de borde, relativas a hoy en Perú. D = hace 40 días (un mes ya cerrado).
  --   madrugada D 00:10 Perú = D 05:10 UTC   ·   víspera D-1 23:50 Perú = D 04:50 UTC  → mismo día UTC
  --   noche     D 23:30 Perú = D+1 04:30 UTC ·   tarde   D 18:00 Perú = D 23:00 UTC    → mismo día Perú
  v_dia := (now() at time zone 'America/Lima')::date - 40;
  t_mov_madrugada := (v_dia + time '00:10') at time zone 'America/Lima';
  t_pt_vispera    := ((v_dia - 1) + time '23:50') at time zone 'America/Lima';
  t_mov_noche     := (v_dia + time '23:30') at time zone 'America/Lima';
  t_pt_tarde      := (v_dia + time '18:00') at time zone 'America/Lima';
  t_viejo         := now() - interval '40 days';
  if (t_mov_madrugada at time zone 'UTC')::date <> (t_pt_vispera at time zone 'UTC')::date
     or (t_mov_noche at time zone 'UTC')::date = (t_pt_tarde at time zone 'UTC')::date then
    raise exception 'Montaje: las horas de borde no quedaron como se diseñaron';
  end if;
  r := r || 'montaje=ok; ';

  -- ── 1) F1: las tres lecturas de etapa se bloquean ──────────────────────────────────────────
  v_fallas := '';
  foreach v_f in array v_firmas loop
    v_def := pg_get_functiondef(('public.' || v_f)::regprocedure);
    if v_def !~* v_rx then v_fallas := v_fallas || v_f || ' sin for update; '; end if;
  end loop;
  if v_fallas = '' then
    r := r || '[ok] caso 1: avanzar, dividir y enviar leen prenda_pasada con for update;';
  else
    r := r || format('[FALLA] caso 1: %s;', v_fallas);
  end if;

  -- ── 3) F2: un movimiento sin puntos propios no se lleva un punto ajeno de otro día ─────────
  -- 3a) Tienda (H-4: 0 puntos) avanza y deshace; hay un punto sin ligar de hace 40 días, de otra
  --     persona, en esa prenda y en la etapa de origen.
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-3A', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_cf, p, 'recepcion', 2, 'P0128 antiguo 3a', t_viejo) returning id into v_pt;
  perform pg_temp.como(e_ta);
  v_pts := pipeline_avanzar(p, 'lavado');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_pts = 0 and v_err = 'ok' and v_etapa = 'recepcion'
     and exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 3a: la tienda deshace su avance sin puntos y el punto ajeno de hace 40 días sigue;';
  else
    r := r || format('[FALLA] caso 3a: pts=%s deshacer=%s etapa=%s punto_antiguo_sigue=%s;',
                     v_pts, v_err, v_etapa, exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- 3b) Confeccionista con la clave de la etapa en 0 (movimiento sin puntos por diseño).
  update config set valor = '0' where clave = 'pts_empatado';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-3B', 'Chaqueta', 'normal', v_a, 'empatado') returning id into p;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_alm, p, 'empatado', 2, 'P0128 antiguo 3b', t_viejo) returning id into v_pt;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'refaccion');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'empatado'));
  perform pg_temp.dueno();
  update config set valor = '1' where clave = 'pts_empatado';
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_pts = 0 and v_err = 'ok' and v_etapa = 'empatado'
     and exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 3b: con pts_empatado = 0 se deshace el avance y el punto antiguo ajeno sigue;';
  else
    r := r || format('[FALLA] caso 3b: pts=%s deshacer=%s etapa=%s punto_antiguo_sigue=%s;',
                     v_pts, v_err, v_etapa, exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- 3c) Borde de medianoche: movimiento antiguo sin puntos a las 00:10 de D (Perú) y un punto sin
  --     ligar a las 23:50 de D-1 (Perú). Mismo día UTC, distinto día Perú → no se toca.
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-3C', 'Chaqueta', 'normal', v_a, 'lavado') returning id into p;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, fecha)
    values (p, 'recepcion', 'lavado', e_cf, null, t_mov_madrugada);
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_cf, p, 'recepcion', 1, 'P0128 vispera 3c', t_pt_vispera) returning id into v_pt;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'recepcion' and exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 3c: un punto de la víspera (mismo día UTC, otro día Perú) no se borra;';
  else
    r := r || format('[FALLA] caso 3c: deshacer=%s etapa=%s punto_vispera_sigue=%s;',
                     v_err, v_etapa, exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- ── 4) F2: el respaldo legítimo se conserva ────────────────────────────────────────────────
  -- 4a) Movimiento antiguo (de antes de historial_id) con su punto sin ligar del mismo instante.
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-4A', 'Chaqueta', 'normal', v_a, 'lavado') returning id into p;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, fecha)
    values (p, 'recepcion', 'lavado', e_cf, null, t_viejo);
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_cf, p, 'recepcion', 1, 'P0128 propio 4a', t_viejo) returning id into v_pt;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p;
  if v_err = 'ok' and v_etapa = 'recepcion' and not exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 4a: un movimiento antiguo se deshace con su punto sin ligar del mismo día;';
  else
    r := r || format('[FALLA] caso 4a: deshacer=%s etapa=%s punto_borrado=%s;',
                     v_err, v_etapa, not exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- 4b) Mismo día Perú, distinto día UTC: movimiento a las 23:30 de D y punto a las 18:00 de D.
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-4B', 'Chaqueta', 'normal', v_a, 'lavado') returning id into p;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs, fecha)
    values (p, 'recepcion', 'lavado', e_cf, null, t_mov_noche);
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_cf, p, 'recepcion', 1, 'P0128 tarde 4b', t_pt_tarde) returning id into v_pt;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  if v_err = 'ok' and not exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 4b: mismo día Perú (aunque distinto día UTC) el respaldo sí borra el punto;';
  else
    r := r || format('[FALLA] caso 4b: deshacer=%s punto_borrado=%s;',
                     v_err, not exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- 4c) Adaptado a la 0130 (el retrabajo no paga): como la prenda ya tiene un punto positivo en
  --     'recepcion', avanzar esa etapa paga 0 y no liga ninguno; deshacer funciona y el punto antiguo
  --     (de hace 40 días, otro día Perú) sigue. El escenario original (punto antiguo + punto ligado
  --     en la misma etapa) ya no puede producirse por la regla de la 0130.
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-4C', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (e_alm, p, 'recepcion', 2, 'P0128 antiguo 4c', t_viejo) returning id into v_pt;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'lavado');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = p and historial_id is not null;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  perform pg_temp.dueno();
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p and historial_id is not null;
  if v_pts = 0 and v_n = 0 and v_err = 'ok' and v_n2 = 0
     and exists (select 1 from pipeline_puntos where id = v_pt) then
    r := r || '[ok] caso 4c: etapa ya pagada no paga ni liga; deshacer funciona y el punto antiguo sigue;';
  else
    r := r || format('[FALLA] caso 4c: pts=%s ligados_antes=%s deshacer=%s ligados_despues=%s antiguo_sigue=%s;',
                     v_pts, v_n, v_err, v_n2, exists (select 1 from pipeline_puntos where id = v_pt));
  end if;

  -- ── 6) F5: la sede destino tiene que existir ───────────────────────────────────────────────
  v_fallas := '';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-6A', 'Chaqueta', 'normal', v_a, 'listo') returning id into p;
  perform pg_temp.como(e_alm);
  v_err  := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, 'NOEXISTE'));
  v_err2 := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, ''));
  v_err3 := pg_temp.mensaje(format('select pipeline_enviar(%L, null)', p));
  perform pg_temp.dueno();
  if v_err is distinct from 'La sede de destino NOEXISTE no existe' then
    v_fallas := v_fallas || format('NOEXISTE→%s; ', v_err);
  end if;
  if v_err2 not like 'La sede de destino % no existe' then v_fallas := v_fallas || format('vacía→%s; ', v_err2); end if;
  if v_err3 is distinct from 'La sede de destino (vacía) no existe' then
    v_fallas := v_fallas || format('nula→%s; ', v_err3);
  end if;
  select etapa into v_etapa from prenda_pasada where id = p;
  select count(*) into v_n from envios_prendas where responsable_id = e_alm;
  select count(*) into v_n2 from prenda_historial where pasada_id = p;
  if v_fallas = '' and v_etapa = 'listo' and v_n = 0 and v_n2 = 0
     and (select envio_id from prenda_pasada where id = p) is null then
    r := r || '[ok] caso 6: enviar a una sede inexistente, vacía o nula falla con el mensaje de la 0122 y no deja nada;';
  else
    r := r || format('[FALLA] caso 6: %s etapa=%s envios=%s historial=%s;', v_fallas, v_etapa, v_n, v_n2);
  end if;

  -- ── 8) Firmas y atributos ──────────────────────────────────────────────────────────────────
  -- 8a) Una sola firma por RPC del pipeline, con p_operador, sin execute para anon.
  v_fallas := '';
  foreach v_f in array v_nombres loop
    select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'public' and pr.proname = v_f;
    select count(*) into v_n2 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'public' and pr.proname = v_f and 'p_operador' = any (pr.proargnames);
    if v_n <> 1 or v_n2 <> 1 then v_fallas := v_fallas || format('%s: %s firma(s), %s con p_operador; ', v_f, v_n, v_n2); end if;
  end loop;
  foreach v_f in array array['pipeline_registrar_punto', 'pipeline_borrar_punto', 'prenda_historial_registrar'] loop
    select count(*) into v_n from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'private' and pr.proname = v_f;
    if v_n <> 1 then v_fallas := v_fallas || format('private.%s: %s firma(s); ', v_f, v_n); end if;
  end loop;
  if v_fallas = '' then
    r := r || '[ok] caso 8a: una sola firma por RPC del pipeline (con p_operador) y por función privada;';
  else
    r := r || format('[FALLA] caso 8a: %s;', v_fallas);
  end if;

  -- 8b) Las tres RPC tocadas y el respaldo conservan lo que tenían.
  v_fallas := '';
  foreach v_f in array v_firmas loop
    v_oid := ('public.' || v_f)::regprocedure;
    v_def := pg_get_functiondef(v_oid);
    if not (select prosecdef from pg_proc where oid = v_oid) then v_fallas := v_fallas || v_f || ' no es definer; '; end if;
    if (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public, pg_temp'] then
      v_fallas := v_fallas || v_f || ' cambió search_path; ';
    end if;
    if v_def !~ 'private\.pipeline_exigir_acceso\(p_id\)' then v_fallas := v_fallas || v_f || ' sin portero; '; end if;
    if v_def !~ 'private\.actor_pipeline\(p_operador\)' then v_fallas := v_fallas || v_f || ' sin token de operador; '; end if;
    if v_def !~ 'private\.prenda_historial_registrar\(' then v_fallas := v_fallas || v_f || ' sin historial por función; '; end if;
    if not has_function_privilege('authenticated', v_oid, 'execute') then v_fallas := v_fallas || v_f || ' sin execute para authenticated; '; end if;
    if has_function_privilege('anon', v_oid, 'execute') then v_fallas := v_fallas || v_f || ' con execute para anon; '; end if;
    if exists (select 1 from pg_proc pr, aclexplode(pr.proacl) a where pr.oid = v_oid and a.grantee = 0) then
      v_fallas := v_fallas || v_f || ' con execute para public; ';
    end if;
  end loop;
  if pg_get_functiondef('public.pipeline_avanzar(uuid, text, uuid)'::regprocedure) !~ 'private\.pipeline_registrar_punto\(' then
    v_fallas := v_fallas || 'pipeline_avanzar ya no pasa por pipeline_registrar_punto (H-4); ';
  end if;
  if pg_get_functiondef('public.pipeline_avanzar(uuid, text, uuid)'::regprocedure) !~ 'v_permitidos' then
    v_fallas := v_fallas || 'pipeline_avanzar perdió la lista blanca de transiciones; ';
  end if;
  v_oid := 'private.pipeline_borrar_punto(uuid, uuid, boolean)'::regprocedure;
  if not (select prosecdef from pg_proc where oid = v_oid)
     or (select proconfig from pg_proc where oid = v_oid) is distinct from array['search_path=public']
     or pg_get_functiondef(v_oid) !~ 'private\.pipeline_exigir_derecho\(p_pasada\)'
     or has_function_privilege('anon', v_oid, 'execute')
     or exists (select 1 from pg_proc pr, aclexplode(pr.proacl) a where pr.oid = v_oid and a.grantee = 0) then
    v_fallas := v_fallas || 'private.pipeline_borrar_punto perdió definer, search_path, exigir_derecho o grants; ';
  end if;
  if v_fallas = '' then
    r := r || '[ok] caso 8b: avanzar, dividir, enviar y borrar_punto conservan definer, search_path, portero, token, historial y grants;';
  else
    r := r || format('[FALLA] caso 8b: %s;', v_fallas);
  end if;

  -- 8c) Las tres RPC siguen funcionando para un rol de pipeline (confeccionista).
  v_fallas := '';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-8A', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'lavado');
  perform pg_temp.dueno();
  select h.id into v_h from prenda_historial h where h.pasada_id = p and h.etapa_nueva = 'lavado';
  if v_pts <> 1 or not exists (select 1 from pipeline_puntos where pasada_id = p and empleado_id = e_cf
                                                               and historial_id = v_h and puntos = 1) then
    v_fallas := v_fallas || format('avanzar pts=%s; ', v_pts);
  end if;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-8T', 'Terno completo', 'normal', v_a, 'lavado') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo in ('P0128-8T-S', 'P0128-8T-P');
  if v_err <> 'ok' or v_n <> 2 or (select etapa from prenda_pasada where id = p) <> 'dividido' then
    v_fallas := v_fallas || format('dividir err=%s hijas=%s; ', v_err, v_n);
  end if;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0128-8L', 'Chaqueta', 'normal', v_a, 'listo') returning id into p;
  perform pg_temp.como(e_cf);
  v_err := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, v_b));
  perform pg_temp.dueno();
  if v_err <> 'ok' or (select etapa from prenda_pasada where id = p) <> 'enviado'
     or not exists (select 1 from prenda_pasada pp join envios_prendas e on e.id = pp.envio_id
                     where pp.id = p and e.sede_destino_cod = v_b and e.responsable_id = e_cf) then
    v_fallas := v_fallas || format('enviar err=%s; ', v_err);
  end if;
  if v_fallas = '' then
    r := r || '[ok] caso 8c: avanzar (con su punto ligado), dividir y enviar siguen funcionando para una confeccionista;';
  else
    r := r || format('[FALLA] caso 8c: %s;', v_fallas);
  end if;

  raise exception 'RESULTADO 0128 --> %', r;
end $$;
