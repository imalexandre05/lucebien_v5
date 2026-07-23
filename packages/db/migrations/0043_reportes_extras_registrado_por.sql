-- 0043_reportes_extras_registrado_por.sql — cada EXTRA se atribuye a quien realmente lo hizo,
-- no a quien envía el reporte completo. Hasta ahora reportes_crear() fijaba
-- reporte_extras.registrado_por_id = v_actor (el encargado que envía) para TODAS las filas.
-- Ahora lee p_extras[].registrado_por_id (uuid del ejecutor, elegido en el formulario) y cae a
-- v_actor solo si viene vacío (compat con datos/llamadas previas que no lo mandaban).
-- Idempotente (create or replace).

create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null
) returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_encargado uuid := coalesce(p_encargado, auth.uid());
  v_m text[];
  v_fecha date;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from reportes where id = p_id) then
    raise exception 'El reporte % ya existe', p_id;
  end if;

  v_m := regexp_match(p_id, '^(\d{2})-(\d{2})-(\d{2})_');
  if v_m is null then raise exception 'id de reporte inválido: %', p_id; end if;
  v_fecha := make_date((case when v_m[3]::int < 70 then 2000 else 1900 end) + v_m[3]::int,
                       v_m[2]::int, v_m[1]::int);

  insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje,
                        act_total, act_done, evaluado, bloqueado)
  values (p_id, p_sede, p_turno, v_fecha, v_encargado, 0,
          coalesce(p_act_total, 0), coalesce(p_act_done, 0), false, true);

  if p_trabajadores is not null and array_length(p_trabajadores, 1) > 0 then
    insert into reporte_trabajadores (reporte_id, empleado_id)
    select p_id, t from unnest(p_trabajadores) t;
  end if;

  if p_actividades is not null then
    insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
    select p_id, e->>'cod', e->>'nombre', e->>'cat',
           coalesce((e->>'peso')::numeric, 0), true, coalesce(e->>'obs', '')
    from jsonb_array_elements(p_actividades) e;
  end if;

  if p_extras is not null then
    insert into reporte_extras (reporte_id, tipo, nombre, cantidad, precio_unitario,
                                monto_total, detalle, registrado_por_id)
    select p_id, e->>'tipo', e->>'nombre', coalesce((e->>'cantidad')::int, 1),
           coalesce((e->>'precio_unitario')::numeric, 0),
           coalesce((e->>'monto_total')::numeric, 0), coalesce(e->>'detalle', ''),
           coalesce(nullif(e->>'registrado_por_id', '')::uuid, v_actor)
    from jsonb_array_elements(p_extras) e;
  end if;

  return p_id;
end;
$$;

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid) from public;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid) to authenticated;
