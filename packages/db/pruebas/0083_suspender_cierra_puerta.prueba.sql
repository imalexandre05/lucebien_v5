-- Prueba de la migración 0083_suspender_cierra_puerta.sql
--
-- Comprueba la tercera cerradura de la spec
-- (docs/superpowers/specs/permisos/2026-08-23-suspender-cierra-la-puerta-design.md §3, C-3): para
-- la base, una persona suspendida no tiene rol ni sedes. Las otras dos cerraduras —el baneo en
-- Supabase Auth y el corte de la sesión ya abierta— viven en la aplicación y se comprueban desde
-- ahí; ésta es la que sigue puesta aunque alguien escriba la columna a mano.
--
-- SE DESCARTA SOLA: suspende de verdad a dos personas reales, mide, y termina lanzando una
-- excepción con el resultado. Eso aborta la transacción y **nadie queda suspendido**. El "error"
-- final ES la salida esperada — se lee la línea RESULTADO.
--
-- OJO: para que la RLS se aplique de verdad hace falta `set local role authenticated`. Sin eso, el
-- editor de Supabase corre como superusuario, las políticas no se evalúan y la prueba pasa siempre
-- sin comprobar nada. Y como ese rol no puede escribir en `empleados`, las suspensiones tienen que
-- hacerse ANTES de cambiar de rol.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0083

do $$
declare
  colaborador uuid;
  admin_id    uuid;
  r           text := '';
  n           int;
  antes_rep   int;
  antes_sedes int;
begin
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  select id into colaborador from empleados
   where rol not in ('admin','dueno') and activo
     and exists (select 1 from empleado_tiendas t where t.empleado_id = empleados.id)
   order by id limit 1;

  if admin_id is null or colaborador is null then
    raise exception 'La prueba necesita un administrador y una persona con tiendas asignadas';
  end if;

  -- ── Antes: la persona activa ve lo suyo ──────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', colaborador, 'role','authenticated')::text, true);
  select count(*) into antes_sedes from (select private.app_sedes()) s;
  if antes_sedes = 0 then
    r := r || ' [FALLA] una persona activa tendria que tener al menos una sede;';
  else
    r := r || format(' [ok] activa: %s sede(s);', antes_sedes);
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  if private.app_es_admin() then
    r := r || ' [ok] admin activo sigue siendo admin;';
  else
    r := r || ' [FALLA] se rompio lo que funcionaba: un admin activo dejo de ser admin;';
  end if;

  -- ── Se suspende a las dos personas (se descarta con el rollback del final) ────────────────
  update empleados set activo = false, estado = 'suspendido'
   where id in (colaborador, admin_id);

  -- ── Después: ni rol ni sedes ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', colaborador, 'role','authenticated')::text, true);
  select count(*) into n from (select private.app_sedes()) s;
  if n = 0 then
    r := r || ' [ok] suspendida: sin sedes;';
  else
    r := r || format(' [FALLA] una persona suspendida conserva %s sede(s);', n);
  end if;

  if private.app_ve_datos_personas() then
    r := r || ' [FALLA] una persona suspendida sigue pudiendo ver datos de personas;';
  else
    r := r || ' [ok] suspendida: no ve datos de personas;';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  if private.app_es_admin() then
    r := r || ' [FALLA] un administrador suspendido sigue siendo administrador;';
  else
    r := r || ' [ok] admin suspendido: deja de ser admin;';
  end if;

  raise exception 'RESULTADO 0083 -->%', r;
end $$;
