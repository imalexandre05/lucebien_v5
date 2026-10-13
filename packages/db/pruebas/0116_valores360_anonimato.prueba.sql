-- Prueba de la migración 0116_valores360_anonimato.sql
--
-- Spec: docs/superpowers/specs/evaluaciones/2026-10-05-valores360-anonimato-design.md §3.
-- Decisión del dueño (05-oct-2026): sólo el administrador puede ver quién puntuó a quién.
--
-- Comprueba:
--   1. un encargado CON permiso `datos_personas` ya no alcanza `evaluador_id` (ni ninguna fila ajena),
--   2. el administrador sigue viendo todo y quien puntuó sigue viendo sólo lo suyo,
--   3. `valores_mis_puntajes` devuelve vacío con menos del mínimo (default 3) y, con el mínimo,
--      UNA fila con la cantidad y los promedios por valor — nunca el vector de un evaluador,
--   4. el mínimo se lee de config y un valor inválido (0, 'abc') cae a 3 en vez de apagar el anonimato,
--   5. `anon` no ejecuta la función,
--   6. spec §6: el resultado de un no-administrador es SIEMPRE de un mes cerrado y con mínimo, nunca en
--      vivo — por la función, y por `evaluacion_componentes` llamada a sí mismo; el administrador
--      sigue viendo el mes en curso. Los meses de prueba son 2000-0x (cerrados); el mes en curso se
--      calcula en hora Perú.
--
-- Cada comprobación de la función va en su propio bloque con `exception`: contra el estado ANTERIOR
-- a la migración (donde la función no tiene `cantidad`) la prueba tiene que fallar con [FALLA], no
-- abortar a medias.
--
-- SE DESCARTA SOLA: crea su propio equipo y termina lanzando una excepción con el resultado, que
-- aborta la transacción y no deja ni una fila. El "error" final ES la salida esperada.
--
-- OJO: sin cambiar de rol las políticas no se evalúan. El montaje va ANTES del cambio de rol, y
-- para tocar `config` a mitad de la prueba se vuelve al rol de sesión y se regresa.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0116

do $$
declare
  v_super   text := session_user;
  admin_id  uuid := gen_random_uuid();
  enc_id    uuid := gen_random_uuid();   -- encargado con datos_personas
  evaluada  uuid := gen_random_uuid();
  ev1       uuid := gen_random_uuid();
  ev2       uuid := gen_random_uuid();
  ev3       uuid := gen_random_uuid();
  r         text := '';
  n         int;
  c         int;
  p_int     numeric;
  p_res     numeric;
  mes_hoy   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM');
  j         jsonb;
  r_mes     text;
