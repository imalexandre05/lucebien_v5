-- Release 2026-10-17c: migraciones 0139, 0140 y 0142 en orden. Idempotente. NO registra en schema_migrations.
-- Generado concatenando packages/db/migrations/0139, 0140 y 0142 (la 0144 NO va en este release). Aplicar con backup previo.
begin;

-- ===== 0139_pasajes_puntualidad.sql =====
-- 0139_pasajes_puntualidad.sql — beneficio de pasajes por llegar temprano a la liquidación.
--
-- Spec: docs/superpowers/specs/2026-10-17-pasajes-puntualidad-design.md (regla confirmada por el dueño).
-- La liquidación la calcula el core (liquidarPeriodo); esta migración sólo deja las dos claves editables
-- y hace que `sueldo_parametros_config()` las entregue.
--
--   sueldo_monto_pasaje          '' (vacío = no se paga nada). Lo define el administrador (Jordan).
--   sueldo_pasaje_minutos_antes  '5'  (dato del dueño; editable).
--
-- Idempotente. `sueldo_parametros_config()` es el cuerpo de la 0117 con dos entradas más en el mapa.

insert into config (clave, valor) values
  ('sueldo_monto_pasaje',          ''),
  ('sueldo_pasaje_minutos_antes',  '5')
on conflict (clave) do nothing;

create or replace function private.sueldo_parametros_config()
  returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  r      record;
  v_txt  text;
  salida jsonb := '{}'::jsonb;
  -- clave de config → clave camelCase de ParametrosSueldo
  mapa constant jsonb := jsonb_build_object(
    'sueldo_tolerancia_minutos',         'toleranciaMinutos',
    'sueldo_tardanzas_libres',           'tardanzasLibres',
    'sueldo_penalidad_tardanza',         'penalidadTardanza',
    'sueldo_valor_almuerzo',             'valorAlmuerzo',
    'sueldo_horas_minimas_almuerzo',     'horasMinimasAlmuerzo',
    'sueldo_valor_capacitacion',         'valorCapacitacion',
    'sueldo_bono_meta_semanal',          'bonoMetaSemanal',
    'sueldo_factor_meta',                'factorMeta',
    'sueldo_pct_comision',               'pctComision',
    'sueldo_monto_minimo_comision',      'montoMinimoComision',
    'sueldo_dias_descuento_por_falta',   'diasDescuentoPorFalta',
    'sueldo_meta_por_hora',              'metaPorHora',
    'sueldo_factor_hora_fuera_contrato', 'factorHoraFueraContrato',
    'sueldo_pausa_minima_minutos',       'pausaMinimaMinutos',
    -- 0117: pago por puntos. Vacías por defecto = desactivado (en blanco cae al default del core,
    -- que es null). Las dos tienen que estar definidas para que se pague algo.
    'sueldo_puntos_meta_mensual',        'puntosMetaMensual',
    'sueldo_soles_por_punto',            'solesPorPunto',
    -- 0139: pasajes por llegar temprano. El monto vacío = no se paga (decisión del dueño).
    'sueldo_monto_pasaje',               'montoPasaje',
    'sueldo_pasaje_minutos_antes',       'minutosAntesPasaje'
  );
begin
  for r in
    select c.clave, trim(coalesce(c.valor, '')) as valor
    from config c
    where mapa ? c.clave
  loop
    continue when r.valor = '';   -- en blanco = "no configurado" = default del core

    if r.valor !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'CONFIG:el parámetro "%" tiene que ser un número y dice "%"', r.clave, r.valor;
    end if;

    salida := salida || jsonb_build_object(mapa ->> r.clave, r.valor::numeric);
  end loop;

  -- El booleano, aparte: 'false' es false y CUALQUIER otro texto es true, igual que el control de
  -- la UI. Un `to_jsonb(valor::boolean)` reventaría con 'si' o con '0'.
  select trim(coalesce(valor, '')) into v_txt from config where clave = 'sueldo_meta_semanal_fija';
  if coalesce(v_txt, '') <> '' then
    salida := salida || jsonb_build_object('metaSemanalFija', v_txt <> 'false');
  end if;

  return salida;
