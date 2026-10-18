-- Prueba de la migración 0165_asistencia_revisada.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-ficha-unica-asistencia-por-revisar-design.md §5 y §7
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola (excepción final con RESULTADO).
-- Se corre con:  bash tools/postgres-local.sh aplicar && bash tools/postgres-local.sh probar 0165

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
  r text := '';
  adm uuid; per uuid; otro uuid; v_id uuid;
  v_rev timestamptz; v_por uuid;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P165-AD', 'Prueba 165 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P165-PE', 'Prueba 165 Persona', 'PE', 'confeccionista') returning id into per;
  insert into empleados (cod, nombre, iniciales, rol) values ('P165-OT', 'Prueba 165 Otro', 'OT', 'encargado_tienda') returning id into otro;
  insert into asistencias (empleado_id, fecha, turno, condicion, hora_entrada, hora_salida, fuente, minutos_tardanza)
    values (per, '2099-06-01', 'M', 'trabajado', '08:30', '13:00', 'huellero', 0) returning id into v_id;

  -- ── 1) Las columnas existen y empiezan vacías ─────────────────────────────────────────────
  select revisada_en, revisada_por into v_rev, v_por from asistencias where id = v_id;
  if v_rev is null and v_por is null then r := r || '[ok] 1;'; else r := r || '[FALLA] 1;'; end if;

  -- ── 2) El administrador marca el día como revisado ────────────────────────────────────────
  perform pg_temp.como(adm);
  update asistencias set revisada_en = now(), revisada_por = adm where id = v_id;
  perform pg_temp.dueno();
  select revisada_en, revisada_por into v_rev, v_por from asistencias where id = v_id;
  if v_rev is not null and v_por = adm then r := r || '[ok] 2;'; else r := r || '[FALLA] 2;'; end if;

  -- ── 3) Un no administrador no puede marcarlo ──────────────────────────────────────────────
  update asistencias set revisada_en = null, revisada_por = null where id = v_id;
  perform pg_temp.como(otro);
  begin
    update asistencias set revisada_en = now(), revisada_por = otro where id = v_id;
  exception when others then null;
  end;
  perform pg_temp.dueno();
  select revisada_en into v_rev from asistencias where id = v_id;
  if v_rev is null then r := r || '[ok] 3;'; else r := r || '[FALLA] 3: un no admin marcó revisado;'; end if;

  -- ── 4) Cambiar una hora vuelve el día a «por revisar» ─────────────────────────────────────
  update asistencias set revisada_en = now(), revisada_por = adm where id = v_id;
  update asistencias set hora_salida = '13:30' where id = v_id;
  select revisada_en, revisada_por into v_rev, v_por from asistencias where id = v_id;
  if v_rev is null and v_por is null then r := r || '[ok] 4;'; else r := r || '[FALLA] 4: la marca de revisado sobrevivió a un cambio de hora;'; end if;

  -- ── 5) Cambiar sólo obs (o justificar) no lo toca ─────────────────────────────────────────
  update asistencias set revisada_en = now(), revisada_por = adm where id = v_id;
  update asistencias set obs = 'nota', tardanza_justificada = true where id = v_id;
  select revisada_en into v_rev from asistencias where id = v_id;
  if v_rev is not null then r := r || '[ok] 5;'; else r := r || '[FALLA] 5;'; end if;

  raise exception 'RESULTADO 0165 --> %', r;
end $$;
