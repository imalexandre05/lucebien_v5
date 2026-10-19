-- Prueba de la migración 0114_personal_ultimo_admin.sql
--
-- empleado_actualizar no debe dejar la empresa sin ningún administrador activo (mismo criterio
-- que empleado_borrar_alta, 0099 §3). Casos:
--   1) el ÚLTIMO admin activo no puede pasar a un rol que no sea admin/dueño (se niega y no escribe);
--   2) con otro admin activo, el mismo cambio SÍ pasa;
--   3) admin -> dueño del último admin SÍ pasa (sigue habiendo administrador);
--   4) editar a un colaborador que no es admin sigue funcionando aunque haya un solo admin;
--   5) editar los demás datos del último admin (sin tocar el rol) SÍ pasa;
--   6) un no-admin no puede llamar la RPC (guard intacto);
--   7) empleado_actualizar sigue con una sola firma (sin sobrecarga ambigua).
--
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado, no queda ni una fila.
-- OJO: hay que correr el archivo ENTERO (el set_config del jwt es lo que da identidad al admin).
-- Cómo se corre: bash tools/probar-migracion.sh 0114

do $$
declare
  adm uuid; col uuid; adm2 uuid;
  v_fallas text := '';
  v_rol text; v_firmas int;
begin
  insert into sedes (cod, nombre) values ('AL', 'Sede prueba 0114') on conflict (cod) do nothing;
  -- Aísla el escenario: ningún otro admin/dueño activo en la base de prueba.
  -- (se apaga el trigger de último admin de la 0125 sólo para armar el escenario)
  set local session_replication_role = replica;
  update empleados set activo = false where rol in ('admin', 'dueno') and activo;
  set local session_replication_role = origin;

  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0114', '0114a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0114', '0114b', 'ventas_junior', true, 'AL', 'CP') returning id into col;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  -- 1) El último admin no puede degradarse.
  begin
    perform empleado_actualizar(adm, 'Admin Prueba 0114', 'ventas_junior', null, 'AL', '{}', null, '', '', '', '', 0);
    v_fallas := v_fallas || E'\n  · 1) el último admin SÍ pudo pasar a ventas_junior';
  exception when others then
    if sqlerrm not ilike '%último administrador activo%' then
      v_fallas := v_fallas || format(E'\n  · 1) falló por otro motivo: %s', sqlerrm);
    end if;
  end;
  select rol into v_rol from empleados where id = adm;
  if v_rol is distinct from 'admin' then
    v_fallas := v_fallas || format(E'\n  · 1) el rol quedó en %s (debía seguir admin)', v_rol);
  end if;

  -- 3) admin -> dueño: sigue habiendo administrador.
  begin
    perform empleado_actualizar(adm, 'Admin Prueba 0114', 'dueno', null, 'AL', '{}', null, '', '', '', '', 0);
  exception when others then
    v_fallas := v_fallas || format(E'\n  · 3) admin -> dueno se negó: %s', sqlerrm);
  end;

  -- 5) Editar otros datos sin tocar el rol.
  begin
    perform empleado_actualizar(adm, 'Admin Prueba 0114', 'dueno', null, 'AL', '{}', null, 'nota', '999', '', '', 100);
  exception when others then
    v_fallas := v_fallas || format(E'\n  · 5) editar datos del último admin se negó: %s', sqlerrm);
  end;

  -- 4) Editar a un colaborador común.
  begin
    perform empleado_actualizar(col, 'Colaborador Prueba 0114', 'ventas_junior_2', null, 'AL', '{}', null, '', '', '', '', 0);
  exception when others then
    v_fallas := v_fallas || format(E'\n  · 4) editar a un colaborador común se negó: %s', sqlerrm);
  end;
  reset role;

  -- 2) Con un segundo admin activo, el primero sí puede dejar de serlo.
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Dos Prueba 0114', '0114c', 'admin', true, 'AL', 'AD') returning id into adm2;
  -- (Lo hace el segundo admin: quien se degrada a sí mismo pierde el permiso de escritura sobre
  -- empleado_tiendas dentro de la misma RPC, así que esa vía no sirve para probar este caso.)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm2::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_actualizar(adm, 'Admin Prueba 0114', 'ventas_junior', null, 'AL', '{}', null, '', '', '', '', 0);
  exception when others then
    v_fallas := v_fallas || format(E'\n  · 2) con otro admin activo se negó: %s', sqlerrm);
  end;
  reset role;
  select rol into v_rol from empleados where id = adm;
  if v_rol is distinct from 'ventas_junior' then
    v_fallas := v_fallas || format(E'\n  · 2) el rol quedó en %s (debía ser ventas_junior)', v_rol);
  end if;

  -- 6) Un no-admin no puede llamar la RPC.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', col::text, 'role', 'authenticated')::text, true);
  begin
    perform empleado_actualizar(col, 'Colaborador Prueba 0114', 'ventas_junior', null, 'AL', '{}', null, '', '', '', '', 0);
    v_fallas := v_fallas || E'\n  · 6) un no-admin SÍ pudo llamar la RPC';
  exception when others then
    if sqlerrm not ilike '%Solo administradores%' then
      v_fallas := v_fallas || format(E'\n  · 6) mensaje inesperado: %s', sqlerrm);
    end if;
  end;
  reset role;

  -- 7) Una sola firma.
  select count(*) into v_firmas from pg_proc where proname = 'empleado_actualizar';
  if v_firmas <> 1 then
    v_fallas := v_fallas || format(E'\n  · 7) empleado_actualizar tiene %s firmas, esperaba 1', v_firmas);
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0114: OK — el último admin no puede degradarse; con otro admin sí; el resto de ediciones intacto';
  else
    raise exception 'RESULTADO 0114: FALLA —%', v_fallas;
  end if;
end $$;
