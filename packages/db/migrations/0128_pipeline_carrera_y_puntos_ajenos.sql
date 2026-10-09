-- 0128_pipeline_carrera_y_puntos_ajenos.sql — el avance bloquea la prenda, deshacer no borra puntos
-- ajenos de otro día y enviar vuelve a validar la sede destino.
--
-- Implementa docs/superpowers/specs/pipeline/2026-10-09-pipeline-carrera-y-puntos-ajenos-design.md,
-- secciones F1, F2 y F5. Origen: registro de la verificación de la release 0112–0127
-- (docs/superpowers/specs/pipeline/2026-10-09-verificacion-release-0112-0127.md), hallazgos 1, 2 y 5.
-- Prueba: packages/db/pruebas/0128_pipeline_carrera_y_puntos_ajenos.prueba.sql
--
-- F1 (hallazgo 1, ALTA). pipeline_avanzar, pipeline_dividir y pipeline_enviar leían la etapa de
--    prenda_pasada sin `for update`: dos sesiones sobre la misma prenda veían la misma etapa y las
--    dos avanzaban (dos movimientos y un punto para cada una; en dividir, 4 hijas y 2 huérfanas; en
--    enviar, un envío fantasma). Reproducido en Postgres local con dos sesiones psql sobre la 0127.
--    Ahora esa lectura es `for update`: la segunda sesión espera a la primera, ve la etapa nueva y
--    falla con la validación que ya existía, sin punto, sin historial y sin envío.
--
-- F2 (hallazgo 2, MEDIA). El respaldo de private.pipeline_borrar_punto (para puntos anteriores a
--    historial_id) borraba «el último punto positivo de la prenda en la etapa de origen» sin mirar la
--    fecha: al deshacer un movimiento SIN puntos por diseño (tienda por H-4, o pts_* en 0) se llevaba
--    un punto antiguo y ajeno, incluso de un mes ya cerrado. Ahora sólo puede borrar un punto sin
--    historial_id cuya fecha caiga en el MISMO DÍA CALENDARIO DE PERÚ que el movimiento deshecho. La
--    conversión se hace en SQL (`at time zone 'America/Lima'`), sin fechas de corte. Con puntos
--    ligados (historial_id) nada cambia; H-1 («deshacer borra los puntos del movimiento, sean de
--    quien sean») queda igual.
--    Límite aceptado por la spec: un punto antiguo sin ligar de la misma prenda, etapa y día Perú que
--    un movimiento sin puntos propios sigue siendo candidato; con esos tres datos iguales se
--    considera el mismo hecho.
--
-- F5 (hallazgo 5, BAJA). La 0122 validaba en pipeline_enviar que la sede destino exista; la 0127
--    dejó la versión de la 0115, que no. Se repone con el mismo texto de la 0122, antes de insertar.
--
-- NO INCLUYE F4 NI F8 DE LA SPEC (detenidos al implementar, pendientes de decisión):
--   · F4 (hallazgo 4, reportes_crear y registrado_por_id): la pantalla /reportes/nuevo ofrece en
--     «¿Quién lo hizo?» a todo el directorio (app_directorio, todas las sedes), no sólo al equipo del
--     reporte; la regla rechazaría ids que el ERP manda hoy. La spec manda parar y reportar.
--   · F8 (hallazgo 8, quitar el execute a authenticated de las tres funciones private): con ese
--     revoke la prueba 0115 da FALLA en sus casos 5a, 5c y 6 (las llaman directo como authenticated),
--     y la spec exige que la 0115 siga pasando. Por eso aquí NO se toca el execute de authenticated.
--
-- QUÉ NO CAMBIA. Se parte de la definición VIGENTE tras 0001→0127, que para estas cuatro funciones es
-- la de la 0115 (la 0122 recreaba las firmas sin p_operador y la 0127 las borró). `create or replace`
-- con EXACTAMENTE las firmas de la 0127: ninguna firma nueva. Se conservan security definer,
-- search_path, private.pipeline_exigir_acceso, el token de operador (private.actor_pipeline), la lista
-- blanca de transiciones, H-4, H-7, el historial por prenda (private.prenda_historial_registrar) y
-- los grants. reportes_crear no se toca.
--
-- Idempotente: sólo `create or replace` y `revoke`/`grant` repetibles. Reaplicarla sola no cambia nada.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas. Aquí sólo aparece dentro de las
--     funciones de la 0115 que no se tocan (el almacén opera el pipeline completo).
--   · Esta migración no agrega ningún parámetro de negocio.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F1 — pipeline_avanzar: la lectura de etapa bloquea la prenda
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.pipeline_avanzar(p_id uuid, p_destino text, p_operador uuid default null)
  returns numeric language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_tipo text; v_tlav text; v_codigo text; v_dividida boolean;
  v_clave text; v_peso numeric; v_pts numeric; v_media boolean;
  v_permitidos text[]; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — una segunda sesión espera aquí y luego ve la etapa nueva.
  select etapa, tipo, tipo_lavado, codigo, dividida
    into v_etapa, v_tipo, v_tlav, v_codigo, v_dividida
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_dividida then raise exception 'Prenda dividida'; end if;

  -- Lista blanca (0086). Las etapas sin salida caen en array vacío.
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

  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, null);

  if v_pts > 0 then
    -- null = quien actúa no tiene rol de pipeline (H-4): la prenda avanza pero no cobra.
    if private.pipeline_registrar_punto(v_actor, p_id, v_etapa, v_pts,
            v_codigo || ': ' || v_etapa || ' → ' || p_destino || case when v_media then ' (½)' else '' end,
            v_hist) is null then
      v_pts := 0;
    end if;
  end if;
  return coalesce(v_pts, 0);
