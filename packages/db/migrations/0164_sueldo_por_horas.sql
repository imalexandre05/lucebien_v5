-- 0164_sueldo_por_horas.sql — el contrato guarda una tarifa por hora; con tarifa se paga por horas
-- reales (decisión del dueño n.º 1, 18-oct-2026).
--
-- Implementa docs/superpowers/specs/sueldos/2026-10-18-sueldo-por-horas-design.md §4.
-- Prueba: packages/db/pruebas/0164_sueldo_por_horas.prueba.sql (escrita antes).
--
-- ZONA CRÍTICA (cadena del sueldo). El cálculo vive en el core (`liquidarPeriodo`); la base sólo
-- guarda la tarifa y la entrega con los datos del calendario de pago (`sueldo_entrada_pago`, 0121),
-- que el cierre ya compara. Por eso el cierre no se toca: si la tarifa cambia entre el cálculo y el
-- cierre, `contratoPago` difiere y responde DESACTUALIZADA.
--
-- REGRESIÓN. `tarifaHora` sólo se emite cuando no es nula. Un contrato de sueldo fijo (todos los que
-- existen al aplicar esto) devuelve el mismo jsonb que antes: sus borradores no piden recalcular y
-- sus liquidaciones no cambian.
--
-- Sin parámetros de negocio nuevos. Idempotente: `add column if not exists`, restricciones dentro de
-- un bloque que consulta pg_constraint, `create or replace` (conserva los grants).

alter table sueldo_acuerdos        add column if not exists tarifa_hora numeric(10,4);
alter table sueldo_acuerdo_cambios add column if not exists tarifa_hora numeric(10,4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sueldo_acuerdos_tarifa_chk') then
    alter table sueldo_acuerdos
      add constraint sueldo_acuerdos_tarifa_chk check (tarifa_hora is null or tarifa_hora > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sueldo_cambios_tarifa_chk') then
    alter table sueldo_acuerdo_cambios
      add constraint sueldo_cambios_tarifa_chk check (tarifa_hora is null or tarifa_hora > 0);
  end if;
end $$;

comment on column sueldo_acuerdos.tarifa_hora is
  'Soles por hora trabajada (0164). Con tarifa el contrato se paga por horas reales y sueldo_pactado
   no se usa (queda en 0). Nula = contrato de sueldo fijo de antes, que se liquida como siempre.';
comment on column sueldo_acuerdo_cambios.tarifa_hora is
  'Tarifa por hora desde `desde` (0164). Nula = sigue la tarifa anterior.';

-- Cuerpo de la 0121 + `tarifaHora` sólo cuando no es nula.
create or replace function public.sueldo_entrada_pago(p_acuerdo uuid)
  returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'contratoPago', jsonb_build_object(
      'fechaInicio',   to_char(a.fecha_inicio, 'YYYY-MM-DD'),
      'fechaFin',      to_char(a.fecha_fin, 'YYYY-MM-DD'),
      'modalidad',     a.modalidad,
      'cadaDias',      a.cada_dias,
      'sueldoPactado', a.sueldo_pactado)
      || case when a.tarifa_hora is null then '{}'::jsonb
              else jsonb_build_object('tarifaHora', a.tarifa_hora) end,
    'cambiosFrecuencia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'desde',         to_char(c.desde, 'YYYY-MM-DD'),
               'modalidad',     c.modalidad,
               'cadaDias',      c.cada_dias,
               'sueldoPactado', c.sueldo_pactado)
             || case when c.tarifa_hora is null then '{}'::jsonb
                     else jsonb_build_object('tarifaHora', c.tarifa_hora) end
             order by c.desde)
      from sueldo_acuerdo_cambios c where c.acuerdo_id = a.id), '[]'::jsonb))
  from sueldo_acuerdos a
  where a.id = p_acuerdo;
$fn$;

comment on function public.sueldo_entrada_pago(uuid) is
  'Contrato y cambios de frecuencia de un acuerdo: los datos con los que el core calcula el pago de cada tramo (0121; desde la 0164 también la tarifa por hora, sólo si la hay). El repo los guarda en la entrada del borrador y el cierre los compara.';
