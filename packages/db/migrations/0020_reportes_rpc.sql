-- 0020_reportes_rpc.sql — mutaciones de Reportes FR-01 como funciones RPC atómicas.
-- security invoker → respetan la RLS del usuario (auth.uid() = encargado/evaluador).
-- Reglas portadas fiel de routes/reportes.js + public/js/app.js (ver core/reportes.ts).

-- ── CREAR: inserta el reporte (encargado = auth.uid, bloqueado) + trabajadores + actividades
--    realizadas + extras. La fecha se deriva del id 'DD-MM-YY_TURNO-SEDE' (única verdad). ──
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb
) returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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
  values (p_id, p_sede, p_turno, v_fecha, v_actor, 0,
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
           coalesce((e->>'monto_total')::numeric, 0), coalesce(e->>'detalle', ''), v_actor
    from jsonb_array_elements(p_extras) e;
  end if;

  return p_id;
end;
$$;

-- ── EVALUAR: el evaluador (auth.uid) no puede ser trabajador del turno. Aplica calificaciones
--    por actividad y calcula el puntaje = round(Σ(peso×cal)/Σ(peso)×100). Desbloquea. ──
create or replace function reportes_evaluar(p_id text, p_calificaciones jsonb)
  returns int language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_pun int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from reportes where id = p_id) then
    raise exception 'Reporte % no encontrado', p_id;
  end if;
  if exists (select 1 from reporte_trabajadores where reporte_id = p_id and empleado_id = v_actor) then
    raise exception 'El evaluador no puede ser trabajador del turno';
  end if;

  update reporte_actividades ra
  set calificacion = (c->>'cal')::numeric,
      obs_eval     = coalesce(c->>'obs', '')
  from jsonb_array_elements(p_calificaciones) c
  where ra.reporte_id = p_id and ra.cod = c->>'cod';

  select coalesce(round(sum(peso * calificacion) / nullif(sum(peso), 0) * 100), 0)::int
    into v_pun
  from reporte_actividades where reporte_id = p_id;

  update reportes
  set evaluado = true, evaluador_id = v_actor, puntaje_eval = v_pun, puntaje = v_pun, bloqueado = false
  where id = p_id;

  return v_pun;
end;
$$;

-- ── ANULAR (admin): borra el reporte y sus hijas. ──
create or replace function reportes_anular(p_id text)
  returns void language plpgsql security invoker set search_path = public
as $$
begin
  if not app_es_admin() then raise exception 'Solo admin/dueño puede anular'; end if;
  delete from reporte_trabajadores where reporte_id = p_id;
  delete from reporte_actividades  where reporte_id = p_id;
  delete from reporte_extras       where reporte_id = p_id;
  delete from reportes where id = p_id;
end;
$$;

-- ── ANULAR EVALUACIÓN (admin): resetea calificaciones y deja el reporte pendiente. ──
create or replace function reportes_anular_eval(p_id text)
  returns void language plpgsql security invoker set search_path = public
as $$
begin
  if not app_es_admin() then raise exception 'Solo admin/dueño'; end if;
  update reporte_actividades set calificacion = null, obs_eval = null where reporte_id = p_id;
  update reportes
  set evaluado = false, evaluador_id = null, puntaje_eval = null, puntaje = 0, bloqueado = true
  where id = p_id;
end;
$$;

-- Solo autenticados (anon entra a auth.uid() null → excepción).
revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb) from public;
revoke execute on function reportes_evaluar(text, jsonb) from public;
revoke execute on function reportes_anular(text) from public;
revoke execute on function reportes_anular_eval(text) from public;
grant execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb) to authenticated;
grant execute on function reportes_evaluar(text, jsonb) to authenticated;
grant execute on function reportes_anular(text) to authenticated;
grant execute on function reportes_anular_eval(text) to authenticated;