end;
$fn$;

revoke execute on function private.sueldo_parametros_config() from public, anon;
grant  execute on function private.sueldo_parametros_config() to authenticated, service_role;


-- ===== 0140_rechazo_calidad.sql =====
-- 0140_rechazo_calidad.sql — un trabajo rechazado por calidad pierde todos sus puntos y el retrabajo no paga.
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-rechazo-calidad-pierde-puntos-design.md (decisión del
-- dueño, sesión 4B). Prueba: packages/db/pruebas/0140_rechazo_calidad.prueba.sql.
-- ZONA CRÍTICA (cadena del sueldo): spec y prueba van en commits anteriores a esta migración.
--
--  1) pipeline_rechazar: la fila negativa `<etapa>_rechazo` descuenta exactamente lo que el culpable
--     cobró en esa etapa para esa prenda (neto 0), en vez del peso actual de la etapa.
--  2) pipeline_registrar_punto: se quita la excepción de la 0130 por la que un rechazo reabría la
--     etapa: quien rehace una etapa rechazada tampoco cobra.
--
-- `create or replace` con las mismas firmas; conservan security definer, search_path y grants (0115/0122).
-- Idempotente. No agrega ningún parámetro de negocio.

create or replace function private.pipeline_registrar_punto(
  p_empleado uuid, p_pasada uuid, p_etapa text, p_puntos numeric, p_detalle text, p_historial uuid default null)
  returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform private.pipeline_exigir_derecho(p_pasada);
  -- H-4: sólo cobra (o se descuenta) quien tiene rol de pipeline. Sin rol → no se escribe nada.
  if not exists (
    select 1 from public.empleados e
    where e.id = p_empleado and e.rol in ('admin', 'dueno', 'encargado_almacen', 'confeccionista')
  ) then
    return null;
  end if;
  -- 0130/0140: el retrabajo no paga. Una etapa ya pagada para esta prenda (o para su madre, si es una
  -- hija de dividir) no se vuelve a pagar, tampoco tras un rechazo de calidad: el rechazo le quita al
  -- culpable lo que cobró (pipeline_rechazar) pero NO reabre la etapa (decisión del dueño, 0140).
  if p_puntos > 0 and exists (
    select 1 from public.pipeline_puntos pp
    where pp.etapa = p_etapa and pp.puntos > 0
      and pp.pasada_id in (
        select p_pasada
        union
        select m.id from public.prenda_pasada m
         where m.dividida and m.dividida_en like '%' || p_pasada::text || '%')
  ) then
    return null;
  end if;
  insert into public.pipeline_puntos (empleado_id, pasada_id, etapa, puntos, detalle, fecha, historial_id)
    values (p_empleado, p_pasada, p_etapa, p_puntos, p_detalle, now(), p_historial)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function pipeline_rechazar(p_id uuid, p_destino text, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_actor uuid;
  v_etapa text; v_codigo text;
  v_culpable uuid; v_pts numeric; v_hist uuid;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;
  perform private.pipeline_exigir_acceso(p_id);
  v_actor := private.actor_pipeline(p_operador);
  select etapa, codigo into v_etapa, v_codigo
    from prenda_pasada where id = p_id for update;
  if not found then raise exception 'Prenda no encontrada'; end if;
  -- H-7 (igual que la 0122 y la 0112): sólo lo que ofrece la pantalla. Cierra también el doble
  -- rechazo: tras el primero la prenda ya no está en control_calidad.
  if v_etapa <> 'control_calidad'
     or p_destino is null
     or not (p_destino = any(array['recepcion','lavado','empatado','refaccion','compostura','planchado'])) then
    raise exception 'TRANSICION: sólo se rechaza desde control de calidad hacia una etapa anterior';
  end if;

  select empleado_id into v_culpable from prenda_historial
    where pasada_id = p_id and etapa_anterior = p_destino and empleado_id is not null
    order by fecha desc limit 1;

  update prenda_pasada set etapa = p_destino, aprobada = false, fecha_actualizado = now() where id = p_id;
  v_hist := private.prenda_historial_registrar(p_id, v_etapa, p_destino, v_actor, 'Rechazado → ' || p_destino);

  if v_culpable is not null then
    -- 0140: pierde TODOS los puntos de ese trabajo: lo que esa persona cobró en esa etapa para esta
    -- prenda (o su madre, si es hija de dividir), menos lo ya descontado por rechazos anteriores.
    -- Así el neto del trabajo queda en 0, sin depender del peso actual (`pts_*`) ni de si es media prenda.
    select coalesce(sum(pp.puntos), 0) into v_pts
      from pipeline_puntos pp
     where pp.empleado_id = v_culpable
       and pp.etapa in (p_destino, p_destino || '_rechazo')
       and pp.pasada_id in (
         -- la familia: la prenda, su madre y todas las hijas de esa madre (hermanas incluidas), para que
         -- los rechazos de una hermana cuenten y el culpable nunca quede bajo 0
         select p_id
         union
         select m.id from prenda_pasada m where m.dividida and m.dividida_en like '%' || p_id::text || '%'
         union
         select h.id from prenda_pasada m join prenda_pasada h on m.dividida_en like '%' || h.id::text || '%'
          where m.dividida and m.dividida_en like '%' || p_id::text || '%');
    if v_pts > 0 then
      perform private.pipeline_registrar_punto(v_culpable, p_id, p_destino || '_rechazo', -v_pts,
              'Rechazo: ' || v_codigo || ' de ' || v_etapa || ' → ' || p_destino || '; pierde ' || v_pts || ' pts', v_hist);
    end if;
  end if;
end;
$$;

revoke execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) from public, anon;
grant  execute on function private.pipeline_registrar_punto(uuid, uuid, text, numeric, text, uuid) to authenticated;
revoke execute on function pipeline_rechazar(uuid, text, uuid) from public, anon;
grant execute on function pipeline_rechazar(uuid, text, uuid) to authenticated;


