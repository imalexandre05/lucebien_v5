-- Prueba de la migración 0104_empleados_recomendaciones.sql
--
-- Monta un administrador, un colaborador sin autoridad y un colaborador de prueba, y ataca las
-- tres promesas de la spec §3/§5:
--   · un admin autenticado SÍ puede guardar recomendaciones con la RPC nueva;
--   · un no-admin NO puede (mismo guard que empleado_actualizar);
--   · empleado_actualizar (la RPC grande, sin tocar) sigue teniendo una sola firma — la razón
--     entera de no haberle agregado un parámetro es evitar una sobrecarga ambigua, así que esta
--     prueba comprueba que en efecto no quedó ninguna.
--
-- SE DESCARTA SOLA: todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado, así que no queda ni una fila.
--
-- OJO — mismo aviso que otras pruebas de RLS: sin el `set_config('request.jwt.claims', ...)` de
-- abajo, `auth.uid()` es null y las dos RPC devuelven "Solo administradores..." para cualquiera,
-- lo que haría pasar la prueba por el motivo equivocado. Correr el archivo ENTERO de una sola vez.
--
-- Cómo se corre: bash tools/probar-migracion.sh 0104 (o pegarlo en el SQL editor de Supabase).

do $$
declare
  adm uuid; col uuid; v_test uuid;
  v_recomendaciones text;
  v_firmas_actualizar int;
  v_fallas text := '';
begin
  insert into empleados (nombre, cod, rol, activo, sede_cod)
    values ('Admin Prueba 0104', '0104a', 'admin', true, 'AL') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod)
    values ('Colaborador Prueba 0104', '0104b', 'ventas_junior', true, 'AL') returning id into col;
  insert into empleados (nombre, cod, rol, activo, sede_cod)
    values ('Persona Prueba 0104', '0104c', 'ventas_junior', true, 'AL') returning id into v_test;

  -- 1) Como admin: guardar recomendaciones debe funcionar.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  perform empleado_actualizar_recomendaciones(v_test, 'Excelente trato con clientes, referida por Marylin.');
  reset role;

  select recomendaciones into v_recomendaciones from empleados where id = v_test;
  if v_recomendaciones is distinct from 'Excelente trato con clientes, referida por Marylin.' then
    v_fallas := v_fallas || format(E'\n  · admin no pudo guardar recomendaciones (quedó: %L)', v_recomendaciones);
  end if;

  -- 2) Como colaborador sin autoridad: debe fallar con el mensaje del guard.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_actualizar_recomendaciones(v_test, 'me lo cambio un colaborador cualquiera');
    v_fallas := v_fallas || E'\n  · un colaborador sin autoridad SÍ pudo llamar la RPC (no debería)';
  exception when others then
    if position('Solo administradores' in sqlerrm) = 0 then
      v_fallas := v_fallas || format(E'\n  · falló por otro motivo, no el guard esperado: %s', sqlerrm);
    end if;
  end;
  reset role;

  select recomendaciones into v_recomendaciones from empleados where id = v_test;
  if v_recomendaciones is distinct from 'Excelente trato con clientes, referida por Marylin.' then
    v_fallas := v_fallas || E'\n  · el intento del colaborador sin autoridad SÍ modificó la fila';
  end if;

  -- 3) empleado_actualizar (la grande, sin tocar en esta migración) sigue con una sola firma —
  -- la comprobación central de por qué se eligió una RPC separada en vez de extenderla.
  select count(*) into v_firmas_actualizar
  from pg_proc where proname = 'empleado_actualizar';
  if v_firmas_actualizar <> 1 then
    v_fallas := v_fallas || format(E'\n  · empleado_actualizar tiene %s firmas, esperaba exactamente 1 (sobrecarga ambigua)', v_firmas_actualizar);
  end if;

  -- 4) Y sigue funcionando de punta a punta, exactamente como antes de esta migración.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  perform empleado_actualizar(
    v_test, 'Persona Prueba 0104 Editada', 'ventas_junior', null, 'AL', array['AL']::text[],
    null, '', '987654321', '12345678', '', 0
  );
  reset role;
  if not exists (select 1 from empleados where id = v_test and nombre = 'Persona Prueba 0104 Editada') then
    v_fallas := v_fallas || E'\n  · empleado_actualizar (sin tocar) dejó de funcionar';
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0104: OK — recomendaciones se guarda solo con admin, empleado_actualizar sigue con una sola firma y funcionando';
  else
    raise exception 'RESULTADO 0104: FALLAS —%', v_fallas;
  end if;
end $$;
