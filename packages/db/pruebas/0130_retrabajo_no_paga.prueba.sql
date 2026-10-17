-- Prueba de la migración 0130_retrabajo_no_paga.sql
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-retrabajo-no-paga-design.md (sección «Pruebas»).
-- Se escribió ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja
-- la prueba sin antes corregir y confirmar la spec.
--
-- QUÉ COMPRUEBA (cada caso deja un [ok] o un [FALLA] en la línea RESULTADO):
--   1. Un ciclo completo (7 etapas) paga 7. Se envía, la tienda observa a recepción y se re-avanza
--      todo: el segundo ciclo paga 0 y el total sigue en 7. (Con la 0128 el total da 14.)
--   2. Deshacer + re-avanzar la misma etapa paga una sola vez (el punto borrado se repone).
--   3. Rechazo de calidad (sin cambio): el culpable pierde su punto y quien rehace la etapa cobra.
--   3b. Dividir tras una observación: las hijas no recobran lo que la madre ya cobró.
--   4. Una etapa que no pagó la primera vez (clave pts_* en 0) paga cuando la clave sube.
--
-- MONTAJE. Todo sintético con el prefijo 'P0130'. Se ataca COMO `authenticated` de verdad.
-- SE DESCARTA SOLA: termina lanzando una excepción con el resultado; se lee la línea RESULTADO.
--
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0130

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;

create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;

create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $f$;

-- Avanza la prenda por las 7 etapas hasta «listo» como la sesión actual; devuelve lo pagado.
create or replace function pg_temp.ciclo(p uuid) returns numeric language plpgsql as $f$
declare v_total numeric := 0; v_dest text; v_etapa text;
begin
  loop
    select etapa into v_etapa from prenda_pasada where id = p;
    exit when v_etapa = 'listo';
    v_dest := case v_etapa
      when 'recepcion' then 'lavado' when 'lavado' then 'empatado' when 'empatado' then 'refaccion'
      when 'refaccion' then 'compostura' when 'compostura' then 'planchado'
      when 'planchado' then 'control_calidad' when 'control_calidad' then 'listo' end;
    v_total := v_total + pipeline_avanzar(p, v_dest);
  end loop;
  return v_total;
end $f$;

