-- 0177 — Código personal siempre (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codigo-siempre-design.md
-- Prueba: packages/db/pruebas/0177_codigo_siempre.prueba.sql (escrita antes). Idempotente.
--
-- Para mover prendas y enviar reportes se pide siempre el código personal, en cualquier equipo y
-- cuenta, sin depender de marcar cuentas o equipos como compartidos. El administrador queda exento
-- salvo que se encienda «exigir código también al admin».

-- DEFAULTS FIJADOS POR EL DUEÑO (no inventados). Editables en /configuracion (Código personal).
insert into config (clave, valor) values ('codigo_siempre', 'true')       on conflict (clave) do nothing;
insert into config (clave, valor) values ('codigo_exigir_admin', 'false') on conflict (clave) do nothing;

-- ¿A esta sesión hay que pedirle el código? (solo responde sobre la propia sesión)
create or replace function private.sesion_debe_dar_codigo()
  returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_siempre'), true)
     and not (
       private.app_es_admin()
       and not coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_exigir_admin'), false)
     );
$$;
revoke execute on function private.sesion_debe_dar_codigo() from public, anon;
grant  execute on function private.sesion_debe_dar_codigo() to authenticated;

create or replace function public.sesion_debe_dar_codigo()
  returns boolean language sql stable security invoker set search_path = public
as $$ select private.sesion_debe_dar_codigo(); $$;
revoke execute on function public.sesion_debe_dar_codigo() from public, anon;
grant  execute on function public.sesion_debe_dar_codigo() to authenticated;

-- Mismo cuerpo que la 0112; cambia solo la condición «sin token».
create or replace function private.actor_pipeline(p_operador uuid)
  returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare v_actor uuid;
begin
  if p_operador is null then
    if private.sesion_es_cuenta_compartida() or private.sesion_debe_dar_codigo() then
      raise exception 'CODIGO: ingresa tu código personal para continuar';
    end if;
    return auth.uid();
  end if;
  v_actor := private.operador_de_token(p_operador);
  if v_actor is null then
    raise exception 'CODIGO: operador vencido, vuelve a ingresar tu código';
  end if;
  perform private.tocar_operador(p_operador);
  return v_actor;
end;
$$;
revoke execute on function private.actor_pipeline(uuid) from public, anon;
grant  execute on function private.actor_pipeline(uuid) to authenticated;

-- pipeline_validar_codigo: igual a la 0112, pero el equipo ya no tiene que ser compartido cuando
-- 'codigo_siempre' está en sí.
drop function if exists pipeline_validar_codigo(text, text);
create or replace function pipeline_validar_codigo(p_usuario text, p_pin text, p_device text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_max int; v_ventana int; v_op_min int; v_min int;
  v_emp uuid; v_activo boolean; v_compartida boolean; v_tiene_pin boolean;
  v_nombre text; v_token uuid; v_exp timestamptz; v_restan int;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- 0) El código sólo se acepta desde un equipo aprobado y marcado como compartido. Se compara con
  --    el token real del equipo (cookie httpOnly) guardado en la base, no con lo que diga la app.
  --    No se registra intento: un equipo personal no puede gastar ni probar códigos.
  if not coalesce(dispositivo_compartido(p_device), false)
     and not coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_siempre'), true) then
    return jsonb_build_object('ok', false, 'motivo', 'equipo_no_compartido');
  end if;

  v_max     := private.codigo_param('codigo_max_intentos', 5);
  v_ventana := private.codigo_param('codigo_ventana_intentos_min', 15);
  v_op_min  := private.codigo_param('codigo_operador_min', 10);

  -- El usuario sólo identifica (no es secreto). Se resuelve aunque esté suspendido: los fallos
  -- cuentan contra la persona igual.
  select e.id, e.activo, e.cuenta_compartida into v_emp, v_activo, v_compartida
    from empleados e where e.cod = btrim(coalesce(p_usuario, '')) limit 1;

  -- Serializa por sesión y por persona: sin esto, varias llamadas en paralelo leen el mismo conteo
  -- de fallos antes de que se inserte el suyo y el límite se vuelve el tamaño del pool. Orden fijo
  -- (sesión, persona) para no cruzar bloqueos.
  perform pg_advisory_xact_lock(hashtext('codigo-sesion:' || v_sesion::text));
  if v_emp is not null then
    perform pg_advisory_xact_lock(hashtext('codigo-persona:' || v_emp::text));
  end if;

  -- 1) ¿Sesión o persona bloqueadas? Aunque el PIN sea correcto.
  v_min := greatest(private.codigo_min_bloqueo(v_sesion, null, v_max, v_ventana),
                    private.codigo_min_bloqueo(null, v_emp, v_max, v_ventana));
  if v_min > 0 then
    return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
  end if;

  v_tiene_pin := v_emp is not null and exists (select 1 from codigo_pines where empleado_id = v_emp);

  -- 2) Fallo: usuario inexistente, suspendido, cuenta compartida, sin PIN o PIN malo. Se registra
  --    y se responde sin raise. 'sin_pin' cuenta como fallo para que no sirva para enumerar.
  if v_emp is null or not v_activo or v_compartida or not v_tiene_pin
     or not private.codigo_pin_valido(v_emp, p_pin) then
    v_restan := private.codigo_registrar_fallo(v_sesion, p_device, v_emp, v_max, v_ventana);
    if v_emp is not null and v_activo and not v_compartida and not v_tiene_pin then
      return jsonb_build_object('ok', false, 'motivo', 'sin_pin', 'intentos_restantes', v_restan);
    end if;
    return jsonb_build_object('ok', false, 'intentos_restantes', v_restan);
  end if;

  -- 3) Acierto: se registra y se emite el token. De paso se barren los tokens vencidos hace más
  --    de un día.
  insert into codigo_intentos (sesion_uid, device_id, empleado_id, ok) values (v_sesion, p_device, v_emp, true);
  delete from codigo_operadores where expira_en < now() - interval '1 day';
  v_exp := now() + make_interval(mins => v_op_min);
  insert into codigo_operadores (sesion_uid, empleado_id, device_id, expira_en)
    values (v_sesion, v_emp, p_device, v_exp) returning token into v_token;
  select nombre into v_nombre from empleados where id = v_emp;

  return jsonb_build_object('ok', true, 'token', v_token, 'nombre', v_nombre, 'expira_en', v_exp,
                            'ventana_min', v_op_min);
end;
$$;
revoke execute on function pipeline_validar_codigo(text, text, text) from public, anon;
grant execute on function pipeline_validar_codigo(text, text, text) to authenticated;
