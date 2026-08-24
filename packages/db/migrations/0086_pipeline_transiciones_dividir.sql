-- 0086_pipeline_transiciones_dividir.sql — el avance de una prenda sólo puede ir por donde el
-- pipeline permite, y dividir un terno deja de perderle la marca de compostura a las piezas.
--
-- Implementa docs/superpowers/specs/pipeline/2026-08-23-transiciones-y-division-design.md §2 y §3.
--
-- Los dos defectos vienen de la auditoría del 23-ago-2026, confirmados contra la base viva:
--   · F22 — pipeline_avanzar (0009) acepta CUALQUIER destino. Llevó una prenda de 'refaccion' a
--     'listo' con aprobada = true (saltando planchado y control de calidad) y, con un destino
--     inventado, la dejó en 'etapa_inventada_xyz', fuera de las nueve columnas del tablero.
--     La regla de qué avance es válido vivía sólo en el navegador (packages/core/src/pipeline.ts
--     :23-33, consumida por app/pipeline/tablero.tsx:280). Ni la server action, ni la RPC, ni un
--     check del esquema, ni la RLS la miraban. Como la clave anónima viaja en cada página,
--     cualquiera con sesión puede llamar a la RPC a mano: la regla tiene que estar en la base.
--   · F23 — pipeline_dividir (0012) inserta las hijas sin necesita_compostura. Se pierde la
--     etiqueta ámbar «compostura» del tablero (tablero.tsx:651) y las piezas de un terno que sí
--     la necesitaba se van a planchado sin arreglarse.
--
-- Idempotente: se puede reaplicar sin fallar. Las tres funciones son `create or replace`; la
-- restricción va con `drop constraint if exists` antes del `add`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25).
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) CHECK de esquema sobre prenda_pasada.etapa — la capa que ninguna RPC puede saltear.
--    Doce valores: las nueve etapas del pipeline (ETAPAS_PIPELINE) más los tres estados de
--    fuera (EstadoPasada, packages/core/src/pipeline.ts:58). Frena a pipeline_deshacer (0010) y
--    a pipeline_calificar (0013), que también escriben la etapa que les llega, y a cualquier
--    update directo por PostgREST — que sigue abierto (lo cierra la spec de permisos), pero que
--    a partir de acá ya no puede inventar una etapa.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Se comprueba ANTES de tocar la restricción: si hubiera una fila fuera de la lista, esta
-- migración corta diciendo qué valores sobran, en vez de fallar con un error de Postgres que no
-- explica nada — y sobre todo, en vez de reescribir datos por su cuenta. Medido el 23-ago-2026:
-- las 81 filas de la base usan seis valores, todos dentro de la lista.
do $$
declare v_fuera text;
begin
  select string_agg(distinct etapa, ', ' order by etapa) into v_fuera
    from prenda_pasada
    where etapa not in ('recepcion', 'lavado', 'empatado', 'vacio', 'refaccion', 'compostura',
                        'planchado', 'control_calidad', 'listo', 'enviado', 'recibido', 'dividido');
  if v_fuera is not null then
    raise exception 'No se puede aplicar el check de etapa: hay prendas en etapas fuera de la lista (%). Corregirlas a mano y reaplicar.', v_fuera;
  end if;
end $$;

