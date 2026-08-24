-- Prueba de la migración 0087_solicitudes_escritura_directa.sql
--
-- No comprueba que las políticas existan: comprueba que el ATAQUE ya no entra y que el flujo
-- legítimo sigue entrando. Las doce promesas de la spec
-- (docs/superpowers/specs/permisos/2026-08-23-solicitudes-escritura-directa-design.md §4).
--
-- Lo que se reproduce es el hallazgo F29 tal como se hizo en vivo el 23-ago-2026: una persona de
-- ventas, sin ninguna autoridad de almacén, dejando una solicitud en 'confirmada' con
-- `confirmado = true` por escritura directa, sin pasar por ninguna RPC.
--
-- OJO — DOS COSAS SIN LAS CUALES ESTA PRUEBA NO COMPRUEBA NADA:
--   1) `set_config('role','authenticated')`. Sin cambiar de rol, la prueba corre como dueño de las
--      tablas y las políticas NI SE EVALÚAN: todos los ataques "pasarían" y la prueba quedaría en
--      verde. Por eso el montaje va ANTES del cambio de rol (`authenticated` ya no puede armarlo).
--   2) `set_config('request.jwt.claims', ...)`. Sin eso `auth.uid()` es null, todo contesta
--      PERMISO y otra vez no se comprueba nada (docs/aprendizajes.md, fila del 22-ago).
--
-- OJO 2 — un UPDATE sin política NO da error: afecta cero filas. Por eso cada ataque se mide con
-- `get diagnostics ... row_count` Y ADEMÁS releyendo el estado. "No lanzó" no es "no escribió".
--
-- SE DESCARTA SOLA. Todo vive dentro de un bloque que termina lanzando una excepción con el
-- resultado: eso aborta la transacción y no queda ni una fila. El "error" final ES la salida
-- esperada.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0087
-- (o pegar el archivo ENTERO de una sola vez en el SQL editor de Supabase, proyecto scilb, y leer
-- el mensaje P0001 que empieza con "RESULTADO 0087")

do $$
declare
  gestor    uuid;   -- admin/dueño: la autoridad de almacén del flujo
  ventas    uuid;   -- sin ninguna autoridad: ni admin, ni encargado_almacen, ni confeccionista
  sede      text;
  s_entreg  uuid;   -- entregada, esperando confirmación de la tienda
  s_pend    uuid;   -- pendiente, para atacar el delete
  s_flujo   uuid;   -- pendiente, para recorrer el camino legítimo del gestor
  it_entreg uuid;
  v_n       int;
  v_filas   int;
  v_estado  text;
  v_conf    boolean;
  v_bool    boolean;
  r         text := '';
