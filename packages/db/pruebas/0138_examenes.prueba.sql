-- Prueba de la migración 0138_examenes.sql
-- Spec: docs/superpowers/specs/capacitacion/2026-10-17-examenes-design.md
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0138

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;
-- Respuestas para un intento: `delta` 0 = todas correctas, 1 = todas mal; `buenas` = cuántas correctas.
create or replace function pg_temp.respuestas(p_intento uuid, p_buenas int) returns jsonb language plpgsql as $f$
declare j jsonb := '{}'; q record; i int := 0;
begin
  for q in select p.id, p.correcta from examen_preguntas p
            where p.id::text in (select jsonb_array_elements_text(i2.preguntas) from examen_intentos i2 where i2.id = p_intento)
            order by p.id loop
    i := i + 1;
    j := j || jsonb_build_object(q.id::text, case when i <= p_buenas then q.correcta else (q.correcta + 1) % 3 end);
  end loop;
  return j;
end $f$;

do $$
declare
  r text := '';
  adm uuid; nu uuid; ca uuid; ot uuid; cap uuid; hab1 uuid; hab2 uuid;
  v jsonb; v2 jsonb; it uuid; v_err text; v_n int; v_nota numeric; k int; v_ev jsonb;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P138-AD','Prueba 138 Admin','AD','admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P138-NU','Prueba 138 Nuevo','NU','confeccionista') returning id into nu;
  insert into empleados (cod, nombre, iniciales, rol) values ('P138-CA','Prueba 138 Capacitador','CA','confeccionista') returning id into ca;
  insert into empleados (cod, nombre, iniciales, rol) values ('P138-OT','Prueba 138 Otro','OT','confeccionista') returning id into ot;
  insert into config (clave, valor) values ('examen_preguntas_por_intento','4') on conflict (clave) do update set valor = '4';
  perform pg_temp.como(adm);
  cap := capacitacion_iniciar(nu, ca);
  for k in 1..4 loop
    perform examen_pregunta_guardar(null, 'software', 'Sistema', 'Pregunta software ' || k, '["a","b","c"]'::jsonb, k % 3, true);
    perform examen_pregunta_guardar(null, 'escrito', 'Medidas', 'Pregunta escrita ' || k, '["a","b","c"]'::jsonb, (k + 1) % 3, true);
  end loop;
  hab1 := examen_habilidad_guardar(null, 'Planchado P138', 1, true);
  hab2 := examen_habilidad_guardar(null, 'Costura P138', 2, true);
  perform pg_temp.dueno();
  -- Los datos de siembra de la migración no deben mezclarse con la prueba.
  update examen_habilidades set activo = false where nombre not like '%P138';

  -- ── 1) La persona nueva no ve el banco ni la clave ──────────────────────────────────────────
  perform pg_temp.como(nu);
  select count(*) into v_n from examen_preguntas;
  v := examen_iniciar(cap, 'software');
  if v_n = 0 and jsonb_array_length(v->'preguntas') = 4 and v::text not like '%correcta%' then
    r := r || '[ok] caso 1: el banco no se lee y el examen llega sin clave;';
  else r := r || format('[FALLA] caso 1: filas=%s n=%s texto=%s;', v_n, jsonb_array_length(v->'preguntas'), left(v::text, 120)); end if;
  it := (v->>'intento_id')::uuid;
  -- retomar el mismo intento
  v2 := examen_iniciar(cap, 'software');
  if (v2->>'intento_id')::uuid = it then r := r || '[ok] caso 1b: un intento sin terminar se retoma;';
  else r := r || '[FALLA] caso 1b: creó otro intento;'; end if;

  -- ── 2) Calificación: todo bien = 20 ─────────────────────────────────────────────────────────
  perform pg_temp.dueno();
  v2 := pg_temp.respuestas(it, 4);
  perform pg_temp.como(nu);
  v := examen_responder(it, v2);
  if (v->>'nota')::numeric = 20 and (v->>'aciertos')::int = 4 and v::text not like '%correcta%' then
    r := r || '[ok] caso 2a: todo correcto = 20, sin revelar la clave;';
  else r := r || format('[FALLA] caso 2a: %s;', v); end if;
  v_err := pg_temp.mensaje(format('select examen_responder(%L, %L::jsonb)', it, v2::text));
  if v_err <> 'ok' then r := r || '[ok] caso 2b: un intento no se califica dos veces;';
  else r := r || '[FALLA] caso 2b: calificó dos veces;'; end if;

  -- ── 3) Consolidación en capacitacion_examenes ───────────────────────────────────────────────
  perform pg_temp.dueno();
  select nota into v_nota from capacitacion_examenes where capacitacion_id = cap order by fecha desc, created_at desc limit 1;
  if v_nota = 20 then r := r || '[ok] caso 3: el Examen integral queda como nota vigente (20);';
  else r := r || format('[FALLA] caso 3: vigente=%s;', v_nota); end if;

  -- segundo intento de software, todo mal → vigente 0 (última nota del tipo)
  perform pg_temp.como(nu);
  v := examen_iniciar(cap, 'software'); it := (v->>'intento_id')::uuid;
  perform pg_temp.dueno(); v2 := pg_temp.respuestas(it, 0); perform pg_temp.como(nu);
  v := examen_responder(it, v2);
  perform pg_temp.dueno();
  select nota into v_nota from capacitacion_examenes where capacitacion_id = cap order by fecha desc, created_at desc limit 1;
  if (v->>'nota')::numeric = 0 and v_nota = 0 then r := r || '[ok] caso 5a: el reintento reemplaza la nota vigente del tipo;';
  else r := r || format('[FALLA] caso 5a: nota=%s vigente=%s;', v->>'nota', v_nota); end if;
  -- tercer intento: mitad (2 de 4 = 10)
  perform pg_temp.como(nu);
  v := examen_iniciar(cap, 'software'); it := (v->>'intento_id')::uuid;
  perform pg_temp.dueno(); v2 := pg_temp.respuestas(it, 2); perform pg_temp.como(nu);
  v := examen_responder(it, v2);
  -- cuarto: el máximo (3) corta
  v_err := pg_temp.mensaje(format('select examen_iniciar(%L, %L)', cap, 'software'));
  if (v->>'nota')::numeric = 10 and v_err like '%intentos%' then r := r || '[ok] caso 5b: mitad = 10 y el tope de 3 intentos corta;';
  else r := r || format('[FALLA] caso 5b: nota=%s err=%s;', v->>'nota', v_err); end if;

  -- ── 4) Ponderación: software 10 (peso 2) + escrito 20 (peso 1) = 13.33 ──────────────────────
  perform pg_temp.dueno();
  insert into config (clave, valor) values ('examen_peso_software','2'), ('examen_peso_escrito','1'), ('examen_peso_presencial','1')
    on conflict (clave) do update set valor = excluded.valor;
  perform pg_temp.como(nu);
  v := examen_iniciar(cap, 'escrito'); it := (v->>'intento_id')::uuid;
  perform pg_temp.dueno(); v2 := pg_temp.respuestas(it, 4); perform pg_temp.como(nu);
  perform examen_responder(it, v2);
  perform pg_temp.dueno();
  select nota into v_nota from capacitacion_examenes where capacitacion_id = cap order by fecha desc, created_at desc limit 1;
  if v_nota = 13.33 then r := r || '[ok] caso 4: promedio ponderado 2:1 = 13.33;';
  else r := r || format('[FALLA] caso 4: vigente=%s;', v_nota); end if;

  -- ── 6) Presencial ───────────────────────────────────────────────────────────────────────────
  perform pg_temp.como(nu);
  v_err := pg_temp.mensaje(format('select examen_presencial_calificar(%L, %L::jsonb)', cap, jsonb_build_array(jsonb_build_object('habilidad', hab1, 'nota', 20))::text));
  if v_err <> 'ok' then r := r || '[ok] caso 6a: la persona evaluada no se califica;';
  else r := r || '[FALLA] caso 6a: se calificó sola;'; end if;
  perform pg_temp.como(ca);
  perform examen_presencial_calificar(cap, jsonb_build_array(jsonb_build_object('habilidad', hab1, 'nota', 18)));
  perform pg_temp.dueno();
  select nota into v_nota from capacitacion_examenes where capacitacion_id = cap order by fecha desc, created_at desc limit 1;
  if v_nota = 13.33 then r := r || '[ok] caso 6b: con una habilidad pendiente el presencial no cuenta;';
  else r := r || format('[FALLA] caso 6b: vigente=%s;', v_nota); end if;
  perform pg_temp.como(ca);
  perform examen_presencial_calificar(cap, jsonb_build_array(jsonb_build_object('habilidad', hab2, 'nota', 14)));
  perform pg_temp.dueno();
  select nota into v_nota from capacitacion_examenes where capacitacion_id = cap order by fecha desc, created_at desc limit 1;
  -- presencial = (18 + 14) / 2 = 16 → (2*10 + 1*20 + 1*16) / 4 = 14
  if v_nota = 14 then r := r || '[ok] caso 6c: con todas las habilidades el presencial entra (14.00);';
  else r := r || format('[FALLA] caso 6c: vigente=%s;', v_nota); end if;

  -- ── 8) Terceros ─────────────────────────────────────────────────────────────────────────────
  perform pg_temp.como(ot);
  v_err := pg_temp.mensaje(format('select examen_iniciar(%L, %L)', cap, 'escrito'));
  select count(*) into v_n from examen_intentos;
  if v_err <> 'ok' and v_n = 0 then r := r || '[ok] caso 8: un tercero no rinde ni lee intentos;';
  else r := r || format('[FALLA] caso 8: err=%s intentos=%s;', v_err, v_n); end if;
  perform pg_temp.como(ca);
  select count(*) into v_n from examen_intentos;
  if v_n >= 4 then r := r || '[ok] caso 8b: el capacitador ve los intentos de su capacitación;';
  else r := r || format('[FALLA] caso 8b: intentos=%s;', v_n); end if;

  -- ── 7 y 9) Cierre → la evaluación toma la nota; después no se admiten intentos ──────────────
  perform pg_temp.como(ca);
  perform capacitacion_marcar(cap, i.id, 'bueno', null) from capacitacion_items i where i.activo;
  v_err := capacitacion_cerrar(cap);
  perform pg_temp.dueno();
  v_ev := private.evaluacion_componentes_datos(nu, v_hoy - 1, v_hoy + 1);
  if (v_ev->>'examenes')::numeric = 14 then r := r || '[ok] caso 9: la evaluación (0132) toma el Examen integral (14);';
  else r := r || format('[FALLA] caso 9: examenes=%s cierre=%s;', v_ev->>'examenes', v_err); end if;
  perform pg_temp.como(nu);
  v_err := pg_temp.mensaje(format('select examen_iniciar(%L, %L)', cap, 'escrito'));
  if v_err <> 'ok' then r := r || '[ok] caso 7: cerrada la capacitación no se admiten intentos;';
  else r := r || '[FALLA] caso 7: aceptó un intento en una capacitación cerrada;'; end if;

  -- ── 10) Permisos ────────────────────────────────────────────────────────────────────────────
  v_err := pg_temp.mensaje(format('select examen_pregunta_guardar(null, %L, %L, %L, %L::jsonb, 0, true)', 'software', 't', 'x', '["a","b"]'));
  perform pg_temp.dueno();
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'examen\_%' and has_function_privilege('anon', p.oid, 'execute');
  if v_err <> 'ok' and v_n = 0 then r := r || '[ok] caso 10: sólo el administrador edita el banco; anon sin execute;';
  else r := r || format('[FALLA] caso 10: err=%s anon=%s;', v_err, v_n); end if;

  raise exception 'RESULTADO 0138 --> %', r;
end $$;
