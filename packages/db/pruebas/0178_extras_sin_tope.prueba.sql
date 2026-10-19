-- Prueba de la migración 0178_extras_sin_tope.sql
-- Spec: docs/superpowers/specs/reportes/2026-10-19-extras-sin-tope-design.md
-- Escrita ANTES que la migración (Zone Guard). Termina con una excepción RESULTADO.
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0178

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
create or replace function pg_temp.crear(p_uid uuid, p_id text, p_sede text, p_trab uuid[], p_extras jsonb)
returns text language plpgsql as $f$
declare v text;
begin
  perform pg_temp.como(p_uid);
  v := pg_temp.mensaje(format('select reportes_crear(%L,%L,%L,0,0,%L::uuid[],null::jsonb,%L::jsonb,null,null)',
                              p_id, p_sede, 'M', p_trab, p_extras));
  perform pg_temp.dueno();
  update reportes set evaluado = true where id = p_id;
  return v;
end $f$;

do $$
declare
  r text := '';
  v_a text := 'P178A';
  e_op uuid; e_comp uuid; v_err text; v_n int; j jsonb; j2 jsonb;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0178 Sede A');
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P178-OP','Prueba 0178 Operario','OP','ventas_junior', v_a) returning id into e_op;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P178-CO','Prueba 0178 Compañero','CO','ventas_junior', v_a) returning id into e_comp;
  insert into actividades_config (sede_cod, cod, nombre, categoria, tipo_act, peso, precio_unitario)
    values (v_a, 'EXT-P178', 'Extra de prueba', 'EXT', 'por_puntos', 2, 1.5);
  -- el valor provisional de la 0171 se vuelve «sin tope» (0)
  insert into config (clave, valor) values ('reporte_extra_cantidad_max', '0')
    on conflict (clave) do update set valor = '0';

  -- 1) cantidad grande entra con tope 0
  v_err := pg_temp.crear(e_op, '01-10-26_P178A_M', v_a, array[e_comp], '[{"cod":"EXT-P178","cantidad":5000}]'::jsonb);
  if v_err = 'ok' then r := r || '[ok] caso 1: sin tope entra una cantidad grande;';
  else r := r || '[FALLA] caso 1: ' || v_err || ';'; end if;

  -- 2) con tope 50 se rechaza
  update config set valor = '50' where clave = 'reporte_extra_cantidad_max';
  v_err := pg_temp.crear(e_op, '02-10-26_P178A_M', v_a, array[e_comp], '[{"cod":"EXT-P178","cantidad":5000}]'::jsonb);
  if v_err like 'CANTIDAD:%' then r := r || '[ok] caso 2: con tope 50 se rechaza;';
  else r := r || '[FALLA] caso 2: ' || v_err || ';'; end if;
  update config set valor = '0' where clave = 'reporte_extra_cantidad_max';

  -- 3) cero y negativos siguen rechazados
  v_err := pg_temp.crear(e_op, '03-10-26_P178A_M', v_a, array[e_comp], '[{"cod":"EXT-P178","cantidad":0}]'::jsonb);
  if v_err like 'CANTIDAD:%' then r := r || '[ok] caso 3: cantidad 0 sigue rechazada;';
  else r := r || '[FALLA] caso 3: ' || v_err || ';'; end if;

  -- 4) los puntos suman a quien hizo el extra, no a otra persona del turno
  v_err := pg_temp.crear(e_op, '04-10-26_P178A_M', v_a, array[e_comp],
    format('[{"cod":"EXT-P178","cantidad":3,"registrado_por_id":"%s"}]', e_comp)::jsonb);
  j  := evaluacion_componentes(e_comp, date '2026-10-01', date '2026-10-31');
  j2 := evaluacion_componentes(e_op,   date '2026-10-01', date '2026-10-31');
  -- el compañero tiene solo lo suyo (3 × 2 = 6); el operario, solo los 5000 × 2 del caso 1
  if (j->>'extrasPuntos')::numeric = 6 and (j2->>'extrasPuntos')::numeric = 10000
  then r := r || '[ok] caso 4: los puntos del extra van a la persona que lo hizo;';
  else r := r || format('[FALLA] caso 4: comp=%s op=%s;', j->>'extrasPuntos', j2->>'extrasPuntos'); end if;

  raise exception 'RESULTADO 0178 --> %', r;
end $$;
