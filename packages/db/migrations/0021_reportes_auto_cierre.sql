-- 0021_reportes_auto_cierre.sql — auto-cierre del FR-01 al pasar el deadline del turno.
-- Para cada sede × turno (de p_turnos) cuyo deadline ya pasó hoy (hora Perú) y sin reporte:
--   · draft con contenido → reporte auto_enviado=1 (atribuido al encargado del draft) + hijas.
--   · sin contenido       → reporte no_evaluable=1 (cascarón, para trazabilidad).
-- Idempotente: salta sede/turno que ya tenga reporte. SECURITY DEFINER porque corre desde
-- pg_cron / Edge Function (service_role) SIN auth.uid() y debe escribir en todas las sedes.
-- NO expuesta a anon/authenticated (no la marca el linter 0028/0029).
-- Deadlines: M ≥ 15:00, T/C ≥ 23:00 hora Perú (routes/reportes.js: deadlinePasado).

create or replace function reportes_auto_cierre(p_turnos text[] default array['M', 'T', 'C'])
  returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_now    timestamptz := now() at time zone 'America/Lima';
  v_hoy    date := v_now::date;
  v_hora   int  := extract(hour from v_now)::int;
  v_sede   text;
  v_turno  text;
  v_id     text;
  v_draft  reporte_drafts%rowtype;
  v_acts   jsonb;
  v_trabs  jsonb;
  v_extras jsonb;
  v_total  int;
  v_done   int;
  v_contenido boolean;
  v_res    jsonb := '[]'::jsonb;
begin
  for v_sede in select cod from sedes loop
    foreach v_turno in array p_turnos loop
      if v_turno = 'M' and v_hora < 15 then continue; end if;
      if v_turno in ('T', 'C') and v_hora < 23 then continue; end if;
      if exists (select 1 from reportes where sede_cod = v_sede and fecha = v_hoy and turno = v_turno) then
        continue;
      end if;

      v_id := to_char(v_hoy, 'DD-MM-YY') || '_' || v_turno || '-' || v_sede;
      if exists (select 1 from reportes where id = v_id) then continue; end if;

      select * into v_draft from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;
      v_acts   := coalesce(v_draft.payload -> 'actividades', '[]'::jsonb);
      v_trabs  := coalesce(v_draft.payload -> 'trabajadores', '[]'::jsonb);
      v_extras := coalesce(v_draft.payload -> 'extras', '[]'::jsonb);
      v_total  := jsonb_array_length(v_acts);
      select count(*) into v_done from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

      v_contenido := jsonb_array_length(v_trabs) > 0 or v_done > 0 or jsonb_array_length(v_extras) > 0;

      insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje, act_total, act_done,
                            evaluado, bloqueado, auto_enviado, auto_enviado_razon, no_evaluable)
      values (v_id, v_sede, v_turno, v_hoy, v_draft.encargado_id, 0, coalesce(v_total, 0), coalesce(v_done, 0),
              false, v_contenido, true,
              case when v_contenido then 'auto-cierre-deadline' else 'sin-draft-no-evaluable' end,
              not v_contenido);

      if v_contenido then
        insert into reporte_trabajadores (reporte_id, empleado_id)
        select v_id, t::uuid from jsonb_array_elements_text(v_trabs) t;

        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, e ->> 'cod', e ->> 'nombre', e ->> 'cat',
               coalesce((e ->> 'peso')::numeric, 0), true, coalesce(e ->> 'obs', '')
        from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

        insert into reporte_extras (reporte_id, tipo, nombre, cantidad, precio_unitario, monto_total, detalle, registrado_por_id)
        select v_id, coalesce(e ->> 'tipo', 'extra'), e ->> 'nombre', coalesce((e ->> 'cantidad')::int, 1),
               0, coalesce((e ->> 'monto')::numeric, 0), '', v_draft.encargado_id
        from jsonb_array_elements(v_extras) e
        where coalesce(e ->> 'nombre', '') <> '';
      end if;

      delete from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;

      v_res := v_res || jsonb_build_object('id', v_id, 'sede', v_sede, 'turno', v_turno, 'no_evaluable', not v_contenido);
    end loop;
  end loop;
  return v_res;
end;
$$;

revoke execute on function reportes_auto_cierre(text[]) from public, anon, authenticated;
grant execute on function reportes_auto_cierre(text[]) to service_role;
