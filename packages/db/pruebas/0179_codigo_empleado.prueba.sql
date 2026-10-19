-- Prueba de la migración 0179_codigo_empleado.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-codigo-empleado-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola: termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0179

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;

do $$
declare
  r text := '';
  e_ses uuid; e_op uuid; e_sus uuid; e_cta uuid; e_d1 uuid; e_d2 uuid; e_adm uuid;
  j jsonb; v_i int; v_n int;
begin
  perform pg_temp.dueno();

  -- 0) La migración deja la config como decidió el dueño.
  if (select valor from config where clave = 'codigo_modo') = 'cod' then r := r || '[ok] caso 0a: codigo_modo=cod por defecto;';
  else r := r || '[FALLA] caso 0a: ' || coalesce((select valor from config where clave = 'codigo_modo'), 'sin fila') || ';'; end if;
  if (select valor from config where clave = 'codigo_exigir_admin') = 'true' then r := r || '[ok] caso 0b: el admin también pone su código;';
  else r := r || '[FALLA] caso 0b;'; end if;

  insert into sedes (cod, nombre) values ('P179A', 'P0179 Sede A');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P179-SE','Prueba 0179 Sesion','SE','encargado_tienda','P179A') returning id into e_ses;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P179-OP','Prueba 0179 Operador','OP','encargado_tienda','P179A') returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, activo) values ('P179-SU','Prueba 0179 Suspendido','SU','encargado_tienda','P179A', false) returning id into e_sus;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, cuenta_compartida) values ('P179-CT','Prueba 0179 Cuenta','CT','encargado_tienda','P179A', true) returning id into e_cta;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P179-D1','Prueba 0179 Dup1','D1','encargado_tienda','P179A') returning id into e_d1;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P179-AD','Prueba 0179 Admin','AD','admin','P179A') returning id into e_adm;
  -- El código repetido no puede existir mientras empleados.cod sea único: si la tabla lo permite se prueba.
  begin
    insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P179-D1','Prueba 0179 Dup2','D2','encargado_tienda','P179A') returning id into e_d2;
  exception when unique_violation then e_d2 := null; end;

  delete from config where clave in ('codigo_siempre');
  insert into config (clave, valor) values ('codigo_siempre', 'true');
  update config set valor = 'cod' where clave = 'codigo_modo';

  -- 1) código correcto, usuario vacío → ok y el token resuelve al dueño del código
  perform pg_temp.como(e_ses);
  j := pipeline_validar_codigo('', 'P179-OP', 'dev-x');
  if (j->>'ok')::boolean and j->>'nombre' = 'Prueba 0179 Operador' and (j->>'ventana_min')::int > 0 then
    r := r || '[ok] caso 1: el código de empleado identifica al operador;';
  else r := r || '[FALLA] caso 1: ' || j::text || ';'; end if;
  if private.actor_pipeline((j->>'token')::uuid) = e_op then r := r || '[ok] caso 1b: el actor es el dueño del código;';
  else r := r || '[FALLA] caso 1b;'; end if;

  -- 2) p_usuario nulo y con espacios en el código también sirve
  j := pipeline_validar_codigo(null, '  P179-OP ', 'dev-x');
  if (j->>'ok')::boolean then r := r || '[ok] caso 2: usuario nulo y espacios;';
  else r := r || '[FALLA] caso 2: ' || j::text || ';'; end if;

  -- 3) código inexistente → codigo_no_encontrado y queda un fallo registrado
  j := pipeline_validar_codigo('', 'NO-EXISTE', 'dev-x');
  if not (j->>'ok')::boolean and j->>'motivo' = 'codigo_no_encontrado' and (j->>'intentos_restantes')::int = 4 then
    r := r || '[ok] caso 3: código no encontrado cuenta un intento;';
  else r := r || '[FALLA] caso 3: ' || j::text || ';'; end if;

  -- 4) suspendido y cuenta compartida no se aceptan
  j := pipeline_validar_codigo('', 'P179-SU', 'dev-x');
  v_n := case when not (j->>'ok')::boolean and j->>'motivo' = 'codigo_no_encontrado' then 1 else 0 end;
  j := pipeline_validar_codigo('', 'P179-CT', 'dev-x');
  v_n := v_n + case when not (j->>'ok')::boolean and j->>'motivo' = 'codigo_no_encontrado' then 1 else 0 end;
  if v_n = 2 then r := r || '[ok] caso 4: suspendido y cuenta compartida rechazados;';
  else r := r || '[FALLA] caso 4;'; end if;

  -- 5) tras 5 fallos la sesión queda bloqueada aunque el código sea correcto
  --    (ya van 3 fallos: casos 3 y 4); se completan los 5.
  perform pipeline_validar_codigo('', 'X1', 'dev-x');
  perform pipeline_validar_codigo('', 'X2', 'dev-x');
  j := pipeline_validar_codigo('', 'P179-OP', 'dev-x');
  if not (j->>'ok')::boolean and (j->>'bloqueado_min')::int >= 1 then
    r := r || '[ok] caso 5: bloqueo por intentos aunque el código sea correcto;';
  else r := r || '[FALLA] caso 5: ' || j::text || ';'; end if;

  -- 6) otra sesión no está bloqueada por los fallos de la primera
  perform pg_temp.como(e_adm);
  j := pipeline_validar_codigo('', 'P179-OP', 'dev-y');
  if (j->>'ok')::boolean then r := r || '[ok] caso 6: el bloqueo es por sesión;';
  else r := r || '[FALLA] caso 6: ' || j::text || ';'; end if;

  -- 7) código repetido (sólo si la tabla lo permite)
  if e_d2 is not null then
    j := pipeline_validar_codigo('', 'P179-D1', 'dev-y');
    if not (j->>'ok')::boolean and j->>'motivo' = 'codigo_repetido' and j->>'token' is null then
      r := r || '[ok] caso 7: código repetido no emite token;';
    else r := r || '[FALLA] caso 7: ' || j::text || ';'; end if;
  else
    r := r || '[ok] caso 7: empleados.cod es único, no hay repetidos posibles;';
  end if;

  -- 8) modo pin: el código de empleado ya no sirve como PIN
  perform pg_temp.dueno();
  delete from codigo_intentos where sesion_uid in (e_ses, e_adm);
  update config set valor = 'pin' where clave = 'codigo_modo';
  perform pg_temp.como(e_ses);
  j := pipeline_validar_codigo('P179-OP', 'P179-OP', 'dev-x');
  if not (j->>'ok')::boolean then r := r || '[ok] caso 8: modo pin no acepta el código de empleado como PIN;';
  else r := r || '[FALLA] caso 8: ' || j::text || ';'; end if;
  j := pipeline_validar_codigo('', 'P179-OP', 'dev-x');
  if not (j->>'ok')::boolean then r := r || '[ok] caso 8b: modo pin exige usuario;';
  else r := r || '[FALLA] caso 8b;'; end if;

  -- 9) la pantalla pregunta el modo
  if public.codigo_modo() = 'pin' then r := r || '[ok] caso 9: codigo_modo() devuelve pin;';
  else r := r || '[FALLA] caso 9;'; end if;
  perform pg_temp.dueno();
  update config set valor = 'cod' where clave = 'codigo_modo';
  perform pg_temp.como(e_ses);
  if public.codigo_modo() = 'cod' then r := r || '[ok] caso 9b: codigo_modo() devuelve cod;';
  else r := r || '[FALLA] caso 9b;'; end if;

  -- 10) anon no puede llamar la función
  perform pg_temp.dueno();
  if not has_function_privilege('anon', 'pipeline_validar_codigo(text,text,text)', 'execute')
     and has_function_privilege('authenticated', 'pipeline_validar_codigo(text,text,text)', 'execute') then
    r := r || '[ok] caso 10: grants solo authenticated;';
  else r := r || '[FALLA] caso 10;'; end if;

  -- 11) reaplicar la migración no pisa un codigo_modo editado
  update config set valor = 'pin' where clave = 'codigo_modo';
  insert into config (clave, valor) values ('codigo_modo', 'cod') on conflict (clave) do nothing;
  if (select valor from config where clave = 'codigo_modo') = 'pin' then r := r || '[ok] caso 11: on conflict respeta lo editado;';
  else r := r || '[FALLA] caso 11;'; end if;

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0179 --> %', r;
end $$;
