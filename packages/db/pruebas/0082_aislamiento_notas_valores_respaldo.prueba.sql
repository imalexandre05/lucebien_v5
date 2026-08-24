-- Prueba de la migración 0082_aislamiento_notas_valores_respaldo.sql
--
-- Comprueba las tres promesas de la spec
-- (docs/superpowers/specs/permisos/2026-08-23-escritura-directa-y-anonimato-design.md §1 A-3/A-4/A-5):
--   1. la tabla de respaldo dejó de ser legible por PostgREST,
--   2. la nota mensual dejó de colgar de `app_es_almacen()`,
--   3. quien es evaluado en Valores 360° ya no puede leer las filas que lo nombran —y por lo tanto
--      no puede saber quién lo puntuó— pero sigue recibiendo sus puntajes por la función.
--
-- Lo importante de la tercera: no alcanza con comprobar que el anonimato "se respeta". Hay que
-- comprobar que la fila NO ES ALCANZABLE, porque el ataque real no pasa por la pantalla — pasa por
-- pedirle a PostgREST la misma tabla con `select=*` usando la clave anónima que viaja en cada
-- página del ERP.
--
-- SE DESCARTA SOLA: inserta un voto de prueba y termina lanzando una excepción con el resultado.
-- Eso aborta la transacción y no queda ni una fila. El "error" final ES la salida esperada.
--
-- OJO: sin `set local role authenticated` las políticas no se evalúan (el editor de Supabase corre
-- como superusuario) y la prueba pasa siempre sin comprobar nada. Y como ese rol no puede insertar
-- el voto, el montaje va ANTES del cambio de rol.
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0082

do $$
declare
  evaluador uuid;
  evaluada  uuid;
  admin_id  uuid;
  r         text := '';
  n         int;
begin
  select id into admin_id from empleados where rol in ('admin','dueno') and activo order by id limit 1;
  select id into evaluada  from empleados where rol not in ('admin','dueno') and activo order by id limit 1;
  select id into evaluador from empleados where id <> evaluada and activo order by id limit 1;
  if admin_id is null or evaluada is null or evaluador is null then
    raise exception 'La prueba necesita un administrador y dos personas activas';
  end if;

  insert into evaluaciones_valores(evaluador_id, evaluado_id, mes, integridad, respeto, honestidad, amabilidad, relacion, actitud)
  values (evaluador, evaluada, '2099-01', 5, 5, 4, 5, 4, 5)
  on conflict (evaluador_id, evaluado_id, mes) do nothing;

  -- A PARTIR DE ACÁ SE DEJA DE SER SUPERUSUARIO. Sin este cambio de rol las políticas no se
  -- evalúan —el editor de Supabase corre como dueño de las tablas— y toda la prueba pasaría sin
  -- comprobar nada. El montaje de arriba tiene que quedar antes, porque `authenticated` no puede
  -- insertar el voto.
  perform set_config('role', 'authenticated', true);

  -- ── 3) El anonimato de Valores 360° ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', evaluada, 'role','authenticated')::text, true);

  select count(*) into n from evaluaciones_valores where evaluado_id = evaluada;
  if n = 0 then
    r := r || ' [ok] la evaluada no alcanza las filas que la nombran;';
  else
    r := r || format(' [FALLA] la evaluada todavia lee %s fila(s) suyas, con evaluador_id adentro;', n);
  end if;

  select count(*) into n from valores_mis_puntajes('2099-01');
  if n = 1 then
    r := r || ' [ok] pero si recibe sus puntajes por la funcion;';
  else
    r := r || format(' [FALLA] la funcion le devolvio %s puntaje(s) en vez de 1;', n);
  end if;

  -- Quien puntúa sigue viendo lo que escribió: ahí no hay anonimato que proteger, es suyo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', evaluador, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_valores where evaluado_id = evaluada;
  if n >= 1 then
    r := r || ' [ok] quien puntuo sigue viendo lo suyo;';
  else
    r := r || ' [FALLA] se rompio lo que funcionaba: quien puntuo perdio su propia fila;';
  end if;

  -- ── 2) La nota mensual ───────────────────────────────────────────────────────────────────
  -- La política ya no menciona app_es_almacen(), que devolvía true también para 'confeccionista'.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'evaluaciones_mensuales'
      and policyname = 'eval_select' and qual like '%app_es_almacen%'
  ) then
    r := r || ' [FALLA] eval_select sigue colgando de app_es_almacen();';
  else
    r := r || ' [ok] la nota mensual ya no cuelga de app_es_almacen();';
  end if;

  -- ── 1) La tabla de respaldo ──────────────────────────────────────────────────────────────
  if exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'asistencias_respaldo_0075' and not c.relrowsecurity
  ) then
    r := r || ' [FALLA] la tabla de respaldo sigue sin RLS;';
  else
    r := r || ' [ok] la tabla de respaldo tiene RLS;';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'asistencias_respaldo_0075'
      and grantee in ('anon','authenticated')
  ) then
    r := r || ' [FALLA] anon o authenticated conservan permisos sobre el respaldo;';
  else
    r := r || ' [ok] ni anon ni authenticated llegan al respaldo;';
  end if;

  -- ── Lo que tiene que seguir funcionando ──────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role','authenticated')::text, true);
  select count(*) into n from evaluaciones_valores;
  if n >= 1 then
    r := r || ' [ok] el administrador sigue viendo el seguimiento completo;';
  else
    r := r || ' [FALLA] el administrador dejo de ver Valores 360;';
  end if;

  raise exception 'RESULTADO 0082 -->%', r;
end $$;
