-- 0184 — Reportes de tienda que se envían solos a la hora límite, con recordatorios antes.
-- Spec: docs/superpowers/specs/reportes/2026-10-19-reportes-auto-envio-design.md
-- Prueba: packages/db/pruebas/0184_reportes_auto_envio.prueba.sql (escrita antes). Idempotente.
--
-- · reporte_hora_limite: hora límite por sede y turno (si no hay fila, vale la global de `config`).
-- · reportes_auto_enviar(): envía el borrador con lo que haya, a nombre del encargado del turno.
-- · reportes_recordar(): avisos en la campana antes de la hora límite (config reporte_recordatorios_min).
-- · pg_cron: un solo job cada 5 min, pedido por el dueño. Reaplicar no lo duplica.
-- Defaults inventados (anotados en docs/pendientes-negocio.md): recordatorios 30 y 10 min; sólo se actúa
-- sobre turnos con borrador (no vuelven los cascarones vacíos); sólo borradores de ayer o de hoy.

create table if not exists public.reporte_hora_limite (
  id        uuid primary key default gen_random_uuid(),
  sede_cod  text not null references public.sedes(cod),
  turno     text not null check (turno in ('M', 'T', 'C')),
  hora      time not null,
  unique (sede_cod, turno)
);
alter table public.reporte_hora_limite enable row level security;
drop policy if exists hora_limite_select on public.reporte_hora_limite;
create policy hora_limite_select on public.reporte_hora_limite for select to authenticated using (true); -- guard-ok: son horas de reloj, no datos de personas
revoke insert, update, delete, truncate on public.reporte_hora_limite from anon, authenticated;

drop trigger if exists trg_audit_reporte_hora_limite on public.reporte_hora_limite;
create trigger trg_audit_reporte_hora_limite after insert or update or delete on public.reporte_hora_limite
  for each row execute function private.audit_log_trigger();

-- Hora límite efectiva: la de la sede, si no la global del turno.
create or replace function private.reporte_hora_limite(p_sede text, p_turno text)
  returns time language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select hora from reporte_hora_limite where sede_cod = p_sede and turno = p_turno),
    (select valor from config where clave = 'turno_' || lower(p_turno) || '_cierre')::time,
    case p_turno when 'M' then time '15:00' else time '23:00' end);
$$;

create or replace function public.reporte_hora_limite_guardar(p_sede text, p_turno text, p_hora text)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO: sólo el administrador cambia la hora límite';
  end if;
  if p_turno not in ('M', 'T', 'C') then
    raise exception 'DATO: el turno debe ser M, T o C';
  end if;
  if not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'DATO: la sede no existe';
  end if;
  if p_hora is null or btrim(p_hora) = '' then
    delete from reporte_hora_limite where sede_cod = p_sede and turno = p_turno;
    return;
  end if;
  if p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'DATO: la hora debe tener el formato HH:MM, por ejemplo 15:00';
  end if;
  insert into reporte_hora_limite (sede_cod, turno, hora) values (p_sede, p_turno, p_hora::time)
  on conflict (sede_cod, turno) do update set hora = excluded.hora;
end;
$$;
revoke execute on function public.reporte_hora_limite_guardar(text, text, text) from public, anon;
grant  execute on function public.reporte_hora_limite_guardar(text, text, text) to authenticated;

-- Envío automático. p_ahora permite fijar el reloj (el núcleo no llama al reloj; las pruebas tampoco).
create or replace function public.reportes_auto_enviar(p_ahora timestamptz default now())
  returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hoy      date := (p_ahora at time zone 'America/Lima')::date;
  d          reporte_drafts%rowtype;
  v_limite   timestamptz;
  v_id       text;
  v_enc      uuid;
  v_acts     jsonb;
  v_trabs    jsonb;
  v_extras   jsonb;
  v_limp     jsonb;
  v_total    int;
  v_done     int;
  v_contenido boolean;
  v_res      jsonb := '[]'::jsonb;
