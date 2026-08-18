-- 0077_factor_hora_fuera_contrato.sql — la hora fuera de contrato se puede pactar a otro precio.
--
-- Implementa docs/superpowers/specs/sueldos/SPEC-cambios-reglas-2026-08-17.md C-03.
--
-- Parámetro nuevo `factorHoraFueraContrato`, **default 1**: multiplica el valor de la hora sólo en
-- la línea de RN-17. Con 1 ninguna liquidación existente cambia de monto — que es justamente el
-- punto de elegir ese default. Con 1.5 esa hora se paga un 50% más.
--
-- Un parámetro nuevo del motor toca TRES lugares en la base, y olvidarse de uno falla distinto:
--   1. La lista blanca de sueldo_acuerdos.parametros — sin esto, pactarlo por contrato lo rechaza
--      el check y el administrador ve un error de base de datos sin traducir.
--   2. private.sueldo_parametros_config() — sin esto, la fila de config existe, se puede editar en
--      pantalla y NO LLEGA AL MOTOR. Es el más silencioso de los tres: parece que funciona.
--   3. La fila sembrada en config — sin esto no aparece en /configuracion.
--
-- Idempotente: el check se borra y se vuelve a crear, la función es `create or replace` y el
-- insert lleva `on conflict do nothing`.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) Lista blanca de claves de sueldo_acuerdos.parametros (era de 14 claves, pasa a 15)
--
--    Se rehace entera en vez de intentar "agregarle" una clave: un check de Postgres no se
--    amplía, se reemplaza. Quitarle las 15 claves conocidas al jsonb tiene que dejarlo vacío.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
alter table sueldo_acuerdos drop constraint if exists sueldo_acuerdos_parametros_chk;

alter table sueldo_acuerdos add constraint sueldo_acuerdos_parametros_chk check (
  jsonb_typeof(parametros) = 'object'
  and parametros - array[
    'toleranciaMinutos', 'tardanzasLibres', 'penalidadTardanza', 'valorAlmuerzo',
    'horasMinimasAlmuerzo', 'valorCapacitacion', 'bonoMetaSemanal', 'metaSemanal',
    'factorMeta', 'metaSemanalFija', 'pctComision', 'montoMinimoComision',
    'diasDescuentoPorFalta', 'metaPorHora', 'factorHoraFueraContrato'
  ] = '{}'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) La lectura de los parámetros globales
--
--    Copia literal de la 0073 con una línea más en el mapa. Las tres trampas que documenta la
--    0073 siguen aplicando y por eso el cuerpo no se toca:
--      a) Number('') es 0 y es finito → en blanco significa "no configurado", cae al default.
--      b) Basura ("uno y medio") corta con CONFIG: en vez de liquidar a ciegas.
--      c) Boolean('false') es true → el booleano se compara contra 'false' explícito.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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
    'sueldo_factor_hora_fuera_contrato', 'factorHoraFueraContrato'
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) El default de la empresa
--
--    `on conflict do nothing`: reaplicar la migración no pisa lo que el administrador ya editó.
--    A diferencia de la 0076, acá no hay nada que corregir — la fila no existía.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into config (clave, valor) values
  ('sueldo_factor_hora_fuera_contrato', '1')
on conflict (clave) do nothing;
