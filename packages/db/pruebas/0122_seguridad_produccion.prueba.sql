-- Prueba de la migración 0122_seguridad_produccion.sql
--
-- Spec: docs/superpowers/specs/2026-10-06-seguridad-produccion-design.md (sección «Pruebas»).
--
-- DIFERENCIA CLAVE con las pruebas anteriores (0086 y otras): aquellas corren como superusuario y
-- se hacen pasar por un empleado sólo con `request.jwt.claims`. Un superusuario IGNORA los grants y
-- la RLS, así que no pueden demostrar un ataque de «permission denied» ni de policy. Ésta ataca
-- COMO `authenticated` DE VERDAD (`set local role authenticated` + claims con el uuid de la
-- persona): cuentan los grants de tabla, la RLS y el `security definer` de las RPC, igual que en
-- PostgREST. Para sembrar y para medir vuelve a postgres con `reset role`.
--
-- Qué ataca (hallazgos H1, H14, H-2 y el permiso datos_personas):
--   (1) un confeccionista (almacén) hace `update prenda_pasada set etapa='recepcion'` → 42501
--   (2) inserta una prenda ya en control_calidad → rechazo; una limpia en recepción → permitida
--   (3) insert/update/delete directos en pipeline_puntos y prenda_historial → 42501
--   (4) las RPC siguen funcionando: camino feliz (6 avances), rechazar, enviar, calificar
--   (5) una encargada de la sede S1 no toca una prenda de la sede S2 → 'Prenda no encontrada'
--   (6) deshacer: `listo → recepcion` → TRANSICION; A/B (deshace el avance de otro) y doble deshacer
--   (7) reportes_crear no fabrica reportes a nombre de otro ni en sedes ajenas → PERMISO
--   (9) rechazar/calificar con origen o destino fuera de lo que ofrece la pantalla → TRANSICION
--   (8) con datos_personas = {ver} la encargada no lee pagos/asistencias/notas de otra persona
--
-- Cada ataque se verifica por el CÓDIGO del error (SQLSTATE 42501, o el mensaje 'PERMISO:',
-- 'TRANSICION:', 'Prenda no encontrada'), no sólo por «lanzó algo», y se MIDE el efecto (filas en
-- pipeline_puntos, etapa de la prenda). Antes de la migración la prueba debe llegar al final y
-- reportar FALLA en los casos 1, 2, 3, 6, 7 y 8: eso demuestra que los ataques funcionan hoy.
--
-- Todo se siembra con códigos 'QA22-...' y sedes QS1..QS2. El postgres local no tiene Supabase:
-- las fechas de las filas se «envejecen» a mano (ver más abajo) porque dentro de una sola
-- transacción now() es constante y el orden del historial no se distinguiría. En producción cada
-- avance es su propia transacción, así que eso no ocurre.
--
-- SE DESCARTA SOLA. El escenario vive en un bloque que termina lanzando una excepción con el
-- resultado: eso aborta la transacción y no queda ni una fila. El «error» final ES la salida
-- esperada: se lee la línea RESULTADO. Correr el archivo ENTERO de una sola vez.
--
-- Cómo se corre:  bash tools/postgres-local.sh probar 0122

do $$
declare
  r          text := '';
  v_state    text;
  v_msg      text;
  v_n        int;
  v_n2       int;
  v_num      numeric;
  v_etapa    text;
  v_aprob    boolean;
  v_enc      uuid;
  i          int;
  rec        record;
  -- personas
  adm        uuid;
  c1         uuid;   -- confeccionista (almacén), sin sede propia
  c2         uuid;   -- segunda confeccionista, para el caso A/B
  e1         uuid;   -- encargada de tienda de QS1
  f2         uuid;   -- vendedora de QS2
  -- prendas
  p9 uuid;   -- caso (9): rechazos y calificación con origen/destino inválidos
  p1 uuid; p_ins uuid; p_pun uuid; p_fel uuid; p_rec uuid; p_s2 uuid; p_lis uuid; p_ab uuid;
  v_hist     uuid;   -- fila de historial sembrada
  v_pun      uuid;   -- fila de puntos sembrada
  v_ataques  text[];
  v_pares    text[][] := array[
                ['recepcion','lavado'], ['lavado','empatado'], ['empatado','refaccion'],
                ['refaccion','planchado'], ['planchado','control_calidad'],
                ['control_calidad','listo']];
