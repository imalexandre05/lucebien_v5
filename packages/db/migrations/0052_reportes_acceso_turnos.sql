-- 0052_reportes_acceso_turnos.sql — Fase 4 del plan de perfeccionamiento: acceso, turnos y
-- "no enviado" del módulo Reporte de Actividades. Cubre las tareas 2, 3, 4, 5 y 6 del plan
-- (la tarea 1 — separar /reportes de /administracion/reportes — es solo routing Next.js, sin
-- schema propio salvo el permiso nuevo `reportes_admin` que se siembra aquí). Aditiva e
-- idempotente: no borra ni renombra ninguna columna existente.
--
-- ⚠️ Horas de cierre (turno_m_cierre=15:00, turno_t_cierre=23:00, turno_c_cierre=23:00): son el
-- MISMO default que ya estaba hardcodeado en 0021/0022 (v_hora<15 / v_hora<23), NO una regla de
-- negocio nueva. Quedan marcadas como pendientes de confirmar por el dueño en
-- docs/pendientes-negocio.md — ver también la nota al final de este archivo.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) estado_envio (tarea 4): tri-estado explícito, derivado del draft al momento del auto-cierre.
--    Se AÑADE sin tocar auto_enviado/auto_enviado_razon/no_evaluable — siguen existiendo y se
--    mantienen en sync (los lee generar_alertas() en 0042/0046 y notificaciones-repo.ts) — así el
--    mapeo es reversible en lectura: si algo sale mal, los datos originales siguen intactos.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table reportes
  add column if not exists estado_envio text default 'enviado'
    check (estado_envio in ('enviado', 'no_enviado', 'sin_actividad'));

-- Backfill determinista desde las columnas existentes (idempotente: recalcula lo mismo si se
-- vuelve a correr). El no_evaluable histórico queda mapeado a 'sin_actividad' SIN perder la
-- columna original.
update reportes
   set estado_envio = case
     when coalesce(auto_enviado, false) and coalesce(no_evaluable, false)     then 'sin_actividad'
     when coalesce(auto_enviado, false) and not coalesce(no_evaluable, false) then 'no_enviado'
     else 'enviado'
   end;

alter table reportes alter column estado_envio set not null;

-- Verificación de que el backfill no perdió contenido (correr manualmente tras aplicar):
--   select estado_envio, auto_enviado, no_evaluable, count(*),
--          sum((select count(*) from reporte_actividades ra where ra.reporte_id = r.id)) as acts,
--          sum((select count(*) from reporte_trabajadores t  where t.reporte_id = r.id))  as trabs
--     from reportes r group by 1, 2, 3 order by 1;
--   -- esperado: no_enviado ⇔ (auto_enviado=true, no_evaluable=false), con acts/trabs > 0 posibles;
--   --           sin_actividad ⇔ (true, true), con acts/trabs en 0 (cascarón real, nada que perder);
--   --           enviado ⇔ auto_enviado=false (o null histórico).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Horas de cierre configurables (tarea 5). Default = lo que ya regía en 0021/0022 (pendiente
--    de confirmar por el dueño, ver docs/pendientes-negocio.md). Formato 'HH:MM' hora Perú.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into config (clave, valor) values
  ('turno_m_cierre', '15:00'),
  ('turno_t_cierre', '23:00'),
  ('turno_c_cierre', '23:00')