begin
  for d in select * from reporte_drafts where fecha between v_hoy - 1 and v_hoy order by fecha, sede_cod, turno loop
    v_limite := (d.fecha + private.reporte_hora_limite(d.sede_cod, d.turno)) at time zone 'America/Lima';
    if p_ahora < v_limite then continue; end if;

    v_id := to_char(d.fecha, 'DD-MM-YY') || '_' || d.turno || '-' || d.sede_cod;

    -- Misma exclusividad de turno que reportes_crear: si ya hay un reporte real, el borrador sobra.
    if exists (select 1 from reportes where id = v_id)
       or exists (
         select 1 from reportes
         where sede_cod = d.sede_cod and fecha = d.fecha
           and turno = any(case when d.turno = 'C' then array['C', 'M', 'T'] else array[d.turno, 'C'] end)
           and not coalesce(no_evaluable, false)
       ) then
      delete from reporte_drafts where sede_cod = d.sede_cod and fecha = d.fecha and turno = d.turno;
      continue;
    end if;

    v_acts   := coalesce(d.payload -> 'actividades', '[]'::jsonb);
    v_trabs  := coalesce(d.payload -> 'trabajadores', '[]'::jsonb);
    v_extras := coalesce(d.payload -> 'extras', '[]'::jsonb);
    v_limp   := coalesce(d.payload -> 'limpieza', '[]'::jsonb);
    v_total  := jsonb_array_length(v_acts);
    select count(*) into v_done from jsonb_array_elements(v_acts) e
      where coalesce((e ->> 'realizada')::boolean, false);

    v_enc := d.encargado_id;
    if v_enc is null then
      select e.id into v_enc from empleados e
       where e.activo and e.rol = 'encargado_tienda' and e.sede_cod = d.sede_cod
       order by e.cod limit 1;
    end if;

    v_contenido := jsonb_array_length(v_trabs) > 0 or v_done > 0 or jsonb_array_length(v_extras) > 0
                   or jsonb_array_length(v_limp) > 0 or d.encargado_id is not null;

    if v_contenido then
      insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje, act_total, act_done,
                            evaluado, bloqueado, auto_enviado, auto_enviado_razon, no_evaluable, estado_envio)
      values (v_id, d.sede_cod, d.turno, d.fecha, v_enc, 0, coalesce(v_total, 0), coalesce(v_done, 0),
              false, true, true, 'auto-envio-hora-limite', false, 'enviado');

      insert into reporte_trabajadores (reporte_id, empleado_id)
      select distinct v_id, t from (
        select t::uuid as t from jsonb_array_elements_text(v_trabs) t
        union
        select v_enc where v_enc is not null
      ) u;

      insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
      select v_id, e ->> 'cod', e ->> 'nombre', e ->> 'cat',
             coalesce((e ->> 'peso')::numeric, 0), true, coalesce(e ->> 'obs', '')
      from jsonb_array_elements(v_acts) e
      where coalesce((e ->> 'realizada')::boolean, false);

      insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
      select v_id, 'OL_' || z.cod, 'Limpieza: ' || z.nombre, 'IND', z.peso, true, ''
      from layout_zonas z
      where z.sede_cod = d.sede_cod and z.tipo <> 'area'
        and z.cod in (select jsonb_array_elements_text(v_limp));

      insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                  peso_unitario, monto_total, revisar, detalle, registrado_por_id)
      select v_id,
             coalesce(nullif(e ->> 'tipo', ''), cat.tipo_act, 'libre'),
             coalesce(nullif(e ->> 'nombre', ''), cat.nombre, 'Extra'),
             nullif(e ->> 'cod', ''),
             coalesce((e ->> 'cantidad')::int, 1),
             coalesce(cat.precio_unitario, 0),
             coalesce(cat.peso, 0),
             coalesce(cat.precio_unitario, 0) * coalesce((e ->> 'cantidad')::int, 1),
             (cat.cod is null),
             '',
             v_enc
      from jsonb_array_elements(v_extras) e
      left join actividades_config cat
        on cat.sede_cod = d.sede_cod and cat.cod = nullif(e ->> 'cod', '') and cat.categoria = 'EXT'
      where coalesce(e ->> 'nombre', '') <> '' or nullif(e ->> 'cod', '') is not null;

      v_res := v_res || jsonb_build_object('id', v_id, 'sede', d.sede_cod, 'turno', d.turno);
    end if;

    delete from reporte_drafts where sede_cod = d.sede_cod and fecha = d.fecha and turno = d.turno;
  end loop;
  return v_res;
end;
$$;
revoke execute on function public.reportes_auto_enviar(timestamptz) from public, anon, authenticated;
grant  execute on function public.reportes_auto_enviar(timestamptz) to service_role;

-- Recordatorios: un aviso por borrador y umbral; se emite el umbral más chico que ya se alcanzó.
create or replace function public.reportes_recordar(p_ahora timestamptz default now())
  returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hoy    date := (p_ahora at time zone 'America/Lima')::date;
  v_umbrales int[];
  d        reporte_drafts%rowtype;
  v_falta  numeric;
  v_m      int;
  v_n      int := 0;
  v_cuenta int;
begin
  select array_agg(x::int order by x::int) into v_umbrales
    from regexp_split_to_table(coalesce((select valor from config where clave = 'reporte_recordatorios_min'), '30,10'), '\s*,\s*') x
   where x ~ '^[0-9]+$' and x::int > 0;
  if v_umbrales is null then v_umbrales := array[10, 30]; end if;

  for d in select * from reporte_drafts where fecha = v_hoy loop
    v_falta := extract(epoch from
      ((d.fecha + private.reporte_hora_limite(d.sede_cod, d.turno)) at time zone 'America/Lima' - p_ahora)) / 60;
    if v_falta <= 0 then continue; end if;
    if exists (select 1 from reportes where sede_cod = d.sede_cod and fecha = d.fecha
                 and turno = d.turno and not coalesce(no_evaluable, false)) then continue; end if;

    select min(u) into v_m from unnest(v_umbrales) u where v_falta <= u;
    if v_m is null then continue; end if;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede,
                                ref_tipo, ref_id, dedup_key)
    values ('reporte_por_vencer', 'Tu reporte se envía pronto',
            'El reporte del turno ' || d.turno || ' se enviará solo en unos ' || ceil(v_falta)::int
              || ' min con lo que tengas marcado. Revisa y envíalo antes.',
            case when v_m <= 10 then 'warn' else 'info' end, 'encargado_tienda', d.sede_cod,
            'reporte_draft', d.sede_cod || ':' || d.turno || ':' || d.fecha,
            'rec-reporte:' || d.sede_cod || ':' || d.turno || ':' || d.fecha || ':' || v_m)
    on conflict (dedup_key) do nothing;
    get diagnostics v_cuenta = row_count;
    v_n := v_n + v_cuenta;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.reportes_recordar(timestamptz) from public, anon, authenticated;
grant  execute on function public.reportes_recordar(timestamptz) to service_role;

-- pg_cron (UTC): cada 5 minutos. unschedule envuelto: si el job no existe lanza excepción.
do $$ begin perform cron.unschedule('reportes-auto-enviar'); exception when others then null; end $$;
select cron.schedule('reportes-auto-enviar', '*/5 * * * *',
  $$select reportes_recordar(); select reportes_auto_enviar();$$);
