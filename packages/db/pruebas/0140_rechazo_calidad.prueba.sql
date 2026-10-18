-- Prueba de la migración 0140_rechazo_calidad.sql
--
-- Spec: docs/superpowers/specs/pipeline/2026-10-17-rechazo-calidad-pierde-puntos-design.md (sección «Pruebas»).
-- Se escribió ANTES que la migración (Zone Guard). Todo sintético con el prefijo 'P0140'; se ataca
-- COMO `authenticated`. SE DESCARTA SOLA: termina lanzando una excepción con la línea RESULTADO.
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0140

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
  v_a text := 'P140A';
  e_alm uuid; e_cf uuid; e_cf2 uuid; p uuid;
  v_pts numeric; v_c1 numeric; v_suma numeric; v_err text; v_det text; v_n int;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values (v_a, 'P0140 Sede A');
  insert into empleados (cod, nombre, iniciales, rol) values ('P0140-AL', 'Prueba 0140 Almacen', 'AL', 'encargado_almacen') returning id into e_alm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0140-CF', 'Prueba 0140 Confeccionista', 'CF', 'confeccionista') returning id into e_cf;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0140-C2', 'Prueba 0140 Confeccionista 2', 'C2', 'confeccionista') returning id into e_cf2;
  insert into config (clave, valor) values
    ('pts_recepcion','1'), ('pts_lavado_normal','1'), ('pts_empatado','1'), ('pts_refaccion','1'),
    ('pts_compostura','1'), ('pts_planchado','1'), ('pts_control_calidad','1')
  on conflict (clave) do update set valor = excluded.valor;

  -- ── 1) Peso cambiado: el culpable cobró 1, el peso sube a 3, el rechazo descuenta lo cobrado (1) ─
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0140-1', 'Chaqueta', 'normal', v_a, 'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.dueno();
  update config set valor = '3' where clave = 'pts_planchado';
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => ''prueba'')', p, 'planchado'));
  perform pg_temp.dueno();
  update config set valor = '1' where clave = 'pts_planchado';
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where pasada_id = p and empleado_id = e_cf;
  select detalle into v_det from pipeline_puntos where pasada_id = p and puntos < 0;
  if v_pts = 1 and v_err = 'ok' and v_suma = 0 then
    r := r || '[ok] caso 1: el neto del culpable queda en 0 aunque el peso haya cambiado;';
  else
    r := r || format('[FALLA] caso 1: cobro=%s rechazar=%s neto=%s;', v_pts, v_err, v_suma);
  end if;

  -- ── 5) El detalle de la fila negativa es auditable ─────────────────────────────────────────
  if v_det like '%planchado%' and v_det like '%pierde 1%' then
    r := r || '[ok] caso 5: el detalle nombra la etapa y los puntos perdidos;';
  else
    r := r || format('[FALLA] caso 5: detalle=%s;', coalesce(v_det, 'null'));
  end if;

  -- ── 2) Rehacer la etapa tras el rechazo paga 0 ─────────────────────────────────────────────
  perform pg_temp.como(e_cf2);
  v_c1 := pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where pasada_id = p and etapa in ('planchado', 'planchado_rechazo');
  if v_c1 = 0 and v_suma = 0 then
    r := r || '[ok] caso 2: rehacer tras el rechazo no paga y el neto de la etapa es 0;';
  else
    r := r || format('[FALLA] caso 2: rehacer=%s neto-etapa=%s;', v_c1, v_suma);
  end if;

  -- ── 4) Un segundo rechazo no descuenta de más ──────────────────────────────────────────────
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => ''prueba'')', p, 'planchado'));
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where pasada_id = p;
  if v_err = 'ok' and v_suma = 0 then
    r := r || '[ok] caso 4: un segundo rechazo no deja al culpable bajo cero;';
  else
    r := r || format('[FALLA] caso 4: err=%s neto=%s;', v_err, v_suma);
  end if;

  -- ── 3) El culpable nunca cobró la etapa: no se escribe fila negativa ────────────────────────
  update config set valor = '0' where clave = 'pts_planchado';
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0140-3', 'Chaqueta', 'normal', v_a, 'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'control_calidad');
  perform pg_temp.como(e_alm);
  v_err := pg_temp.mensaje(format('select pipeline_rechazar(%L, %L, p_motivo => ''prueba'')', p, 'planchado'));
  perform pg_temp.dueno();
  update config set valor = '1' where clave = 'pts_planchado';
  select count(*) into v_n from pipeline_puntos where pasada_id = p and puntos < 0;
  if v_pts = 0 and v_err = 'ok' and v_n = 0 then
    r := r || '[ok] caso 3: sin nada cobrado no hay nada que quitar;';
  else
    r := r || format('[FALLA] caso 3: cobro=%s rechazar=%s filas-neg=%s;', v_pts, v_err, v_n);
  end if;

  -- ── 6) División: A cobró en la madre y se rechazan las dos hijas hacia la misma etapa ───────
  insert into prenda_pasada (codigo, tipo, tipo_lavado, sede_origen_cod, etapa)
    values ('P0140-6', 'Terno completo', 'normal', v_a, 'planchado') returning id into p;
  perform pg_temp.como(e_cf);
  v_pts := pipeline_avanzar(p, 'control_calidad');
  v_err := pg_temp.mensaje(format('select pipeline_dividir(%L)', p));
  -- Las hijas nacen en control_calidad: calidad las rechaza (sin culpable aún), A las rehace sin cobrar
  -- (la madre ya cobró) y calidad las rechaza otra vez, ahora con A como culpable de cada hija.
  perform pg_temp.como(e_alm);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(id, %L, p_motivo => ''prueba'') from prenda_pasada where codigo in (%L, %L)', 'planchado', 'P0140-6-S', 'P0140-6-P'));
  perform pg_temp.como(e_cf);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_avanzar(id, %L) from prenda_pasada where codigo in (%L, %L)', 'control_calidad', 'P0140-6-S', 'P0140-6-P'));
  perform pg_temp.como(e_alm);
  v_err := v_err || '/' || pg_temp.mensaje(format('select pipeline_rechazar(id, %L, p_motivo => ''prueba'') from prenda_pasada where codigo in (%L, %L)', 'planchado', 'P0140-6-S', 'P0140-6-P'));
  perform pg_temp.dueno();
  select coalesce(sum(puntos), 0) into v_suma from pipeline_puntos where empleado_id = e_cf and pasada_id in
    (select id from prenda_pasada where codigo like 'P0140-6%');
  if v_pts = 1 and v_err = 'ok/ok/ok/ok' and v_suma = 0 then
    r := r || '[ok] caso 6: dividida y rechazada en las dos hijas, el culpable nunca queda bajo cero;';
  else
    r := r || format('[FALLA] caso 6: cobro=%s neto=%s err=%s;', v_pts, v_suma, v_err);
  end if;

  raise exception 'RESULTADO 0140 --> %', r;
end $$;