begin
  -- ── Montaje (todavía como dueño de las tablas) ────────────────────────────────────────────
  select id into gestor from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  -- app_es_almacen() es true también para 'confeccionista' (0006:22-25): quedan los dos fuera.
  select id into ventas from empleados
   where rol not in ('admin','dueno','encargado_almacen','confeccionista') and activo
   order by id limit 1;
  if gestor is null or ventas is null then
    raise exception 'La prueba necesita un administrador y una persona sin autoridad de almacen';
  end if;

  select et.sede_cod into sede from empleado_tiendas et where et.empleado_id = ventas limit 1;
  if sede is null then select e.sede_cod into sede from empleados e where e.id = ventas; end if;
  if sede is null then
    raise exception 'La persona de ventas elegida no tiene ninguna sede: la prueba no comprobaria el caso real';
  end if;

  insert into solicitudes (sede_cod, solicitante_id, urgencia, obs, estado, aprobado_por_id,
                           fecha_respuesta, entregado_por_id, fecha_entrega, recibe_en_tienda)
  values (sede, ventas, 'alta', 'QA-0087 entregada', 'entregada', gestor, now(), gestor, now(), 'QA')
  returning id into s_entreg;
  insert into solicitud_items (solicitud_id, categoria, tipo, cantidad, cantidad_enviada, estado_item)
  values (s_entreg, 'prenda', 'Terno', 1, 1, 'aprobado') returning id into it_entreg;

  insert into solicitudes (sede_cod, solicitante_id, urgencia, obs)
  values (sede, ventas, 'media', 'QA-0087 pendiente') returning id into s_pend;

  insert into solicitudes (sede_cod, solicitante_id, urgencia, obs)
  values (sede, ventas, 'baja', 'QA-0087 flujo') returning id into s_flujo;
  insert into solicitud_items (solicitud_id, categoria, tipo, cantidad)
  values (s_flujo, 'articulo', 'Detergente', 2);

  -- ── A PARTIR DE ACÁ SE DEJA DE SER DUEÑO DE LAS TABLAS ────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ventas, 'role', 'authenticated')::text, true);

  if private.app_es_admin() or private.app_es_almacen() or private.app_es_gestor_solicitudes() then
    raise exception 'La persona elegida SI tiene autoridad de almacen; la prueba no comprobaria el ataque';
  end if;

  -- ── 1) El ataque de F29, textual ──────────────────────────────────────────────────────────
  update solicitudes set estado = 'confirmada', confirmado = true where id = s_entreg;
  get diagnostics v_n = row_count;
  select estado, confirmado into v_estado, v_conf from solicitudes where id = s_entreg;
  if v_n = 0 and v_estado = 'entregada' and v_conf = false then
    r := r || ' [ok] el update plano de F29 no toca ninguna fila;';
  else
    r := r || format(' [FALLA] F29 SIGUE ABIERTO: %s fila(s), estado=%s confirmado=%s;', v_n, v_estado, v_conf);
  end if;

  -- ── 2) Borrar una solicitud ───────────────────────────────────────────────────────────────
  delete from solicitudes where id = s_pend;
  get diagnostics v_n = row_count;
  if v_n = 0 and exists (select 1 from solicitudes where id = s_pend) then
    r := r || ' [ok] el delete plano no borra;';
  else
    r := r || format(' [FALLA] el delete plano borro %s fila(s);', v_n);
  end if;

  -- ── 3) Los contadores de los ítems (qué salió y qué llegó) ────────────────────────────────
  update solicitud_items set cantidad_recibida = 99, estado_item = 'aprobado' where id = it_entreg;
  get diagnostics v_filas = row_count;
  select cantidad_recibida into v_n from solicitud_items where id = it_entreg;
  if v_filas = 0 and v_n = 0 then
    r := r || ' [ok] el update plano de los items no toca nada;';
  else
    r := r || format(' [FALLA] %s fila(s) de items tocadas, cantidad_recibida quedo en %s;', v_filas, v_n);
  end if;

  -- ── 4) Fabricar por POST una solicitud ya confirmada ──────────────────────────────────────
  begin
    insert into solicitudes (sede_cod, solicitante_id, urgencia, obs, estado, confirmado)
    values (sede, ventas, 'alta', 'QA-0087 fabricada', 'confirmada', true);
    r := r || ' [FALLA] se pudo INSERTAR una solicitud ya confirmada;';
  exception when insufficient_privilege then
    r := r || ' [ok] no se puede insertar una solicitud que nace confirmada;';
  end;

  -- ── 5) Pedir a nombre de otra persona ─────────────────────────────────────────────────────
  begin
    insert into solicitudes (sede_cod, solicitante_id, urgencia, obs)
    values (sede, gestor, 'alta', 'QA-0087 suplantada');
    r := r || ' [FALLA] se pudo insertar una solicitud a nombre de otra persona;';
  exception when insufficient_privilege then
    r := r || ' [ok] no se puede pedir a nombre de otra persona;';
  end;

  -- ── 6) No se rompió la lectura ────────────────────────────────────────────────────────────
  select count(*) into v_n from solicitudes where id in (s_entreg, s_pend, s_flujo);
  if v_n = 3 then
    r := r || ' [ok] la lectura de su sede sigue funcionando;';
  else
    r := r || format(' [FALLA] la persona de ventas ve %s de sus 3 solicitudes;', v_n);
  end if;

  -- ── 7) Crear por RPC sigue funcionando (sigue siendo `invoker`) ───────────────────────────
  begin
    perform solicitud_crear(sede, 'media', 'QA-0087 alta legitima',
      '[{"categoria":"prenda","tipo":"Terno","cantidad":1}]'::jsonb);
    r := r || ' [ok] solicitud_crear sigue funcionando para ventas;';
  exception when others then
    r := r || format(' [FALLA] se rompio el alta legitima: %s;', sqlerrm);
  end;

  -- ── 8) Aprobar por RPC le sigue estando negado ────────────────────────────────────────────
  begin
    perform solicitud_aprobar(s_flujo, 'me apruebo sola', null);
    r := r || ' [FALLA] una persona sin autoridad aprobo por RPC;';
  exception when others then
    if sqlerrm like 'SIN_PERMISO:%' then
      r := r || ' [ok] solicitud_aprobar le contesta SIN_PERMISO;';
    else
      r := r || format(' [FALLA] solicitud_aprobar fallo con otro error: %s;', sqlerrm);
    end if;
  end;

  -- ── 11a) Marcar impreso: el update plano de esa columna tampoco entra ─────────────────────
  update solicitudes set pedido_impreso = true where id = s_entreg;
  get diagnostics v_n = row_count;
  select pedido_impreso into v_bool from solicitudes where id = s_entreg;
  if v_n = 0 and v_bool = false then
    r := r || ' [ok] tampoco entra el update plano de pedido_impreso;';
  else
    r := r || ' [FALLA] pedido_impreso se pudo escribir directo;';
  end if;

  -- ── 11b) …pero la RPC nueva sí, y con la misma autoridad de siempre ───────────────────────
  begin
    perform solicitud_marcar_impreso(s_entreg, 'pedido');
    select pedido_impreso into v_bool from solicitudes where id = s_entreg;
    if v_bool then
      r := r || ' [ok] solicitud_marcar_impreso reemplaza al update plano;';
    else
      r := r || ' [FALLA] solicitud_marcar_impreso no dejo la marca;';
    end if;
  exception when others then
    r := r || format(' [FALLA] solicitud_marcar_impreso fallo: %s;', sqlerrm);
  end;

  -- ── 10) Confirmar: la sede que pidió sí puede, y es la prueba de que `definer` funciona para
  --        alguien que ya NO tiene politica de UPDATE ────────────────────────────────────────
  begin
    perform solicitud_confirmar(s_entreg,
      format('[{"id":"%s","cantidad_recibida":1}]', it_entreg)::jsonb);
    select estado, confirmado into v_estado, v_conf from solicitudes where id = s_entreg;
    select cantidad_recibida into v_n from solicitud_items where id = it_entreg;
    if v_estado = 'confirmada' and v_conf and v_n = 1 then
      r := r || ' [ok] la tienda que pidio sigue confirmando por RPC;';
    else
      r := r || format(' [FALLA] tras confirmar quedo estado=%s confirmado=%s recibida=%s;', v_estado, v_conf, v_n);
    end if;
  exception when others then
    r := r || format(' [FALLA] solicitud_confirmar se rompio: %s;', sqlerrm);
  end;

  -- ── 9) El camino del gestor, entero, sin ninguna politica de UPDATE en pie ────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', gestor, 'role', 'authenticated')::text, true);

  begin
    perform solicitud_aprobar(s_flujo, 'hay stock', null);
    perform solicitud_entregar(s_flujo, 'QA recibe', null);
    select estado into v_estado from solicitudes where id = s_flujo;
    if v_estado = 'entregada' then
      r := r || ' [ok] aprobar+entregar siguen funcionando para el gestor;';
    else
      r := r || format(' [FALLA] tras aprobar+entregar quedo en %s;', v_estado);
    end if;
  exception when others then
    r := r || format(' [FALLA] el flujo del gestor se rompio: %s;', sqlerrm);
  end;

  begin
    perform solicitud_deshacer(s_flujo);
    select estado, entregado_por_id is null into v_estado, v_bool from solicitudes where id = s_flujo;
    if v_estado = 'aprobada' and v_bool then
      r := r || ' [ok] deshacer sigue funcionando y sigue limpiando;';
    else
      r := r || format(' [FALLA] deshacer dejo estado=%s, entregado_por vacio=%s;', v_estado, v_bool);
    end if;
  exception when others then
    r := r || format(' [FALLA] solicitud_deshacer se rompio (quedo `invoker`?): %s;', sqlerrm);
  end;

  -- ── 12) Rastro en audit_log (se lee como admin: la tabla es solo-lectura-admin) ───────────
  select count(*) into v_n from audit_log
   where tabla = 'solicitudes' and fila_id = s_flujo::text and operacion = 'UPDATE';
  if v_n >= 2 then
    r := r || format(' [ok] audit_log guardo %s cambios de esa solicitud;', v_n);
  else
    r := r || format(' [FALLA] audit_log solo tiene %s fila(s) de esa solicitud;', v_n);
  end if;

  raise exception 'RESULTADO 0087 —%', r;
end $$;