begin
  -- ══ Montaje (como postgres) ═══════════════════════════════════════════════════════════════
  insert into sedes (cod, nombre) values ('QS1', 'QA22 Sede 1'), ('QS2', 'QA22 Sede 2');

  insert into empleados (cod, nombre, iniciales, rol, sede_cod)
    values ('QA22-ADM', 'QA22 Admin', 'QA', 'admin', null) returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod)
    values ('QA22-C1', 'QA22 Confeccionista Uno', 'Q1', 'confeccionista', null) returning id into c1;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod)
    values ('QA22-C2', 'QA22 Confeccionista Dos', 'Q2', 'confeccionista', null) returning id into c2;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod)
    values ('QA22-E1', 'QA22 Encargada Uno', 'E1', 'encargado_tienda', 'QS1') returning id into e1;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod)
    values ('QA22-F2', 'QA22 Vendedora Dos', 'F2', 'ventas_junior', 'QS2') returning id into f2;

  -- Pesos fijos para no depender de lo que haya en config: 1 punto por etapa de lavado/avance.
  insert into config (clave, valor) values
    ('pts_recepcion','1'), ('pts_lavado_normal','1'), ('pts_empatado','1'), ('pts_refaccion','1'),
    ('pts_compostura','1'), ('pts_planchado','1'), ('pts_control_calidad','1')
  on conflict (clave) do update set valor = excluded.valor;

  -- ══ (1) c1 reescribe la etapa de una prenda con un update plano ═══════════════════════════
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-P1', 'Terno completo', 'listo', 'QS1', 'normal') returning id into p1;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
  v_state := null; v_msg := null;
  begin
    execute 'set local role authenticated';
    update prenda_pasada set etapa = 'recepcion' where id = p1;
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  if v_state = '42501' then
    r := r || ' [ok] (1) update directo de etapa rechazado con 42501;';
  else
    r := r || format(' [FALLA] (1) update directo de etapa: %s %s;', v_state, coalesce(v_msg, ''));
  end if;
  select etapa into v_etapa from prenda_pasada where id = p1;
  if v_etapa = 'listo' then
    r := r || ' [ok] (1) la etapa no cambió;';
  else
    r := r || format(' [FALLA] (1) la prenda quedó en "%s" (era listo): el update plano funcionó;', v_etapa);
  end if;
  -- Delete directo: mismo cierre.
  v_state := null; v_msg := null;
  begin
    execute 'set local role authenticated';
    delete from prenda_pasada where id = p1;
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select count(*) into v_n from prenda_pasada where id = p1;
  if v_state = '42501' and v_n = 1 then
    r := r || ' [ok] (1) delete directo rechazado con 42501 y la prenda sigue;';
  else
    r := r || format(' [FALLA] (1) delete directo: %s, filas restantes=%s;', v_state, v_n);
  end if;

  -- ══ (2) c1 inserta prendas directamente ═══════════════════════════════════════════════════
  v_state := null; v_msg := null;
  begin
    execute 'set local role authenticated';
    insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod)
      values ('QA22-INS-CC', 'Terno completo', 'control_calidad', 'QS1');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select count(*) into v_n from prenda_pasada where codigo = 'QA22-INS-CC';
  if v_state = '42501' and v_n = 0 then
    r := r || ' [ok] (2) insert en control_calidad rechazado con 42501;';
  else
    r := r || format(' [FALLA] (2) insert en control_calidad: %s, filas creadas=%s (la prenda se salta cuatro etapas);', v_state, v_n);
  end if;

  v_state := null; v_msg := null;
  begin
    execute 'set local role authenticated';
    insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod)
      values ('QA22-INS-REC', 'Terno completo', 'recepcion', 'QS1');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select count(*) into v_n from prenda_pasada where codigo = 'QA22-INS-REC' and etapa = 'recepcion';
  if v_state = 'sin error' and v_n = 1 then
    r := r || ' [ok] (2) insert limpio en recepcion de QS1 permitido;';
  else
    r := r || format(' [FALLA] (2) insert limpio en recepcion: %s %s, filas=%s;', v_state, coalesce(v_msg, ''), v_n);
  end if;

  -- ══ (3) escritura directa en pipeline_puntos y prenda_historial ═══════════════════════════
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-PUN', 'Terno completo', 'lavado', 'QS1', 'normal') returning id into p_pun;
  insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (c1, p_pun, 'recepcion', 1, 'QA22 sembrado', now()) returning id into v_pun;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_pun, 'recepcion', 'lavado', c1, null) returning id into v_hist;

  v_ataques := array[
    format('insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle) values (%L, %L, %L, 99, %L)', c1, p_pun, 'recepcion', 'QA22 inyectado'),
    format('update pipeline_puntos set puntos = 99 where id = %L', v_pun),
    format('delete from pipeline_puntos where id = %L', v_pun),
    format('insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs) values (%L, %L, %L, %L, %L)', p_pun, 'lavado', 'listo', c1, 'QA22 inyectado'),
    format('update prenda_historial set etapa_nueva = %L where id = %L', 'listo', v_hist),
    format('delete from prenda_historial where id = %L', v_hist)];
  for i in 1 .. array_length(v_ataques, 1) loop
    v_state := null; v_msg := null;
    begin
      execute 'set local role authenticated';
      execute v_ataques[i];
      v_state := 'sin error';
    exception when others then
      v_state := sqlstate; v_msg := sqlerrm;
    end;
    execute 'reset role';
    if v_state = '42501' then
      r := r || format(' [ok] (3.%s) rechazado con 42501;', i);
    else
      r := r || format(' [FALLA] (3.%s) "%s" -> %s %s;', i, left(v_ataques[i], 40), v_state, coalesce(v_msg, ''));
    end if;
  end loop;
  -- Efecto: la fila sembrada sigue intacta y no se coló ninguna inyectada.
  select count(*), coalesce(sum(puntos), 0) into v_n, v_num from pipeline_puntos where pasada_id = p_pun;
  if v_n = 1 and v_num = 1 then
    r := r || ' [ok] (3) pipeline_puntos quedó intacto (1 fila, 1 punto);';
  else
    r := r || format(' [FALLA] (3) pipeline_puntos quedó con %s fila(s) y %s punto(s) (esperado 1 y 1);', v_n, v_num);
  end if;
  select count(*) into v_n from prenda_historial where pasada_id = p_pun and etapa_nueva = 'lavado' and id = v_hist;
  select count(*) into v_n2 from prenda_historial where pasada_id = p_pun;
  if v_n = 1 and v_n2 = 1 then
    r := r || ' [ok] (3) prenda_historial quedó intacto;';
  else
    r := r || format(' [FALLA] (3) prenda_historial quedó con %s fila(s) y fila sembrada intacta=%s;', v_n2, v_n);
  end if;

  -- ══ (4) las RPC siguen funcionando ════════════════════════════════════════════════════════
  -- 4a. Camino feliz: 6 avances de c1, recepcion → … → listo.
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-FELIZ', 'Terno completo', 'recepcion', 'QS1', 'normal') returning id into p_fel;
  for i in 1 .. array_length(v_pares, 1) loop
    v_state := null; v_msg := null;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      perform pipeline_avanzar(p_fel, v_pares[i][2]);
      v_state := 'sin error';
    exception when others then
      v_state := sqlstate; v_msg := sqlerrm;
    end;
    execute 'reset role';
    if v_state <> 'sin error' then
      r := r || format(' [FALLA] (4) el camino feliz se cortó en %s -> %s: %s %s;', v_pares[i][1], v_pares[i][2], v_state, v_msg);
    end if;
    -- Envejece historial y puntos de la prenda para que cada avance quede en un instante distinto.
    update prenda_historial set fecha = fecha - interval '1 minute' where pasada_id = p_fel;
    update pipeline_puntos  set fecha = fecha - interval '1 minute' where pasada_id = p_fel;
  end loop;
  select etapa, aprobada into v_etapa, v_aprob from prenda_pasada where id = p_fel;
  select count(*), coalesce(sum(puntos), 0) into v_n, v_num
    from pipeline_puntos where pasada_id = p_fel and empleado_id = c1 and puntos > 0;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p_fel and empleado_id <> c1;
  if v_etapa = 'listo' and coalesce(v_aprob, false) and v_n = 6 and v_num = 6 and v_n2 = 0 then
    r := r || ' [ok] (4) camino feliz: listo y aprobada, 6 avances = 6 puntos para c1;';
  else
    r := r || format(' [FALLA] (4) camino feliz terminó en "%s" aprobada=%s, filas de c1=%s, puntos=%s, filas ajenas=%s;',
                     v_etapa, coalesce(v_aprob, false), v_n, v_num, v_n2);
  end if;

  -- 4b. Rechazar: c2 llega a control_calidad desde planchado y c1 lo rechaza; pierde c2.
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-RECHAZO', 'Terno completo', 'planchado', 'QS1', 'normal') returning id into p_rec;
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_avanzar(p_rec, 'control_calidad');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  update prenda_historial set fecha = fecha - interval '1 minute' where pasada_id = p_rec;
  update pipeline_puntos  set fecha = fecha - interval '1 minute' where pasada_id = p_rec;
  if v_state <> 'sin error' then
    r := r || format(' [FALLA] (4) c2 no pudo avanzar planchado -> control_calidad: %s %s;', v_state, v_msg);
  end if;
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_rechazar(p_rec, 'planchado', p_motivo => 'prueba');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_rec;
  select coalesce(sum(puntos), 0) into v_num from pipeline_puntos where pasada_id = p_rec and empleado_id = c2;
  select count(*) into v_n from pipeline_puntos
    where pasada_id = p_rec and empleado_id = c2 and puntos < 0 and etapa = 'planchado_rechazo';
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p_rec and empleado_id = c1;
  if v_state = 'sin error' and v_etapa = 'planchado' and v_num = 0 and v_n = 1 and v_n2 = 0 then
    r := r || ' [ok] (4) rechazar devolvió la prenda a planchado y restó el punto a c2 (el culpable);';
  else
    r := r || format(' [FALLA] (4) rechazar: %s %s, etapa=%s, saldo de c2=%s, filas de rechazo=%s, filas de c1=%s;',
                     v_state, coalesce(v_msg, ''), v_etapa, v_num, v_n, v_n2);
  end if;

  -- 4c. Enviar la prenda lista (la del camino feliz) a QS1.
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_enviar(p_fel, 'QS1');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_fel;
  select count(*) into v_n from prenda_pasada where id = p_fel and envio_id is not null;
  if v_state = 'sin error' and v_etapa = 'enviado' and v_n = 1 then
    r := r || ' [ok] (4) enviar dejó la prenda en enviado con su envío;';
  else
    r := r || format(' [FALLA] (4) enviar: %s %s, etapa=%s, con envio=%s;', v_state, coalesce(v_msg, ''), v_etapa, v_n);
  end if;

  -- 4d. e1 (destino QS1, prenda de origen QS1) califica y acepta.
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_calificar(p_fel, true, null, null);
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_fel;
  select count(*) into v_n from prenda_calificacion where pasada_id = p_fel and aceptada and calificador_id = e1;
  if v_state = 'sin error' and v_etapa = 'recibido' and v_n = 1 then
    r := r || ' [ok] (4) calificar como e1 dejó la prenda en recibido con su calificación;';
  else
    r := r || format(' [FALLA] (4) calificar: %s %s, etapa=%s, calificaciones=%s;', v_state, coalesce(v_msg, ''), v_etapa, v_n);
  end if;

  -- ══ (5) e1 (QS1) no avanza una prenda de QS2 ══════════════════════════════════════════════
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-S2', 'Terno completo', 'recepcion', 'QS2', 'normal') returning id into p_s2;
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_avanzar(p_s2, 'lavado');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_s2;
  select count(*) into v_n from pipeline_puntos where pasada_id = p_s2;
  select count(*) into v_n2 from prenda_historial where pasada_id = p_s2;
  if v_msg = 'Prenda no encontrada' then
    r := r || ' [ok] (5) la encargada de QS1 recibió "Prenda no encontrada" sobre una prenda de QS2;';
  else
    r := r || format(' [FALLA] (5) avanzar prenda de otra sede: %s %s;', v_state, coalesce(v_msg, ''));
  end if;
  if v_etapa = 'recepcion' and v_n = 0 and v_n2 = 0 then
    r := r || ' [ok] (5) sin cambios: ni etapa, ni puntos, ni historial;';
  else
    r := r || format(' [FALLA] (5) la prenda de QS2 quedó en "%s" con %s punto(s) y %s historial;', v_etapa, v_n, v_n2);
  end if;

  -- ══ (6) deshacer ══════════════════════════════════════════════════════════════════════════
  -- 6a. Una prenda que ya llegó a listo no se «deshace» hasta recepcion (+3 puntos sin trabajo).
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-LISTO', 'Terno completo', 'control_calidad', 'QS1', 'normal') returning id into p_lis;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform pipeline_avanzar(p_lis, 'listo');
  execute 'reset role';
  update prenda_historial set fecha = fecha - interval '1 minute' where pasada_id = p_lis;
  update pipeline_puntos  set fecha = fecha - interval '1 minute' where pasada_id = p_lis;
  select count(*) into v_n from pipeline_puntos where pasada_id = p_lis;
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_deshacer(p_lis, 'recepcion');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_lis;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p_lis;
  if v_msg like 'TRANSICION:%' then
    r := r || ' [ok] (6) deshacer listo -> recepcion rechazado con TRANSICION;';
  else
    r := r || format(' [FALLA] (6) deshacer listo -> recepcion: %s %s;', v_state, coalesce(v_msg, ''));
  end if;
  if v_etapa = 'listo' and v_n2 = v_n then
    r := r || ' [ok] (6) la prenda sigue en listo y los puntos no cambiaron;';
  else
    r := r || format(' [FALLA] (6) tras el deshacer inválido: etapa="%s", puntos %s -> %s;', v_etapa, v_n, v_n2);
  end if;

  -- 6b. Caso A/B: c1 avanza recepcion -> lavado, c2 avanza lavado -> empatado, c1 pide deshacer.
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
    values ('QA22-AB', 'Terno completo', 'recepcion', 'QS1', 'normal') returning id into p_ab;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform pipeline_avanzar(p_ab, 'lavado');
  execute 'reset role';
  update prenda_historial set fecha = fecha - interval '1 minute' where pasada_id = p_ab;
  update pipeline_puntos  set fecha = fecha - interval '1 minute' where pasada_id = p_ab;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform pipeline_avanzar(p_ab, 'empatado');
  execute 'reset role';
  update prenda_historial set fecha = fecha - interval '1 minute' where pasada_id = p_ab;
  update pipeline_puntos  set fecha = fecha - interval '1 minute' where pasada_id = p_ab;

  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_deshacer(p_ab, 'lavado');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_ab;
  select count(*) into v_n  from pipeline_puntos where pasada_id = p_ab and empleado_id = c1 and etapa = 'recepcion' and puntos > 0;
  select count(*) into v_n2 from pipeline_puntos where pasada_id = p_ab and empleado_id = c2 and etapa = 'lavado'    and puntos > 0;
  if v_state = 'sin error' and v_etapa = 'lavado' and v_n2 = 0 and v_n = 1 then
    r := r || ' [ok] (6) A/B: c2 perdió exactamente su punto, c1 conserva el suyo y la prenda volvió a lavado;';
  else
    r := r || format(' [FALLA] (6) A/B: %s %s, etapa=%s, puntos de c2 (debía perder)=%s, puntos de c1 (debía conservar)=%s;',
                     v_state, coalesce(v_msg, ''), v_etapa, v_n2, v_n);
  end if;
  -- Segundo deshacer seguido: el último historial ya es el propio «Deshacer».
  v_state := null; v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform pipeline_deshacer(p_ab, 'recepcion');
    v_state := 'sin error';
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  execute 'reset role';
  select etapa into v_etapa from prenda_pasada where id = p_ab;
  if v_msg like 'TRANSICION:%' and v_etapa = 'lavado' then
    r := r || ' [ok] (6) el segundo deshacer seguido se rechazó con TRANSICION;';
  else
    r := r || format(' [FALLA] (6) segundo deshacer seguido: %s %s, etapa=%s;', v_state, coalesce(v_msg, ''), v_etapa);
  end if;

  -- ══ (7) reportes_crear ════════════════════════════════════════════════════════════════════
  -- Tras cada caso se marca evaluado todo lo creado, para que REPORTE_PENDIENTE no tape el
  -- siguiente. Un solo turno 'M' en fechas distintas evita TURNO_CONFLICTO.
  for rec in
    select * from (values
      ('7a', c1,  'QS2', f2,        '01-09-26_QS2_M', 'PERMISO', 'almacén con p_encargado ajeno'),
      ('7b', c1,  'QS2', null::uuid,'02-09-26_QS2_M', 'PERMISO', 'almacén en sede que no es suya'),
      ('7c', e1,  'QS1', f2,        '03-09-26_QS1_M', 'PERMISO', 'encargada con p_encargado ajeno'),
      ('7d', e1,  'QS1', null::uuid,'04-09-26_QS1_M', 'ok',      'encargada en su sede, sin p_encargado'),
      ('7e', adm, 'QS2', f2,        '05-09-26_QS2_M', 'ok',      'admin con otro encargado')
    ) t(caso, actor, sede, enc, id, esperado, que)
  loop
    v_state := null; v_msg := null;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', rec.actor, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      perform reportes_crear(rec.id, rec.sede, 'M', 0, 0, null::uuid[], null::jsonb, null::jsonb, rec.enc);
      v_state := 'sin error';
    exception when others then
      v_state := sqlstate; v_msg := sqlerrm;
    end;
    execute 'reset role';
    select encargado_id into v_enc from reportes where id = rec.id;
    if rec.esperado = 'PERMISO' then
      if v_msg like 'PERMISO%' and v_enc is null then
        r := r || format(' [ok] (%s) %s: rechazado con PERMISO y sin reporte;', rec.caso, rec.que);
      else
        r := r || format(' [FALLA] (%s) %s: %s %s, reporte creado=%s;', rec.caso, rec.que, v_state, coalesce(v_msg, ''), v_enc is not null);
      end if;
    else
      if v_state = 'sin error' and v_enc = coalesce(rec.enc, rec.actor) then
        r := r || format(' [ok] (%s) %s: permitido, encargado correcto;', rec.caso, rec.que);
      else
        r := r || format(' [FALLA] (%s) %s: %s %s, encargado=%s (esperado %s);', rec.caso, rec.que,
                         v_state, coalesce(v_msg, ''), v_enc, coalesce(rec.enc, rec.actor));
      end if;
    end if;
    update reportes set evaluado = true where sede_cod in ('QS1', 'QS2');
  end loop;

  -- ══ (8) datos_personas = {ver} no abre datos ajenos ═══════════════════════════════════════
  insert into permisos_modulos (rol, modulo, acciones)
    values ('encargado_tienda', 'datos_personas', array['ver'])
  on conflict (rol, modulo) do update set acciones = excluded.acciones;

  insert into pagos (empleado_id) values (f2), (e1);
  insert into asistencias (empleado_id, fecha) values (f2, date '2026-09-01'), (e1, date '2026-09-01');
  insert into evaluaciones_mensuales (empleado_id, mes) values (f2, '2026-09'), (e1, '2026-09');

  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n  from pagos where empleado_id = f2;
  select count(*) into v_n2 from pagos where empleado_id = e1;
  execute 'reset role';
  if v_n = 0 and v_n2 >= 1 then
    r := r || ' [ok] (8) pagos: no ve los de f2, sí los suyos;';
  else
    r := r || format(' [FALLA] (8) pagos: ve %s de f2 (esperado 0) y %s propios (esperado >=1);', v_n, v_n2);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n  from asistencias where empleado_id = f2;
  select count(*) into v_n2 from asistencias where empleado_id = e1;
  execute 'reset role';
  if v_n = 0 and v_n2 >= 1 then
    r := r || ' [ok] (8) asistencias: no ve las de f2, sí las suyas;';
  else
    r := r || format(' [FALLA] (8) asistencias: ve %s de f2 (esperado 0) y %s propias (esperado >=1);', v_n, v_n2);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n  from evaluaciones_mensuales where empleado_id = f2;
  select count(*) into v_n2 from evaluaciones_mensuales where empleado_id = e1;
  execute 'reset role';
  -- Desde la 0119 (valores360-base) nadie lee la tabla directo: lo propio llega por RPC. Aquí sólo
  -- importa el aislamiento: no ve nada de f2.
  if v_n = 0 then
    r := r || ' [ok] (8) evaluaciones_mensuales: no ve las de f2 (lo propio llega por RPC desde la 0119);';
  else
    r := r || format(' [FALLA] (8) evaluaciones_mensuales: ve %s de f2 (esperado 0) y %s propias (esperado >=1);', v_n, v_n2);
  end if;

  -- ══ (9) rechazar / calificar sólo con origen y destino válidos (H-7) ══════════════════════
  -- Ataque: rechazar una prenda en listo a recepcion y volver a avanzarla suma puntos sin trabajo
  -- nuevo; calificar una prenda que no está enviada es la misma vía desde la tienda.
  for rec in select * from (values
      ('listo',           'rechazar',  'recepcion', '9a rechazar desde listo'),
      ('control_calidad', 'rechazar',  'listo',     '9b rechazar hacia listo'),
      ('listo',           'calificar', 'recepcion', '9c calificar sin estar enviada')
    ) as t(etapa, accion, destino, nombre)
  loop
    insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, tipo_lavado)
      values ('QA22-' || rec.nombre, 'Terno completo', rec.etapa, 'QS1', 'normal') returning id into p9;
    v_state := null; v_msg := null;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      if rec.accion = 'rechazar' then
        perform pipeline_rechazar(p9, rec.destino, p_motivo => 'prueba');
      else
        perform pipeline_calificar(p9, false, rec.destino, 'QA22');
      end if;
      v_state := 'sin error';
    exception when others then
      v_state := sqlstate; v_msg := sqlerrm;
    end;
    execute 'reset role';
    select etapa into v_etapa from prenda_pasada where id = p9;
    if v_msg like 'TRANSICION:%' and v_etapa = rec.etapa then
      r := r || format(' [ok] (%s) rechazado con TRANSICION y la prenda sigue en %s;', rec.nombre, rec.etapa);
    else
      r := r || format(' [FALLA] (%s): %s %s, etapa=%s;', rec.nombre, v_state, coalesce(v_msg, ''), v_etapa);
    end if;
  end loop;

  raise exception 'RESULTADO 0122 -->%', r;
end $$;
