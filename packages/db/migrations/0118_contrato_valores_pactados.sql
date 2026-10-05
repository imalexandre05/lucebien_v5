-- 0118_contrato_valores_pactados.sql — cada contrato lleva sus propios valores pactados
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-05-contrato-valores-pactados-design.md
-- (ticket imalexandre05/lucebien-tablero#20). ZONA CRÍTICA: toca la cadena del sueldo.
--
-- EL PROBLEMA. Un contrato guardaba sólo los valores que se pisaban a mano (`parametros`); todo lo
-- demás seguía a la configuración global (`config`) a través de
-- `private.sueldo_parametros_config() || a.parametros` (0098, sueldo_entrada). Cambiar
-- /configuracion movía el sueldo de TODOS los contratos, viejos incluidos.
--
-- DECISIÓN DEL DUEÑO (05-oct-2026): un cambio de parámetros aplica SÓLO a contratos nuevos; los
-- contratos EXISTENTES se congelan con los valores de HOY.
--
-- QUÉ HACE, y nada más:
--   1) private.sueldo_parametros_defaults(): los 15 defaults del código (foto de
--      PARAMETROS_SUELDO_DEFAULT, packages/core/src/sueldos.ts). Un test de vitest
--      (contrato-parametros.test.ts) compara este bloque con el core y falla si se alejan.
--   2) private.sueldo_acuerdos_congelar_parametros(): completa `parametros` de cada contrato con
--      defaults || config de HOY || lo que el contrato ya tenía. NO pisa ningún valor propio.
--      Idempotente: sólo toca los contratos a los que les falta alguna clave.
--   3) public.sueldo_parametros_vigentes(): lo que hay fijado en `config` (sin defaults), sólo
--      admin. El servidor lo completa con los defaults del core y lo copia al contrato nuevo
--      (apps/erp-web/lib/sueldos-repo.ts, crearAcuerdo). Una sola fuente del mapa config→parámetro.
--   4) Ejecuta el congelado una vez.
--
-- NO cambia `sueldo_entrada` ni ninguna fórmula. La precedencia `config || contrato` ya da el
-- último valor al contrato; lo que cambia es que ahora el contrato TIENE todas las claves, así que
-- `config` queda sólo como respaldo de un contrato al que le falte una.
--
-- `metaSemanal` (default null = «sin meta pactada, se sugiere con las horas») no se copia: null y
-- ausente significan lo mismo y no existe clave global que la fije.
--
-- PR #54 (pago por puntos, 0117) agrega `puntosMetaMensual` y `solesPorPunto`: NO están en main,
-- así que este congelado no las incluye. #54 debe sumarlas a la lista blanca, a los defaults y a
-- esta copia (nacen vacías = desactivadas, ver su spec).
--
-- Sin parámetros nuevos ni reglas inventadas: no hay nada que anotar en pendientes-negocio.md.
-- Si `config` tuviera basura, `sueldo_parametros_config()` corta con CONFIG: y la migración falla
-- entera, sin congelar nada equivocado.
--
-- Idempotente: `create or replace function` + un update que sólo toca lo incompleto.
--
-- Verificación después de aplicar (correr a mano; no está activa a propósito):
--   -- Tiene que dar 0 filas: ningún contrato sin las 15 claves.
--   -- select id, empleado_id, parametros
--   --   from sueldo_acuerdos
--   --  where not (parametros ?& array[
--   --    'toleranciaMinutos','tardanzasLibres','penalidadTardanza','valorAlmuerzo',
--   --    'horasMinimasAlmuerzo','valorCapacitacion','bonoMetaSemanal','factorMeta',
--   --    'metaSemanalFija','pctComision','montoMinimoComision','diasDescuentoPorFalta',
--   --    'metaPorHora','factorHoraFueraContrato','pausaMinimaMinutos']);
--
-- Prueba: packages/db/pruebas/0118_contrato_valores_pactados.prueba.sql

-- ═══ 1) Los defaults del código, en un solo lugar de SQL ═══════════════════════════════════════
create or replace function private.sueldo_parametros_defaults()
  returns jsonb language sql immutable set search_path = public as $fn$
  select jsonb_build_object(
    -- DEFAULTS:begin
    'toleranciaMinutos', 10,
    'tardanzasLibres', 3,
    'penalidadTardanza', 5,
    'valorAlmuerzo', 8,
    'horasMinimasAlmuerzo', 12,
    'valorCapacitacion', 25,
    'bonoMetaSemanal', 30,
    'factorMeta', 1,
    'metaSemanalFija', false,
    'pctComision', 0.02,
    'montoMinimoComision', 120,
    'diasDescuentoPorFalta', 2,
    'metaPorHora', 45.45454545454545,
    'factorHoraFueraContrato', 1,
    'pausaMinimaMinutos', 15
    -- DEFAULTS:end
  )
$fn$;

revoke execute on function private.sueldo_parametros_defaults() from public, anon;
grant  execute on function private.sueldo_parametros_defaults() to authenticated, service_role;

-- ═══ 2) El congelado: devuelve cuántos contratos completó ══════════════════════════════════════
create or replace function private.sueldo_acuerdos_congelar_parametros()
  returns integer language plpgsql set search_path = public as $fn$
declare
  v_hoy   jsonb := private.sueldo_parametros_defaults() || private.sueldo_parametros_config();
  v_n     integer;
begin
  -- `v_hoy || parametros`: lo que el contrato ya tenía va a la derecha y gana siempre.
  with u as (
    update sueldo_acuerdos
       set parametros = v_hoy || parametros
     where not (parametros ?& array(select jsonb_object_keys(private.sueldo_parametros_defaults())))
    returning 1
  )
  select count(*) into v_n from u;
  return v_n;
end;
$fn$;

-- Es una operación de migración, no de la API: nadie con sesión la llama.
revoke execute on function private.sueldo_acuerdos_congelar_parametros() from public, anon, authenticated;

-- ═══ 3) Los valores vigentes de /configuracion, para copiarlos a un contrato nuevo ════════════
create or replace function public.sueldo_parametros_vigentes()
  returns jsonb language plpgsql stable set search_path = public as $fn$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede leer los parámetros de sueldo';
  end if;
  return private.sueldo_parametros_config();
end;
$fn$;

revoke execute on function public.sueldo_parametros_vigentes() from public, anon;
grant  execute on function public.sueldo_parametros_vigentes() to authenticated;

comment on function public.sueldo_parametros_vigentes() is
  'Lo que /configuracion tiene fijado para los parámetros de sueldo (sin defaults del código). Sólo
   admin. El servidor lo completa con los defaults del core y lo copia al contrato nuevo.';

-- ═══ 4) Congelar los contratos existentes con los valores de hoy ═══════════════════════════════
select private.sueldo_acuerdos_congelar_parametros();
