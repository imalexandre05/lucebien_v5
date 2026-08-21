-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  PROBAR 0076 + 0077 — NO deja nada escrito
--
--  OJO CON EL CASO 1. Este archivo prueba las DOS migraciones juntas: el archivo de prueba es
--  compartido, y su primer caso comprueba que la 0076 este aplicada.
--
--  Mientras no apliques la 0076 vas a ver:
--
--      RESULTADO 1-META-SIGUE-FIJA=FALLA(true) 2=ok 3=ok 4=ok 5=ok 6=ok
--
--  Eso NO es un defecto: es el caso 1 diciendo la verdad sobre una decision que todavia no
--  tomaste. Los casos 2 al 6 son los de la 0077, y son los que importan para aplicarla.
--
--  El caso 1 va a pasar a "ok" el dia que apliques la 0076 (archivo 8).
--
--  Pegá TODO este archivo en el editor SQL de Supabase y dale Run.
--
--  VA A TERMINAR EN ROJO, Y ESO ES LO CORRECTO. La prueba termina a propósito con una excepción,
--  y esa excepción hace que Postgres deshaga todo lo de esta corrida — incluido el cambio de
--  función. Probaste el código nuevo contra los datos reales y no quedó nada.
--
--  Lo que importa es el texto del error. Buscá la palabra RESULTADO:
--
--      ERROR: RESULTADO 1=ok 2=ok 3=ok ...
--
--  · Todos dicen «ok»  → seguí con el archivo de aplicar.
--  · Alguno dice FALLA → pará. Copiá la línea entera y mandámela.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


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


-- Prueba de las migraciones 0076_meta_semanal_proporcional_default.sql y
-- 0077_factor_hora_fuera_contrato.sql
--
-- Las dos son cambios de parámetro, así que lo único que hay que comprobar es que el parámetro
-- LLEGUE AL MOTOR. Ese es el modo de fallar que importa: la fila de config existe, el
-- administrador la edita en pantalla, la ve guardada, y private.sueldo_parametros_config() no la
-- emite porque nadie la agregó al mapa. Parece que funciona y liquida con el default.
--
-- SE DESCARTA SOLA. Todo vive en un bloque que termina lanzando una excepción con el resultado:
-- eso aborta la transacción y no queda ni una fila.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0077
--
-- Todo `ok` = las migraciones cumplen. Cualquier `FALLA` = una promesa que no se cumple.

do $$
declare
  p       jsonb;
  emp     uuid;
  acu     uuid;
  r       text := '';
begin
  -- ── 1) El default de la empresa quedó en meta proporcional (C-02) ────────────────────────
  -- La 0072 sembró 'true' con `on conflict do nothing`, así que sin el update de la 0076 esta
  -- comprobación falla y el motor liquidaría con la conducta anterior aunque el core diga otra.
  p := private.sueldo_parametros_config();
  if (p ->> 'metaSemanalFija') = 'false' then r := r || '1=ok ';
  else r := r || format('1-META-SIGUE-FIJA=FALLA(%s) ', coalesce(p ->> 'metaSemanalFija', 'ausente')); end if;

  -- ── 2) El factor de la hora fuera de contrato llega al motor (C-03) ──────────────────────
  -- Éste es el silencioso. Si falta la línea en el mapa de la RPC, la clave simplemente no
  -- aparece y el core aplica su default de 1 sin que nadie se entere.
  update config set valor = '1.5' where clave = 'sueldo_factor_hora_fuera_contrato';
  p := private.sueldo_parametros_config();
  if (p ->> 'factorHoraFueraContrato')::numeric = 1.5 then r := r || '2=ok ';
  else r := r || format('2-FACTOR-NO-LLEGA=FALLA(%s) ', coalesce(p ->> 'factorHoraFueraContrato', 'ausente')); end if;

  -- ── 3) En blanco significa "no configurado", no cero ─────────────────────────────────────
  -- Un factor 0 es una decisión válida ("no se paga aparte"); una celda vacía NO es esa decisión.
  -- Number('') es 0 y es finito, así que un cast ingenuo dejaría de pagar la hora sin avisar.
  update config set valor = '' where clave = 'sueldo_factor_hora_fuera_contrato';
  p := private.sueldo_parametros_config();
  if not (p ? 'factorHoraFueraContrato') then r := r || '3=ok ';
  else r := r || format('3-VACIO-NO-CAE-AL-DEFAULT=FALLA(%s) ', p ->> 'factorHoraFueraContrato'); end if;

  -- ── 4) Basura corta, no liquida a ciegas ─────────────────────────────────────────────────
  update config set valor = 'una vez y media' where clave = 'sueldo_factor_hora_fuera_contrato';
  begin
    p := private.sueldo_parametros_config();
    r := r || '4-BASURA-NO-CORTA=FALLA ';
  exception when others then
    if sqlerrm like 'CONFIG:%' then r := r || '4=ok ';
    else r := r || format('4-CORTA-MAL=FALLA(%s) ', sqlerrm); end if;
  end;

  -- ── 5) Se puede pactar por contrato: la lista blanca acepta la clave nueva ───────────────
  -- Sin ampliar sueldo_acuerdos_parametros_chk, pactarlo con una persona explota con un error de
  -- base sin traducir en la pantalla de contratos.
  select id into emp from empleados order by id limit 1;
  insert into sueldo_acuerdos(empleado_id, fecha_inicio, fecha_fin, modalidad, sueldo_pactado, estado, parametros)
    values (emp, '2099-01-01', '2099-01-31', 'mensual', 600, 'borrador', '{"factorHoraFueraContrato": 1.5}'::jsonb)
    returning id into acu;
  r := r || '5=ok ';

  -- ── 6) Y una clave inventada sigue rebotando ────────────────────────────────────────────
  -- La lista blanca se rehizo entera en la 0077. Si al rehacerla se hubiera aflojado, un
  -- 'factor_hora_fuera_contrato' en snake_case entraría, y TODA liquidación de esa persona
  -- cortaría después con "Parámetro de sueldo desconocido".
  begin
    update sueldo_acuerdos set parametros = '{"factor_hora_fuera_contrato": 1.5}'::jsonb where id = acu;
    r := r || '6-LISTA-BLANCA-AFLOJADA=FALLA ';
  exception when check_violation then
    r := r || '6=ok ';
  end;

  raise exception 'RESULTADO %', r;
end $$;
