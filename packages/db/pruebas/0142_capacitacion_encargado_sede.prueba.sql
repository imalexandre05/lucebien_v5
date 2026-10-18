-- Prueba de 0142: el encargado ve la capacitación de su sede y no la de otra; el nuevo sólo la suya.
-- Todo sintético, prefijo 'P0142'. Se descarta sola (excepción final con RESULTADO).
-- Correr:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0142
create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;

do $$
declare
  r text := ''; s1 text; s2 text; enc1 uuid; enc2 uuid; n1 uuid; n2 uuid; c1 uuid; c2 uuid; adm uuid; k int;
begin
  perform pg_temp.dueno();
  s1 := 'P1'; s2 := 'P2';
  insert into sedes (cod, nombre) values (s1, 'P0142 Sede 1'), (s2, 'P0142 Sede 2') on conflict (cod) do nothing;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0142-AD', 'P0142 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0142-E1', 'P0142 Enc1', 'E1', 'encargado_tienda', s1) returning id into enc1;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0142-E2', 'P0142 Enc2', 'E2', 'encargado_tienda', s2) returning id into enc2;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0142-N1', 'P0142 Nuevo1', 'N1', 'confeccionista', s1) returning id into n1;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0142-N2', 'P0142 Nuevo2', 'N2', 'confeccionista', s2) returning id into n2;
  insert into capacitaciones (nuevo_id, capacitador_id, inicio) values (n1, adm, current_date) returning id into c1;
  insert into capacitaciones (nuevo_id, capacitador_id, inicio) values (n2, adm, current_date) returning id into c2;

  perform pg_temp.como(enc1);
  select count(*) into k from capacitaciones where id in (c1, c2);
  r := r || format('enc1_ve=%s(esp 1); ', k);
  select count(*) into k from capacitaciones where id = c2;
  r := r || format('enc1_ve_otra_sede=%s(esp 0); ', k);
  perform pg_temp.como(enc2);
  select count(*) into k from capacitaciones where id = c1;
  r := r || format('enc2_ve_sede1=%s(esp 0); ', k);
  perform pg_temp.como(n1);
  select count(*) into k from capacitaciones where id in (c1, c2);
  r := r || format('nuevo1_ve=%s(esp 1); ', k);
  perform pg_temp.como(adm);
  select count(*) into k from capacitaciones where id in (c1, c2);
  r := r || format('admin_ve=%s(esp 2); ', k);
  perform pg_temp.dueno();
  raise exception 'RESULTADO 0142 --> %', r;
end $$;
