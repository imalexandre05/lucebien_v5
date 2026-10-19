-- 0157 — Contrato + horario en una sola transacción
-- Spec: docs/superpowers/specs/empleados/2026-10-18-acuerdo-con-turnos-atomico-design.md
--
-- sueldo_acuerdo_guardar(p_acuerdo, p_fila, p_turnos): crea (p_acuerdo nulo) o actualiza el
-- contrato y reemplaza su horario llamando a sueldo_acuerdo_guardar_turnos (0149). Si los turnos
-- fallan, se deshace también el contrato: ni contrato sin horario ni términos nuevos con horario
-- viejo. La RPC no decide reglas de negocio: escribe lo que el servidor ya resolvió (parámetros
-- vigentes + overrides). Los errores de restricciones del contrato (solape de fechas, checks) se
-- dejan salir tal cual, como cuando se escribía la tabla directo.
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
                                 sueldo_pactado, escala, almuerzo_habilitado, parametros, creado_por)
    values ((p_fila->>'empleado_id')::uuid,
            (p_fila->>'fecha_inicio')::date,
            (p_fila->>'fecha_fin')::date,
            p_fila->>'modalidad',
            nullif(p_fila->>'cada_dias', '')::int,
            (p_fila->>'sueldo_pactado')::numeric,
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
  'Crea o actualiza un contrato y reemplaza su horario en una sola transaccion. Solo admin.
   Spec empleados/2026-10-18-acuerdo-con-turnos-atomico.';

revoke execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) from public, anon;
grant  execute on function sueldo_acuerdo_guardar(uuid, jsonb, jsonb) to authenticated;
