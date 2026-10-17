-- Prueba de la migración 0135_codigo_todos_los_movimientos.sql
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-codigo-en-todos-los-movimientos-design.md
-- Escrita ANTES que la migración (Zone Guard). Si falla, se corrige el código, nunca se afloja
-- la prueba sin corregir y confirmar la spec. Se descarta sola: termina con una excepción cuyo
-- texto RESULTADO lleva un [ok]/[FALLA] por caso.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0135

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
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := '';
  v_a text := 'P135A';
  e_op uuid; e_eq uuid; e_otro uuid;          -- operador (persona), equipo compartido, otra persona
  tok uuid; tok_otro uuid;
  v_err text; v_err2 text; v_n int; v_n2 int; v_id uuid; v_lista uuid; v_item uuid;
  v_emp uuid; v_cod text; v_cod2 text; v_pas uuid; v_def text;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0135 Sede A');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0135-OP','Prueba 0135 Operador','OP','encargado_tienda', v_a) returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod, cuenta_compartida) values ('P0135-EQ','Prueba 0135 Equipo','EQ','encargado_tienda', v_a, true) returning id into e_eq;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0135-OT','Prueba 0135 Otro','OT','encargado_tienda', v_a) returning id into e_otro;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_eq, e_op, now() + interval '5 minutes') returning token into tok;
  insert into codigo_operadores (sesion_uid, empleado_id, expira_en) values (e_otro, e_op, now() + interval '5 minutes') returning token into tok_otro;

  -- ── 1) Cuenta compartida SIN token: las tres acciones fallan con CODIGO: y no dejan fila ────
  perform pg_temp.como(e_eq);
  v_err  := pg_temp.mensaje(format('select pipeline_registrar_prenda(%L,%L,%L,%L,%L,%L,false,null,null,null)', 'P135-1','Saco','','',v_a,null));
  v_err2 := pg_temp.mensaje(format('select lavanderia_enviar(%L,%L,%L,%L,%L::jsonb,%L::jsonb,null)', v_a,'LAV','x','y','{}','[{"cod":"P135-2","tipo":"Saco"}]'));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo in ('P135-1','P135-2');
  select count(*) into v_n2 from listas_lavanderia where sede_cod = v_a;
  if v_err like 'CODIGO:%' and v_err2 like 'CODIGO:%' and v_n = 0 and v_n2 = 0 then
    r := r || '[ok] caso 1a: registrar y enviar sin token en equipo compartido piden código y no escriben;';
  else r := r || format('[FALLA] caso 1a: err=%s err2=%s prendas=%s listas=%s;', v_err, v_err2, v_n, v_n2); end if;

  insert into listas_lavanderia (sede_cod, tipo, fecha) values (v_a, 'LAV', now()) returning id into v_lista;
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select lavanderia_validar_retorno(%L, ''[]''::jsonb, null, null)', v_lista));
  perform pg_temp.dueno();
  if v_err like 'CODIGO:%' and (select validado_tienda from listas_lavanderia where id = v_lista) is not true then
    r := r || '[ok] caso 1b: validar retorno sin token en equipo compartido pide código y no valida;';
  else r := r || format('[FALLA] caso 1b: err=%s;', v_err); end if;

  -- ── 2) Con token válido: queda a nombre del operador ────────────────────────────────────────
  perform pg_temp.como(e_eq);
  select pipeline_registrar_prenda('P135-3','Saco','negro','40',v_a,null,false,null,null,tok) into v_pas;
  v_lista := lavanderia_enviar(v_a,'LAV','x','y','{}'::jsonb,'[{"cod":"P135-4","tipo":"Saco"}]'::jsonb, tok);
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial h join prenda_pasada p on p.id = h.pasada_id
    where p.codigo in ('P135-3','P135-4') and h.empleado_id = e_op and h.registrado_por = e_eq;
  if v_n = 2 then r := r || '[ok] caso 2a: alta y envío dejan historial a nombre del operador (sesión aparte);';
  else r := r || format('[FALLA] caso 2a: filas=%s;', v_n); end if;
  perform pg_temp.como(e_eq);
  perform lavanderia_validar_retorno(v_lista, '[]'::jsonb, null, tok);
  perform pg_temp.dueno();
  if (select validado_por from listas_lavanderia where id = v_lista) = e_op then
    r := r || '[ok] caso 2b: validar retorno guarda quién validó (el operador);';
  else r := r || '[FALLA] caso 2b: validado_por;'; end if;

  -- ── 3) Token de otra sesión → rechazado sin escribir ────────────────────────────────────────
  perform pg_temp.como(e_eq);
  v_err := pg_temp.mensaje(format('select pipeline_registrar_prenda(%L,%L,%L,%L,%L,null,false,null,null,%L)', 'P135-5','Saco','','',v_a,tok_otro));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_pasada where codigo = 'P135-5';
  if v_err like 'CODIGO:%' and v_n = 0 then r := r || '[ok] caso 3: token de otra sesión se rechaza;';
  else r := r || format('[FALLA] caso 3: err=%s n=%s;', v_err, v_n); end if;

  -- ── 4) Cuenta personal sin token: como antes (actor = sesión) ───────────────────────────────
  perform pg_temp.como(e_otro);
  v_err := pg_temp.mensaje(format('select pipeline_registrar_prenda(%L,%L,%L,%L,%L,null,false,null,null,null)', 'P135-6','Saco','','',v_a));
  perform pg_temp.dueno();
  if v_err = 'ok' and exists (select 1 from prenda_historial h join prenda_pasada p on p.id = h.pasada_id
                              where p.codigo = 'P135-6' and h.empleado_id = e_otro) then
    r := r || '[ok] caso 4: cuenta personal sin token funciona y el actor es la sesión;';
  else r := r || format('[FALLA] caso 4: err=%s;', v_err); end if;

  -- ── 5) codigo_mov: formato, fecha Perú, correlativo, único, también en avanzar ──────────────
  select codigo_mov into v_cod from prenda_historial h join prenda_pasada p on p.id = h.pasada_id where p.codigo = 'P135-6' limit 1;
  if v_cod ~ '^MOV-[0-9]{6}-[0-9]{5}$'
     and substr(v_cod, 5, 6) = to_char((select h.fecha from prenda_historial h join prenda_pasada p on p.id = h.pasada_id where p.codigo='P135-6' limit 1) at time zone 'America/Lima', 'YYMMDD') then
    r := r || '[ok] caso 5a: formato MOV-AAMMDD-NNNNN con fecha de la fila en hora Perú;';
  else r := r || format('[FALLA] caso 5a: codigo_mov=%s;', v_cod); end if;
  -- borde de medianoche: 23:30 Perú del día D es D+1 en UTC; el código debe llevar D.
  insert into prenda_pasada (codigo, tipo, sede_origen_cod, etapa) values ('P135-7','Saco',v_a,'recepcion') returning id into v_pas;
  insert into prenda_historial (pasada_id, etapa_nueva, fecha)
    values (v_pas, 'recepcion', ((now() at time zone 'America/Lima')::date - 3 + time '23:30') at time zone 'America/Lima')
    returning codigo_mov into v_cod2;
  if substr(v_cod2, 5, 6) = to_char((now() at time zone 'America/Lima')::date - 3, 'YYMMDD') then
    r := r || '[ok] caso 5b: 23:30 hora Perú lleva el día Perú, no el UTC;';
  else r := r || format('[FALLA] caso 5b: %s;', v_cod2); end if;
  insert into prenda_historial (pasada_id, etapa_nueva) values (v_pas, 'lavado') returning codigo_mov into v_cod;
  if substr(v_cod,12)::int > substr(v_cod2,12)::int then r := r || '[ok] caso 5c: el correlativo crece;';
  else r := r || format('[FALLA] caso 5c: %s %s;', v_cod2, v_cod); end if;
  begin
    insert into prenda_historial (pasada_id, etapa_nueva, codigo_mov) values (v_pas, 'lavado', v_cod);
    r := r || '[FALLA] caso 5d: aceptó un código repetido;';
  exception when unique_violation then r := r || '[ok] caso 5d: el código de movimiento es único;'; end;
  -- avanzar (RPC existente) también recibe código sin haberse reescrito
  insert into config (clave, valor) values ('pts_recepcion','1') on conflict (clave) do nothing;
  perform pg_temp.como(e_otro);
  v_err := pg_temp.mensaje(format('select pipeline_avanzar(%L, %L)', v_pas, 'lavado'));
  perform pg_temp.dueno();
  select count(*) into v_n from prenda_historial where pasada_id = v_pas and etapa_anterior = 'recepcion' and codigo_mov is not null;
  if v_n >= 1 then r := r || '[ok] caso 5e: pipeline_avanzar deja su movimiento con código;';
  else r := r || format('[FALLA] caso 5e: err=%s n=%s;', v_err, v_n); end if;

  -- ── 6) Una sola firma por función y grants ──────────────────────────────────────────────────
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('pipeline_registrar_prenda','lavanderia_enviar','lavanderia_validar_retorno');
  select count(*) into v_n2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('pipeline_registrar_prenda','lavanderia_enviar','lavanderia_validar_retorno')
      and has_function_privilege('anon', p.oid, 'execute');
  if v_n = 3 and v_n2 = 0 then r := r || '[ok] caso 6: una firma por función y sin execute para anon;';
  else r := r || format('[FALLA] caso 6: firmas=%s anon=%s;', v_n, v_n2); end if;

  -- ── 7) Prefijo editable desde config ────────────────────────────────────────────────────────
  update config set valor = 'XYZ' where clave = 'pipeline_mov_prefijo';
  insert into prenda_historial (pasada_id, etapa_nueva) values (v_pas, 'empatado') returning codigo_mov into v_cod;
  if v_cod like 'XYZ-%' then r := r || '[ok] caso 7: el prefijo se lee de config (editable);';
  else r := r || format('[FALLA] caso 7: %s;', v_cod); end if;

  raise exception 'RESULTADO 0135 --> %', r;
end $$;