on conflict (clave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Permiso propio para la lista administrativa (tarea 1: /administracion/reportes). `reportes`
--    (el formulario) ya está sembrado ampliamente en 0045 — se deja tal cual, sigue gateando
--    /reportes/nuevo. `reportes_admin` es nuevo: por defecto solo los encargados (ya tienen el
--    resto de módulos de seguimiento: evaluar_reportes, pagos, evaluaciones). admin/dueno pasan
--    siempre por mecanismo (puede()), no necesitan fila. Editable desde /configuracion/permisos
--    sin volver a migrar.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into permisos_modulos (rol, modulo, acciones) values
  ('encargado_tienda',  'reportes_admin', array['ver']),
  ('encargado_almacen', 'reportes_admin', array['ver'])
on conflict (rol, modulo) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) Exclusividad de turno real (tarea 3), defensa en profundidad a nivel BD. La regla real
--    (C excluye M/T y viceversa) NO se puede expresar como igualdad de columnas — vive en el RPC
--    de abajo; este índice cubre el caso más simple (dos reportes del MISMO turno exacto para la
--    misma sede/fecha), que hoy solo evita la PK de `reportes.id` (determinista mismo
--    sede+fecha+turno). `where not coalesce(no_evaluable,false)`: los cascarones sin_actividad no
--    cuentan como "turno cubierto" (mismo criterio que buscarConflictoTurno en reportes-repo.ts).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create unique index if not exists idx_reportes_turno_unico
  on reportes (sede_cod, fecha, turno)
  where not coalesce(no_evaluable, false);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5) reportes_crear: agrega, EN ORDEN, exclusividad de turno real (tarea 3), bloqueo por
--    evaluación pendiente de la sede (tarea 2) y encargado=colaborador siempre (tarea 6).
--    Mismo contrato de errores prefijados que usará Fase 8 (SIN_CAJA, etc.): 'PREFIJO:id' — el
--    repo (reportes-repo.ts) lo parsea para enlazar al reporte bloqueante en la UI.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null
) returns text language plpgsql security invoker set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_encargado   uuid := coalesce(p_encargado, auth.uid());
  v_m           text[];
  v_fecha       date;
  v_bloqueantes text[];
  v_conflicto_id text;
  v_pendiente_id text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from reportes where id = p_id) then
    raise exception 'El reporte % ya existe', p_id;
  end if;

  v_m := regexp_match(p_id, '^(\d{2})-(\d{2})-(\d{2})_');
  if v_m is null then raise exception 'id de reporte inválido: %', p_id; end if;
  v_fecha := make_date((case when v_m[3]::int < 70 then 2000 else 1900 end) + v_m[3]::int,
                       v_m[2]::int, v_m[1]::int);

  -- Tarea 3: C excluye M/T y viceversa (turnosQueBloquean en packages/core/src/reportes.ts).
  -- Los cascarones sin_actividad (no_evaluable) no cuentan como turno cubierto.
  v_bloqueantes := case when p_turno = 'C' then array['M', 'T'] else array['C'] end;
  select id into v_conflicto_id from reportes
    where sede_cod = p_sede and fecha = v_fecha and turno = any(v_bloqueantes)
      and not coalesce(no_evaluable, false)
    limit 1;
  if v_conflicto_id is not null then
    raise exception 'TURNO_CONFLICTO:%', v_conflicto_id;
  end if;

  -- Tarea 2: el reporte anterior de la sede (cualquier turno/fecha) debe estar evaluado o sin
  -- actividad antes de poder crear uno nuevo. "Anterior" = el más reciente por fecha/creación.
  select id into v_pendiente_id from reportes
    where sede_cod = p_sede and not evaluado and not coalesce(no_evaluable, false)
    order by fecha desc, created_at desc
    limit 1;
  if v_pendiente_id is not null then
    raise exception 'REPORTE_PENDIENTE:%', v_pendiente_id;
  end if;

  insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje,
                        act_total, act_done, evaluado, bloqueado, estado_envio)
  values (p_id, p_sede, p_turno, v_fecha, v_encargado, 0,
          coalesce(p_act_total, 0), coalesce(p_act_done, 0), false, true, 'enviado');

  -- Tarea 6: el encargado SIEMPRE cuenta como colaborador y acumula puntos — se auto-agrega a
  -- reporte_trabajadores junto con el resto del equipo, sin duplicar si ya estaba en
  -- p_trabajadores. No hay opción de "quitarlo": esto corre siempre, no depende de la UI.
  -- Precedente: reportes_marcar_asistencia (0030) ya trata al encargado como parte del turno.
  insert into reporte_trabajadores (reporte_id, empleado_id)
  select distinct p_id, t from unnest(
    coalesce(p_trabajadores, array[]::uuid[])
    || case when v_encargado is not null then array[v_encargado] else array[]::uuid[] end
  ) t;

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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6) reportes_auto_cierre: cierre configurable (tarea 5), estado_envio explícito (tarea 4),
--    encargado=colaborador también en el camino automático (tarea 6), y arregla una pérdida real
--    de datos: el draft guarda `limpieza` (zonas marcadas) APARTE de `actividades` — ver
--    form.tsx submit(), que recién ahí las convierte a actividades OL_. El auto-cierre viejo
--    nunca hacía esa conversión: si alguien solo marcaba limpieza (sin actividades/extras/
--    trabajadores), el turno se cerraba como "sin actividad" y la limpieza marcada se perdía. Se
--    corrige leyendo layout_zonas para reconstruir las mismas OL_<cod> que el envío manual.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function reportes_auto_cierre(p_turnos text[] default array['M', 'T', 'C'])
  returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_now         timestamptz := now() at time zone 'America/Lima';
  v_hoy         date := v_now::date;
  v_hora_actual time := v_now::time;
  v_cierre_m    time;
  v_cierre_t    time;
  v_cierre_c    time;
  v_cierre      time;
  v_sede        text;
  v_turno       text;
  v_id          text;
  v_draft       reporte_drafts%rowtype;
  v_acts        jsonb;
  v_trabs       jsonb;
  v_extras      jsonb;
  v_limp        jsonb;
  v_total       int;
  v_done        int;
  v_contenido   boolean;
  v_estado_envio text;
  v_res         jsonb := '[]'::jsonb;
