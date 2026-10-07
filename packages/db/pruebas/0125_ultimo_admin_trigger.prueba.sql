-- Prueba de la migración 0125_ultimo_admin_trigger.sql
--
-- El guard del último administrador pasa de la RPC (0114) a un trigger before update/delete en
-- `empleados`: cubre también el update directo por PostgREST (policy emp_admin_write, FOR ALL).
-- Casos (cada uno reporta [ok] o [FALLA]):
--   1) con UN solo admin activo, update directo rol -> confeccionista se rechaza (ULTIMO_ADMIN);
--   2) update directo activo=false se rechaza;
--   3) update directo estado='suspendido' + activo=false se rechaza;
--   4) delete directo se rechaza;
--   5) tras los rechazos, el admin sigue admin y activo (no se escribió nada);
--   6) admin -> dueno del único admin SÍ pasa (sigue habiendo administrador);
--   7) con DOS admins activos, degradar a uno SÍ pasa;
--   8) editar a un colaborador (datos, rol no admin) por update directo SÍ pasa;
--   9) la RPC empleado_actualizar sigue funcionando para un colaborador común.
--
-- Escenario controlado: la base local puede traer otros admins sembrados. Se crea primero el admin
-- de prueba y DESPUÉS se desactivan los demás (así nunca se queda en 0 y el trigger, si ya existe,
-- no estorba el montaje).
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado, no queda ni una fila.
-- OJO: hay que correr el archivo ENTERO (el set_config del jwt da identidad al admin).
-- Cómo se corre: bash tools/probar-migracion.sh 0125

do $$
declare
  adm uuid; adm2 uuid; col uuid;
  v_res text := '';
  v_fallas int := 0;
  v_rol text; v_activo boolean; v_n int;
begin
  insert into sedes (cod, nombre) values ('AL', 'Sede prueba 0125') on conflict (cod) do nothing;

  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Prueba 0125', '0125a', 'admin', true, 'AL', 'AP') returning id into adm;
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Colaborador Prueba 0125', '0125b', 'ventas_junior', true, 'AL', 'CP') returning id into col;
  -- Aísla: ningún otro admin/dueño activo.
  update empleados set activo = false where rol in ('admin', 'dueno') and activo and id <> adm;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);

  -- 1) rol -> confeccionista directo
  begin
    update empleados set rol = 'confeccionista' where id = adm;
    v_res := v_res || E'\n  [FALLA] 1) el último admin pasó a confeccionista por update directo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'ULTIMO_ADMIN%' then v_res := v_res || E'\n  [ok]    1) cambio de rol directo rechazado';
    else v_res := v_res || format(E'\n  [FALLA] 1) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 2) activo=false directo
  begin
    update empleados set activo = false where id = adm;
    v_res := v_res || E'\n  [FALLA] 2) el último admin se desactivó por update directo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'ULTIMO_ADMIN%' then v_res := v_res || E'\n  [ok]    2) activo=false directo rechazado';
    else v_res := v_res || format(E'\n  [FALLA] 2) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 3) estado + activo (como actualizarEstadoEmpleado)
  begin
    update empleados set activo = false, estado = 'suspendido' where id = adm;
    v_res := v_res || E'\n  [FALLA] 3) el último admin se suspendió por update directo'; v_fallas := v_fallas + 1;
  exception when others then
    if sqlerrm like 'ULTIMO_ADMIN%' then v_res := v_res || E'\n  [ok]    3) suspensión directa rechazada';
    else v_res := v_res || format(E'\n  [FALLA] 3) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 4) delete directo
  begin
    delete from empleados where id = adm;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_res := v_res || E'\n  [FALLA] 4) el último admin se borró por delete directo'; v_fallas := v_fallas + 1;
    else
      v_res := v_res || E'\n  [FALLA] 4) el delete no afectó filas ni lanzó ULTIMO_ADMIN'; v_fallas := v_fallas + 1;
    end if;
  exception when others then
    if sqlerrm like 'ULTIMO_ADMIN%' then v_res := v_res || E'\n  [ok]    4) delete directo rechazado';
    else v_res := v_res || format(E'\n  [FALLA] 4) falló por otro motivo: %s', sqlerrm); v_fallas := v_fallas + 1; end if;
  end;

  -- 5) nada se escribió
  select rol, activo into v_rol, v_activo from empleados where id = adm;
  if v_rol = 'admin' and v_activo then v_res := v_res || E'\n  [ok]    5) el admin sigue admin y activo';
  else v_res := v_res || format(E'\n  [FALLA] 5) el admin quedó en rol=%s activo=%s', v_rol, v_activo); v_fallas := v_fallas + 1; end if;

  -- 6) admin -> dueno
  begin
    update empleados set rol = 'dueno' where id = adm;
    v_res := v_res || E'\n  [ok]    6) admin -> dueno del único admin pasa';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 6) admin -> dueno se rechazó: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;

  -- 8) colaborador por update directo
  begin
    update empleados set rol = 'ventas_junior_2', notas = 'nota' where id = col;
    v_res := v_res || E'\n  [ok]    8) editar a un colaborador por update directo pasa';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 8) editar colaborador se rechazó: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;

  -- 9) la RPC sigue funcionando
  begin
    perform empleado_actualizar(col, 'Colaborador Prueba 0125', 'ventas_junior', null, 'AL', '{}', null, '', '', '', '', 0);
    v_res := v_res || E'\n  [ok]    9) empleado_actualizar de un colaborador sigue funcionando';
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 9) empleado_actualizar se rechazó: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;
  reset role;

  -- 7) con dos admins activos, degradar a uno pasa
  insert into empleados (nombre, cod, rol, activo, sede_cod, iniciales)
    values ('Admin Dos Prueba 0125', '0125c', 'admin', true, 'AL', 'AD') returning id into adm2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  begin
    update empleados set rol = 'confeccionista' where id = adm2;
    select rol into v_rol from empleados where id = adm2;
    if v_rol = 'confeccionista' then v_res := v_res || E'\n  [ok]    7) con dos admins, degradar a uno pasa';
    else v_res := v_res || format(E'\n  [FALLA] 7) el rol quedó en %s', v_rol); v_fallas := v_fallas + 1; end if;
  exception when others then
    v_res := v_res || format(E'\n  [FALLA] 7) con otro admin activo se rechazó: %s', sqlerrm); v_fallas := v_fallas + 1;
  end;
  reset role;

  if v_fallas = 0 then
    raise exception 'RESULTADO 0125 --> OK, todos los casos pasan:%', v_res;
  else
    raise exception 'RESULTADO 0125 --> FALLA (% caso(s)):%', v_fallas, v_res;
  end if;
end $$;