begin
  insert into empleados(id, cod, nombre, iniciales, rol) values
    (admin_id, 'T-ADM', 'Prueba Admin 0116',   'PA', 'admin'),
    (enc_id,   'T-ENC', 'Prueba Encargado 0116','PE', 'encargado_tienda'),
    (evaluada, 'T-EVD', 'Prueba Evaluada 0116', 'PV', 'confeccionista'),
    (ev1,      'T-EV1', 'Prueba Evaluador Uno 0116',  'P1', 'confeccionista'),
    (ev2,      'T-EV2', 'Prueba Evaluador Dos 0116',  'P2', 'confeccionista'),
    (ev3,      'T-EV3', 'Prueba Evaluador Tres 0116', 'P3', 'confeccionista');

  -- El encargado SÍ tiene `datos_personas`: ése es justamente el caso que la policy dejaba pasar.
  insert into permisos_modulos(rol, modulo, acciones) values ('encargado_tienda', 'datos_personas', array['ver'])
  on conflict (rol, modulo) do update set acciones = array['ver'];

  -- 2000-01: 2 evaluaciones (no alcanza). 2000-02: 3 (alcanza). 2000-03: 3 más, para el mínimo en 4.
  insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud) values
    (ev1, evaluada, '2000-01', 5, 5, 5, 5, 5, 5),
    (ev2, evaluada, '2000-01', 1, 1, 1, 1, 1, 1),
    (ev1, evaluada, '2000-02', 3, 5, 4, 4, 4, 4),
    (ev2, evaluada, '2000-02', 4, 5, 4, 4, 4, 4),
    (ev3, evaluada, '2000-02', 5, 4, 4, 4, 4, 4),
    (ev1, evaluada, '2000-03', 3, 3, 3, 3, 3, 3),
    (ev2, evaluada, '2000-03', 3, 3, 3, 3, 3, 3),
    (ev3, evaluada, '2000-03', 3, 3, 3, 3, 3, 3),
    -- 2000-04: 2 votos (cerrado, sin mínimo). Mes en curso (hora Perú): 3 votos, que NO se ven en vivo.
    (ev1, evaluada, '2000-04', 4, 4, 4, 4, 4, 4),
    (ev2, evaluada, '2000-04', 4, 4, 4, 4, 4, 4),
    (ev1, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5),
    (ev2, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5),
    (ev3, evaluada, mes_hoy, 5, 5, 5, 5, 5, 5);
  insert into config(clave, valor) values ('valores_min_evaluaciones', '3')
  on conflict (clave) do update set valor = '3';

  perform set_config('role', 'authenticated', true);

  -- ── 1) El encargado con datos_personas ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', enc_id, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_valores;
  if n = 0 then r := r || ' [ok] el encargado con datos_personas no alcanza ninguna fila (ni evaluador_id);';
  else          r := r || format(' [FALLA] el encargado con datos_personas lee %s fila(s) con evaluador_id;', n); end if;

  -- ── 2) Administrador y evaluador ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_valores where evaluador_id in (ev1, ev2, ev3);
  if n = 13 then r := r || ' [ok] el administrador ve las 13 filas con su evaluador;';
  else           r := r || format(' [FALLA] el administrador ve %s fila(s) en vez de 13;', n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ev1, 'role','authenticated')::text, true);
  select count(*), count(*) filter (where evaluador_id = ev1) into n, c from evaluaciones_valores;
  if n = 5 and c = 5 then r := r || ' [ok] quien puntuó ve sólo lo que envió (5 de 5 suyas);';
  else                    r := r || format(' [FALLA] quien puntuó ve %s fila(s), %s suyas (esperado 5 y 5);', n, c); end if;

  -- ── 3) La función ────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', evaluada, 'role','authenticated')::text, true);

  select count(*) into n from evaluaciones_valores;
  if n = 0 then r := r || ' [ok] la evaluada no lee las filas que la nombran;';
  else          r := r || format(' [FALLA] la evaluada lee %s fila(s) suyas;', n); end if;

  begin
    execute $q$ select count(*) from valores_mis_puntajes('2000-01') $q$ into n;
    if n = 0 then r := r || ' [ok] con 2 evaluaciones no se devuelve nada;';
    else          r := r || format(' [FALLA] con 2 evaluaciones devolvió %s fila(s);', n); end if;
  exception when others then r := r || format(' [FALLA] la función con 2 evaluaciones: %s;', sqlerrm); end;

  begin
    execute $q$ select count(*), max(cantidad), max(integridad), max(respeto) from valores_mis_puntajes('2000-02') $q$
      into n, c, p_int, p_res;
    if n = 1 and c = 3 and p_int = 4.00 and p_res = 4.67 then
      r := r || ' [ok] con 3 evaluaciones: una fila, cantidad 3 y promedios 4.00 / 4.67;';
    else
      r := r || format(' [FALLA] con 3 evaluaciones: filas=%s cantidad=%s integridad=%s respeto=%s;', n, c, p_int, p_res);
    end if;
  exception when others then r := r || format(' [FALLA] la función con 3 evaluaciones: %s;', sqlerrm); end;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'valores_mis_puntajes'
    and pg_get_function_result(p.oid) ~* '(evaluador|evaluado_id|\mid\M|created)';
  if n = 0 then r := r || ' [ok] la función no expone evaluador, id ni fechas de envío;';
  else          r := r || ' [FALLA] la función expone evaluador, id o fechas;'; end if;

  -- ── 4) El mínimo sale de config ──────────────────────────────────────────────────────────
  perform set_config('role', v_super, true);
  update config set valor = '4' where clave = 'valores_min_evaluaciones';
  perform set_config('role', 'authenticated', true);
  begin
    execute $q$ select count(*) from valores_mis_puntajes('2000-03') $q$ into n;
    if n = 0 then r := r || ' [ok] con el mínimo en 4 y 3 evaluaciones no se devuelve nada;';
    else          r := r || format(' [FALLA] con el mínimo en 4 y 3 evaluaciones devolvió %s fila(s);', n); end if;
  exception when others then r := r || format(' [FALLA] mínimo 4: %s;', sqlerrm); end;

  foreach c in array array[0, 1, 2] loop  -- 0 = '0'; 1 = 'abc'; 2 = desborda int
    perform set_config('role', v_super, true);
    update config set valor = case c when 0 then '0' when 1 then 'abc' else '99999999999' end where clave = 'valores_min_evaluaciones';
    perform set_config('role', 'authenticated', true);
    begin
      execute $q$ select count(*) from valores_mis_puntajes('2000-01') $q$ into n;
      if n = 0 then r := r || format(' [ok] mínimo inválido (%s) cae a 3: con 2 evaluaciones no se devuelve nada;', case c when 0 then '0' when 1 then 'abc' else '99999999999' end);
      else          r := r || format(' [FALLA] mínimo inválido (%s) apagó el anonimato: devolvió %s fila(s);', case c when 0 then '0' when 1 then 'abc' else '99999999999' end, n); end if;
    exception when others then r := r || format(' [FALLA] mínimo inválido: %s;', sqlerrm); end;
  end loop;

  -- ── 5) anon ──────────────────────────────────────────────────────────────────────────────
  if has_function_privilege('anon', 'public.valores_mis_puntajes(text)', 'execute') then
    r := r || ' [FALLA] anon ejecuta valores_mis_puntajes;';
  else
    r := r || ' [ok] anon no ejecuta valores_mis_puntajes;';
  end if;

  -- ── 6) Nunca en vivo: sólo un mes CERRADO y con mínimo (spec §6) ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', evaluada, 'role','authenticated')::text, true);

  -- 6a) El mes en curso tiene 3 votos y aun así no se ve nada.
  begin
    execute format($q$ select count(*) from valores_mis_puntajes(%L) $q$, mes_hoy) into n;
    if n = 0 then r := r || ' [ok] con 3 votos en el mes en curso no se ve nada;';
    else          r := r || format(' [FALLA] el mes en curso se ve en vivo (%s fila);', n); end if;
  exception when others then r := r || format(' [FALLA] mes en curso: %s;', sqlerrm); end;

  -- 6b) Sin parámetro: el último mes cerrado que cumple. 2000-04 es el más reciente pero sólo tiene 2.
  begin
    execute $q$ select count(*), max(cantidad) from valores_mis_puntajes() $q$ into n, c;
    execute $q$ select max(mes) from valores_mis_puntajes() $q$ into r_mes;
    if n = 1 and r_mes = '2000-03' and c = 3 then
      r := r || ' [ok] sin parámetro devuelve el último mes cerrado que cumple (2000-03), no el 2000-04 con 2 votos ni el mes en curso;';
    else
      r := r || format(' [FALLA] sin parámetro: filas=%s mes=%s cantidad=%s;', n, r_mes, c);
    end if;
  exception when others then r := r || format(' [FALLA] sin parámetro: %s;', sqlerrm); end;

  -- 6c) evaluacion_componentes a sí mismo: en vivo no, en mes cerrado con mínimo sí.
  begin
    j := public.evaluacion_componentes(evaluada, (mes_hoy || '-01')::date, (mes_hoy || '-01')::date);
    if (j -> 'valores') = 'null'::jsonb and (j -> 'valoresCantidad') = 'null'::jsonb then
      r := r || ' [ok] evaluacion_componentes a sí mismo no da valores ni cantidad en el mes en curso;';
    else
      r := r || format(' [FALLA] evaluacion_componentes a sí mismo filtra el mes en curso: valores=%s cantidad=%s;', j -> 'valores', j -> 'valoresCantidad');
    end if;
    j := public.evaluacion_componentes(evaluada, '2000-04-01', '2000-04-30');
    if (j -> 'valores') = 'null'::jsonb and (j -> 'valoresCantidad') = 'null'::jsonb then
      r := r || ' [ok] ni en un mes cerrado con 2 votos (sin mínimo);';
    else
      r := r || format(' [FALLA] evaluacion_componentes filtra un mes cerrado sin mínimo: cantidad=%s;', j -> 'valoresCantidad');
    end if;
    j := public.evaluacion_componentes(evaluada, '2000-02-01', '2000-02-29');
    if (j ->> 'valoresCantidad')::int = 3 and (j ->> 'valores') is not null then
      r := r || ' [ok] sí en un mes cerrado con 3 votos;';
    else
      r := r || format(' [FALLA] mes cerrado con mínimo no se ve: valores=%s cantidad=%s;', j -> 'valores', j -> 'valoresCantidad');
    end if;
  exception when others then r := r || format(' [FALLA] evaluacion_componentes (propio): %s;', sqlerrm); end;

  -- 6d) El administrador, igual que antes: en vivo y sin mínimo (la nota del mes no se toca).
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  begin
    j := public.evaluacion_componentes(evaluada, (mes_hoy || '-01')::date, (mes_hoy || '-01')::date);
    if (j ->> 'valoresCantidad')::int = 3 and (j ->> 'valores') is not null then
      r := r || ' [ok] el administrador sigue viendo el mes en curso en evaluacion_componentes;';
    else
      r := r || format(' [FALLA] el administrador perdió el mes en curso: valores=%s cantidad=%s;', j -> 'valores', j -> 'valoresCantidad');
    end if;
    j := public.evaluacion_componentes(evaluada, '2000-04-01', '2000-04-30');
    if (j ->> 'valoresCantidad')::int = 2 and (j ->> 'valores') is not null then
      r := r || ' [ok] y un mes con 2 votos;';
    else
      r := r || format(' [FALLA] el administrador no ve un mes con 2 votos: cantidad=%s;', j -> 'valoresCantidad');
    end if;
  exception when others then r := r || format(' [FALLA] evaluacion_componentes (admin): %s;', sqlerrm); end;

  raise exception 'RESULTADO 0116 -->%', r;
end $$;
