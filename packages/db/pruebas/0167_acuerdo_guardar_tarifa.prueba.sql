-- Prueba de la migración 0167_acuerdo_guardar_tarifa.sql
-- Spec: docs/superpowers/specs/2026-10-18-acuerdo-guardar-tarifa-design.md
-- Se corre: bash tools/postgres-local.sh probar 0167

do $$
declare
  r text := ''; adm uuid; emp uuid; v_id uuid; t numeric; s numeric; fila jsonb;
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Admin 0167', '0167a', 'admin', true, null, 'AA') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales) values ('Emp 0167', '0167e', 'ventas_junior', true, null, 'EE') returning id into emp;
  fila := jsonb_build_object('empleado_id', emp, 'fecha_inicio', '2099-01-01', 'fecha_fin', '2099-03-31',
    'modalidad', 'mensual', 'cada_dias', null, 'sueldo_pactado', 0, 'tarifa_hora', 5, 'escala', null,
    'almuerzo_habilitado', false, 'parametros', '{}'::jsonb, 'creado_por', adm);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  v_id := sueldo_acuerdo_guardar(null, fila, '[]'::jsonb);
  select tarifa_hora, sueldo_pactado into t, s from sueldo_acuerdos where id = v_id;
  if t = 5 and s = 0 then r := r || '[ok] caso 1: crear con tarifa la guarda;'; else r := r || format('[FALLA] caso 1: tarifa=%s sueldo=%s;', t, s); end if;

  perform sueldo_acuerdo_guardar(v_id, fila || '{"tarifa_hora": 7.5}'::jsonb, '[]'::jsonb);
  select tarifa_hora into t from sueldo_acuerdos where id = v_id;
  if t = 7.5 then r := r || '[ok] caso 2: actualizar la tarifa la cambia;'; else r := r || format('[FALLA] caso 2: tarifa=%s;', t); end if;

  perform sueldo_acuerdo_guardar(v_id, (fila - 'tarifa_hora') || '{"sueldo_pactado": 1500, "tarifa_hora": null}'::jsonb, '[]'::jsonb);
  select tarifa_hora, sueldo_pactado into t, s from sueldo_acuerdos where id = v_id;
  if t is null and s = 1500 then r := r || '[ok] caso 3: pasar a sueldo fijo limpia la tarifa;'; else r := r || format('[FALLA] caso 3: tarifa=%s sueldo=%s;', t, s); end if;

  raise exception 'RESULTADO 0167 --> %', r;
end $$;
