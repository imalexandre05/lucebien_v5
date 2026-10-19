-- Prueba de la migración 0112_codigo_personal.sql
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
--  11. authenticated no ejecuta private.codigo_pin_valido (el helper que compara el PIN).
--  12. Las otras seis RPC (rechazar, enviar, deshacer, dividir, deshacer_division, calificar) con
--      token (actor = dueño del código, registrado_por = sesión) y enviar sin token (= sesión).
--  13. Cada acción con token renueva expira_en.
--  14. Un valor no entero en config (p. ej. '5.5') no rompe pipeline_validar_codigo.
--  15. Equipo no aprobado/compartido o ausente → motivo 'equipo_no_compartido', sin intento.
--  16. El bloqueo de una sesión deja UNA notificación para el rol admin (motor existente).
--  17. pipeline_cerrar_operador revoca el token (sólo los de la propia sesión).
--  18. Vida máxima del token desde su emisión (codigo_operador_max_h, default 8).
--  ENMIENDA 06-oct (spec §0): el código es usuario (`cod`) + PIN propio con hash.
--  19. El `cod` solo ya no da token; el PIN malo responde intentos_restantes.
--  20. pipeline_definir_pin: corto, trivial (repetido, secuencia, igual al cod) → rechazado; se guarda
--      sólo el hash; cambiarlo exige el PIN actual; cambiarlo revoca los tokens de la persona.
--  21. Sólo el admin borra un PIN; el PIN borrado deja de valer.
--  22. Límite por persona: 5 fallos contra una persona desde DOS sesiones → el PIN correcto desde
--      una TERCERA sesión responde bloqueado, y queda una notificación codigo_persona_bloqueada.
--  23. Cuenta compartida (empleados.cuenta_compartida): sin token → CODIGO: en las RPC y no se
--      mueve nada; con token funciona; no define PIN; sólo el admin la marca.
--  24. H-1: A avanza, B avanza y A deshace lo de B → B pierde ESE punto y A conserva el suyo.
--  25. H-2: deshacer a una etapa que no es la del último movimiento → TRANSICION: sin escribir.
--  28. E-7 (alineación con la 0122, H-7): rechazar sólo desde control_calidad (y no dos veces),
--      calificar sólo lo enviado (la tienda destino sí califica), deshacer sólo un avance real
--      (no un 'Deshacer') y desde listo deja aprobada = false.
--  10. dispositivo_compartido(device): true sólo para un equipo APROBADO y marcado compartido;
--      falso para uno no compartido, uno no aprobado y uno desconocido. La validación devuelve
--      además ventana_min (la UI la usa para su cuenta de inactividad).
--
-- MONTAJE. Todo sintético (ningún empleado real): cuatro sesiones con rol 'encargado_almacen'
-- (para que la RLS de pipeline las deje operar) y dos operadores con código propio. Los códigos
-- llevan prefijo 'P0112' para no chocar con ninguno real.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; eso aborta la transacción y
-- no queda ni una fila. El "error" final ES la salida esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0112
-- (o pegar el archivo entero, de una sola vez, en el SQL editor de Supabase —proyecto scilb— y
-- leer el mensaje de error P0001 que empieza con "RESULTADO 0112")
--
-- Se corre en un Postgres local con `bash tools/postgres-local.sh probar 0112` (rama del PR #44).
-- La migración no está aplicada en producción (la aplica el dueño después de revisar).

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
  p5 uuid; p6 uuid; p7 uuid; p8 uuid;
  v_exp timestamptz; v_n2 int;
  j jsonb; v_token uuid; v_token_op2 uuid;
  v_n int; v_err text; v_emp uuid; v_reg uuid; v_etapa text;
  v_err2 text; v_err3 text;
  s_e uuid; s_f uuid; s_g uuid; s_h uuid; op3 uuid; op4 uuid; adm uuid; p9 uuid; p10 uuid;
  r text := '';
  v_total numeric;
begin
  -- ── Montaje (como dueño de las tablas) ─────────────────────────────────────────────────────
  select cod into v_sede from sedes order by cod limit 1;
  if v_sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SA', 'Prueba 0112 Sesion A', 'SA', 'encargado_almacen') returning id into s_a;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SB', 'Prueba 0112 Sesion B', 'SB', 'encargado_almacen') returning id into s_b;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SC', 'Prueba 0112 Sesion C', 'SC', 'encargado_almacen') returning id into s_c;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SD', 'Prueba 0112 Sesion D', 'SD', 'encargado_almacen') returning id into s_d;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-O1', 'Prueba 0112 Operador 1', 'O1', 'confeccionista') returning id into op1;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-O2', 'Prueba 0112 Operador 2', 'O2', 'confeccionista') returning id into op2;

  -- Enmienda 06-oct: cada operador define su PIN desde su propia sesión.
  perform pg_temp.como(op1);
  j := pipeline_definir_pin('482913', null);
  if not (j->>'ok')::boolean then raise exception 'montaje: no se pudo definir el PIN de op1: %', j; end if;
  perform pg_temp.como(op2);
  j := pipeline_definir_pin('730561', null);
  if not (j->>'ok')::boolean then raise exception 'montaje: no se pudo definir el PIN de op2: %', j; end if;
  perform pg_temp.dueno();

  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-1', 'Chaqueta', v_sede, 'recepcion') returning id into p1;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-2', 'Chaqueta', v_sede, 'recepcion') returning id into p2;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-3', 'Chaqueta', v_sede, 'recepcion') returning id into p3;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-4', 'Chaqueta', v_sede, 'recepcion') returning id into p4;

  -- El peso de recepción tiene que ser > 0 para que avanzar deje puntos (si el admin lo puso en 0
  -- los casos 1b y 8 fallarían por montaje, no por la migración). Todo se descarta al final.
  insert into config (clave, valor) values ('pts_recepcion', '1')
    on conflict (clave) do update set valor = '1';
  -- Esta prueba cubre el modo usuario + PIN; desde la 0179 el modo por defecto es 'cod'.
  insert into config (clave, valor) values ('codigo_modo', 'pin') on conflict (clave) do update set valor = 'pin';
  insert into config (clave, valor) values ('codigo_exigir_admin', 'false') on conflict (clave) do update set valor = 'false';
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-5', 'Terno completo', v_sede, 'recepcion') returning id into p5;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-6', 'Chaqueta', v_sede, 'listo') returning id into p6;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-7', 'Chaqueta', v_sede, 'listo') returning id into p7;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-8', 'Chaqueta', v_sede, 'recepcion') returning id into p8;

  -- El equipo desde el que se teclea el código tiene que estar aprobado y marcado como compartido.
  insert into dispositivos_autorizados (device_id, estado, compartido) values ('equipo-prueba', 'aprobado', true);

  r := r || 'montaje=ok; ';

  -- ── 1) Código válido → token; con el token los puntos van al dueño del código ──────────────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
  if (j->>'ok')::boolean and (j->>'token') is not null and j->>'nombre' = 'Prueba 0112 Operador 1' then
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
    j := pipeline_validar_codigo('NO-EXISTE-0112', '135790', 'equipo-prueba');
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
  j := pipeline_validar_codigo('P0112-O2', '730561', 'equipo-prueba');
  v_token_op2 := (j->>'token')::uuid;
  perform pg_temp.dueno();
  update empleados set activo = false where id = op2;
  perform pg_temp.como(s_a);
  begin
    perform pipeline_avanzar(p2, 'lavado', v_token_op2);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p2;
  perform pg_temp.como(s_a);
  if v_err like 'CODIGO:%' and v_etapa = 'recepcion' then
    r := r || '[ok] caso 3a: el token de un empleado suspendido deja de valer y la prenda no se mueve;';
  else
    r := r || format('[FALLA] caso 3a: err=%s etapa=%s;', v_err, v_etapa);
  end if;
  j := pipeline_validar_codigo('P0112-O2', '730561', 'equipo-prueba');
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
    perform pipeline_validar_codigo('MALO-' || i, '135790', 'equipo-prueba');
  end loop;
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');   -- correcto, pero ya bloqueado
  if not (j->>'ok')::boolean and (j->>'token') is null and coalesce((j->>'bloqueado_min')::int, 0) > 0 then
    r := r || '[ok] caso 4: tras 5 fallos el código correcto responde bloqueado y no emite token;';
  else
    r := r || format('[FALLA] caso 4: respuesta %s;', j);
  end if;

  -- ── 9) Un authenticated no lee tokens ni intentos ───────────────────────────────────────────
  perform pg_temp.como(s_a);
  begin
    select count(*) into v_n from codigo_operadores;   -- sin grant: lo normal es 'permission denied'
    v_err := null;
  exception when insufficient_privilege then
    v_err := 'denegado'; v_n := 0;
  end;
  if v_n = 0 then
    r := r || '[ok] caso 9a: authenticated no ve ninguna fila de codigo_operadores (' || coalesce(v_err, '0 filas') || ');';
  else
    r := r || format('[FALLA] caso 9a: ve %s tokens;', v_n);
  end if;
  select count(*) into v_n from codigo_intentos;
  if v_n = 0 then
    r := r || '[ok] caso 9b: un no-admin no ve ninguna fila de codigo_intentos;';
  else
    r := r || format('[FALLA] caso 9b: ve %s intentos;', v_n);
  end if;

  -- ── 11) Permisos: el helper del código NO es invocable por authenticated ────────────────────
  perform pg_temp.como(s_a);
  begin
    perform private.codigo_pin_valido(op1, '482913');
    v_err := 'EJECUTO';
  exception when insufficient_privilege then v_err := 'denegado'; end;
  if v_err = 'denegado' then
    r := r || '[ok] caso 11: authenticated no puede ejecutar private.codigo_pin_valido;';
  else
    r := r || '[FALLA] caso 11: authenticated pudo ejecutar el helper del código;';
  end if;

  -- ── 12) Las otras seis RPC con token: actor = dueño del código, registrado_por = sesión ─────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
  v_token := (j->>'token')::uuid;
  perform pipeline_avanzar(p8, 'lavado', v_token);
  perform pipeline_deshacer(p8, 'recepcion', v_token);
  perform pg_temp.dueno();
  select count(*) into v_n from pipeline_puntos where pasada_id = p8;
  select count(*) into v_n2 from prenda_historial
    where pasada_id = p8 and obs = 'Deshacer' and empleado_id = op1 and registrado_por = s_a;
  if v_n = 0 and v_n2 = 1 then
    r := r || '[ok] caso 12a: deshacer con token borra los puntos del dueño del código y lo deja en historial;';
  else
    r := r || format('[FALLA] caso 12a: puntos=%s historial_deshacer=%s;', v_n, v_n2);
  end if;

  perform pg_temp.como(s_a);
  -- H-7: sólo se rechaza desde control de calidad; la prenda llega ahí por avances legítimos.
  perform pipeline_avanzar(p8, 'lavado', v_token);
  perform pipeline_avanzar(p8, 'empatado', v_token);
  perform pipeline_avanzar(p8, 'refaccion', v_token);
  perform pipeline_avanzar(p8, 'planchado', v_token);
  perform pipeline_avanzar(p8, 'control_calidad', v_token);
  perform pipeline_rechazar(p8, 'recepcion', v_token, 'prueba');
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial
    where pasada_id = p8 and obs like 'Rechazado%' and empleado_id = op1 and registrado_por = s_a;
  if v_n = 1 then
    r := r || '[ok] caso 12b: rechazar con token atribuye al dueño del código;';
  else
    r := r || format('[FALLA] caso 12b: filas de rechazo=%s;', v_n);
  end if;

  perform pg_temp.como(s_a);
  perform pipeline_dividir(p5, v_token);
  perform pipeline_deshacer_division(p5, v_token);
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial
    where pasada_id = p5 and empleado_id = op1 and registrado_por = s_a
      and (obs like 'Terno dividido%' or obs like 'Deshacer división%');
  if v_n = 2 then
    r := r || '[ok] caso 12c: dividir y deshacer_division con token atribuyen al dueño del código;';
  else
    r := r || format('[FALLA] caso 12c: filas=%s (esperaba 2);', v_n);
  end if;

  perform pg_temp.como(s_a);
  perform pipeline_enviar(p6, v_sede, v_token);
  perform pipeline_calificar(p6, true, '', '', v_token);
  perform pipeline_enviar(p7, v_sede);   -- sin token: actor = sesión
  perform pg_temp.dueno();
  select count(*) into v_n from envios_prendas e join prenda_pasada p on p.envio_id = e.id
    where p.id = p6 and e.responsable_id = op1;
  select count(*) into v_n2 from prenda_calificacion where pasada_id = p6 and calificador_id = op1;
  if v_n = 1 and v_n2 = 1 then
    r := r || '[ok] caso 12d: enviar y calificar con token atribuyen al dueño del código;';
  else
    r := r || format('[FALLA] caso 12d: envio=%s calificacion=%s;', v_n, v_n2);
  end if;
  select count(*) into v_n from envios_prendas e join prenda_pasada p on p.envio_id = e.id
    where p.id = p7 and e.responsable_id = s_a;
  if v_n = 1 then
    r := r || '[ok] caso 12e: enviar sin token atribuye a la sesión (como hoy);';
  else
    r := r || '[FALLA] caso 12e: enviar sin token no atribuyó a la sesión;';
  end if;

  -- ── 13) Cada acción con token renueva su ventana de inactividad ─────────────────────────────
  update codigo_operadores set expira_en = now() + interval '1 minute' where token = v_token;
  perform pg_temp.como(s_a);
  perform pipeline_avanzar(p8, 'lavado', v_token);
  perform pg_temp.dueno();
  select expira_en into v_exp from codigo_operadores where token = v_token;
  if v_exp > now() + interval '5 minutes' then
    r := r || '[ok] caso 13: una acción con token renueva expira_en;';
  else
    r := r || format('[FALLA] caso 13: expira_en quedó en %s;', v_exp);
  end if;

  -- ── 14) Un valor no entero en config no rompe la validación ─────────────────────────────────
  update config set valor = '5.5' where clave = 'codigo_max_intentos';
  perform pg_temp.como(s_c);
  begin
    j := pipeline_validar_codigo('NO-EXISTE-0112', '135790', 'equipo-prueba');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err is null and (j->>'ok') = 'false' then
    r := r || '[ok] caso 14: config con valor no entero no rompe pipeline_validar_codigo;';
  else
    r := r || format('[FALLA] caso 14: err=%s;', v_err);
  end if;
  perform pg_temp.dueno();
  update config set valor = '5' where clave = 'codigo_max_intentos';

  -- ── 15) Equipo no compartido / no aprobado / ausente → motivo y SIN intento registrado ──────
  perform pg_temp.dueno();
  insert into dispositivos_autorizados (device_id, estado, compartido) values ('equipo-personal-0112', 'aprobado', false);
  perform pg_temp.como(s_b);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-personal-0112');
  v_err := j->>'motivo';
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-que-no-existe');
  v_n2 := case when j->>'motivo' = 'equipo_no_compartido' then 1 else 0 end;
  j := pipeline_validar_codigo('P0112-O1', '482913', null);
  perform pg_temp.dueno();
  select count(*) into v_n from codigo_intentos where sesion_uid = s_b;
  if v_err = 'equipo_no_compartido' and v_n2 = 1 and j->>'motivo' = 'equipo_no_compartido'
     and not (j->>'ok')::boolean and v_n = 1 then   -- el 1 es el intento fallido del caso 2
    r := r || '[ok] caso 15: equipo no compartido, desconocido o ausente responde equipo_no_compartido sin registrar intento;';
  else
    r := r || format('[FALLA] caso 15: motivo=%s intentos=%s;', v_err, v_n);
  end if;

  -- ── 16) El bloqueo de una sesión avisa al administrador (una sola vez) ───────────────────────
  -- La sesión s_d quedó bloqueada en el caso 4 (5 fallos).
  select count(*) into v_n from notificaciones
    where tipo = 'codigo_sesion_bloqueada' and destinatario_rol = 'admin' and ref_id = s_d::text;
  if v_n = 1 then
    r := r || '[ok] caso 16: el bloqueo generó una sola notificación para el rol admin;';
  else
    r := r || format('[FALLA] caso 16: notificaciones de bloqueo=%s (esperaba 1);', v_n);
  end if;

  -- ── 17) «cambiar» revoca el token en la base, y sólo los de la propia sesión ───────────────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
  v_token := (j->>'token')::uuid;
  perform pg_temp.como(s_c);
  perform pipeline_cerrar_operador(v_token);          -- otra sesión: no debe borrar nada
  perform pg_temp.dueno();
  select count(*) into v_n from codigo_operadores where token = v_token;
  perform pg_temp.como(s_a);
  perform pipeline_cerrar_operador(v_token);          -- la dueña: sí
  begin
    perform pipeline_avanzar(p3, 'empatado', v_token);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.dueno();
  select count(*) into v_n2 from codigo_operadores where token = v_token;
  if v_n = 1 and v_n2 = 0 and v_err like 'CODIGO:%' then
    r := r || '[ok] caso 17: cerrar_operador borra sólo los tokens de la propia sesión y el token revocado deja de valer;';
  else
    r := r || format('[FALLA] caso 17: tras_otra_sesion=%s tras_dueña=%s err=%s;', v_n, v_n2, v_err);
  end if;

  -- ── 18) Vida máxima: un token emitido hace más de codigo_operador_max_h horas ya no vale ────
  perform pg_temp.como(s_a);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
  v_token := (j->>'token')::uuid;
  perform pg_temp.dueno();
  update codigo_operadores
    set creado_en = now() - interval '9 hours', expira_en = now() + interval '1 minute'
    where token = v_token;
  perform pg_temp.como(s_a);
  begin
    perform pipeline_avanzar(p3, 'empatado', v_token);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  if v_err like 'CODIGO:%' then
    r := r || '[ok] caso 18: un token con más de 8 horas de vida ya no vale aunque no haya vencido por inactividad;';
  else
    r := r || format('[FALLA] caso 18: err=%s;', v_err);
  end if;

  -- ── 10) dispositivo_compartido ──────────────────────────────────────────────────────────────
  perform pg_temp.dueno();
  insert into dispositivos_autorizados (device_id, estado, compartido) values ('P0112-DEV-C', 'aprobado', true);
  insert into dispositivos_autorizados (device_id, estado, compartido) values ('P0112-DEV-N', 'aprobado', false);
  insert into dispositivos_autorizados (device_id, estado, compartido) values ('P0112-DEV-P', 'pendiente', true);
  perform pg_temp.como(s_a);
  if dispositivo_compartido('P0112-DEV-C') and not dispositivo_compartido('P0112-DEV-N')
     and not dispositivo_compartido('P0112-DEV-P') and not dispositivo_compartido('P0112-DEV-X') then
    r := r || '[ok] caso 10a: compartido sólo para el equipo aprobado y marcado;';
  else
    r := r || '[FALLA] caso 10a: dispositivo_compartido devolvió algo inesperado;';
  end if;
  if (select (pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba') ->> 'ventana_min')::int) = 10 then
    r := r || '[ok] caso 10b: la validación devuelve ventana_min (default 10);';
  else
    r := r || '[FALLA] caso 10b: ventana_min ausente o distinta de 10;';
  end if;

  -- ════════════════════ ENMIENDA 06-oct: PIN propio, límite por persona, cuenta compartida ════
  perform pg_temp.dueno();
  update config set valor = '5' where clave = 'codigo_max_intentos';
  insert into config (clave, valor) values ('pts_lavado_normal', '1') on conflict (clave) do update set valor = '1';
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SE', 'Prueba 0112 Sesion E', 'SE', 'encargado_almacen') returning id into s_e;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SF', 'Prueba 0112 Sesion F', 'SF', 'encargado_almacen') returning id into s_f;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SG', 'Prueba 0112 Sesion G', 'SG', 'encargado_almacen') returning id into s_g;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-SH', 'Prueba 0112 Cuenta PC', 'SH', 'encargado_almacen') returning id into s_h;
  insert into empleados (cod, nombre, iniciales, rol) values ('908172', 'Prueba 0112 Operador 3', 'O3', 'confeccionista') returning id into op3;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-O4', 'Prueba 0112 Operador 4', 'O4', 'confeccionista') returning id into op4;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0112-AD', 'Prueba 0112 Admin', 'AD', 'admin') returning id into adm;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-9', 'Chaqueta', v_sede, 'recepcion') returning id into p9;
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-10', 'Chaqueta', v_sede, 'listo') returning id into p10;

  -- ── 19) El cod solo ya no sirve; el PIN malo informa los intentos que quedan ────────────────
  perform pg_temp.como(s_e);
  j := pipeline_validar_codigo('P0112-O1', 'P0112-O1', 'equipo-prueba');
  v_err := j::text;
  j := pipeline_validar_codigo('P0112-O1', '000001', 'equipo-prueba');
  if not (v_err::jsonb->>'ok')::boolean and (v_err::jsonb->>'token') is null
     and not (j->>'ok')::boolean and (j->>'intentos_restantes')::int between 1 and 4 then
    r := r || '[ok] caso 19: el cod solo no da token y el PIN malo devuelve intentos_restantes;';
  else
    r := r || format('[FALLA] caso 19: cod_solo=%s pin_malo=%s;', v_err, j);
  end if;

  -- ── 20) Definir PIN: largo, triviales, hash, cambio con el actual, revoca tokens ────────────
  perform pg_temp.como(op3);
  v_err := '';
  v_err := v_err || coalesce(pipeline_definir_pin('12345', null)->>'motivo', 'ok') || ',';     -- corto
  v_err := v_err || coalesce(pipeline_definir_pin('777777', null)->>'motivo', 'ok') || ',';    -- repetido
  v_err := v_err || coalesce(pipeline_definir_pin('345678', null)->>'motivo', 'ok') || ',';    -- secuencia
  v_err := v_err || coalesce(pipeline_definir_pin('876543', null)->>'motivo', 'ok') || ',';    -- secuencia inversa
  v_err := v_err || coalesce(pipeline_definir_pin('908172', null)->>'motivo', 'ok') || ',';    -- igual al cod
  v_err := v_err || coalesce(pipeline_definir_pin('12a456', null)->>'motivo', 'ok') || ',';    -- no numérico
  v_err := v_err || coalesce(pipeline_definir_pin('594038', null)->>'motivo', 'ok');           -- válido
  perform pg_temp.dueno();
  select count(*) into v_n from codigo_pines where empleado_id = op3 and pin_hash <> '594038' and pin_hash like '$2%';
  if v_err = 'pin_corto,pin_trivial,pin_trivial,pin_trivial,pin_trivial,pin_corto,ok' and v_n = 1 then
    r := r || '[ok] caso 20a: PIN corto, trivial o igual al cod se rechaza y sólo se guarda el hash;';
  else
    r := r || format('[FALLA] caso 20a: motivos=%s hash_ok=%s;', v_err, v_n);
  end if;
  perform pg_temp.como(s_e);
  j := pipeline_validar_codigo('908172', '594038', 'equipo-prueba');
  v_token := (j->>'token')::uuid;
  perform pg_temp.como(op3);
  v_err := coalesce(pipeline_definir_pin('402817', null)->>'motivo', 'ok') || ','
        || coalesce(pipeline_definir_pin('402817', '111999')->>'motivo', 'ok') || ','
        || coalesce(pipeline_definir_pin('402817', '594038')->>'motivo', 'ok');
  perform pg_temp.dueno();
  select count(*) into v_n from codigo_operadores where token = v_token;
  perform pg_temp.como(s_e);
  j := pipeline_validar_codigo('908172', '402817', 'equipo-prueba');
  if v_err = 'pin_actual_incorrecto,pin_actual_incorrecto,ok' and v_n = 0 and (j->>'ok')::boolean then
    r := r || '[ok] caso 20b: cambiar el PIN exige el actual, revoca los tokens y el nuevo vale;';
  else
    r := r || format('[FALLA] caso 20b: motivos=%s tokens_vivos=%s nuevo=%s;', v_err, v_n, j);
  end if;

  -- ── 21) Sólo el admin borra un PIN ─────────────────────────────────────────────────────────
  perform pg_temp.como(s_e);
  begin perform pipeline_borrar_pin(op3); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.como(adm);
  perform pipeline_borrar_pin(op3);
  perform pg_temp.como(s_f);
  j := pipeline_validar_codigo('908172', '402817', 'equipo-prueba');
  if v_err like 'PERMISO:%' and not (j->>'ok')::boolean and j->>'motivo' = 'sin_pin' then
    r := r || '[ok] caso 21: sólo el admin borra un PIN y el borrado deja de valer (motivo sin_pin);';
  else
    r := r || format('[FALLA] caso 21: no_admin=%s tras_borrar=%s;', v_err, j);
  end if;

  -- ── 22) Límite por persona desde varias sesiones ───────────────────────────────────────────
  perform pg_temp.como(op4);
  perform pipeline_definir_pin('629104', null);
  perform pg_temp.como(s_f);
  for i in 1..3 loop perform pipeline_validar_codigo('P0112-O4', '00000' || i, 'equipo-prueba'); end loop;
  perform pg_temp.como(s_g);
  for i in 1..2 loop perform pipeline_validar_codigo('P0112-O4', '00001' || i, 'equipo-prueba'); end loop;
  perform pg_temp.como(s_c);
  j := pipeline_validar_codigo('P0112-O4', '629104', 'equipo-prueba');   -- correcto, otra sesión
  perform pg_temp.dueno();
  select count(*) into v_n from notificaciones
    where tipo = 'codigo_persona_bloqueada' and destinatario_rol = 'admin' and ref_id = op4::text;
  if not (j->>'ok')::boolean and coalesce((j->>'bloqueado_min')::int, 0) > 0 and v_n = 1 then
    r := r || '[ok] caso 22: 5 fallos contra una persona desde dos sesiones la bloquean para todas y avisan al admin;';
  else
    r := r || format('[FALLA] caso 22: respuesta=%s notificaciones=%s;', j, v_n);
  end if;

  -- ── 23) Cuenta de equipo compartido ────────────────────────────────────────────────────────
  perform pg_temp.como(s_e);
  begin perform empleado_marcar_cuenta_compartida(s_h, true); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
  perform pg_temp.como(adm);
  perform empleado_marcar_cuenta_compartida(s_h, true);
  perform pg_temp.como(s_h);
  begin perform pipeline_avanzar(p9, 'lavado'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
  begin perform pipeline_avanzar_tanda(array[p9], 'lavado'); v_err3 := 'EJECUTO'; exception when others then v_err3 := sqlerrm; end;
  j := pipeline_definir_pin('583920', null);
  perform pg_temp.dueno();
  select etapa into v_etapa from prenda_pasada where id = p9;
  if v_err like 'PERMISO:%' and v_err2 like 'CODIGO:%' and v_err3 like 'CODIGO:%' and v_etapa = 'recepcion'
     and j->>'motivo' = 'cuenta_compartida' then
    r := r || '[ok] caso 23a: la cuenta compartida sin token no mueve nada, no define PIN y sólo el admin la marca;';
  else
    r := r || format('[FALLA] caso 23a: marcar_no_admin=%s avanzar=%s tanda=%s etapa=%s pin=%s;', v_err, v_err2, v_err3, v_etapa, j);
  end if;

  -- ── 24) H-1: deshacer quita el punto del movimiento deshecho ───────────────────────────────
  perform pg_temp.como(s_h);
  j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
  v_token := (j->>'token')::uuid;
  perform pipeline_avanzar(p9, 'lavado', v_token);            -- A (op1) +1
  perform pg_temp.dueno();
  update empleados set activo = true where id = op2;           -- reactivado tras el caso 3
  perform pg_temp.como(s_h);
  j := pipeline_validar_codigo('P0112-O2', '730561', 'equipo-prueba');
  v_token_op2 := (j->>'token')::uuid;
  perform pipeline_avanzar(p9, 'empatado', v_token_op2);      -- B (op2) +1
  perform pipeline_deshacer(p9, 'lavado', v_token);           -- A deshace lo de B
  perform pg_temp.dueno();
  select count(*) into v_n  from pipeline_puntos where pasada_id = p9 and empleado_id = op1;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p9 and empleado_id = op2;
  if v_n = 1 and v_n2 = 0 and (select etapa from prenda_pasada where id = p9) = 'lavado' then
    r := r || '[ok] caso 24: A deshace lo de B → B pierde ese punto y A conserva el suyo;';
  else
    r := r || format('[FALLA] caso 24: puntos A=%s B=%s (esperaba 1/0);', v_n, v_n2);
  end if;

  -- ── 25) H-2: deshacer a una etapa arbitraria → TRANSICION: ─────────────────────────────────
  perform pg_temp.como(s_h);
  begin perform pipeline_deshacer(p9, 'recepcion', v_token); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
  begin perform pipeline_deshacer(p10, 'recepcion', v_token); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
  perform pg_temp.dueno();
  if v_err like 'TRANSICION:%' and v_err2 like 'TRANSICION:%'
     and (select etapa from prenda_pasada where id = p9) = 'lavado'
     and (select etapa from prenda_pasada where id = p10) = 'listo' then
    r := r || '[ok] caso 25: deshacer a una etapa que no es la del último movimiento lanza TRANSICION;';
  else
    r := r || format('[FALLA] caso 25: err=%s / %s;', v_err, v_err2);
  end if;

  -- ════════════════════ COMPATIBILIDAD CON LA 0122 (spec §0 E-6) ═══════════════════════════════
  -- La 0122 (migración de seguridad, se aplica ANTES que ésta) revoca insert/update/delete de las
  -- tres tablas del pipeline a authenticated. Se simula acá como dueño; el rollback final lo deshace.
  declare
    v_otra text; q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid;
    s_t uuid; s_t2 uuid; v_tok uuid;
  begin
    perform pg_temp.dueno();
    select cod into v_otra from sedes where cod <> v_sede order by cod limit 1;
    if v_otra is null then raise exception 'La prueba 26-27 necesita al menos dos sedes'; end if;
    insert into empleados (cod, nombre, iniciales, rol, sede_cod)
      values ('P0112-T1', 'Prueba 0112 Tienda otra sede', 'T1', 'encargado_tienda', v_otra) returning id into s_t;
    insert into empleados (cod, nombre, iniciales, rol, sede_cod)
      values ('P0112-T2', 'Prueba 0112 Tienda misma sede', 'T2', 'encargado_tienda', v_sede) returning id into s_t2;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q1', 'Chaqueta', v_sede, 'recepcion') returning id into q1;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q2', 'Terno completo', v_sede, 'recepcion') returning id into q2;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q3', 'Chaqueta', v_sede, 'listo') returning id into q3;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q4', 'Chaqueta', v_sede, 'recepcion') returning id into q4;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q5', 'Chaqueta', v_sede, 'recepcion') returning id into q5;
    insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-Q6', 'Chaqueta', v_sede, 'recepcion') returning id into q6;

    revoke insert, update, delete on prenda_pasada, prenda_historial, pipeline_puntos from authenticated;

    -- ── 26) Con la tabla cerrada, las RPC siguen funcionando y atribuyen bien ───────────────────
    perform pg_temp.como(s_a);
    begin update prenda_pasada set etapa = 'listo' where id = q6; v_err := 'EJECUTO';
    exception when insufficient_privilege then v_err := 'denegado'; end;
    if v_err = 'denegado' then
      r := r || '[ok] caso 26a: simulada la 0122, authenticated ya no hace update directo;';
    else
      r := r || '[FALLA] caso 26a: el revoke simulado no cerró la tabla (la prueba no es válida);';
    end if;

    j := pipeline_validar_codigo('P0112-O1', '482913', 'equipo-prueba');
    v_tok := (j->>'token')::uuid;
    if v_tok is null then r := r || format('[FALLA] caso 26: sin token (%s);', j); end if;

    begin
      perform pipeline_avanzar(q1, 'lavado', v_tok);
      perform pg_temp.dueno();
      select count(*) into v_n from pipeline_puntos where pasada_id = q1 and empleado_id = op1;
      select count(*) into v_n2 from prenda_historial
        where pasada_id = q1 and etapa_nueva = 'lavado' and empleado_id = op1 and registrado_por = s_a;
      select etapa into v_etapa from prenda_pasada where id = q1;
      if v_n = 1 and v_n2 = 1 and v_etapa = 'lavado' and (select lavador_id from prenda_pasada where id = q1) = op1 then
        r := r || '[ok] caso 26b: pipeline_avanzar con token funciona con la tabla cerrada y atribuye al dueño del código;';
      else
        r := r || format('[FALLA] caso 26b: puntos=%s historial=%s etapa=%s;', v_n, v_n2, v_etapa);
      end if;

      perform pg_temp.como(s_a);
      perform pipeline_deshacer(q1, 'recepcion', v_tok);
      perform pg_temp.dueno();
      select count(*) into v_n from pipeline_puntos where pasada_id = q1;
      select etapa into v_etapa from prenda_pasada where id = q1;
      if v_n = 0 and v_etapa = 'recepcion' then
        r := r || '[ok] caso 26c: pipeline_deshacer funciona con la tabla cerrada y quita el punto;';
      else
        r := r || format('[FALLA] caso 26c: puntos=%s etapa=%s;', v_n, v_etapa);
      end if;

      perform pg_temp.como(s_a);
      -- H-7: se rechaza desde control de calidad.
      perform pipeline_avanzar(q1, 'lavado', v_tok);
      perform pipeline_avanzar(q1, 'empatado', v_tok);
      perform pipeline_avanzar(q1, 'refaccion', v_tok);
      perform pipeline_avanzar(q1, 'planchado', v_tok);
      perform pipeline_avanzar(q1, 'control_calidad', v_tok);
      perform pipeline_rechazar(q1, 'recepcion', v_tok, 'prueba');
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_historial
        where pasada_id = q1 and obs like 'Rechazado%' and empleado_id = op1 and registrado_por = s_a;
      select etapa into v_etapa from prenda_pasada where id = q1;
      if v_n = 1 and v_etapa = 'recepcion' then
        r := r || '[ok] caso 26d: pipeline_rechazar funciona con la tabla cerrada y atribuye bien;';
      else
        r := r || format('[FALLA] caso 26d: rechazos=%s etapa=%s;', v_n, v_etapa);
      end if;

      perform pg_temp.como(s_a);
      perform pipeline_dividir(q2, v_tok);
      perform pipeline_deshacer_division(q2, v_tok);
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_historial
        where pasada_id = q2 and empleado_id = op1 and registrado_por = s_a
          and (obs like 'Terno dividido%' or obs like 'Deshacer división%');
      if v_n = 2 then
        r := r || '[ok] caso 26e: dividir y deshacer_division funcionan con la tabla cerrada;';
      else
        r := r || format('[FALLA] caso 26e: filas=%s (esperaba 2);', v_n);
      end if;

      perform pg_temp.como(s_a);
      perform pipeline_enviar(q3, v_sede, v_tok);
      perform pipeline_calificar(q3, true, '', '', v_tok);
      perform pg_temp.dueno();
      select count(*) into v_n from envios_prendas e join prenda_pasada p on p.envio_id = e.id
        where p.id = q3 and e.responsable_id = op1;
      select count(*) into v_n2 from prenda_calificacion where pasada_id = q3 and calificador_id = op1;
      if v_n = 1 and v_n2 = 1 then
        r := r || '[ok] caso 26f: enviar y calificar funcionan con la tabla cerrada y atribuyen al dueño del código;';
      else
        r := r || format('[FALLA] caso 26f: envio=%s calificacion=%s;', v_n, v_n2);
      end if;

      perform pg_temp.como(s_a);
      v_total := pipeline_avanzar_tanda(array[q4, q5], 'lavado', v_tok);
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_pasada where id in (q4, q5) and etapa = 'lavado';
      if v_n = 2 and v_total = 2 then
        r := r || '[ok] caso 26g: pipeline_avanzar_tanda (invoker) mueve las prendas llamando a la RPC definer;';
      else
        r := r || format('[FALLA] caso 26g: movidas=%s total=%s;', v_n, v_total);
      end if;
    exception when others then
      r := r || format('[FALLA] caso 26: una RPC lanzó %s;', sqlerrm);
    end;

    -- ── 27) Tienda de OTRA sede: 'Prenda no encontrada' y la prenda no se mueve ────────────────
    perform pg_temp.como(s_t);
    begin perform pipeline_avanzar(q6, 'lavado'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
    begin perform pipeline_avanzar(gen_random_uuid(), 'lavado'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
    perform pg_temp.dueno();
    select etapa into v_etapa from prenda_pasada where id = q6;
    select count(*) into v_n from prenda_historial where pasada_id = q6;
    if v_err like '%Prenda no encontrada%' and v_err2 like '%Prenda no encontrada%'
       and v_etapa = 'recepcion' and v_n = 0 and not exists (select 1 from pipeline_puntos where pasada_id = q6) then
      r := r || '[ok] caso 27a: tienda de otra sede (o prenda inexistente) recibe Prenda no encontrada y nada se mueve;';
    else
      r := r || format('[FALLA] caso 27a: err=%s inexistente=%s etapa=%s historial=%s;', v_err, v_err2, v_etapa, v_n);
    end if;

    perform pg_temp.como(s_t2);
    begin perform pipeline_avanzar(q6, 'lavado'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
    perform pg_temp.dueno();
    select etapa into v_etapa from prenda_pasada where id = q6;
    if v_err = 'EJECUTO' and v_etapa = 'lavado' then
      r := r || '[ok] caso 27b: la tienda de la misma sede sí avanza su prenda;';
    else
      r := r || format('[FALLA] caso 27b: err=%s etapa=%s;', v_err, v_etapa);
    end if;

    -- ── 28) Alineación con la 0122 (H-7) y hallazgos del verificador (spec §0 E-7) ─────────────
    declare
      w1 uuid; w2 uuid; w3 uuid; w4 uuid; w5 uuid; w6 uuid; w7 uuid; s_dest uuid;
      v_env uuid; v_neg int;
    begin
      perform pg_temp.dueno();
      insert into empleados (cod, nombre, iniciales, rol, sede_cod)
        values ('P0112-T3', 'Prueba 0112 Tienda destino', 'T3', 'encargado_tienda', v_otra) returning id into s_dest;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W1', 'Chaqueta', v_sede, 'lavado') returning id into w1;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W2', 'Chaqueta', v_sede, 'control_calidad') returning id into w2;
      insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id) values (w2, 'lavado', 'empatado', op2);
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W3', 'Chaqueta', v_sede, 'listo') returning id into w3;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W4', 'Chaqueta', v_sede, 'listo') returning id into w4;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W5', 'Chaqueta', v_sede, 'listo') returning id into w5;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W6', 'Chaqueta', v_sede, 'lavado') returning id into w6;
      insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P0112-W7', 'Chaqueta', v_sede, 'control_calidad') returning id into w7;

      perform pg_temp.como(s_a);
      -- 28a) rechazar desde una etapa que no es control de calidad
      begin perform pipeline_rechazar(w1, 'recepcion', p_motivo => 'prueba'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      -- 28b) rechazo doble: el segundo ya no está en control de calidad
      perform pipeline_rechazar(w2, 'lavado', p_motivo => 'prueba');
      begin perform pipeline_rechazar(w2, 'lavado', p_motivo => 'prueba'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
      perform pg_temp.dueno();
      select count(*) into v_n from prenda_historial where pasada_id = w1;
      select count(*) into v_neg from pipeline_puntos where pasada_id = w2 and empleado_id = op2 and puntos < 0;
      if v_err like 'TRANSICION:%' and v_n = 0 and (select etapa from prenda_pasada where id = w1) = 'lavado' then
        r := r || '[ok] caso 28a: rechazar desde una etapa que no es control de calidad lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 28a: err=%s historial=%s;', v_err, v_n);
      end if;
      if v_err2 like 'TRANSICION:%' and v_neg = 1 then
        r := r || '[ok] caso 28b: el rechazo doble lanza TRANSICION y el culpable sólo tiene un negativo;';
      else
        r := r || format('[FALLA] caso 28b: err=%s negativos=%s (esperaba 1);', v_err2, v_neg);
      end if;

      -- 28c) calificar una prenda que no fue enviada
      perform pg_temp.como(s_a);
      begin perform pipeline_calificar(w3, true, '', ''); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      -- 28d) calificar observada hacia 'listo'
      perform pipeline_enviar(w4, v_otra);
      begin perform pipeline_calificar(w4, false, 'listo', 'x'); v_err2 := 'EJECUTO'; exception when others then v_err2 := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err like 'TRANSICION:%' and (select etapa from prenda_pasada where id = w3) = 'listo'
         and not exists (select 1 from prenda_calificacion where pasada_id = w3) then
        r := r || '[ok] caso 28c: calificar una prenda no enviada lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 28c: err=%s;', v_err);
      end if;
      if v_err2 like 'TRANSICION:%' and (select etapa from prenda_pasada where id = w4) = 'enviado'
         and not exists (select 1 from prenda_calificacion where pasada_id = w4) then
        r := r || '[ok] caso 28d: calificar observada hacia listo lanza TRANSICION sin escribir;';
      else
        r := r || format('[FALLA] caso 28d: err=%s;', v_err2);
      end if;

      -- 28e) la tienda DESTINO del envío (sede distinta de la de origen) califica
      perform pg_temp.como(s_a);
      perform pipeline_enviar(w5, v_otra);
      perform pg_temp.como(s_dest);
      begin perform pipeline_calificar(w5, true, '', ''); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err = 'EJECUTO' and (select etapa from prenda_pasada where id = w5) = 'recibido'
         and exists (select 1 from prenda_calificacion where pasada_id = w5 and calificador_id = s_dest) then
        r := r || '[ok] caso 28e: la tienda destino del envío califica con éxito;';
      else
        r := r || format('[FALLA] caso 28e: err=%s;', v_err);
      end if;

      -- 28f) deshacer de un deshacer: reaplicaría el movimiento sin puntos
      perform pg_temp.como(s_a);
      perform pipeline_avanzar(w6, 'empatado');
      perform pipeline_deshacer(w6, 'lavado');
      begin perform pipeline_deshacer(w6, 'empatado'); v_err := 'EJECUTO'; exception when others then v_err := sqlerrm; end;
      perform pg_temp.dueno();
      if v_err like 'TRANSICION:%' and (select etapa from prenda_pasada where id = w6) = 'lavado' then
        r := r || '[ok] caso 28f: deshacer de un deshacer lanza TRANSICION y la prenda no se mueve;';
      else
        r := r || format('[FALLA] caso 28f: err=%s;', v_err);
      end if;

      -- 28g) deshacer desde listo deja aprobada = false
      perform pg_temp.como(s_a);
      perform pipeline_avanzar(w7, 'listo');
      perform pipeline_deshacer(w7, 'control_calidad');
      perform pg_temp.dueno();
      if (select aprobada from prenda_pasada where id = w7) = false
         and (select etapa from prenda_pasada where id = w7) = 'control_calidad' then
        r := r || '[ok] caso 28g: deshacer desde listo deja aprobada = false;';
      else
        r := r || '[FALLA] caso 28g: la prenda quedó aprobada tras deshacer desde listo;';
      end if;
    end;
  end;

  raise exception 'RESULTADO 0112 --> %', r;
end $$;