begin
  -- Tarea 5: horas de cierre desde config (turno_m_cierre/turno_t_cierre/turno_c_cierre), con el
  -- mismo default que antes (15:00/23:00/23:00) si el admin aún no las tocó.
  select coalesce((select valor from config where clave = 'turno_m_cierre'), '15:00')::time into v_cierre_m;
  select coalesce((select valor from config where clave = 'turno_t_cierre'), '23:00')::time into v_cierre_t;
  select coalesce((select valor from config where clave = 'turno_c_cierre'), '23:00')::time into v_cierre_c;

  for v_sede in select cod from sedes loop
    foreach v_turno in array p_turnos loop
      v_cierre := case v_turno when 'M' then v_cierre_m when 'T' then v_cierre_t else v_cierre_c end;
      if v_hora_actual < v_cierre then continue; end if;
      if exists (select 1 from reportes where sede_cod = v_sede and fecha = v_hoy and turno = v_turno) then
        continue;
      end if;

      v_id := to_char(v_hoy, 'DD-MM-YY') || '_' || v_turno || '-' || v_sede;
      if exists (select 1 from reportes where id = v_id) then continue; end if;

      select * into v_draft from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;
      v_acts   := coalesce(v_draft.payload -> 'actividades', '[]'::jsonb);
      v_trabs  := coalesce(v_draft.payload -> 'trabajadores', '[]'::jsonb);
      v_extras := coalesce(v_draft.payload -> 'extras', '[]'::jsonb);
      v_limp   := coalesce(v_draft.payload -> 'limpieza', '[]'::jsonb);
      v_total  := jsonb_array_length(v_acts);
      select count(*) into v_done from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

      -- Tarea 4: "hay contenido" ahora también mira limpieza y encargado (antes solo trabajadores/
      -- actividades/extras — un turno con solo zonas de limpieza marcadas se archivaba vacío).
      v_contenido := jsonb_array_length(v_trabs) > 0 or v_done > 0 or jsonb_array_length(v_extras) > 0
                     or jsonb_array_length(v_limp) > 0 or v_draft.encargado_id is not null;
      v_estado_envio := case when v_contenido then 'no_enviado' else 'sin_actividad' end;

      insert into reportes (id, sede_cod, turno, fecha, encargado_id, puntaje, act_total, act_done,
                            evaluado, bloqueado, auto_enviado, auto_enviado_razon, no_evaluable,
                            estado_envio)
      values (v_id, v_sede, v_turno, v_hoy, v_draft.encargado_id, 0, coalesce(v_total, 0), coalesce(v_done, 0),
              false, v_contenido, true,
              case when v_contenido then 'auto-cierre-deadline' else 'sin-draft-no-evaluable' end,
              not v_contenido, v_estado_envio);

      if v_contenido then
        -- Tarea 6: el encargado del draft también cuenta como colaborador en el cierre automático
        -- (antes solo se guardaba como reportes.encargado_id, sin fila en reporte_trabajadores).
        insert into reporte_trabajadores (reporte_id, empleado_id)
        select distinct v_id, t from (
          select t::uuid as t from jsonb_array_elements_text(v_trabs) t
          union
          select v_draft.encargado_id where v_draft.encargado_id is not null
        ) u;

        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, e ->> 'cod', e ->> 'nombre', e ->> 'cat',
               coalesce((e ->> 'peso')::numeric, 0), true, coalesce(e ->> 'obs', '')
        from jsonb_array_elements(v_acts) e
        where coalesce((e ->> 'realizada')::boolean, false);

        -- Limpieza marcada (payload.limpieza = [cod, ...]) → actividades OL_<cod>, igual que hace
        -- el envío manual en form.tsx submit(). Sin esto se perdía por completo (ver comentario
        -- de cabecera de esta sección).
        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, 'OL_' || z.cod, 'Limpieza: ' || z.nombre, 'IND', z.peso, true, ''
        from layout_zonas z
        where z.sede_cod = v_sede and z.tipo <> 'area'
          and z.cod in (select jsonb_array_elements_text(v_limp));

        insert into reporte_extras (reporte_id, tipo, nombre, cantidad, precio_unitario, monto_total, detalle, registrado_por_id)
        select v_id, coalesce(e ->> 'tipo', 'extra'), e ->> 'nombre', coalesce((e ->> 'cantidad')::int, 1),
               0, coalesce((e ->> 'monto')::numeric, 0), '', v_draft.encargado_id
        from jsonb_array_elements(v_extras) e
        where coalesce(e ->> 'nombre', '') <> '';
      end if;

      delete from reporte_drafts where sede_cod = v_sede and fecha = v_hoy and turno = v_turno;

      v_res := v_res || jsonb_build_object('id', v_id, 'sede', v_sede, 'turno', v_turno,
                                            'estado_envio', v_estado_envio, 'no_evaluable', not v_contenido);
    end loop;
  end loop;
  return v_res;
