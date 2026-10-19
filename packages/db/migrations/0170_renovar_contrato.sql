-- 0170_renovar_contrato.sql — «Renovar» un contrato: borrador copiado que se activa solo.
--
-- Spec: docs/superpowers/specs/sueldos/2026-10-19-renovar-contrato-design.md (decisión del dueño n.º 3, 19-oct-2026).
-- Prueba: packages/db/pruebas/0170_renovar_contrato.prueba.sql.   ZONA CRÍTICA (verificador antes de mergear).
--
-- No toca la cadena del sueldo ni ninguna función existente: una columna, dos funciones nuevas y un cron.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): el contrato nuevo dura los mismos meses
-- (si el actual es de meses completos) o los mismos días; la renovación espera a que el anterior deje de estar
-- vigente. Idempotente.

alter table sueldo_acuerdos add column if not exists renueva_a uuid references sueldo_acuerdos(id) on delete set null;

comment on column sueldo_acuerdos.renueva_a is
  'De qué contrato viene esta renovación (0170). Solo un borrador con este dato se activa solo; uno sin él, nunca.';

create index if not exists idx_sueldo_acuerdos_renueva_a on sueldo_acuerdos(renueva_a) where renueva_a is not null;

-- ═══ Renovar: crea el borrador copiando el contrato ═════════════════════════════════════════════
create or replace function sueldo_acuerdo_renovar(p_acuerdo uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  a        sueldo_acuerdos%rowtype;
  v_ini    date;
  v_fin    date;
  v_meses  int;
  v_nuevo  uuid;
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:solo el administrador puede renovar un contrato';
  end if;

  select * into a from sueldo_acuerdos where id = p_acuerdo for update;
  if not found then
    raise exception 'DATO:ese contrato no existe';
  end if;
  if a.estado = 'borrador' then
    raise exception 'ESTADO:un contrato en borrador no se renueva; actívalo primero';
  end if;
  if exists (select 1 from sueldo_acuerdos n where n.empleado_id = a.empleado_id and n.fecha_inicio > a.fecha_fin) then
    raise exception 'ESTADO:este contrato ya tiene uno que lo sigue; edita ese';
  end if;

  v_ini := a.fecha_fin + 1;
  -- Meses completos (1-oct a 31-oct → 1 mes): el nuevo dura lo mismo. Si no, los mismos días.
  v_meses := (extract(year from age(a.fecha_fin + 1, a.fecha_inicio)) * 12
              + extract(month from age(a.fecha_fin + 1, a.fecha_inicio)))::int;
  if v_meses >= 1 and (a.fecha_inicio + make_interval(months => v_meses))::date = a.fecha_fin + 1 then
    v_fin := (v_ini + make_interval(months => v_meses))::date - 1;
  else
    v_fin := v_ini + (a.fecha_fin - a.fecha_inicio);
  end if;

  -- Reutiliza la 0167/0149: mismo contrato + horario atómicos y mismas validaciones.
  v_nuevo := sueldo_acuerdo_guardar(
    null,
    jsonb_build_object(
      'empleado_id',         a.empleado_id,
      'fecha_inicio',        v_ini,
      'fecha_fin',           v_fin,
      'modalidad',           a.modalidad,
      'cada_dias',           a.cada_dias,
      'sueldo_pactado',      a.sueldo_pactado,
      'tarifa_hora',         a.tarifa_hora,
      'escala',              a.escala,
      'almuerzo_habilitado', a.almuerzo_habilitado,
      'parametros',          a.parametros,
      'creado_por',          auth.uid()
    ),
    coalesce((select jsonb_agg(jsonb_build_object(
                'dia_semana',  t.dia_semana,
                'hora_inicio', to_char(t.hora_inicio, 'HH24:MI'),
                'hora_fin',    to_char(t.hora_fin, 'HH24:MI'),
                'lugar',       t.lugar) order by t.dia_semana, t.hora_inicio)
              from sueldo_acuerdo_turnos t where t.acuerdo_id = a.id), '[]'::jsonb)
  );

  update sueldo_acuerdos set renueva_a = a.id where id = v_nuevo;
  return v_nuevo;
end;
$fn$;

comment on function sueldo_acuerdo_renovar(uuid) is
  'Crea en borrador el contrato que sigue a p_acuerdo, copiando frecuencia, cuota o tarifa, escala, almuerzo, parámetros y horario (0170). Solo admin.';
revoke execute on function sueldo_acuerdo_renovar(uuid) from public, anon;
grant  execute on function sueldo_acuerdo_renovar(uuid) to authenticated;

-- ═══ Activar: el borrador renovado pasa a vigente cuando llega su día ═══════════════════════════
-- Corre por cron (sin sesión). Solo activa si la persona NO tiene otro contrato vigente: nunca dos.
create or replace function sueldo_renovaciones_activar(p_hoy date default null)
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Lima')::date);
  r     record;
  v_n   int := 0;
begin
  for r in
    select n.id, n.empleado_id
    from sueldo_acuerdos n
    where n.estado = 'borrador' and n.renueva_a is not null and n.fecha_inicio <= v_hoy
    order by n.fecha_inicio
  loop
    if not exists (select 1 from sueldo_acuerdos o where o.empleado_id = r.empleado_id and o.id <> r.id and o.estado = 'vigente') then
      update sueldo_acuerdos set estado = 'vigente' where id = r.id and estado = 'borrador';
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;

comment on function sueldo_renovaciones_activar(date) is
  'Pasa a vigente los borradores renovados cuyo inicio ya llegó, solo si la persona no tiene otro vigente (0170). Lo llama el cron; hora Perú.';
revoke execute on function sueldo_renovaciones_activar(date) from public, anon, authenticated;
grant  execute on function sueldo_renovaciones_activar(date) to service_role;

-- Cron diario 00:10 hora Perú (05:10 UTC). Solo si la base tiene pg_cron (en local no).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sueldo-renovaciones-activar', '10 5 * * *', 'select sueldo_renovaciones_activar();');
  end if;
end $$;
