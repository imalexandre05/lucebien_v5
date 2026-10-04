-- Prueba de la migración 0110_codigo_personal.sql
--
-- Contrato: docs/superpowers/specs/pipeline/2026-10-04-codigo-personal-design.md §4 y §6.1.
-- Esta prueba se escribió ANTES que la migración (Zone Guard): si falla, se corrige el código,
-- nunca se afloja la prueba sin antes corregir y confirmar la spec.
--
-- QUÉ COMPRUEBA (cada caso deja un [ok] o un [FALLA] en la línea RESULTADO):
--   1. Código válido → ok:true + token. Con el token, pipeline_avanzar manda los puntos, la
--      fila de prenda_historial y lavador_id al DUEÑO DEL CÓDIGO, y `registrado_por` guarda a
--      quien tenía la sesión.
--   2. Código inválido → ok:false SIN excepción y el intento QUEDA REGISTRADO en codigo_intentos
--      (si la función hiciera raise, el rollback lo borraría y el límite nunca se alcanzaría).
--   3. Empleado suspendido (activo = false) → su código no da token; y un token ya emitido deja
--      de valer en cuanto se suspende.
--   4. Límite: 5 fallos en 15 min desde la misma sesión → el 6.º intento responde bloqueado aun
--      con el código correcto.
--   5. Token emitido a OTRA sesión → pipeline_avanzar lanza 'CODIGO:' y no escribe nada.
--   6. Token vencido → pipeline_avanzar lanza 'CODIGO:' y no escribe nada.
--   7. pipeline_avanzar_tanda con token malo → lanza error y NO mueve ninguna prenda (el bucle
--      de la tanda traga excepciones por prenda: el token se tiene que resolver antes).
--   8. p_operador null → comportamiento de hoy: el actor es auth.uid().
--   9. Un authenticated no puede leer codigo_operadores ni codigo_intentos (nadie ve tokens ni
--      intentos por PostgREST).
--
-- MONTAJE. Todo sintético (ningún empleado real): cuatro sesiones con rol 'encargado_almacen'
-- (para que la RLS de pipeline las deje operar) y dos operadores con código propio. Los códigos
-- llevan prefijo 'P0110' para no chocar con ninguno real.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; eso aborta la transacción y
-- no queda ni una fila. El "error" final ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0110
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0110")
--
-- NO SE HA EJECUTADO contra ninguna base al escribir este archivo: la migración no está aplicada
-- en ningún lado (la aplica el dueño después de revisar).

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

do $$
declare
  s_a uuid; s_b uuid; s_c uuid; s_d uuid;   -- sesiones (quien tiene el equipo abierto)
  op1 uuid; op2 uuid;                       -- operadores con código propio
  v_sede text;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;       -- prendas de prueba
  j jsonb; v_token uuid; v_token_op2 uuid;
  v_n int; v_err text; v_emp uuid; v_reg uuid; v_etapa text;
  r text := '';
