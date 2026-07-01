-- 0030_reportes_asistencia.sql — auto-asistencia desde el reporte (side-effect del FR-01 viejo).
-- Al enviar un reporte, marca presentes (fuente='reporte', tardanza 0) al encargado + trabajadores.
-- SECURITY DEFINER porque el encargado de tienda no puede escribir asistencias de terceros bajo RLS
-- (asist_admin_write). Solo deriva de un reporte existente → no permite marcar asistencia arbitraria.
-- Idempotente por el índice único (empleado,fecha,turno). La llama la server action tras crear.

create or replace function reportes_marcar_asistencia(p_reporte_id text)
  returns int language plpgsql security definer set search_path = public
as $$
declare
  v_fecha date;
  v_turno text;
  v_enc   uuid;
  v_n     int := 0;
begin
  select fecha, turno, encargado_id into v_fecha, v_turno, v_enc from reportes where id = p_reporte_id;
  if not found then return 0; end if;

  if v_enc is not null then
    insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
    values (v_enc, v_fecha, v_turno, 0, 'reporte', 'auto: encargado del reporte ' || p_reporte_id)
    on conflict (empleado_id, fecha, turno) do nothing;
  end if;

  insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
  select t.empleado_id, v_fecha, v_turno, 0, 'reporte', 'auto: trabajador del reporte ' || p_reporte_id
  from reporte_trabajadores t
  where t.reporte_id = p_reporte_id and t.empleado_id is not null
  on conflict (empleado_id, fecha, turno) do nothing;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

revoke execute on function reportes_marcar_asistencia(text) from public, anon;
grant execute on function reportes_marcar_asistencia(text) to authenticated;
