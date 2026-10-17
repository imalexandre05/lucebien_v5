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
