-- Prueba de la migración 0144_ventas_asistencia_periodo_cerrado.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-17-ventas-asistencia-periodo-cerrado-design.md
-- Escrita ANTES que la migración (Zone Guard): si falla, se corrige el código, nunca se afloja la
-- prueba sin corregir y confirmar la spec. Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0144

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

do $$
declare
  r text := '';
  adm uuid; per uuid; ven uuid;
  ac_sep uuid; ac_oct uuid;
  j jsonb; e jsonb; v_err text; v_n int; v_id uuid;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P144-AD','Prueba 144 Admin','AD','admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P144-PE','Prueba 144 Persona','PE','confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P144-VE','Prueba 144 Sin contrato','VE','confeccionista') returning id into ven;

  -- Septiembre 2099 cerrado; octubre 2099 abierto con un solo turno semanal declarado.
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-09-01','2099-09-30',1000,adm,'vigente') returning id into ac_sep;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado, creado_por, estado)
    values (per,'2099-10-01','2099-10-31',1000,adm,'vigente') returning id into ac_oct;
  insert into sueldo_liquidaciones (acuerdo_id, empleado_id, periodo_desde, periodo_hasta, estado, entrada, parametros_usados,
      resultado, total, valor_por_hora, motor_version, cerrada_en, cerrada_por)
    values (ac_sep, per, '2099-09-01','2099-09-30','cerrada','{}','{}','{"lineas":[]}',1000,1,'t',now(),adm);
  insert into sueldo_acuerdo_turnos(acuerdo_id, dia_semana, hora_inicio, hora_fin)
    values (ac_oct, extract(isodow from date '2099-10-05')::int, time '09:00', time '13:00');
  insert into asistencias(empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente)
    select per, d::date, 'M', 'trabajado', time '09:00', time '13:00', 'huellero'
    from generate_series(date '2099-10-01', date '2099-10-31', interval '1 day') d
    where extract(isodow from d) = extract(isodow from date '2099-10-05');

  perform pg_temp.como(adm);

  -- ── 1) Venta del 28-sep con septiembre cerrado → entra en octubre ───────────────────────────
  j := sueldo_venta_crear('2099-09-28', 300, 'venta', null, per, null);
  select count(*) into v_n from sueldo_ventas
   where id = (j->>'id')::uuid and fecha = '2099-10-01' and fecha_original = '2099-09-28' and empleado_id = per;
  e := sueldo_entrada(ac_oct, '2099-10-01', '2099-10-31');
  if v_n = 1 and (j->>'aviso') like '%ya está pagado%'
     and exists (select 1 from jsonb_array_elements(e->'ventas') x where x->>'fecha' = '2099-10-01' and (x->>'monto')::numeric = 300) then
    r := r || '[ok] caso 1: la venta del 28-sep va al 1-oct, guarda la original, avisa y la comisión entra en la liquidación de octubre;';
  else r := r || format('[FALLA] caso 1: n=%s j=%s ventas=%s;', v_n, j, e->'ventas'); end if;

  -- ── 2) Fecha abierta: tal cual. Sin siguiente período: error y no escribe ──────────────────
  j := sueldo_venta_crear('2099-10-10', 150, 'venta', null, per, null);
  select count(*) into v_n from sueldo_ventas where id = (j->>'id')::uuid and fecha = '2099-10-10' and fecha_original is null;
  v_err := pg_temp.mensaje(format('select sueldo_venta_crear(%L, 99, %L, null, %L, null)', date '2099-12-01', 'venta', per));
  if v_n = 1 and v_err like 'PERIODO:%' and not exists (select 1 from sueldo_ventas where monto = 99 and empleado_id = per) then
    r := r || '[ok] caso 2: fecha abierta tal cual; sin período siguiente avisa (PERIODO:) y no guarda;';
  else r := r || format('[FALLA] caso 2: n=%s err=%s;', v_n, v_err); end if;

  -- ── 3) Red de seguridad: un insert directo en período cerrado se rechaza ────────────────────
  v_err := pg_temp.mensaje(format('insert into sueldo_ventas(origen, fecha, monto, tipo, empleado_id) values (%L, %L, 10, %L, %L)', 'manual', date '2099-09-15', 'venta', per));
  if v_err like 'PERIODO_CERRADO:%' then r := r || '[ok] caso 3: el insert directo en período cerrado lo corta el trigger;';
  else r := r || format('[FALLA] caso 3: %s;', v_err); end if;

  -- ── 4) Sin vendedor (cola) se guarda; al asignar aplica la misma regla ─────────────────────
  j := sueldo_venta_crear('2099-09-20', 80, 'venta', null, null, 'externo');
  v_id := (j->>'id')::uuid;
  perform sueldo_venta_asignar(v_id, per);
  select count(*) into v_n from sueldo_ventas where id = v_id and empleado_id = per and fecha = '2099-10-01' and fecha_original = '2099-09-20';
  if v_n = 1 then r := r || '[ok] caso 4: la venta de la cola, al asignarla, también se traslada;';
  else r := r || format('[FALLA] caso 4: n=%s;', v_n); end if;

  -- ── 5) Tardanza del 28-sep con septiembre cerrado → se descuenta en octubre ────────────────
  j := sueldo_tardanza_diferida_crear(per, '2099-09-28', 'llegó 20 min tarde, cargada tarde');
  e := sueldo_entrada(ac_oct, '2099-10-01', '2099-10-31');
  if (j->>'aplicada_en')::date = '2099-10-01' and (j->>'aviso') like '%ya está pagado%'
     and (e->>'tardanzasDiferidas')::int = 1 then
    r := r || '[ok] caso 5: la tardanza va a octubre y sueldo_entrada la entrega como tardanzasDiferidas = 1;';
  else r := r || format('[FALLA] caso 5: j=%s entrada=%s;', j, e->'tardanzasDiferidas'); end if;
  select count(*) into v_n from sueldo_tardanzas_diferidas where empleado_id = per and aplicada_en between '2099-09-01' and '2099-09-30';
  if v_n = 0 then r := r || '[ok] caso 5b: ninguna tardanza trasladada cae en septiembre;';
  else r := r || format('[FALLA] caso 5b: %s;', v_n); end if;

  -- ── 6) Fecha abierta se rechaza; no-admin se rechaza ───────────────────────────────────────
  v_err := pg_temp.mensaje(format('select sueldo_tardanza_diferida_crear(%L, %L, %L)', per, date '2099-10-12', 'abierta'));
  if v_err like 'DATO:%' then r := r || '[ok] caso 6: una fecha abierta se carga en la asistencia del día, no acá;';
  else r := r || format('[FALLA] caso 6: %s;', v_err); end if;
  perform pg_temp.como(ven);
  v_err := pg_temp.mensaje(format('select sueldo_tardanza_diferida_crear(%L, %L, %L)', per, date '2099-09-28', 'intruso'));
  v_n := (select count(*) from (select 1) q where pg_temp.mensaje(format('select sueldo_venta_crear(%L, 5, %L, null, %L, null)', date '2099-10-02', 'venta', per)) like 'PERMISO:%');
  if v_err like 'PERMISO:%' and v_n = 1 then r := r || '[ok] caso 6b: sólo el administrador carga ventas y tardanzas trasladadas;';
  else r := r || format('[FALLA] caso 6b: %s n=%s;', v_err, v_n); end if;
  perform pg_temp.dueno();

  raise exception 'RESULTADO 0144 --> %', r;
end $$;
