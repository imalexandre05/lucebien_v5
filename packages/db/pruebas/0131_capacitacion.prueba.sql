-- Prueba de la migración 0131_capacitacion.sql
-- Spec: docs/superpowers/specs/capacitacion/2026-10-17-capacitacion-checklist-design.md (sección «Pruebas»).
--
-- QUÉ COMPRUEBA:
--   1. Sólo el admin asigna; el capacitador debe ser otra persona; una sola en curso por nuevo.
--   2. Aislamiento: el nuevo ve la suya, el capacitador la que dicta, un tercero no ve nada.
--   3. El nuevo no se califica (marcar/examen) y un tercero tampoco.
--   4. Cierre bloqueado sin ítems marcados / sin examen; con todo: aprobada o por_reforzar.
--   5. Sin escritura directa en las tablas.
-- Todo sintético, prefijo 'P0131'. Se descarta sola (excepción final con RESULTADO).
-- Cómo se corre:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0131

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
  e_adm uuid; e_adm2 uuid; e_cap2 uuid; cap3 uuid; cap4 uuid; e_nuevo uuid; e_cap uuid; e_otro uuid; cap uuid; cap2 uuid;
  it record; v_err text; v_n int; v_res text; v_ok boolean;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-AD', 'P0131 Admin', 'AD', 'admin') returning id into e_adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-NU', 'P0131 Nuevo', 'NU', 'confeccionista') returning id into e_nuevo;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-CA', 'P0131 Capacitador', 'CA', 'confeccionista') returning id into e_cap;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-OT', 'P0131 Otro', 'OT', 'confeccionista') returning id into e_otro;
  select count(*) into v_n from capacitacion_items where activo;
  r := r || format('montaje=ok(items=%s); ', v_n);

  -- 1) asignar
  perform pg_temp.como(e_cap);
  v_err := pg_temp.mensaje(format('select capacitacion_iniciar(%L, %L)', e_nuevo, e_cap));
  v_ok := v_err like 'Sólo el administrador%';
  perform pg_temp.como(e_adm);
  v_err := pg_temp.mensaje(format('select capacitacion_iniciar(%L, %L)', e_nuevo, e_nuevo));
  v_ok := v_ok and v_err like 'El capacitador debe ser otra persona%';
  select capacitacion_iniciar(e_nuevo, e_cap) into cap;
  v_err := pg_temp.mensaje(format('select capacitacion_iniciar(%L, %L)', e_nuevo, e_otro));
  v_ok := v_ok and v_err like '%ya tiene una capacitación en curso%';
  if v_ok then r := r || '[ok] caso 1: sólo el admin asigna, capacitador distinto y una sola en curso;';
  else r := r || format('[FALLA] caso 1: último error=%s;', v_err); end if;

  -- 2) aislamiento de lectura
  perform pg_temp.como(e_nuevo);  select count(*) into v_n from capacitaciones;
  v_ok := v_n = 1;
  perform pg_temp.como(e_cap);    select count(*) into v_n from capacitaciones;
  v_ok := v_ok and v_n = 1;
  perform pg_temp.como(e_otro);   select count(*) into v_n from capacitaciones;
  v_ok := v_ok and v_n = 0;
  perform pg_temp.como(e_adm);    select count(*) into v_n from capacitaciones where id = cap;
  v_ok := v_ok and v_n = 1;
  if v_ok then r := r || '[ok] caso 2: nuevo, capacitador y admin ven la capacitación; un tercero no;';
  else r := r || '[FALLA] caso 2: aislamiento de lectura;'; end if;

  -- 3) quién califica
  select id into it from capacitacion_items where activo order by orden limit 1;
  perform pg_temp.como(e_nuevo);
  v_err := pg_temp.mensaje(format('select capacitacion_marcar(%L, %L, %L)', cap, it.id, 'bueno'));
  v_ok := v_err = 'Capacitación no encontrada';
  v_err := pg_temp.mensaje(format('select capacitacion_examen(%L, %L, 15)', cap, 'X'));
  v_ok := v_ok and v_err = 'Capacitación no encontrada';
  perform pg_temp.como(e_otro);
  v_err := pg_temp.mensaje(format('select capacitacion_marcar(%L, %L, %L)', cap, it.id, 'bueno'));
  v_ok := v_ok and v_err = 'Capacitación no encontrada';
  perform pg_temp.como(e_cap);
  v_err := pg_temp.mensaje(format('select capacitacion_marcar(%L, %L, %L)', cap, it.id, 'excelente'));
  v_ok := v_ok and v_err like 'El estado debe ser%';
  if v_ok then r := r || '[ok] caso 3: ni el nuevo ni un tercero califican; el estado inválido se rechaza;';
  else r := r || format('[FALLA] caso 3: %s;', v_err); end if;

  -- 4) cierre
  perform pg_temp.como(e_cap);
  v_err := pg_temp.mensaje(format('select capacitacion_cerrar(%L)', cap));
  v_ok := v_err like 'Faltan marcar%';
  for it in select id from capacitacion_items where activo loop
    perform capacitacion_marcar(cap, it.id, 'bueno', null);
  end loop;
  v_err := pg_temp.mensaje(format('select capacitacion_cerrar(%L)', cap));
  v_ok := v_ok and v_err = 'Falta registrar al menos un examen';
  perform capacitacion_examen(cap, 'Examen 1', 10);
  select capacitacion_cerrar(cap) into v_res;
  v_ok := v_ok and v_res = 'por_reforzar';
  -- segunda capacitación: todo bueno y nota 16 → aprobada
  perform pg_temp.como(e_adm);
  select capacitacion_iniciar(e_nuevo, e_cap) into cap2;
  perform pg_temp.como(e_cap);
  for it in select id from capacitacion_items where activo loop
    perform capacitacion_marcar(cap2, it.id, 'regular', 'ok');
  end loop;
  perform capacitacion_examen(cap2, 'Examen 1', 16);
  select capacitacion_cerrar(cap2) into v_res;
  v_ok := v_ok and v_res = 'aprobada';
  v_err := pg_temp.mensaje(format('select capacitacion_examen(%L, %L, 18)', cap2, 'tarde'));
  v_ok := v_ok and v_err like 'Esta capacitación ya está cerrada%';
  if v_ok then r := r || '[ok] caso 4: el cierre exige ítems y examen; nota baja = por_reforzar, nota 16 = aprobada;';
  else r := r || format('[FALLA] caso 4: err=%s res=%s;', v_err, v_res); end if;

  -- 5) sin escritura directa
  perform pg_temp.como(e_adm);
  v_err := pg_temp.mensaje(format('insert into capacitaciones (nuevo_id, capacitador_id, inicio) values (%L, %L, current_date)', e_otro, e_cap));
  v_ok := v_err like 'permission denied%';
  v_err := pg_temp.mensaje('update capacitacion_items set nombre = ''x''');
  v_ok := v_ok and v_err like 'permission denied%';
  if v_ok then r := r || '[ok] caso 5: ni el admin escribe directo en las tablas;';
  else r := r || format('[FALLA] caso 5: %s;', v_err); end if;

  -- 6) hallazgos del verificador: una persona suspendida no lee ni califica, y un admin no se califica
  --    a sí mismo como «nuevo»
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-A2', 'P0131 Admin2', 'A2', 'admin') returning id into e_adm2;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0131-CB', 'P0131 Cap B', 'CB', 'confeccionista') returning id into e_cap2;
  perform pg_temp.como(e_adm);
  select capacitacion_iniciar(e_adm2, e_cap) into cap3;
  select capacitacion_iniciar(e_otro, e_cap2) into cap4;
  perform pg_temp.dueno();
  update empleados set activo = false where id = e_cap2;
  select id into it from capacitacion_items where activo order by orden limit 1;
  perform pg_temp.como(e_cap2);
  select count(*) into v_n from capacitaciones;
  v_err := pg_temp.mensaje(format('select capacitacion_marcar(%L, %L, %L)', cap4, it.id, 'bueno'));
  v_ok := v_n = 0 and v_err = 'Capacitación no encontrada';
  perform pg_temp.como(e_adm2);
  v_err := pg_temp.mensaje(format('select capacitacion_examen(%L, %L, 20)', cap3, 'autoexamen'));
  v_ok := v_ok and v_err = 'Capacitación no encontrada';
  if v_ok then r := r || '[ok] caso 6: suspendido no lee ni califica; el admin «nuevo» no se califica;';
  else r := r || format('[FALLA] caso 6: lecturas=%s err=%s;', v_n, v_err); end if;

  raise exception 'RESULTADO 0131 --> %', r;
end $$;
