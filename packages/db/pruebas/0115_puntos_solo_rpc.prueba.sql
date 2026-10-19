-- Prueba de la migración 0115_puntos_solo_rpc.sql
--
-- Contrato: docs/superpowers/specs/pipeline/2026-10-05-puntos-solo-rpc-design.md §3 y §6.
-- Esta prueba se escribió ANTES que la migración (Zone Guard): si falla, se corrige el código,
-- nunca se afloja la prueba sin antes corregir y confirmar la spec.
--
-- REGLA QUE PRUEBA: sólo las RPC del pipeline escriben `pipeline_puntos` y `prenda_historial`.
--
-- QUÉ COMPRUEBA (cada caso deja un [ok] o un [FALLA] en la línea RESULTADO):
--   1. `authenticated` NO puede insert / update / delete directos en las dos tablas, con ningún rol
--      (admin, almacén, tienda de la sede, un empleado sobre SUS PROPIOS puntos). `anon` tampoco.
--      Y no queda ninguna fila escrita.
--   2. La lectura NO cambió: cada rol ve exactamente lo que veía (admin y almacén todo; tienda sólo
--      su sede; un empleado, además, sus propios puntos).
--   3. Sólo quedan policies `for select` en las dos tablas.
--   4. Las nueve RPC que escriben siguen funcionando igual: avanzar, avanzar_tanda, rechazar,
--      deshacer, dividir, deshacer_division, enviar, calificar y lavanderia_enviar. Mismos puntos,
--      mismas filas de historial. Una tienda mueve lo de su sede y NO lo de otra.
--   5. Las tres funciones privadas rechazan al llamador sin derecho sobre la prenda: otra sede, el
--      empleado «sobre sus propios puntos», prenda inexistente o nula, y sesión sin autenticar. El
--      rechazo no deja ninguna fila escrita ni borrada.
--   6. `registrado_por` no se puede falsificar (siempre es auth.uid()).
--   7. `anon` no ejecuta las funciones privadas.
--
-- MONTAJE. Todo sintético: el prefijo 'P0115' en códigos y detalles. Dos sedes (las dos primeras
-- que existan), un admin, una encargada de almacén, una encargada de tienda por sede y un
-- empleado de ventas con sus propios puntos.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; eso aborta la transacción y
-- no queda ni una fila. El "error" final ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0115
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0115")
--
-- NO SE HA EJECUTADO contra ninguna base real: la migración no está aplicada en ningún lado (la
-- aplica el dueño después de revisar). Se corrió sólo contra un Postgres local con las 112
-- migraciones anteriores.

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;

create or replace function pg_temp.como_anon() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;

-- authenticated pero sin sesión (auth.uid() = null)
create or replace function pg_temp.como_sin_sesion() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;

create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;

-- Ejecuta una sentencia y devuelve 'ok' o el SQLSTATE con que falló.
create or replace function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $f$;

-- Ejecuta una sentencia y devuelve 'ok' o el mensaje con que falló.
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $f$;

-- 0181: solo la tienda destino (o el admin) califica. Este ayudante califica como un empleado de la
-- tienda destino del envío (o como admin si la prenda no tiene envío) y vuelve a la sesión de antes.
-- Si p_tok trae un token de operador, se le emite uno equivalente a la sesión del ayudante.
create or replace function pg_temp.calificar_destino(p_id uuid, p_acept boolean, p_dest text, p_obs text, p_tok uuid default null)
  returns void language plpgsql as $f$
declare v_prev text := current_setting('request.jwt.claims', true); v_sede text; v_t uuid; v_op uuid; v_tok uuid; v_cod text;
begin
  execute 'reset role';
  select e.sede_destino_cod into v_sede from envios_prendas e join prenda_pasada p on p.envio_id = e.id where p.id = p_id;
  v_cod := coalesce('PCAL-' || v_sede, 'PCAL-ADM');
  select id into v_t from empleados where cod = v_cod;
  if v_t is null then
    insert into empleados (cod, nombre, iniciales, rol, sede_cod)
      values (v_cod, 'Prueba calificador ' || v_cod, 'PC', case when v_sede is null then 'admin' else 'encargado_tienda' end, v_sede)
      returning id into v_t;
  end if;
  if p_tok is not null then
    select empleado_id into v_op from codigo_operadores where token = p_tok;
    insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (v_t, v_op, now() + interval '5 minutes') returning token into v_tok;
  end if;
  perform pg_temp.como(v_t);
  perform pipeline_calificar(p_id, p_acept, p_dest, p_obs, v_tok);
  execute 'reset role';
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);
  if coalesce(v_prev, '') <> '' then perform set_config('role', 'authenticated', true); end if;
end $f$;

do $$
declare
  v_a text; v_b text;                         -- sedes
  e_admin uuid; e_alm uuid; e_ta uuid; e_tb uuid; e_emp uuid;
  pa1 uuid; pa2 uuid; pa3 uuid; pa4 uuid; pb1 uuid; pt uuid; pl uuid; pn uuid;
  v_hija uuid; v_pts numeric; v_id uuid;
  v_n int; v_n2 int; v_err text; v_est text;
  v_roles text[]; v_uids uuid[]; v_nom text; v_uid uuid; v_sql text; v_res text; v_fallas text;
  v_reg uuid; v_emp uuid; v_lista uuid; v_etapa text; v_err2 text;
  r text := '';
