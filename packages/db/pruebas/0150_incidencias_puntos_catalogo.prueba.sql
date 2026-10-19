-- Prueba de 0150: quien no es administrador no puede fijar puntos_penalidad; salen del catálogo.
-- Todo sintético, prefijo 'P0150'. Se descarta sola (excepción final con RESULTADO).
-- Correr:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0150
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
  r text := ''; enc uuid; adm uuid; p numeric; falla boolean;
begin
  perform pg_temp.dueno();
  insert into sedes (cod, nombre) values ('P5', 'P0150 Sede') on conflict (cod) do nothing;
  insert into empleados (cod, nombre, iniciales, rol) values ('P0150-AD', 'P0150 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol, sede_cod) values ('P0150-E1', 'P0150 Enc', 'E1', 'encargado_tienda', 'P5') returning id into enc;
  insert into incidencia_tipos (tipo, categoria, nivel_default, puntos_default, activo)
    values ('P0150-tipo', 'Otros', 'Bajo', 3, true);

  perform pg_temp.como(enc);
  insert into incidencias (sede_cod, fecha, tipo, nivel, puntos_penalidad, reportado_por_id)
    values ('P5', current_date, 'P0150-tipo', 'Bajo', 999, enc) returning puntos_penalidad into p;
  r := r || format('no_admin_puntos=%s(esp 3); ', p);

  begin
    insert into incidencias (sede_cod, fecha, tipo, nivel, puntos_penalidad, reportado_por_id)
      values ('P5', current_date, 'P0150-inventado', 'Bajo', 5, enc);
    falla := false;
  exception when others then falla := true;
  end;
  r := r || format('tipo_inexistente_rechazado=%s(esp true); ', falla);

  perform pg_temp.como(adm);
  insert into incidencias (sede_cod, fecha, tipo, nivel, puntos_penalidad, reportado_por_id)
    values ('P5', current_date, 'P0150-tipo', 'Bajo', 7, adm) returning puntos_penalidad into p;
  r := r || format('admin_conserva=%s(esp 7); ', p);

  perform pg_temp.dueno();
  raise exception 'RESULTADO 0150 --> %', r;
end $$;