alter table prenda_pasada drop constraint if exists prenda_pasada_etapa_check;
alter table prenda_pasada add constraint prenda_pasada_etapa_check
  check (etapa in ('recepcion', 'lavado', 'empatado', 'vacio', 'refaccion', 'compostura',
                   'planchado', 'control_calidad', 'listo', 'enviado', 'recibido', 'dividido'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) pipeline_avanzar — mismo cuerpo de 0009 más la lista blanca de transiciones.
--    La tabla es la de packages/core/src/pipeline.ts:23-33 (constante TRANSICIONES), transcrita
--    a SQL. Se duplica a propósito, por la misma razón por la que 0009 ya duplica la regla del
--    ½ punto: el cálculo y la regla tienen que vivir junto a la base, donde no se pueden
--    saltear. Si mañana cambia una transición hay que tocar LOS DOS lados — el comentario de
--    cabecera de pipeline.ts apunta acá.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pipeline_avanzar(p_id uuid, p_destino text)
  returns numeric language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[];
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca. Las etapas sin salida ('vacio', 'listo' y todo lo de fuera del pipeline)
  -- caen en array vacío: desde ahí no se avanza. 'listo' → 'enviado' NO es un avance, es
  -- pipeline_enviar (0009/0055), que además crea el envío y libera el activo de inventario.
  v_permitidos := case v_etapa
    when 'recepcion'       then array['lavado', 'refaccion']
    when 'lavado'          then array['empatado']
    when 'empatado'        then array['refaccion']
    when 'refaccion'       then array['compostura', 'planchado']
    when 'compostura'      then array['planchado']
    when 'planchado'       then array['control_calidad']
    when 'control_calidad' then array['listo']
    else array[]::text[]
  end;
  -- `not (x = any(...))` y no `x <> any(...)`: el segundo es verdadero en cuanto UN elemento
  -- difiere, así que rechazaría los destinos válidos de toda etapa con más de una salida.
  if p_destino is null or not (p_destino = any(v_permitidos)) then
    raise exception 'TRANSICION: no se puede pasar de "%" a "%"', v_etapa, coalesce(p_destino, '(vacío)');
  end if;

  if v_etapa = 'lavado' then v_clave := 'pts_lavado_' || coalesce(v_tlav, 'normal');
  else v_clave := 'pts_' || v_etapa; end if;
  select valor::numeric into v_peso from config where clave = v_clave;
  if v_peso is null then v_peso := 1; end if;

  v_media := lower(coalesce(v_tipo, '')) not in ('terno completo', 'terno')
             and lower(coalesce(v_tipo, '')) ~ '(saco|pantal|falda|chaleco|blazer)';
  v_pts := case when v_media then round(v_peso / 2, 1) else v_peso end;

  update prenda_pasada set
    etapa = p_destino,
    fecha_actualizado = now(),
    aprobada = case when p_destino = 'listo' then true else aprobada end,
    lavador_id = case when v_etapa = 'recepcion' then v_actor else lavador_id end,
    planchador_id = case when v_etapa = 'planchado' then v_actor else planchador_id end
  where id = p_id;

  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
  values (p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    insert into pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha)
    values (v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end, now());
  end if;
  return coalesce(v_pts, 0);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) pipeline_dividir — mismo cuerpo de 0012 más `necesita_compostura` en las dos hijas.
--    La marca del terno se hereda a las dos piezas: puede sobrar en la que estaba sana (cuesta
--    una mirada de más) pero faltar cuesta una prenda entregada sin arreglar.
--
--    activo_id NO se copia — decisión 13 de la spec (§4), pendiente del dueño. Poner el mismo
--    activo en las dos hijas haría que pipeline_enviar (0055) lo dejara 'disponible' al despachar
--    la PRIMERA pieza, con la otra todavía en el taller: el inventario ofrecería un terno
--    completo al que le falta el pantalón. Mientras el terno está dividido su activo se queda en
--    'en_pipeline' y hay que devolverlo a mano — que es el modo de falla seguro: un terno con el
--    saco en el taller no se debe poder alquilar. Ver docs/pendientes-negocio.md.
--    pedido_id tampoco se copia: es del módulo comercial, fuera de alcance desde el 13-ago-2026.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function pipeline_dividir(p_id uuid)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  select * into v_pr from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_saco;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_saco, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  insert into prenda_historial (pasada_id, etapa_nueva, empleado_id, obs)
    values (v_pant, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$$;

-- Los permisos se repiten porque `create or replace` sobre una función existente los conserva,
-- pero si esta migración corriera sobre una base donde 0009/0012 no estuvieran, la función
-- nacería con execute para public.
revoke execute on function pipeline_avanzar(uuid, text) from public;
revoke execute on function pipeline_dividir(uuid) from public;
grant execute on function pipeline_avanzar(uuid, text) to authenticated;
grant execute on function pipeline_dividir(uuid) to authenticated;

-- Prueba de ataque: packages/db/pruebas/0086_pipeline_transiciones_dividir.prueba.sql
--   bash tools/probar-migracion.sh 0086