begin
  -- ── Montaje (como dueño de las tablas) ─────────────────────────────────────────────────────
  select cod into v_a from sedes where not interna order by cod limit 1;
  select cod into v_b from sedes where not interna and cod <> v_a order by cod limit 1;
  if v_a is null or v_b is null then raise exception 'La prueba necesita al menos dos sedes no internas'; end if;

  insert into empleados (cod, nombre, iniciales, rol) values ('P0115-AD', 'Prueba 0115 Admin', 'AD', 'admin') returning id into e_admin;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0115-AL', 'Prueba 0115 Almacen', 'AL', 'encargado_almacen') returning id into e_alm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0115-TA', 'Prueba 0115 Tienda A', 'TA', 'encargado_tienda', v_a) returning id into e_ta;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0115-TB', 'Prueba 0115 Tienda B', 'TB', 'encargado_tienda', v_b) returning id into e_tb;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0115-EM', 'Prueba 0115 Empleado', 'EM', 'ventas_junior', v_b) returning id into e_emp;

  -- Pesos conocidos para que los puntos sean predecibles.
  insert into config (clave, valor) values ('pts_recepcion', '1') on conflict (clave) do update set valor = '1';
  insert into config (clave, valor) values ('pts_lavado_normal', '2') on conflict (clave) do update set valor = '2';

  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-A1', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into pa1;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-A2', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into pa2;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-A3', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into pa3;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-A4', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into pa4;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-B1', 'Chaqueta', 'normal', v_b, 'recepcion') returning id into pb1;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-T1', 'Terno completo', 'normal', v_a, 'recepcion') returning id into pt;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-L1', 'Chaqueta', 'normal', v_a, 'listo') returning id into pl;
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-N1', 'Chaqueta', 'normal', v_b, 'recepcion') returning id into pn;

  -- Filas sembradas para comprobar lecturas y que nada se edite ni se borre.
  --   r1: puntos de la almacén sobre una prenda de A · r2: sobre una de B · r3: del empleado
  --   (sede B) sobre una prenda de A.
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle) values
    (e_alm, pa4, 'recepcion', 1, 'P0115 r1'),
    (e_alm, pb1, 'recepcion', 1, 'P0115 r2'),
    (e_emp, pa4, 'recepcion', 1, 'P0115 r3');
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs) values
    (pa4, 'recepcion', e_alm, 'P0115 h1'),
    (pb1, 'recepcion', e_alm, 'P0115 h2');

  r := r || 'montaje=ok; ';

  -- ── 1) Escritura directa denegada a todo rol, en las dos tablas ─────────────────────────────
  v_roles := array['admin', 'almacen', 'tienda_A', 'empleado_sus_puntos'];
  v_uids  := array[e_admin, e_alm, e_ta, e_emp];
  v_fallas := '';
  for i in 1 .. 4 loop
    v_nom := v_roles[i]; v_uid := v_uids[i];
    perform pg_temp.como(v_uid);
    foreach v_sql in array array[
      format($q$insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle) values ('%s', '%s', 'recepcion', 500, 'P0115 directo')$q$, v_uid, pa4),
      $q$update pipeline_puntos set puntos = 500 where detalle = 'P0115 r1'$q$,
      $q$update pipeline_puntos set puntos = 500 where detalle = 'P0115 r3'$q$,
      $q$delete from pipeline_puntos where detalle = 'P0115 r1'$q$,
      $q$delete from pipeline_puntos where detalle = 'P0115 r3'$q$,
      format($q$insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs) values ('%s', 'listo', '%s', 'P0115 directo')$q$, pa4, v_uid),
      $q$update prenda_historial set obs = 'P0115 editado' where obs = 'P0115 h1'$q$,
      $q$delete from prenda_historial where obs = 'P0115 h1'$q$
    ] loop
      v_res := pg_temp.intentar(v_sql);
      if v_res <> '42501' then
        v_fallas := v_fallas || format('%s→%s [%s]; ', v_nom, v_res, left(v_sql, 40));
      end if;
    end loop;
  end loop;
  perform pg_temp.como_anon();
  foreach v_sql in array array[
    format($q$insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle) values ('%s', '%s', 'recepcion', 500, 'P0115 directo')$q$, e_emp, pa4),
    format($q$insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs) values ('%s', 'listo', '%s', 'P0115 directo')$q$, pa4, e_emp)
  ] loop
    v_res := pg_temp.intentar(v_sql);
    if v_res <> '42501' then v_fallas := v_fallas || format('anon→%s; ', v_res); end if;
  end loop;
  if v_fallas = '' then
    r := r || '[ok] caso 1a: ningún rol (ni anon) puede insert/update/delete directo en las dos tablas;';
  else
    r := r || format('[FALLA] caso 1a: escrituras directas que NO se denegaron: %s;', v_fallas);
  end if;

  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where detalle in ('P0115 directo', 'P0115 editado') or puntos = 500;
  select count(*) into v_n2 from prenda_historial where obs in ('P0115 directo', 'P0115 editado');
  select count(*) into v_est from pipeline_puntos where detalle in ('P0115 r1', 'P0115 r2', 'P0115 r3') and puntos = 1;
  if v_n = 0 and v_n2 = 0 and v_est::int = 3
     and (select count(*) from prenda_historial where obs in ('P0115 h1', 'P0115 h2')) = 2 then
    r := r || '[ok] caso 1b: tras los intentos no hay filas nuevas, editadas ni borradas;';
  else
    r := r || format('[FALLA] caso 1b: puntos_extra=%s historial_extra=%s sembrados_intactos=%s;', v_n, v_n2, v_est);
  end if;

  -- ── 2) La lectura no cambió ─────────────────────────────────────────────────────────────────
  --   puntos : desde la 0174 (spec pipeline/2026-10-10-puntos-solo-propios, decisión 2 del dueño)
  --            cada persona ve sólo los suyos y el admin todos: admin 3 · almacén (r1, r2) 2 ·
  --            tienda A 0 · empleado (r3) 1 · tienda B 0
  --   historial: admin 2 · almacén 2 · tienda A 1 · tienda B 1 · empleado (sede B) 1
  v_fallas := '';
  for i in 1 .. 5 loop
    v_uid := (array[e_admin, e_alm, e_ta, e_emp, e_tb])[i];
    v_nom := (array['admin', 'almacen', 'tienda_A', 'empleado', 'tienda_B'])[i];
    perform pg_temp.como(v_uid);
    select count(*) into v_n  from pipeline_puntos  where detalle like 'P0115 r%';
    select count(*) into v_n2 from prenda_historial where obs like 'P0115 h%';
    if v_n <> (array[3, 2, 0, 1, 0])[i] or v_n2 <> (array[2, 2, 1, 1, 1])[i] then
      v_fallas := v_fallas || format('%s ve puntos=%s historial=%s; ', v_nom, v_n, v_n2);
    end if;
  end loop;
  perform pg_temp.dueno();
  if v_fallas = '' then
    r := r || '[ok] caso 2: la lectura de cada rol es la de siempre;';
  else
    r := r || format('[FALLA] caso 2: %s;', v_fallas);
  end if;

  -- ── 3) Sólo policies de lectura ─────────────────────────────────────────────────────────────
  select count(*) into v_n from pg_policies
    where schemaname = 'public' and tablename in ('pipeline_puntos', 'prenda_historial') and cmd <> 'SELECT';
  select count(*) into v_n2 from pg_policies
    where schemaname = 'public' and tablename in ('pipeline_puntos', 'prenda_historial') and cmd = 'SELECT';
  if v_n = 0 and v_n2 >= 2 then
    r := r || '[ok] caso 3: las dos tablas sólo tienen policies for select;';
  else
    r := r || format('[FALLA] caso 3: policies no-select=%s, select=%s;', v_n, v_n2);
  end if;

  -- ── 4) Las RPC siguen igual ─────────────────────────────────────────────────────────────────
  -- 4a) avanzar (almacén): 1 punto de recepción, historial con registrado_por = sesión.
  perform pg_temp.como(e_alm);
  v_pts := pipeline_avanzar(pa1, 'lavado');
  perform pg_temp.dueno();
  select count(*), coalesce(sum(puntos), 0) into v_n, v_pts from pipeline_puntos
    where pasada_id = pa1 and empleado_id = e_alm and etapa = 'recepcion';
  select count(*) into v_n2 from prenda_historial
    where pasada_id = pa1 and etapa_anterior = 'recepcion' and etapa_nueva = 'lavado'
      and empleado_id = e_alm and registrado_por = e_alm;
  if v_n = 1 and v_pts = 1 and v_n2 = 1 then
    r := r || '[ok] caso 4a: pipeline_avanzar deja su punto y su fila de historial;';
  else
    r := r || format('[FALLA] caso 4a: puntos=%s suma=%s historial=%s;', v_n, v_pts, v_n2);
  end if;

  -- 4b) avanzar con la etapa de lavado (peso 2) y rechazar → punto negativo al culpable.
  perform pg_temp.como(e_alm);
  -- H-7: sólo se rechaza desde control de calidad; la prenda llega ahí por avances legítimos.
  perform pipeline_avanzar(pa1, 'empatado');
  perform pipeline_avanzar(pa1, 'refaccion');
  perform pipeline_avanzar(pa1, 'planchado');
  perform pipeline_avanzar(pa1, 'control_calidad');
  perform pipeline_rechazar(pa1, 'lavado', p_motivo => 'prueba');
  perform pg_temp.dueno();
  select count(*), coalesce(sum(puntos), 0) into v_n, v_pts from pipeline_puntos
    where pasada_id = pa1 and etapa = 'lavado_rechazo' and empleado_id = e_alm;
  select count(*) into v_n2 from prenda_historial
    where pasada_id = pa1 and etapa_nueva = 'lavado' and obs like 'Rechazado%' and registrado_por = e_alm;
  if v_n = 1 and v_pts = -2 and v_n2 = 1 then
    r := r || '[ok] caso 4b: pipeline_rechazar deja el punto negativo (-2) y su historial;';
  else
    r := r || format('[FALLA] caso 4b: filas_rechazo=%s suma=%s historial=%s;', v_n, v_pts, v_n2);
  end if;

  -- 4c) avanzar_tanda: 2 prendas → 2 puntos.
  perform pg_temp.como(e_alm);
  v_pts := pipeline_avanzar_tanda(array[pa2, pa3], 'lavado');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id in (pa2, pa3) and etapa = 'recepcion';
  if v_n = 2 and v_pts = 2 then
    r := r || '[ok] caso 4c: pipeline_avanzar_tanda deja un punto por prenda;';
  else
    r := r || format('[FALLA] caso 4c: puntos=%s devuelto=%s;', v_n, v_pts);
  end if;

  -- 4d) deshacer: quita el punto positivo del actor y deja su fila en el historial.
  perform pg_temp.como(e_alm);
  perform pipeline_deshacer(pa2, 'recepcion');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = pa2;
  select count(*) into v_n2 from prenda_historial where pasada_id = pa2 and obs = 'Deshacer' and registrado_por = e_alm;
  select etapa into v_etapa from prenda_pasada where id = pa2;
  if v_n = 0 and v_n2 = 1 and v_etapa = 'recepcion' then
    r := r || '[ok] caso 4d: pipeline_deshacer borra el punto y deja constancia;';
  else
    r := r || format('[FALLA] caso 4d: puntos_restantes=%s historial=%s etapa=%s;', v_n, v_n2, v_etapa);
  end if;

  -- 4e) dividir + deshacer_division (con un punto sembrado en una hija: tiene que borrarse, si no
  --     la FK impide borrar la hija).
  perform pg_temp.como(e_alm);
  perform pipeline_dividir(pt);
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial h join prenda_pasada p on p.id = h.pasada_id
    where p.codigo in ('P0115-T1-S', 'P0115-T1-P') and h.registrado_por = e_alm;
  select count(*) into v_n2 from prenda_historial
    where pasada_id = pt and etapa_nueva = 'dividido' and registrado_por = e_alm;
  select id into v_hija from prenda_pasada where codigo = 'P0115-T1-S';
  if v_n = 2 and v_n2 = 1 and v_hija is not null then
    r := r || '[ok] caso 4e-1: pipeline_dividir deja las tres filas de historial;';
  else
    r := r || format('[FALLA] caso 4e-1: historial_hijas=%s historial_madre=%s;', v_n, v_n2);
  end if;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle) values (e_alm, v_hija, 'recepcion', 1, 'P0115 hija');
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_deshacer_division(%L)', pt));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo in ('P0115-T1-S', 'P0115-T1-P');
  select count(*) into v_n2 from pipeline_puntos where detalle = 'P0115 hija';
  select etapa into v_etapa from prenda_pasada where id = pt;
  if v_err = 'ok' and v_n = 0 and v_n2 = 0 and v_etapa = 'recepcion'
     and exists (select 1 from prenda_historial where pasada_id = pt and obs like 'Deshacer división%' and registrado_por = e_alm) then
    r := r || '[ok] caso 4e-2: pipeline_deshacer_division borra hijas y sus puntos y restaura la madre;';
  else
    r := r || format('[FALLA] caso 4e-2: err=%s hijas=%s puntos_hija=%s etapa=%s;', v_err, v_n, v_n2, v_etapa);
  end if;

  -- 4f) enviar + calificar.
  perform pg_temp.como(e_alm);
  perform pipeline_enviar(pl, v_b);
  perform pg_temp.calificar_destino(pl, true, null, null);
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial
    where pasada_id = pl and etapa_anterior = 'listo' and etapa_nueva = 'enviado' and registrado_por = e_alm;
  select count(*) into v_n2 from prenda_historial
    where pasada_id = pl and etapa_nueva = 'recibido' and registrado_por is not null;  -- 0181: lo registra la tienda destino
  if v_n = 1 and v_n2 = 1 then
    r := r || '[ok] caso 4f: pipeline_enviar y pipeline_calificar dejan su historial;';
  else
    r := r || format('[FALLA] caso 4f: enviar=%s calificar=%s;', v_n, v_n2);
  end if;

  -- 4g) Una tienda mueve lo de SU sede (SIN punto: spec §11, H-4) y no lo de otra sede.
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', pa4, 'lavado'));
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = pa4 and empleado_id = e_ta and etapa = 'recepcion';
  select count(*) into v_n2 from prenda_historial where pasada_id = pa4 and empleado_id = e_ta and registrado_por = e_ta;
  if v_err = 'ok' and v_n = 0 and v_n2 = 1 then
    r := r || '[ok] caso 4g-1: una tienda avanza una prenda de su sede, queda en el historial y no cobra punto (H-4);';
  else
    r := r || format('[FALLA] caso 4g-1: err=%s puntos=%s historial=%s;', v_err, v_n, v_n2);
  end if;
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', pb1, 'lavado'));
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = pb1 and empleado_id = e_ta;
  if v_err like '%no encontrada%' and v_n = 0 then
    r := r || '[ok] caso 4g-2: una tienda no mueve una prenda de otra sede (y no deja puntos);';
  else
    r := r || format('[FALLA] caso 4g-2: err=%s puntos=%s;', v_err, v_n);
  end if;

  -- 4h) lavanderia_enviar (tienda A): crea la prenda y su fila de historial.
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format(
    $q$select lavanderia_enviar(%L, 'NORMAL', 'P0115', 'P0115', '{}'::jsonb,
         '[{"cod":"P0115-LV","tipo":"Chaqueta","color":"negro","talla":"M"}]'::jsonb)$q$, v_a));
  perform pg_temp.dueno();
  select count(*), min(h.etapa_nueva), (array_agg(h.registrado_por))[1]
    into v_n, v_etapa, v_reg
    from prenda_historial h join prenda_pasada p on p.id = h.pasada_id
    where p.codigo = 'P0115-LV' and h.empleado_id = e_ta;
  if v_err = 'ok' and v_n = 1 and v_etapa = 'recepcion' then
    r := r || '[ok] caso 4h-1: lavanderia_enviar crea la prenda y su historial;';
  else
    r := r || format('[FALLA] caso 4h-1: err=%s historial=%s etapa=%s;', v_err, v_n, v_etapa);
  end if;
  if v_reg = e_ta then
    r := r || '[ok] caso 4h-2: el historial de lavanderia_enviar guarda registrado_por = sesión (mejora de la 0115);';
  else
    r := r || format('[FALLA] caso 4h-2: registrado_por=%s, esperaba %s;', v_reg, e_ta);
  end if;

  -- 4h-3) El mismo código dos veces en la lista: cada prenda queda con su historial.
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format(
    $q$select lavanderia_enviar(%L, 'NORMAL', 'P0115', 'P0115', '{}'::jsonb,
         '[{"cod":"P0115-DUP","tipo":"Chaqueta"},{"cod":"P0115-DUP","tipo":"Chaqueta"}]'::jsonb)$q$, v_a));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo = 'P0115-DUP';
  select count(*) into v_n2 from prenda_pasada p
    where p.codigo = 'P0115-DUP' and exists (select 1 from prenda_historial h where h.pasada_id = p.id);
  if v_err = 'ok' and v_n = 2 and v_n2 = 2 then
    r := r || '[ok] caso 4h-3: con un código repetido en la lista, cada prenda queda con su historial;';
  else
    r := r || format('[FALLA] caso 4h-3: err=%s prendas=%s con_historial=%s;', v_err, v_n, v_n2);
  end if;

  -- ── 5) Las funciones privadas no son una puerta nueva ───────────────────────────────────────
  -- La tienda A intenta escribir sobre una prenda de la sede B.
  perform pg_temp.como(e_ta);
  v_fallas := '';
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, %L, 'recepcion', 5, 'P0115 ajena')$q$, e_ta, pb1));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('registrar ajena→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.pipeline_borrar_punto(%L, %L)$q$, pb1, e_alm));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('borrar ajena→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.pipeline_borrar_punto(%L, %L, true)$q$, pb1, e_alm));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('borrar todos ajena→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.prenda_historial_registrar(%L, 'recepcion', 'listo', %L, 'P0115 ajena')$q$, pb1, e_ta));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('historial ajena→%s; ', v_err); end if;
  -- Prenda inexistente o nula.
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, %L, 'recepcion', 5, 'P0115 fantasma')$q$, e_ta, gen_random_uuid()));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('registrar inexistente→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, null, 'recepcion', 5, 'P0115 nula')$q$, e_ta));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('registrar nula→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.prenda_historial_registrar(%L, 'recepcion', 'listo', %L, 'P0115 fantasma')$q$, gen_random_uuid(), e_ta));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('historial inexistente→%s; ', v_err); end if;
  -- El empleado «sobre sus propios puntos» (sede B) sobre una prenda de la sede A: la rama que
  -- hoy deja sumarse puntos a uno mismo desaparece.
  perform pg_temp.como(e_emp);
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, %L, 'recepcion', 500, 'P0115 autopuntos')$q$, e_emp, pa4));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('autopuntos→%s; ', v_err); end if;
  v_err := pg_temp.mensaje(format($q$select private.pipeline_borrar_punto(%L, %L)$q$, pa4, e_emp));
  if v_err not like 'PERMISO%' then v_fallas := v_fallas || format('borrarse puntos→%s; ', v_err); end if;
  -- Sin sesión.
  perform pg_temp.como_sin_sesion();
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, %L, 'recepcion', 5, 'P0115 sin sesion')$q$, e_ta, pa4));
  if v_err = 'ok' then v_fallas := v_fallas || 'sin sesión→ok; '; end if;
  perform pg_temp.dueno();
  if v_fallas = '' then
    r := r || '[ok] caso 5a: las tres funciones rechazan prenda ajena, inexistente, nula, el autopunto y la sesión nula;';
  else
    r := r || format('[FALLA] caso 5a: %s;', v_fallas);
  end if;
  select count(*) into v_n from pipeline_puntos where detalle like 'P0115 %' and detalle in ('P0115 ajena', 'P0115 fantasma', 'P0115 nula', 'P0115 autopuntos', 'P0115 sin sesion');
  select count(*) into v_n2 from prenda_historial where obs in ('P0115 ajena', 'P0115 fantasma');
  if v_n = 0 and v_n2 = 0 and exists (select 1 from pipeline_puntos where detalle = 'P0115 r2')
     and exists (select 1 from pipeline_puntos where detalle = 'P0115 r1') then
    r := r || '[ok] caso 5b: los rechazos no dejaron filas nuevas ni borraron las sembradas;';
  else
    r := r || format('[FALLA] caso 5b: puntos_nuevos=%s historial_nuevo=%s;', v_n, v_n2);
  end if;

  -- Control positivo: la tienda A sobre una prenda de SU sede sí puede.
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format($q$select private.pipeline_registrar_punto(%L, %L, 'control_calidad', 1, 'P0115 propia')$q$, e_alm, pa3));
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where detalle = 'P0115 propia' and pasada_id = pa3;
  if v_err = 'ok' and v_n = 1 then
    r := r || '[ok] caso 5c: con derecho sobre la prenda, registrar_punto escribe;';
  else
    r := r || format('[FALLA] caso 5c: err=%s filas=%s;', v_err, v_n);
  end if;

  -- ── 6) registrado_por no se puede falsificar ────────────────────────────────────────────────
  perform pg_temp.como(e_ta);
  v_err := pg_temp.mensaje(format($q$select private.prenda_historial_registrar(%L, 'recepcion', 'lavado', %L, 'P0115 firma')$q$, pa3, e_alm));
  perform pg_temp.dueno();
  select empleado_id, registrado_por into v_emp, v_reg from prenda_historial where obs = 'P0115 firma';
  if v_err = 'ok' and v_emp = e_alm and v_reg = e_ta then
    r := r || '[ok] caso 6: registrado_por es siempre la sesión (auth.uid()), no un parámetro;';
  else
    r := r || format('[FALLA] caso 6: err=%s empleado=%s registrado_por=%s;', v_err, v_emp, v_reg);
  end if;

  -- ── 7) anon no ejecuta las funciones privadas ───────────────────────────────────────────────
  if to_regprocedure('private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid)') is not null
     and to_regprocedure('private.pipeline_registrar_punto(uuid, uuid, text, numeric, text)') is null
     and not has_function_privilege('anon', 'private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid)', 'execute')
     and not has_function_privilege('anon', 'private.pipeline_borrar_punto(uuid, uuid, boolean)', 'execute')
     and not has_function_privilege('anon', 'private.prenda_historial_registrar(uuid, text, text, uuid, text)', 'execute') then
    r := r || '[ok] caso 7: anon no ejecuta ninguna de las tres funciones privadas;';
  else
    r := r || '[FALLA] caso 7: las funciones no existen con esa firma o anon puede ejecutarlas;';
  end if;

  -- ── 8) H-4: una tienda mueve su prenda pero no se acredita puntos ──────────────────────────
  perform pg_temp.dueno();
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-H4', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into v_id;
  perform pg_temp.como(e_ta);
  v_pts := pipeline_avanzar(v_id, 'lavado');
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = v_id;
  select etapa into v_etapa from prenda_pasada where id = v_id;
  if v_pts = 0 and v_n = 0 and v_etapa = 'lavado' then
    r := r || '[ok] caso 8: la tienda avanza su prenda sin acreditarse puntos;';
  else
    r := r || format('[FALLA] caso 8: devolvió %s, puntos=%s, etapa=%s;', v_pts, v_n, v_etapa);
  end if;

  -- ── 9) H-1: deshacer quita los puntos del movimiento deshecho, no los de quien deshace ──────
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-H1', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into v_hija;
  perform pg_temp.como(e_alm);
  perform pipeline_avanzar(v_hija, 'lavado');             -- almacén +1
  perform pg_temp.como(e_admin);
  perform pipeline_avanzar(v_hija, 'empatado');           -- admin +2
  perform pg_temp.como(e_alm);
  perform pipeline_deshacer(v_hija, 'lavado');            -- almacén deshace lo del admin
  perform pg_temp.dueno();
  select count(*) into v_n  from pipeline_puntos where pasada_id = v_hija and empleado_id = e_alm;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = v_hija and empleado_id = e_admin;
  if v_n = 1 and v_n2 = 0 then
    r := r || '[ok] caso 9: deshacer borra el punto del movimiento (admin) y no el de quien deshace (almacén);';
  else
    r := r || format('[FALLA] caso 9: almacén=%s admin=%s (esperaba 1/0);', v_n, v_n2);
  end if;

  -- ── 10) H-2: deshacer a una etapa que no es la del último movimiento ───────────────────────
  select etapa into v_est from prenda_pasada where id = pl;
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format($q$select pipeline_deshacer(%L, 'recepcion')$q$, pl));
  v_err2 := pg_temp.mensaje(format($q$select pipeline_deshacer(%L, 'recepcion')$q$, v_hija));
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' and v_err2 like 'TRANSICION:%'
     and (select etapa from prenda_pasada where id = pl) = v_est
     and (select etapa from prenda_pasada where id = v_hija) = 'lavado' then
    r := r || '[ok] caso 10: deshacer a una etapa arbitraria lanza TRANSICION y no mueve nada;';
  else
    r := r || format('[FALLA] caso 10: listo→%s / lavado→%s;', v_err, v_err2);
  end if;

  -- ── 11) Compatibilidad con la 0122 (spec §12) ─────────────────────────────────────────────
  -- La 0122 se aplica ANTES que la 0112 y la 0115 y revoca insert/update/delete de prenda_pasada,
  -- prenda_historial y pipeline_puntos a authenticated. Se simula como dueño (el rollback final lo
  -- deshace): las RPC, ahora security definer, tienen que seguir funcionando.
  declare
    w1 uuid; w2 uuid; w3 uuid; w4 uuid;
  begin
    perform pg_temp.dueno();
    insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-W1', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into w1;
    insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-W2', 'Terno completo', 'normal', v_a, 'recepcion') returning id into w2;
    insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-W3', 'Chaqueta', 'normal', v_a, 'listo') returning id into w3;
    insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-W4', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into w4;
    revoke insert, update, delete on prenda_pasada, prenda_historial, pipeline_puntos from authenticated;

    perform pg_temp.como(e_alm);
    v_err := pg_temp.mensaje(format('update prenda_pasada set etapa = %L where id = %L', 'listo', w4));
    if v_err like '%permission denied%' then
      r := r || '[ok] caso 11a: simulada la 0122, authenticated ya no hace update directo;';
    else
      r := r || format('[FALLA] caso 11a: el revoke simulado no cerró la tabla (%s);', v_err);
    end if;

    begin
      perform pipeline_avanzar(w1, 'lavado');
      perform pipeline_deshacer(w1, 'recepcion');
      perform pg_temp.dueno();
      select count(*) into v_n from pipeline_puntos where pasada_id = w1;
      select count(*) into v_n2 from prenda_historial where pasada_id = w1 and registrado_por = e_alm;
      select etapa into v_etapa from prenda_pasada where id = w1;
      if v_n = 0 and v_n2 = 2 and v_etapa = 'recepcion' then
        r := r || '[ok] caso 11b: avanzar y deshacer (almacén) funcionan con las tablas cerradas;';
      else
        r := r || format('[FALLA] caso 11b: puntos=%s historial=%s etapa=%s;', v_n, v_n2, v_etapa);
      end if;

      perform pg_temp.como(e_alm);
      -- H-7: se rechaza desde control de calidad.
      perform pipeline_avanzar(w1, 'lavado');
      perform pipeline_avanzar(w1, 'empatado');
      perform pipeline_avanzar(w1, 'refaccion');
      perform pipeline_avanzar(w1, 'planchado');
      perform pipeline_avanzar(w1, 'control_calidad');
      perform pipeline_rechazar(w1, 'recepcion', p_motivo => 'prueba');
      perform pg_temp.dueno();
      select etapa into v_etapa from prenda_pasada where id = w1;
      select count(*) into v_n from prenda_historial
        where pasada_id = w1 and obs like 'Rechazado%' and registrado_por = e_alm;
      if v_n = 1 and v_etapa = 'recepcion' then
        r := r || '[ok] caso 11c: pipeline_rechazar funciona con las tablas cerradas;';
      else
        r := r || format('[FALLA] caso 11c: rechazos=%s etapa=%s;', v_n, v_etapa);
      end if;

      perform pg_temp.como(e_alm);
      perform pipeline_dividir(w2);
      perform pipeline_deshacer_division(w2);
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_historial
        where pasada_id = w2 and registrado_por = e_alm
          and (obs like 'Terno dividido%' or obs like 'Deshacer división%');
      if v_n = 2 then
        r := r || '[ok] caso 11d: dividir y deshacer_division funcionan con las tablas cerradas;';
      else
        r := r || format('[FALLA] caso 11d: filas=%s (esperaba 2);', v_n);
      end if;

      perform pg_temp.como(e_alm);
      perform pipeline_enviar(w3, v_a);
      perform pg_temp.calificar_destino(w3, true, '', '');
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_pasada where id = w3 and envio_id is not null;
      select count(*) into v_n2 from prenda_calificacion where pasada_id = w3 and calificador_id is not null;  -- 0181: califica la tienda destino
      if v_n = 1 and v_n2 = 1 then
        r := r || '[ok] caso 11e: enviar y calificar funcionan con las tablas cerradas;';
      else
        r := r || format('[FALLA] caso 11e: enviada=%s calificacion=%s;', v_n, v_n2);
      end if;
    exception when others then
      r := r || format('[FALLA] caso 11: una RPC lanzó %s;', sqlerrm);
    end;

    -- Tienda de OTRA sede: 'Prenda no encontrada' y no se escribe nada.
    perform pg_temp.como(e_tb);
    v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', w4, 'lavado'));
    v_err2 := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', w4, 'recepcion'));
    perform pg_temp.dueno();
    select count(*) into v_n from prenda_historial where pasada_id = w4;
    select etapa into v_etapa from prenda_pasada where id = w4;
    if v_err like '%Prenda no encontrada%' and v_err2 like '%Prenda no encontrada%'
       and v_n = 0 and v_etapa = 'recepcion'
       and not exists (select 1 from pipeline_puntos where pasada_id = w4) then
      r := r || '[ok] caso 11f: una tienda de otra sede recibe Prenda no encontrada y no se escribe nada;';
    else
      r := r || format('[FALLA] caso 11f: avanzar=%s deshacer=%s historial=%s etapa=%s;', v_err, v_err2, v_n, v_etapa);
    end if;

    -- ── 12) Alineación con la 0122 (H-7) y hallazgos del verificador (spec §13) ────────────────
    declare
      x1 uuid; x2 uuid; x3 uuid; x4 uuid; x5 uuid; x6 uuid; x7 uuid; v_neg int;
    begin
      perform pg_temp.dueno();
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X1', 'Chaqueta', 'normal', v_a, 'lavado') returning id into x1;
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X2', 'Chaqueta', 'normal', v_a, 'control_calidad') returning id into x2;
      insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id) values (x2, 'lavado', 'empatado', e_alm);
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X3', 'Chaqueta', 'normal', v_a, 'listo') returning id into x3;
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X4', 'Chaqueta', 'normal', v_a, 'listo') returning id into x4;
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X5', 'Chaqueta', 'normal', v_a, 'listo') returning id into x5;
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X6', 'Chaqueta', 'normal', v_a, 'lavado') returning id into x6;
      insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa) values ('P0115-X7', 'Chaqueta', 'normal', v_a, 'control_calidad') returning id into x7;

      perform pg_temp.como(e_alm);
      -- 12a) rechazar desde una etapa que no es control de calidad
      begin perform pipeline_rechazar(x1, 'recepcion', p_motivo => 'prueba'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      -- 12b) rechazo doble
      perform pipeline_rechazar(x2, 'lavado', p_motivo => 'prueba');
      begin perform pipeline_rechazar(x2, 'lavado', p_motivo => 'prueba'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_historial where pasada_id = x1;
      select count(*) into v_neg from pipeline_puntos where pasada_id = x2 and empleado_id = e_alm and puntos < 0;
      if v_err like 'TRANSICION:%' and v_n = 0 and (select etapa from prenda_pasada where id = x1) = 'lavado' then
        r := r || '[ok] caso 12a: rechazar desde una etapa que no es control de calidad lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 12a: err=%s historial=%s;', v_err, v_n);
      end if;
      if v_err2 like 'TRANSICION:%' and v_neg = 1 then
        r := r || '[ok] caso 12b: el rechazo doble lanza TRANSICION y el culpable sólo tiene un negativo;';
      else
        r := r || format('[FALLA] caso 12b: err=%s negativos=%s (esperaba 1);', v_err2, v_neg);
      end if;

      -- 12c) calificar una prenda no enviada · 12d) observada hacia listo
      perform pg_temp.como(e_alm);
      begin perform pg_temp.calificar_destino(x3, true, '', ''); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      perform pipeline_enviar(x4, v_a);
      begin perform pg_temp.calificar_destino(x4, false, 'listo', 'x'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err like 'TRANSICION:%' and (select etapa from prenda_pasada where id = x3) = 'listo'
         and not exists (select 1 from prenda_calificacion where pasada_id = x3) then
        r := r || '[ok] caso 12c: calificar una prenda no enviada lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 12c: err=%s;', v_err);
      end if;
      if v_err2 like 'TRANSICION:%' and (select etapa from prenda_pasada where id = x4) = 'enviado'
         and not exists (select 1 from prenda_calificacion where pasada_id = x4) then
        r := r || '[ok] caso 12d: calificar observada hacia listo lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 12d: err=%s;', v_err2);
      end if;

      -- 12e) la tienda DESTINO (sede B) del envío de una prenda de la sede A califica
      perform pg_temp.como(e_alm);
      perform pipeline_enviar(x5, v_b);
      perform pg_temp.como(e_tb);
      begin perform pipeline_calificar(x5, true, '', ''); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err = 'EJECUTO' and (select etapa from prenda_pasada where id = x5) = 'recibido'
         and exists (select 1 from prenda_calificacion where pasada_id = x5 and calificador_id = e_tb) then
        r := r || '[ok] caso 12e: la tienda destino del envío califica con éxito;';
      else
        r := r || format('[FALLA] caso 12e: err=%s;', v_err);
      end if;

      -- 12f) deshacer de un deshacer
      perform pg_temp.como(e_alm);
      perform pipeline_avanzar(x6, 'empatado');
      perform pipeline_deshacer(x6, 'lavado');
      begin perform pipeline_deshacer(x6, 'empatado'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err like 'TRANSICION:%' and (select etapa from prenda_pasada where id = x6) = 'lavado' then
        r := r || '[ok] caso 12f: deshacer de un deshacer lanza TRANSICION y la prenda no se mueve;';
      else
        r := r || format('[FALLA] caso 12f: err=%s;', v_err);
      end if;

      -- 12g) deshacer desde listo deja aprobada = false
      perform pg_temp.como(e_alm);
      perform pipeline_avanzar(x7, 'listo');
      perform pipeline_deshacer(x7, 'control_calidad');
      perform pg_temp.dueno();
      if (select aprobada from prenda_pasada where id = x7) = false
         and (select etapa from prenda_pasada where id = x7) = 'control_calidad' then
        r := r || '[ok] caso 12g: deshacer desde listo deja aprobada = false;';
      else
        r := r || '[FALLA] caso 12g: la prenda quedó aprobada tras deshacer desde listo;';
      end if;
    end;
  end;

  raise exception 'RESULTADO 0115 --> %', r;
end $$;
