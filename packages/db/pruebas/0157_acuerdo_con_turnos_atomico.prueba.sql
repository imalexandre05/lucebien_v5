-- Prueba de la migración 0157_acuerdo_con_turnos_atomico.sql
-- Spec: docs/superpowers/specs/empleados/2026-10-18-acuerdo-con-turnos-atomico-design.md
--
-- Ataca:
--   A  crear con turnos válidos deja contrato + horario;
--   B  crear con turnos solapados NO deja contrato (y reintentar con turnos buenos funciona);
--   C  actualizar con turnos solapados deja términos Y horario anteriores;
--   D  actualizar válido cambia ambos;
--   E  actualizar un contrato inexistente falla con DATO;
--   F  un no-admin no puede; anon no tiene EXECUTE.
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado. Correr el archivo ENTERO.
-- Cómo se corre: bash tools/probar-migracion.sh 0157

do $$
declare
  adm uuid; col uuid; emp uuid;
  v_id uuid; v_id2 uuid; v_n int; v_sueldo numeric; v_msg text;
  v_fallas text := '';
  v_ok jsonb := '[{"dia_semana":1,"hora_inicio":"09:00","hora_fin":"13:00","lugar":"AL"}]';
  v_ok2 jsonb := '[{"dia_semana":3,"hora_inicio":"10:00","hora_fin":"14:00","lugar":"AL"},
                   {"dia_semana":3,"hora_inicio":"14:00","hora_fin":"18:00","lugar":null}]';
  v_mal jsonb := '[{"dia_semana":2,"hora_inicio":"09:00","hora_fin":"14:00","lugar":"AL"},
                   {"dia_semana":2,"hora_inicio":"13:00","hora_fin":"20:00","lugar":"AL"}]';
  v_fila jsonb;
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Admin 0157', '0157a', 'admin', true, null, 'AA') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Colab 0157', '0157c', 'ventas_junior', true, null, 'CC') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Emp 0157', '0157e', 'ventas_junior', true, null, 'EE') returning id into emp;

  v_fila := jsonb_build_object('empleado_id', emp, 'fecha_inicio', '2099-01-01', 'fecha_fin', '2099-03-31',
    'modalidad', 'mensual', 'cada_dias', null, 'sueldo_pactado', 1500, 'escala', null,
    'almuerzo_habilitado', false, 'parametros', '{}'::jsonb, 'creado_por', adm);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  -- B) crear con turnos solapados: nada queda
  begin
    perform sueldo_acuerdo_guardar(null, v_fila, v_mal);
    v_fallas := v_fallas || E'\n  · B: aceptó turnos solapados';
  exception when others then
    if sqlerrm not like 'DATO:%solapan%' then v_fallas := v_fallas || E'\n  · B: mensaje inesperado: ' || sqlerrm; end if;
  end;
  select count(*) into v_n from sueldo_acuerdos where empleado_id = emp;
  if v_n <> 0 then v_fallas := v_fallas || E'\n  · B: quedó un contrato sin horario'; end if;

  -- A) crear válido (el reintento no choca con sin_solape)
  v_id := sueldo_acuerdo_guardar(null, v_fila, v_ok);
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = v_id;
  if v_id is null or v_n <> 1 then v_fallas := v_fallas || E'\n  · A: contrato u horario mal creados'; end if;
  if (select creado_por from sueldo_acuerdos where id = v_id) is distinct from adm then
    v_fallas := v_fallas || E'\n  · A: creado_por no se guardó';
  end if;

  -- C) actualizar con turnos solapados: términos y horario anteriores
  begin
    perform sueldo_acuerdo_guardar(v_id, v_fila || '{"sueldo_pactado": 2500}'::jsonb, v_mal);
    v_fallas := v_fallas || E'\n  · C: aceptó turnos solapados al actualizar';
  exception when others then null;
  end;
  select sueldo_pactado into v_sueldo from sueldo_acuerdos where id = v_id;
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = v_id and dia_semana = 1;
  if v_sueldo <> 1500 then v_fallas := v_fallas || E'\n  · C: el sueldo cambió pese al fallo'; end if;
  if v_n <> 1 then v_fallas := v_fallas || E'\n  · C: el horario anterior se perdió'; end if;

  -- D) actualizar válido
  v_id2 := sueldo_acuerdo_guardar(v_id, v_fila || '{"sueldo_pactado": 2500}'::jsonb, v_ok2);
  select sueldo_pactado into v_sueldo from sueldo_acuerdos where id = v_id;
  select count(*) into v_n from sueldo_acuerdo_turnos where acuerdo_id = v_id;
  if v_id2 <> v_id or v_sueldo <> 2500 or v_n <> 2 then v_fallas := v_fallas || E'\n  · D: la actualización válida no cambió ambos'; end if;

  -- E) contrato inexistente
  begin
    perform sueldo_acuerdo_guardar(gen_random_uuid(), v_fila, v_ok);
    v_fallas := v_fallas || E'\n  · E: actualizó un contrato inexistente';
  exception when others then
    if sqlerrm not like 'DATO:%' then v_fallas := v_fallas || E'\n  · E: mensaje inesperado: ' || sqlerrm; end if;
  end;
  reset role;

  -- F) no-admin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform sueldo_acuerdo_guardar(v_id, v_fila || '{"sueldo_pactado": 1}'::jsonb, v_ok);
    v_fallas := v_fallas || E'\n  · F: un colaborador pudo guardar un contrato';
  exception when others then null;
  end;
  reset role;
  select sueldo_pactado into v_sueldo from sueldo_acuerdos where id = v_id;
  if v_sueldo <> 2500 then v_fallas := v_fallas || E'\n  · F: el intento del no-admin sí escribió'; end if;
  if has_function_privilege('anon', 'sueldo_acuerdo_guardar(uuid, jsonb, jsonb)', 'execute') then
    v_fallas := v_fallas || E'\n  · F: anon tiene EXECUTE';
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0157: OK — contrato y horario se guardan juntos o no se guarda nada';
  else
    raise exception 'RESULTADO 0157: FALLAS —%', v_fallas;
  end if;
end $$;
