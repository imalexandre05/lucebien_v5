-- Release 2026-10-19d: migración 0179 (código de empleado). Se aplica DESPUÉS de deploy/2026-10-19c.sql. Idempotente. Sin schema_migrations.
-- Generado de packages/db/migrations; no editar a mano.
begin;

-- ===== 0179_codigo_empleado.sql =====
-- 0179 — El código de empleado (empleados.cod) es el código del operador (decisión del dueño, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codigo-empleado-design.md
-- Prueba: packages/db/pruebas/0179_codigo_empleado.prueba.sql (escrita antes). Idempotente.
--
-- Hoy codigo_siempre = true pero codigo_pines está vacía: nadie tiene PIN y nadie puede identificarse
-- para mover prendas ni enviar reportes. El dueño autorizó usar el código de empleado (4 dígitos, p. ej.
-- 8686) y aceptó que no es secreto. Se mantiene todo el circuito (bloqueo por intentos, token de
-- operador de 5 min, atribución por actor_pipeline); sólo cambia cómo se identifica a la persona.

-- DEFAULTS FIJADOS POR EL DUEÑO (no inventados). Editables en /configuracion (Código personal).
insert into config (clave, valor) values ('codigo_modo', 'cod') on conflict (clave) do nothing;
-- También el administrador pone su código. Se actualiza aunque la fila ya exista (era 'false').
insert into config (clave, valor) values ('codigo_exigir_admin', 'true') on conflict (clave) do update set valor = 'true' where config.valor is distinct from 'true';

-- Modo vigente: 'pin' sólo si está escrito exactamente así; cualquier otra cosa es 'cod'.
create or replace function private.codigo_modo()
  returns text language sql stable security definer set search_path = public, pg_temp
as $$
  select case when coalesce((select lower(btrim(valor)) from config where clave = 'codigo_modo'), 'cod') = 'pin'
              then 'pin' else 'cod' end;
$$;
revoke execute on function private.codigo_modo() from public, anon;
grant  execute on function private.codigo_modo() to authenticated;

create or replace function public.codigo_modo()
  returns text language sql stable security invoker set search_path = public
as $$ select private.codigo_modo(); $$;
revoke execute on function public.codigo_modo() from public, anon;
grant  execute on function public.codigo_modo() to authenticated;

-- pipeline_validar_codigo: modo 'cod' (default) identifica por empleados.cod = p_pin; modo 'pin' es
-- exactamente la 0177 (usuario + PIN).
create or replace function pipeline_validar_codigo(p_usuario text, p_pin text, p_device text)
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_sesion uuid := auth.uid();
  v_modo text := private.codigo_modo();
  v_max int; v_ventana int; v_op_min int; v_min int;
  v_emp uuid; v_activo boolean; v_compartida boolean; v_tiene_pin boolean;
  v_cod text; v_n int;
  v_nombre text; v_token uuid; v_exp timestamptz; v_restan int;
begin
  if v_sesion is null then raise exception 'No autenticado'; end if;

  -- 0) Con 'codigo_siempre' en sí el código se acepta desde cualquier equipo (0177); si está en no,
  --    sólo desde un equipo aprobado y compartido. No se registra intento.
  if not coalesce(dispositivo_compartido(p_device), false)
     and not coalesce((select lower(btrim(valor)) in ('true', 't', '1', 'si', 'sí') from config where clave = 'codigo_siempre'), true) then
    return jsonb_build_object('ok', false, 'motivo', 'equipo_no_compartido');
  end if;

  v_max     := private.codigo_param('codigo_max_intentos', 5);
  v_ventana := private.codigo_param('codigo_ventana_intentos_min', 15);
  v_op_min  := private.codigo_param('codigo_operador_min', 10);

  -- Serializa por sesión: sin esto, varias llamadas en paralelo leen el mismo conteo de fallos antes
  -- de que se inserte el suyo y el límite se vuelve el tamaño del pool.
  perform pg_advisory_xact_lock(hashtext('codigo-sesion:' || v_sesion::text));

  if v_modo = 'cod' then
    -- Modo código de empleado: p_pin trae empleados.cod; p_usuario se ignora. Sólo cuentan personas
    -- activas y que no sean la cuenta de un equipo compartido. Tiene que haber exactamente una.
    v_cod := btrim(coalesce(p_pin, ''));
    select count(*) into v_n from empleados e
      where v_cod <> '' and e.cod = v_cod and e.activo and not e.cuenta_compartida;
    if v_n = 1 then
      select e.id into v_emp from empleados e
        where e.cod = v_cod and e.activo and not e.cuenta_compartida;
    end if;

    -- ¿Sesión bloqueada? Aunque el código sea correcto.
    v_min := private.codigo_min_bloqueo(v_sesion, null, v_max, v_ventana);
    if v_min > 0 then
      return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
    end if;

    -- Fallo: se registra contra la sesión (no contra una persona: el código equivocado no identifica
    -- a nadie, y así nadie puede bloquear a otro tecleando mal).
    if v_emp is null then
      v_restan := private.codigo_registrar_fallo(v_sesion, p_device, null, v_max, v_ventana);
      return jsonb_build_object('ok', false,
                                'motivo', case when v_n > 1 then 'codigo_repetido' else 'codigo_no_encontrado' end,
                                'intentos_restantes', v_restan);
    end if;
  else
    -- Modo PIN (0177): el usuario sólo identifica (no es secreto). Se resuelve aunque esté suspendido:
    -- los fallos cuentan contra la persona igual.
    select e.id, e.activo, e.cuenta_compartida into v_emp, v_activo, v_compartida
      from empleados e where e.cod = btrim(coalesce(p_usuario, '')) limit 1;

    if v_emp is not null then
      perform pg_advisory_xact_lock(hashtext('codigo-persona:' || v_emp::text));
    end if;

    -- ¿Sesión o persona bloqueadas? Aunque el PIN sea correcto.
    v_min := greatest(private.codigo_min_bloqueo(v_sesion, null, v_max, v_ventana),
                      private.codigo_min_bloqueo(null, v_emp, v_max, v_ventana));
    if v_min > 0 then
      return jsonb_build_object('ok', false, 'bloqueado_min', v_min);
    end if;

    v_tiene_pin := v_emp is not null and exists (select 1 from codigo_pines where empleado_id = v_emp);

    -- Fallo: usuario inexistente, suspendido, cuenta compartida, sin PIN o PIN malo. 'sin_pin' cuenta
    -- como fallo para que no sirva para enumerar.
    if v_emp is null or not v_activo or v_compartida or not v_tiene_pin
       or not private.codigo_pin_valido(v_emp, p_pin) then
      v_restan := private.codigo_registrar_fallo(v_sesion, p_device, v_emp, v_max, v_ventana);
      if v_emp is not null and v_activo and not v_compartida and not v_tiene_pin then
        return jsonb_build_object('ok', false, 'motivo', 'sin_pin', 'intentos_restantes', v_restan);
      end if;
      return jsonb_build_object('ok', false, 'intentos_restantes', v_restan);
    end if;
  end if;

  -- Acierto: se registra y se emite el token. De paso se barren los tokens vencidos hace más de un día.
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

commit;