do $$
declare
  r text := '';
  v_a text := 'P130A'; v_b text := 'P130B';
  e_alm uuid; e_cf uuid; p uuid; h record;
  v_c1 numeric; v_c2 numeric; v_suma numeric; v_n int; v_err text; v_pts numeric;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0130 Sede A'), (v_b, 'P0130 Sede B');
  insert into empleados (cod, nombre, iniciales, rol) values ('P0130-AL', 'Prueba 0130 Almacen', 'AL', 'encargado_almacen') returning id into e_alm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0130-CF', 'Prueba 0130 Confeccionista', 'CF', 'confeccionista') returning id into e_cf;
  insert into config (clave, valor) values
    ('pts_recepcion','1'), ('pts_lavado_normal','1'), ('pts_empatado','1'), ('pts_refaccion','1'),
    ('pts_compostura','1'), ('pts_planchado','1'), ('pts_control_calidad','1')
  on conflict (clave) do update set valor = excluded.valor;
  r := r || 'montaje=ok; ';

  -- ── 1) El ciclo de retrabajo no paga ───────────────────────────────────────────────────────
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0130-1', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_c1 := pg_temp.ciclo(p);
  v_err := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, v_b));
  perform pg_temp.como(e_alm);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_calificar(%L, false, %L, %L)', p, 'recepcion', 'P0130 observada'));
  perform pg_temp.como(e_cf);
  v_c2 := pg_temp.ciclo(p);
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0), count(*) into v_suma, v_n from pipeline_puntos where pasada_id = p;
  if v_c1 = 7 and v_c2 = 0 and v_suma = 7 and v_n = 7 and v_err = 'ok/ok' then
    r := r || '[ok] caso 1: ciclo 1 paga 7, el retrabajo paga 0 y el total queda en 7;';
  else
    r := r || format('[FALLA] caso 1: ciclo1=%s retrabajo=%s total=%s filas=%s err=%s;', v_c1, v_c2, v_suma, v_n, v_err);
  end if;

  -- ── 2) Deshacer repone el pago: se paga una sola vez ───────────────────────────────────────
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0130-2', 'Chaqueta', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'lavado');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'recepcion'));
  v_c1 := pipeline_avanzar(p, 'lavado');
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where pasada_id = p and etapa = 'recepcion';
  if v_pts = 1 and v_err = 'ok' and v_c1 = 1 and v_suma = 1 then
    r := r || '[ok] caso 2: deshacer + re-avanzar paga una sola vez;';
  else
    r := r || format('[FALLA] caso 2: pts=%s deshacer=%s repago=%s suma=%s;', v_pts, v_err, v_c1, v_suma);
  end if;

  -- ── 3) Rechazo de calidad (queda como antes): el culpable pierde su punto y quien rehace cobra ─
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0130-3', 'Chaqueta', 'normal', v_a, 'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L)', p, 'planchado'));
  perform pg_temp.como(e_cf);
  v_c1 := pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where pasada_id = p;
  if v_pts = 1 and v_err = 'ok' and v_c1 = 1 and v_suma = 1
     and exists (select 1 from pipeline_puntos where pasada_id = p and puntos < 0 and empleado_id = e_cf) then
    r := r || '[ok] caso 3: el rechazo penaliza al culpable y quien rehace la etapa cobra (sin cambio);';
  else
    r := r || format('[FALLA] caso 3: pts=%s rechazar=%s rehacer=%s suma=%s;', v_pts, v_err, v_c1, v_suma);
  end if;

  -- ── 3b) Dividir tras una observación: las hijas no recobran lo que la madre ya cobró ───────
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0130-3B', 'Terno completo', 'normal', v_a, 'recepcion') returning id into p;
  perform pg_temp.como(e_cf);
  v_c1 := pg_temp.ciclo(p);
  v_err := pg_temp.mensaje(format('select pipeline_enviar(%L, %L)', p, v_b));
  perform pg_temp.como(e_alm);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_calificar(%L, false, %L, %L)', p, 'recepcion', 'P0130 obs'));
  perform pg_temp.como(e_cf);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_dividir(%L)', p));
  v_c2 := 0;
  for h in select id from prenda_pasada where codigo in ('P0130-3B-S', 'P0130-3B-P') loop
    v_c2 := v_c2 + pg_temp.ciclo(h.id);
  end loop;
  perform pg_temp.dueno();
  if v_c1 = 7 and v_c2 = 0 and v_err = 'ok/ok/ok' then
    r := r || '[ok] caso 3b: las hijas no vuelven a cobrar el ciclo que la madre ya cobró;';
  else
    r := r || format('[FALLA] caso 3b: ciclo1=%s hijas=%s err=%s;', v_c1, v_c2, v_err);
  end if;

  -- ── 4) Una etapa que no pagó (clave en 0) paga cuando la clave sube ────────────────────────
  update config set valor = '0' where clave = 'pts_empatado';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0130-4', 'Chaqueta', 'normal', v_a, 'empatado') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'refaccion');
  v_err := pg_temp.mensaje(format('select pipeline_deshacer(%L, %L)', p, 'empatado'));
  perform pg_temp.dueno();
  update config set valor = '1' where clave = 'pts_empatado';
  perform pg_temp.como(e_cf);
  v_c1 := pipeline_avanzar(p, 'refaccion');
  perform pg_temp.dueno();
  if v_pts = 0 and v_err = 'ok' and v_c1 = 1 then
    r := r || '[ok] caso 4: una etapa que no pagó (clave en 0) paga cuando corresponde;';
  else
    r := r || format('[FALLA] caso 4: primera=%s deshacer=%s segunda=%s;', v_pts, v_err, v_c1);
  end if;

  raise exception 'RESULTADO 0130 --> %', r;
end $$;