end;
$$;
revoke execute on function public.pipeline_avanzar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_avanzar(uuid, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F1 — pipeline_dividir: la lectura de la madre bloquea la prenda
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.pipeline_dividir(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_pr prenda_pasada;
  v_saco uuid; v_pant uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — sin esto dos sesiones creaban 4 hijas y dejaban 2 huérfanas.
  select * into v_pr from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_pr.dividida then raise exception 'Esta prenda ya fue dividida'; end if;

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-S', 'Saco', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_saco;
  perform private.prenda_historial_registrar(v_saco, null, v_pr.etapa, v_actor, 'Dividido: Saco de terno ' || v_pr.codigo);

  insert into prenda_pasada
    (codigo, tipo, color, talla, sede_origen_cod, etapa, tipo_lavado, fecha_ingreso,
     lista_lavanderia_id, obs_general, necesita_compostura)
    values (v_pr.codigo || '-P', 'Pantalón', v_pr.color, v_pr.talla, v_pr.sede_origen_cod, v_pr.etapa,
            v_pr.tipo_lavado, v_pr.fecha_ingreso, v_pr.lista_lavanderia_id,
            'Dividido de terno ' || v_pr.codigo, v_pr.necesita_compostura)
    returning id into v_pant;
  perform private.prenda_historial_registrar(v_pant, null, v_pr.etapa, v_actor, 'Dividido: Pantalón de terno ' || v_pr.codigo);

  update prenda_pasada set
    dividida = true, etapa = 'dividido',
    dividida_en = v_saco::text || ',' || v_pant::text, fecha_actualizado = now()
  where id = p_id;
  perform private.prenda_historial_registrar(p_id, v_pr.etapa, 'dividido', v_actor, 'Terno dividido en Saco + Pantalón');
end;
$$;
revoke execute on function public.pipeline_dividir(uuid, uuid) from public, anon;
grant  execute on function public.pipeline_dividir(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F1 + F5 — pipeline_enviar: bloquea la prenda y valida la sede destino
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.pipeline_enviar(p_id uuid, p_sede text, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_sesion uuid := auth.uid(); v_actor uuid; v_etapa text; v_envio uuid; v_activo_id uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  -- F1 (hallazgo 1): `for update` — sin esto dos sesiones dejaban un envío fantasma.
  select etapa, activo_id into v_etapa, v_activo_id from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if v_etapa <> 'listo' then raise exception 'Solo se envían prendas listas'; end if;
  -- F5 (hallazgo 5): la validación de la 0122 (:399-401), con su mismo texto, antes de insertar.
  if p_sede is null or not exists (select 1 from public.sedes where cod = p_sede) then
    raise exception 'La sede de destino % no existe', coalesce(p_sede, '(vacía)');
  end if;

  insert into envios_prendas (sede_destino_cod, fecha, responsable_id, estado)
    values (p_sede, now(), v_actor, 'enviado') returning id into v_envio;
  update prenda_pasada set etapa = 'enviado', envio_id = v_envio, fecha_actualizado = now() where id = p_id;
  perform private.prenda_historial_registrar(p_id, 'listo', 'enviado', v_actor,
    'Envío ' || substr(v_envio::text, 1, 8) || ' → ' || p_sede);

  -- Fase 7 tarea 2 (0055): el activo vinculado sale del pipeline y queda disponible.
  if v_activo_id is not null then
    update inventario_activo
      set estado = 'disponible'
      where id = v_activo_id and estado in ('codificando', 'en_pipeline', 'en_compostura');
  end if;
end;
$$;
revoke execute on function public.pipeline_enviar(uuid, text, uuid) from public, anon;
grant  execute on function public.pipeline_enviar(uuid, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F2 — private.pipeline_borrar_punto: el respaldo sólo borra un punto del mismo día Perú
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- p_todos = false → borra los puntos DEL MOVIMIENTO p_historial (deshacer), sean de quien sean; si
--                  no hay ninguno ligado (puntos de antes de historial_id), el último positivo de
--                  esa prenda en la etapa de origen de ese movimiento, sin mirar el empleado, y SÓLO
--                  si su fecha cae en el mismo día calendario de Perú que el movimiento (F2).
-- p_todos = true  → borra todos los puntos de esa prenda (deshacer división).
create or replace function private.pipeline_borrar_punto(
  p_pasada uuid, p_historial uuid default null, p_todos boolean default false)
  returns int language plpgsql volatile security definer set search_path = public
as $$
declare v_n int; v_h public.prenda_historial;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  if p_todos then
    delete from public.pipeline_puntos where pasada_id = p_pasada;
    get diagnostics v_n = row_count;
    return v_n;
  end if;
  select * into v_h from public.prenda_historial where id = p_historial and pasada_id = p_pasada;
  if v_h.id is null then return 0; end if;
  delete from public.pipeline_puntos where historial_id = v_h.id;
  get diagnostics v_n = row_count;
  if v_n = 0 and v_h.obs is null then
    -- F2 (hallazgo 2): un movimiento sin puntos propios por diseño (H-4, pts_* en 0) ya no se lleva
    -- un punto antiguo y ajeno de otro día. Las dos fechas son timestamptz: se pasan a hora Perú.
    delete from public.pipeline_puntos where id = (
      select id from public.pipeline_puntos
      where pasada_id = p_pasada and historial_id is null and etapa = v_h.etapa_anterior and puntos > 0
        and (fecha at time zone 'America/Lima')::date = (v_h.fecha at time zone 'America/Lima')::date
      order by fecha desc limit 1
    );
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;
-- El execute de authenticated NO se toca aquí: F8 está detenido (ver cabecera). `create or replace`
-- conserva los permisos que ya tenía; esto sólo reafirma que public y anon no ejecutan.
revoke execute on function private.pipeline_borrar_punto(uuid, uuid, boolean) from public, anon;