begin
  -- ── Montaje (como dueño de las tablas) ─────────────────────────────────────────────────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-SA', 'Prueba 0110 Sesion A', 'SA', 'encargado_almacen') returning id into s_a;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-SB', 'Prueba 0110 Sesion B', 'SB', 'encargado_almacen') returning id into s_b;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-SC', 'Prueba 0110 Sesion C', 'SC', 'encargado_almacen') returning id into s_c;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-SD', 'Prueba 0110 Sesion D', 'SD', 'encargado_almacen') returning id into s_d;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-O1', 'Prueba 0110 Operador 1', 'O1', 'confeccionista') returning id into op1;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0110-O2', 'Prueba 0110 Operador 2', 'O2', 'confeccionista') returning id into op2;

  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0110-1', 'Chaqueta', v_sede, 'recepcion') returning id into p1;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0110-2', 'Chaqueta', v_sede, 'recepcion') returning id into p2;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0110-3', 'Chaqueta', v_sede, 'recepcion') returning id into p3;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0110-4', 'Chaqueta', v_sede, 'recepcion') returning id into p4;

  r := r || 'montaje=ok; ';

  -- ── 1) Código válido → token; con el token los puntos van al dueño del código ──────────────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0110-O1', 'equipo-prueba');
  if (j->>'ok')::boolean and (j->>'token') is not null and j->>'nombre' = 'Prueba 0110 Operador 1' then
    r := r || '[ok] caso 1a: código válido devuelve ok, token y nombre;';
    v_token := (j->>'token')::uuid;
  else
    r := r || format('[FALLA] caso 1a: respuesta inesperada %s;', j);
  end if;

  perform pipeline_avanzar(p1, 'lavado', v_token);

  perform pg_temp.dueno();
  select empleado_id into v_emp from pipeline_puntos where pasada_id = p1;
  if v_emp = op1 then
    r := r || '[ok] caso 1b: pipeline_puntos.empleado_id es el dueño del código;';
  else
    r := r || format('[FALLA] caso 1b: pipeline_puntos.empleado_id = %s, esperaba %s;', v_emp, op1);
  end if;
  select empleado_id, registrado_por into v_emp, v_reg from prenda_historial where pasada_id = p1 and etapa_nueva = 'lavado';
  if v_emp = op1 and v_reg = s_a then
    r := r || '[ok] caso 1c: historial.empleado_id = dueño del código y registrado_por = sesión;';
  else
    r := r || format('[FALLA] caso 1c: historial empleado=%s registrado_por=%s, esperaba %s / %s;', v_emp, v_reg, op1, s_a);
  end if;
  select lavador_id into v_emp from prenda_pasada where id = p1;
  if v_emp = op1 then
    r := r || '[ok] caso 1d: lavador_id es el dueño del código;';
  else
    r := r || format('[FALLA] caso 1d: lavador_id = %s;', v_emp);
  end if;

  -- ── 2) Código inválido → ok:false sin excepción, y el intento queda escrito ────────────────
  perform pg_temp.como(s_b);
  begin
    j := pipeline_validar_codigo('NO-EXISTE-0110', 'equipo-prueba');
    v_err := null;
  exception when others then
    v_err := sqlerrm;
  end;
  perform pg_temp.dueno();
  select count(*) into v_n from codigo_intentos where sesion_uid = s_b and not ok;
  if v_err is null and not (j->>'ok')::boolean and v_n = 1 then
    r := r || '[ok] caso 2: código malo devuelve ok:false sin raise y el intento queda registrado;';
  else
    r := r || format('[FALLA] caso 2: err=%s respuesta=%s intentos_registrados=%s;', v_err, j, v_n);
  end if;

  -- ── 3) Suspendido: su código no da token; un token ya emitido deja de valer ────────────────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0110-O2', 'equipo-prueba');
  v_token_op2 := (j->>'token')::uuid;
  perform pg_temp.dueno();
  update empleados set activo = false where id = op2;
  perform pg_temp.como(s_a);
  begin
    perform pipeline_avanzar(p2, 'lavado', v_token_op2);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err like 'CODIGO:%' then
    r := r || '[ok] caso 3a: el token de un empleado suspendido deja de valer;';
  else
    r := r || format('[FALLA] caso 3a: err=%s;', v_err);
  end if;
  j := pipeline_validar_codigo('P0110-O2', 'equipo-prueba');
  if not (j->>'ok')::boolean and (j->>'token') is null then
    r := r || '[ok] caso 3b: el código de un suspendido no emite token;';
  else
    r := r || format('[FALLA] caso 3b: respuesta %s;', j);
  end if;

  -- ── 5) Token emitido a OTRA sesión → rechazado, sin escribir nada ───────────────────────────
  perform pg_temp.como(s_c);
  begin
    perform pipeline_avanzar(p2, 'lavado', v_token);   -- v_token lo emitió s_a
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p2;
  if v_err like 'CODIGO:%' and v_etapa = 'recepcion' then
    r := r || '[ok] caso 5: el token de otra sesión se rechaza y la prenda no se mueve;';
  else
    r := r || format('[FALLA] caso 5: err=%s etapa=%s;', v_err, v_etapa);
  end if;

  -- ── 6) Token vencido → rechazado ────────────────────────────────────────────────────────────
  update codigo_operadores set expira_en = now() - interval '1 minute' where token = v_token;
  perform pg_temp.como(s_a);
  begin
    perform pipeline_avanzar(p2, 'lavado', v_token);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p2;
  if v_err like 'CODIGO:%' and v_etapa = 'recepcion' then
    r := r || '[ok] caso 6: el token vencido se rechaza y la prenda no se mueve;';
  else
    r := r || format('[FALLA] caso 6: err=%s etapa=%s;', v_err, v_etapa);
  end if;

  -- ── 7) Tanda con token malo → error y ninguna prenda se mueve ───────────────────────────────
  perform pg_temp.como(s_a);
  begin
    perform pipeline_avanzar_tanda(array[p2, p3], 'lavado', gen_random_uuid());
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where id in (p2, p3) and etapa <> 'recepcion';
  if v_err like 'CODIGO:%' and v_n = 0 then
    r := r || '[ok] caso 7: la tanda con token malo falla y no mueve ninguna prenda;';
  else
    r := r || format('[FALLA] caso 7: err=%s prendas_movidas=%s;', v_err, v_n);
  end if;

  -- ── 8) p_operador null → el actor es la sesión, como hoy ────────────────────────────────────
  perform pg_temp.como(s_a);
  perform pipeline_avanzar(p3, 'lavado');
  perform pg_temp.dueno();
  select empleado_id into v_emp from pipeline_puntos where pasada_id = p3;
  select registrado_por into v_reg from prenda_historial where pasada_id = p3 and etapa_nueva = 'lavado';
  if v_emp = s_a and v_reg = s_a then
    r := r || '[ok] caso 8: sin token el actor es auth.uid() (comportamiento de hoy);';
  else
    r := r || format('[FALLA] caso 8: puntos a %s, registrado_por %s, esperaba %s;', v_emp, v_reg, s_a);
  end if;

  -- ── 4) Límite: 5 fallos en 15 min → el 6.º intento bloqueado aun con código correcto ────────
  perform pg_temp.como(s_d);
  for i in 1..5 loop
    perform pipeline_validar_codigo('MALO-' || i, 'equipo-prueba');
  end loop;
  j := pipeline_validar_codigo('P0110-O1', 'equipo-prueba');   -- correcto, pero ya bloqueado
  if not (j->>'ok')::boolean and (j->>'token') is null and coalesce((j->>'bloqueado_min')::int, 0) > 0 then
    r := r || '[ok] caso 4: tras 5 fallos el código correcto responde bloqueado y no emite token;';
  else
    r := r || format('[FALLA] caso 4: respuesta %s;', j);
  end if;

  -- ── 9) Un authenticated no lee tokens ni intentos ───────────────────────────────────────────
  perform pg_temp.como(s_a);
  select count(*) into v_n from codigo_operadores;
  if v_n = 0 then
    r := r || '[ok] caso 9a: authenticated no ve ninguna fila de codigo_operadores;';
  else
    r := r || format('[FALLA] caso 9a: ve %s tokens;', v_n);
  end if;
  select count(*) into v_n from codigo_intentos;
  if v_n = 0 then
    r := r || '[ok] caso 9b: un no-admin no ve ninguna fila de codigo_intentos;';
  else
    r := r || format('[FALLA] caso 9b: ve %s intentos;', v_n);
  end if;

  raise exception 'RESULTADO 0110 --> %', r;
end $$;
