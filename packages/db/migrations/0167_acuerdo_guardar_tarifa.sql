-- 0167 — sueldo_acuerdo_guardar guarda la tarifa por hora
-- Spec: docs/superpowers/specs/2026-10-18-acuerdo-guardar-tarifa-design.md
--
-- La 0157 (contrato + horario atómicos) listaba las columnas a mano y se escribió antes de la 0164:
-- descartaba `p_fila.tarifa_hora`, y un contrato por horas nuevo quedaba como sueldo fijo de S/ 0.
-- Cuerpo EXACTO de la 0157 más `tarifa_hora` en el insert y en el update (nulo = sueldo fijo).
--
-- Idempotente: create or replace + revoke/grant. No toca datos ni esquema.

create or replace function sueldo_acuerdo_guardar(p_acuerdo uuid, p_fila jsonb, p_turnos jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede guardar un contrato';
  end if;
  if p_fila is null or jsonb_typeof(p_fila) <> 'object' then
    raise exception 'DATO:faltan los datos del contrato';
  end if;

  if p_acuerdo is null then
    insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, modalidad, cada_dias,
                                 sueldo_pactado, tarifa_hora, escala, almuerzo_habilitado, parametros, creado_por)
    values ((p_fila->>'empleado_id')::uuid,
            (p_fila->>'fecha_inicio')::date,
            (p_fila->>'fecha_fin')::date,
            p_fila->>'modalidad',
            nullif(p_fila->>'cada_dias', '')::int,
            (p_fila->>'sueldo_pactado')::numeric,
            nullif(p_fila->>'tarifa_hora', '')::numeric,
            nullif(p_fila->>'escala', '')::int,
            coalesce((p_fila->>'almuerzo_habilitado')::boolean, false),
            coalesce(p_fila->'parametros', '{}'::jsonb),
            nullif(p_fila->>'creado_por', '')::uuid)
    returning id into v_id;
  else
    perform 1 from sueldo_acuerdos where id = p_acuerdo for update;
    if not found then
      raise exception 'DATO:ese contrato no existe';
    end if;
    update sueldo_acuerdos set
      empleado_id         = (p_fila->>'empleado_id')::uuid,
      fecha_inicio        = (p_fila->>'fecha_inicio')::date,
      fecha_fin           = (p_fila->>'fecha_fin')::date,
      modalidad           = p_fila->>'modalidad',
      cada_dias           = nullif(p_fila->>'cada_dias', '')::int,
      sueldo_pactado      = (p_fila->>'sueldo_pactado')::numeric,
      tarifa_hora         = nullif(p_fila->>'tarifa_hora', '')::numeric,
      escala              = nullif(p_fila->>'escala', '')::int,
      almuerzo_habilitado = coalesce((p_fila->>'almuerzo_habilitado')::boolean, false),
      parametros          = coalesce(p_fila->'parametros', '{}'::jsonb)
    where id = p_acuerdo;
    v_id := p_acuerdo;
  end if;

  -- Reutiliza la 0149 (mismas validaciones y mensajes). Si lanza, se revierte todo lo anterior.
  perform sueldo_acuerdo_guardar_turnos(v_id, coalesce(p_turnos, '[]'::jsonb));
  return v_id;
end;
$fn$;

comment on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) is
  'Crea o actualiza un contrato (con su tarifa por hora, 0167) y reemplaza su horario en una sola transaccion. Solo admin.
   Spec empleados/2026-10-18-acuerdo-con-turnos-atomico.';

revoke execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) from public, anon;
grant  execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) to authenticated;