-- ===== 0142_capacitacion_encargado_sede.sql =====
-- 0142: el encargado de tienda ve el avance de la capacitación de la gente de SU sede.
-- Decisión del dueño (17-oct-2026): la persona nueva ve sólo la suya; el encargado ve a su gente
-- (sólo su sede); el admin ve todo. Antes de esto el encargado sólo veía lo que él mismo dictaba.
-- Sólo lectura: calificar sigue siendo del capacitador asignado o del admin (0131).
-- Idempotente: create or replace + drop policy if exists.

create or replace function private.capacitacion_encargado_ve(p_nuevo uuid)
  returns boolean language sql stable security definer set search_path = ''
as $$
  select private.app_mi_rol() = 'encargado_tienda'
     and exists (
       select 1 from public.empleados n
        where n.id = p_nuevo
          and (n.sede_cod in (select private.app_sedes())
               or exists (select 1 from public.empleado_tiendas t
                           where t.empleado_id = n.id and t.sede_cod in (select private.app_sedes())))
     );
$$;
revoke all on function private.capacitacion_encargado_ve(uuid) from public, anon;
grant execute on function private.capacitacion_encargado_ve(uuid) to authenticated;

drop policy if exists cap_select on public.capacitaciones;
create policy cap_select on public.capacitaciones for select to authenticated
  using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.activo)   -- suspendido: no lee
    and (private.app_es_admin() or nuevo_id = auth.uid() or capacitador_id = auth.uid()
         or private.capacitacion_encargado_ve(nuevo_id))
  );
-- avances y exámenes heredan la visibilidad vía el subselect sobre capacitaciones (sin cambios).

commit;