end;
$$;

revoke execute on function reportes_auto_cierre(text[]) from public, anon, authenticated;
grant execute on function reportes_auto_cierre(text[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7) pg_cron (tarea 5): las horas de cierre ya no son fijas (viven en config), así que el
--    horario del propio cron tampoco puede quedar fijo a "5 min después de las 15:00/23:00" — si
--    el admin cambia turno_m_cierre, ese horario ya no serviría. Se reemplazan los dos jobs
--    puntuales (0022) por uno solo que corre cada 15 min: reportes_auto_cierre() ya revisa el
--    cierre correcto de cada turno contra config en cada corrida, así que un cambio de horario
--    surte efecto en ≤15 min sin volver a desplegar nada.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$ begin perform cron.unschedule('reportes-auto-cierre-M');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('reportes-auto-cierre-TC'); exception when others then null; end $$;

select cron.schedule('reportes-auto-cierre', '*/15 * * * *', $$select reportes_auto_cierre(array['M','T','C'])$$);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Nota de negocio pendiente (ver también docs/pendientes-negocio.md): turno_m_cierre/
-- turno_t_cierre/turno_c_cierre se sembraron con el MISMO valor que ya regía en el SQL viejo
-- (15:00 / 23:00 / 23:00). Nadie confirmó que esas horas sean correctas — son el default heredado,
-- ahora editable desde /configuracion sin migrar de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
