-- 0076_meta_semanal_proporcional_default.sql — la semana que absorbe días sobrantes sube su meta.
--
-- Implementa docs/superpowers/specs/sueldos/SPEC-cambios-reglas-2026-08-17.md C-02.
--
-- Qué cambia: NADA de lógica. El parámetro `meta_semanal_fija` existe desde la 0072 y el motor lo
-- respeta en las dos direcciones (packages/core/src/sueldos.ts). Lo único que cambia es cuál de
-- las dos conductas viene de fábrica: pasa de `true` a `false`.
--
-- Por qué hace falta una migración para "sólo un default": el `insert ... on conflict do nothing`
-- de la 0072 ya dejó la fila `sueldo_meta_semanal_fija = 'true'` en producción, y
-- private.sueldo_parametros_config() la lee y pisa el default del core. Sin este `update`, invertir
-- el default en TypeScript no cambiaría una sola liquidación real.
--
-- Idempotente: reaplicarla vuelve a escribir el mismo valor.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) El default de la empresa
--
--    Se pisa el valor sin condición, a propósito. Es un `update` que puede borrar una elección
--    del administrador, así que vale decir por qué es seguro HOY y por qué no lo sería siempre:
--    a la fecha de esta migración no hay una sola liquidación emitida (sueldo_liquidaciones está
--    vacía) y nadie usa todavía el módulo, así que no existe una elección que respetar. Una
--    migración futura que quiera cambiar otro parámetro de negocio ya NO puede hacer esto: tendría
--    que mirar si el valor sigue siendo el sembrado antes de tocarlo.
--
--    Queda editable donde siempre: /configuracion → Sueldos → «Meta semanal fija».
-- ═══════════════════════════════════════════════════════════════════════════════════════════
update config
   set valor = 'false'
 where clave = 'sueldo_meta_semanal_fija';

-- Si la fila no existía (base nueva que nunca corrió el seed de la 0072), se crea.
insert into config (clave, valor)
values ('sueldo_meta_semanal_fija', 'false')
on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) Aviso, no comprobación
--
--    Una liquidación ya cerrada guarda su propio `parametros_usados` y su `motor_version`, así que
--    este cambio no la toca: lo congelado sigue congelado (0072 §6). Lo que sí cambia es toda
--    liquidación en borrador que se recalcule después de acá. Es lo esperado, pero conviene que
--    quede dicho en el log de la migración y no sólo en la spec.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  n integer;
begin
  select count(*) into n from sueldo_liquidaciones where estado = 'borrador';
  if n > 0 then
    raise notice '0076: hay % liquidacion(es) en borrador. Al recalcularlas, la semana que absorbe dias sobrantes pasa a pedir una meta mayor y eso puede apagar la comision del mes (SPEC-cambios-reglas-2026-08-17 C-02).', n;
  end if;
end $$;
