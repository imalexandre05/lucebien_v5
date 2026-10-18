-- Prueba de la migración 0160_entrada_dias_pendientes.sql
-- Spec: docs/superpowers/specs/sueldos/2026-10-18-liquidacion-borrador-dias-pendientes-design.md
-- Escrita ANTES que la migración (Zone Guard). Se descarta sola. Se corre: bash tools/postgres-local.sh probar 0160
--
-- Semana lun 2020-03-02 … vie 2020-03-06, turno 08–16 de lunes a viernes:
--   lun, mar, mié: trabajado completo · jue: sin_dato (sin declarar) · vie: un tramo declarado + otro sin_dato (a medias).
-- Casos: 1) estricta (3 args) corta con DATO; 2) permisiva lista jue y vie en diasSinDeclarar;
--        3) permisiva NO manda jue ni vie en asistencia; 4) sin pendientes estricta == permisiva y sin la clave.

create or replace function pg_temp.dueno() returns void language plpgsql as $f$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.mensaje(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $f$;

do $$
declare
  r text := ''; adm uuid; e uuid; ac uuid; j jsonb; ja jsonb; jb jsonb; msg text;
begin
  perform pg_temp.dueno();
  insert into empleados (cod, nombre, iniciales, rol) values ('P160-AD', 'P160 Admin', 'AD', 'admin') returning id into adm;
  insert into empleados (cod, nombre, iniciales, rol) values ('P160-E', 'P160 Persona', 'PE', 'confeccionista') returning id into e;
  insert into sueldo_acuerdos (empleado_id, fecha_inicio, fecha_fin, sueldo_pactado)
    values (e, date '2020-03-01', date '2020-03-31', 1000) returning id into ac;
  insert into sueldo_acuerdo_turnos (acuerdo_id, dia_semana, hora_inicio, hora_fin)
    select ac, n, time '08:00', time '16:00' from generate_series(1, 5) n;
  insert into asistencias (empleado_id, fecha, turno, hora_entrada, hora_salida, condicion) values
    (e, date '2020-03-02', 'M', time '08:00', time '16:00', 'trabajado'),
    (e, date '2020-03-03', 'M', time '08:00', time '16:00', 'trabajado'),
    (e, date '2020-03-04', 'M', time '08:00', time '16:00', 'trabajado'),
    (e, date '2020-03-05', 'M', null, null, 'sin_dato'),
    (e, date '2020-03-06', 'M', time '08:00', time '12:00', 'trabajado'),
    (e, date '2020-03-06', 'T', time '13:00', null, 'sin_dato');
  -- el administrador de la prueba: la RPC exige private.app_es_admin()
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  msg := pg_temp.mensaje(format('select public.sueldo_entrada(%L, date ''2020-03-02'', date ''2020-03-06'')', ac));
  if msg like 'DATO:%' then r := r || '[ok] caso 1: la versión estricta sigue cortando con DATO;';
  else r := r || format('[FALLA] caso 1: %s;', msg); end if;

  ja := public.sueldo_entrada(ac, date '2020-03-02', date '2020-03-06', true);
  if ja -> 'diasSinDeclarar' = '["2020-03-05", "2020-03-06"]'::jsonb then
    r := r || '[ok] caso 2: la permisiva lista jueves (sin declarar) y viernes (a medias);';
  else r := r || format('[FALLA] caso 2: %s;', ja -> 'diasSinDeclarar'); end if;

  if jsonb_array_length(ja -> 'asistencia') = 3 then
    r := r || '[ok] caso 3: la asistencia mandada trae sólo los 3 días completos;';
  else r := r || format('[FALLA] caso 3: asistencia=%s;', ja -> 'asistencia'); end if;

  ja := public.sueldo_entrada(ac, date '2020-03-02', date '2020-03-04', true);
  jb := public.sueldo_entrada(ac, date '2020-03-02', date '2020-03-04');
  if ja = jb and not (ja ? 'diasSinDeclarar') then
    r := r || '[ok] caso 4: sin pendientes la permisiva == estricta y no agrega la clave;';
  else r := r || '[FALLA] caso 4: difieren sin pendientes;'; end if;

  raise exception 'RESULTADO 0160 --> %', r;
end $$;
