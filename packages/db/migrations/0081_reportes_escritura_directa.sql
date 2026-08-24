-- 0081_reportes_escritura_directa.sql — cierra la escritura directa sobre los reportes, le da al
-- auto-cierre la misma exclusividad de turno que ya usa reportes_crear, deja de duplicar el día en
-- asistencias, y desagenda el auto-cierre que el propio repositorio vuelve a encender.
--
-- Implementa <docs/superpowers/specs/permisos/2026-08-23-reportes-escritura-directa-design.md §3>.
-- Hallazgos F50 (crítico), F51 (alto), F55 (medio) y F56 (medio) de la auditoría del 23-ago-2026.
--
-- POR QUÉ IMPORTA. El puntaje del reporte es el primer eslabón de la cadena del sueldo
-- (puntos → reportes → evaluación /20 → pago). Hoy las cuatro tablas del módulo tienen una sola
-- policy `for all` con la misma expresión en using y en with check, y como las once personas
-- tienen las cuatro sedes en empleado_tiendas, esa expresión es verdadera para casi todas ellas en
-- casi todos los reportes. Se reprodujo en vivo suplantando a una colaboradora sin autoridad: un
-- PATCH directo a PostgREST puso 18 reportes en puntaje=100/evaluado=true y un DELETE borró 6.
--
-- Idempotente: se puede reaplicar sin fallar. `drop policy if exists` antes de cada create,
-- `create or replace` en las funciones, y los `cron.unschedule` envueltos en un bloque que se
-- traga la excepción del job inexistente.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Acá SÍ se usa,
--     y es legítimo: un reporte de turno es dato operativo de sede, no dato personal, y el almacén
--     ve la operación de las cuatro sedes desde la 0017.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio. Acá la escritura la hacen funciones
--     `security definer` (que son dueñas de su propio permiso) más una policy de update/delete
--     para el administrador: la tabla NO queda sin camino de escritura.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5).

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 (F50) — La escritura de reportes pasa por una RPC, y sólo por una RPC.
--
-- ORDEN IMPORTANTE: primero se convierten las dos RPC que van a tener que escribir sin la RLS de
-- su lado, y recién después se cambian las policies. Al revés queda una ventana —corta, pero
-- real— en la que nadie puede enviar un reporte de turno.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─── 1.1) reportes_crear pasa a SECURITY DEFINER con su guard de sede adentro ────────────────
--
-- LA TRAMPA DE ESTA CONVERSIÓN, escrita para quien la lea dentro de un año: hasta hoy esta función
-- no comprobaba la sede porque no le hacía falta — corría como el llamante y la policy `rep_rw`
-- (with check: sede propia) le impedía crear un reporte de una sede ajena. Como `definer` corre
-- como `postgres`, dueño de las tablas y sin `force row level security`, la RLS deja de aplicarle:
-- sin el guard de abajo, la conversión habría cambiado un agujero por otro peor. El guard es
-- exactamente la condición que la policy le imponía.
--
-- El `search_path` lleva `pg_temp` al final: es lo que impide que el llamante cree un objeto
-- temporal que suplante a uno de `public` dentro de una función que corre con permisos ajenos.
-- Cuerpo idéntico al de la 0053 (verificado contra pg_proc.prosrc de la base viva el 23-ago-2026)
-- salvo el bloque de permiso.
create or replace function reportes_crear(
  p_id text, p_sede text, p_turno text,
  p_act_total int, p_act_done int,
  p_trabajadores uuid[], p_actividades jsonb, p_extras jsonb,
  p_encargado uuid default null
) returns text language plpgsql security definer set search_path = public, pg_temp
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

  -- Reemplaza al with check de rep_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or p_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: no puedes registrar el turno de la sede %', p_sede;
  end if;

  if exists (select 1 from reportes where id = p_id) then
    raise exception 'El reporte % ya existe', p_id;
  end if;

  v_m := regexp_match(p_id, '^(\d{2})-(\d{2})-(\d{2})_');
  if v_m is null then raise exception 'id de reporte inválido: %', p_id; end if;
  v_fecha := make_date((case when v_m[3]::int < 70 then 2000 else 1900 end) + v_m[3]::int,
                       v_m[2]::int, v_m[1]::int);

  v_bloqueantes := case when p_turno = 'C' then array['M', 'T'] else array['C'] end;
  select id into v_conflicto_id from reportes
    where sede_cod = p_sede and fecha = v_fecha and turno = any(v_bloqueantes)
      and not coalesce(no_evaluable, false)
    limit 1;
  if v_conflicto_id is not null then
    raise exception 'TURNO_CONFLICTO:%', v_conflicto_id;
  end if;

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

  -- Fase 5 tarea 3: left join contra el catálogo EXT de la sede — `cat.cod is null` cubre TANTO
  -- el extra "libre" (sin cod) COMO un cod que no matcheó (catálogo no sembrado en esa sede).
  if p_extras is not null then
    insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                peso_unitario, monto_total, revisar, detalle, registrado_por_id)
    select
      p_id,
      coalesce(nullif(e->>'tipo', ''), cat.tipo_act, 'libre'),
      coalesce(nullif(e->>'nombre', ''), cat.nombre, 'Extra'),
      nullif(e->>'cod', ''),
      coalesce((e->>'cantidad')::int, 1),
      coalesce(cat.precio_unitario, 0),
      coalesce(cat.peso, 0),
      coalesce(cat.precio_unitario, 0) * coalesce((e->>'cantidad')::int, 1),
      (cat.cod is null),
      coalesce(e->>'detalle', ''),
      coalesce(nullif(e->>'registrado_por_id', '')::uuid, v_actor)
    from jsonb_array_elements(p_extras) e
    left join actividades_config cat
      on cat.sede_cod = p_sede and cat.cod = nullif(e->>'cod', '') and cat.categoria = 'EXT'
    where coalesce(e->>'nombre', '') <> '' or nullif(e->>'cod', '') is not null;
  end if;

  return p_id;
end;
$$;

revoke execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid)
  from public, anon;
grant  execute on function reportes_crear(text, text, text, int, int, uuid[], jsonb, jsonb, uuid)
  to authenticated;

-- ─── 1.2) reportes_evaluar pasa a SECURITY DEFINER con su guard de sede adentro ──────────────
--
-- Misma conversión y misma trampa que 1.1: acá la sede se lee del reporte, no de un parámetro.
-- La regla de negocio que ya tenía —el evaluador no puede haber estado en el turno— queda intacta;
-- es la que sostiene que la nota la ponga alguien externo.
create or replace function reportes_evaluar(p_id text, p_calificaciones jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_sede  text;
  v_pun   int;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select sede_cod into v_sede from reportes where id = p_id;
  if not found then raise exception 'Reporte % no encontrado', p_id; end if;

  -- Reemplaza al using/with check de rep_rw, que esta función deja de tener encima al ser definer.
  if not (private.app_es_admin() or private.app_es_almacen()
          or v_sede in (select private.app_sedes())) then
    raise exception 'PERMISO: el reporte % no es de una sede tuya', p_id;
  end if;

  if not private.app_es_admin()
     and exists (select 1 from reporte_trabajadores where reporte_id = p_id and empleado_id = v_actor) then
    raise exception 'No puedes evaluar este reporte: estuviste en el turno (el evaluador debe ser externo).';
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

revoke execute on function reportes_evaluar(text, jsonb) from public, anon;
grant  execute on function reportes_evaluar(text, jsonb) to authenticated;

-- ─── 1.3) Las policies: lectura como hasta hoy, escritura sólo del administrador ─────────────
--
-- Se parte cada `for all` en una de lectura (la condición de siempre: admin, almacén o sede
-- propia) y dos de escritura restringidas al administrador. NO se crea policy de INSERT: los
-- inserta reportes_crear y el auto-cierre, las dos `definer`.
--
-- Por qué el update y el delete conservan una puerta de administrador en vez de cerrarse del todo:
-- reportes_anular y reportes_anular_eval (0037) son `security invoker` y ya exigen
-- private.app_es_admin() por dentro. Dejarles abierta exactamente esa condición las mantiene
-- funcionando sin convertir dos funciones más, y el universo de quien puede tocar un puntaje pasa
-- de once personas a los dos administradores.

-- reportes
drop policy if exists rep_rw           on reportes;
drop policy if exists rep_select       on reportes;
drop policy if exists rep_admin_update on reportes;
drop policy if exists rep_admin_delete on reportes;
create policy rep_select on reportes for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));
create policy rep_admin_update on reportes for update
  using (private.app_es_admin()) with check (private.app_es_admin());
create policy rep_admin_delete on reportes for delete
  using (private.app_es_admin());

-- reporte_trabajadores (hereda la sede del reporte padre)
drop policy if exists rep_trab_rw           on reporte_trabajadores;
drop policy if exists rep_trab_select       on reporte_trabajadores;
drop policy if exists rep_trab_admin_update on reporte_trabajadores;
drop policy if exists rep_trab_admin_delete on reporte_trabajadores;
create policy rep_trab_select on reporte_trabajadores for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from reportes r
      where r.id = reporte_trabajadores.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );
create policy rep_trab_admin_update on reporte_trabajadores for update
  using (private.app_es_admin()) with check (private.app_es_admin());
create policy rep_trab_admin_delete on reporte_trabajadores for delete
  using (private.app_es_admin());

-- reporte_actividades (hereda la sede del reporte padre) — es la tabla de las calificaciones
drop policy if exists rep_act_rw           on reporte_actividades;
drop policy if exists rep_act_select       on reporte_actividades;
drop policy if exists rep_act_admin_update on reporte_actividades;
drop policy if exists rep_act_admin_delete on reporte_actividades;
create policy rep_act_select on reporte_actividades for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from reportes r
      where r.id = reporte_actividades.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );
create policy rep_act_admin_update on reporte_actividades for update
  using (private.app_es_admin()) with check (private.app_es_admin());
create policy rep_act_admin_delete on reporte_actividades for delete
  using (private.app_es_admin());

-- reporte_extras (hereda la sede del reporte padre)
drop policy if exists rep_extras_rw           on reporte_extras;
drop policy if exists rep_extras_select       on reporte_extras;
drop policy if exists rep_extras_admin_update on reporte_extras;
drop policy if exists rep_extras_admin_delete on reporte_extras;
create policy rep_extras_select on reporte_extras for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from reportes r
      where r.id = reporte_extras.reporte_id and r.sede_cod in (select private.app_sedes())
    )
  );
create policy rep_extras_admin_update on reporte_extras for update
  using (private.app_es_admin()) with check (private.app_es_admin());
create policy rep_extras_admin_delete on reporte_extras for delete
  using (private.app_es_admin());

-- ─── 1.4) Los privilegios de tabla, que la policy no alcanza a cubrir ────────────────────────
--
-- TRUNCATE merece renglón propio: la RLS NO se aplica a truncate. Basta el privilegio para vaciar
-- la tabla entera y ninguna policy de fila interviene — o sea que cualquier sesión iniciada podía
-- borrar el historial completo de reportes de la empresa por más policies que le pusiéramos.
-- INSERT se revoca porque ya no hay policy que lo permita: un privilegio sin policy es un estado
-- confuso que invita a "arreglarlo" agregando la policy. UPDATE y DELETE se le dejan a
-- authenticated y los gobiernan las policies de administrador de arriba.
revoke insert, update, delete, truncate on table reportes             from anon;
revoke insert, update, delete, truncate on table reporte_trabajadores from anon;
revoke insert, update, delete, truncate on table reporte_actividades  from anon;
revoke insert, update, delete, truncate on table reporte_extras       from anon;

revoke insert, truncate on table reportes             from authenticated;
revoke insert, truncate on table reporte_trabajadores from authenticated;
revoke insert, truncate on table reporte_actividades  from authenticated;
revoke insert, truncate on table reporte_extras       from authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 (F51) — El auto-cierre deja de montar un turno C sobre el trabajo de la gente.
--
-- La función miraba si existía el MISMO turno; reportes_crear, en cambio, ya bloquea C contra M/T
-- y M/T contra C. Resultado en producción: 5 días con un C automático encima de reportes que
-- enviaron personas, los cinco con puntaje=100.
--
-- Cuerpo idéntico al de la 0053 (verificado contra pg_proc.prosrc el 23-ago-2026) salvo ese
-- `if exists`. Dos detalles del reemplazo:
--   · la lista incluye al propio turno, así que no se pierde el chequeo que había;
--   · se agrega `and not coalesce(no_evaluable, false)` —que la condición vieja no tenía— por el
--     mismo motivo por el que lo tiene reportes_crear: un reporte no_evaluable es el sello vacío
--     que este mismo auto-cierre deja cuando nadie reportó, y no cubre ningún horario. Un sello
--     vacío del propio turno ya no frena acá; lo frena el `if exists (... where id = v_id)` de la
--     línea siguiente, porque el id es determinista (DD-MM-YY_TURNO-SEDE). No hay camino a un id
--     duplicado.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create or replace function reportes_auto_cierre(p_turnos text[] default array['M', 'T', 'C'])
  returns jsonb language plpgsql security definer set search_path = public, pg_temp
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
  select coalesce((select valor from config where clave = 'turno_m_cierre'), '15:00')::time into v_cierre_m;
  select coalesce((select valor from config where clave = 'turno_t_cierre'), '23:00')::time into v_cierre_t;
  select coalesce((select valor from config where clave = 'turno_c_cierre'), '23:00')::time into v_cierre_c;

  for v_sede in select cod from sedes loop
    foreach v_turno in array p_turnos loop
      v_cierre := case v_turno when 'M' then v_cierre_m when 'T' then v_cierre_t else v_cierre_c end;
      if v_hora_actual < v_cierre then continue; end if;

      -- Misma exclusividad de turno que reportes_crear (0053:119-126).
      if exists (
        select 1 from reportes
        where sede_cod = v_sede and fecha = v_hoy
          and turno = any(case when v_turno = 'C' then array['C', 'M', 'T'] else array[v_turno, 'C'] end)
          and not coalesce(no_evaluable, false)
      ) then
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

        insert into reporte_actividades (reporte_id, cod, nombre, cat, peso, realizada, obs)
        select v_id, 'OL_' || z.cod, 'Limpieza: ' || z.nombre, 'IND', z.peso, true, ''
        from layout_zonas z
        where z.sede_cod = v_sede and z.tipo <> 'area'
          and z.cod in (select jsonb_array_elements_text(v_limp));

        -- Fase 5 tarea 3: mismo derivado de catálogo que reportes_crear (ver comentario arriba).
        insert into reporte_extras (reporte_id, tipo, nombre, cod, cantidad, precio_unitario,
                                    peso_unitario, monto_total, revisar, detalle, registrado_por_id)
        select
          v_id,
          coalesce(nullif(e ->> 'tipo', ''), cat.tipo_act, 'libre'),
          coalesce(nullif(e ->> 'nombre', ''), cat.nombre, 'Extra'),
          nullif(e ->> 'cod', ''),
          coalesce((e ->> 'cantidad')::int, 1),
          coalesce(cat.precio_unitario, 0),
          coalesce(cat.peso, 0),
          coalesce(cat.precio_unitario, 0) * coalesce((e ->> 'cantidad')::int, 1),
          (cat.cod is null),
          '',
          v_draft.encargado_id
        from jsonb_array_elements(v_extras) e
        left join actividades_config cat
          on cat.sede_cod = v_sede and cat.cod = nullif(e ->> 'cod', '') and cat.categoria = 'EXT'
        where coalesce(e ->> 'nombre', '') <> '' or nullif(e ->> 'cod', '') is not null;
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
grant  execute on function reportes_auto_cierre(text[]) to service_role;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 (F55) — La asistencia derivada del reporte deja de duplicar el día.
--
-- EL DEFECTO. Un día podía terminar con dos filas de la misma persona: la que deja el reporte y la
-- que escribe el administrador al declarar. El motor de sueldos exige el día declarado, así que la
-- fila fantasma corta la liquidación de una persona real.
--
-- EL ARREGLO ES EL GUARD DEL DÍA, NO EL TURNO. La función no inserta nada si esa persona ya tiene
-- alguna fila ese día — el `on conflict do nothing` sólo cubría la colisión exacta de
-- (empleado_id, fecha, turno), y el huellero escribe una fila por tramo con turno 'M'/'T' (0079):
-- hoy son 1.105 de 1.118 filas.
--
-- POR QUÉ EL TURNO SIGUE SIENDO EL DEL REPORTE. La primera versión de esta migración forzaba 'C'
-- para que coincidiera con lo que escribe la declaración manual. Un verificador adversarial lo
-- frenó, y tenía razón: la 0079 rescata la fila que deja un reporte buscándola POR TURNO
-- (0079:250-255) y, si la encuentra en 'sin_dato', le pone las horas y la pasa a 'trabajado'
-- (0079:305-320). El comentario de esas mismas líneas lo dice: «sin ella el proyecto no sirve».
-- Como el huellero sólo usa 'M' y 'T', una fila forzada a 'C' no se rescata NUNCA — y desde la
-- 0085 un día con una fila declarada y otra en 'sin_dato' bloquea el periodo entero. El arreglo
-- habría envenenado el día en vez de limpiarlo, en el orden más frecuente de todos: la persona
-- manda el turno antes de marcar, o el colector sincroniza a la noche.
--
-- La otra mitad de F55 —que la declaración manual clave siempre 'C' en vez de reusar la fila que
-- el día ya tiene— se arregla donde vive, en `declararDia` (apps/erp-web/lib/asistencias-repo.ts).
--
-- Lo que NO cambia: la fila sigue naciendo en condicion='sin_dato'. Ponerle 'trabajado' es la
-- decisión 12 del dueño y, sin horas, haría que el motor tratara el día como jornada de cero
-- horas: un pago de menos silencioso (anotado en docs/pendientes-negocio.md).
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create or replace function reportes_marcar_asistencia(p_reporte_id text)
  returns integer language plpgsql security definer set search_path = public, pg_temp
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
    select v_enc, v_fecha, v_turno, 0, 'reporte', 'auto: encargado del reporte ' || p_reporte_id
    where not exists (
      select 1 from asistencias a where a.empleado_id = v_enc and a.fecha = v_fecha
    )
    on conflict (empleado_id, fecha, turno) do nothing;
  end if;

  insert into asistencias (empleado_id, fecha, turno, minutos_tardanza, fuente, obs)
  select distinct t.empleado_id, v_fecha, v_turno, 0, 'reporte',
         'auto: trabajador del reporte ' || p_reporte_id
  from reporte_trabajadores t
  where t.reporte_id = p_reporte_id and t.empleado_id is not null
    and not exists (
      select 1 from asistencias a where a.empleado_id = t.empleado_id and a.fecha = v_fecha
    )
  on conflict (empleado_id, fecha, turno) do nothing;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4 (F56) — Desagendar el auto-cierre que el propio repositorio vuelve a encender.
--
-- CLAUDE.md, sección "No tocar": el cron de auto-cierre está desprogramado A PROPÓSITO y no se
-- reactiva hasta que exista el sistema de horarios. La base viva le da la razón (cron.job sólo
-- tiene generar-alertas-am y -pm, verificado el 23-ago-2026), pero el repositorio no: una
-- aplicación limpia deja TRES jobs encendidos — 'reportes-auto-cierre' (0052:300) y
-- 'reportes-auto-cierre-M'/'-TC', que la 0052 había desagendado y la 0064:93-101 volvió a agendar.
--
-- Se desagenda desde acá y NO se edita la 0064: una migración ya aplicada no se reescribe, y como
-- la 0064 corre antes que esta, una reconstrucción limpia termina igual — con los tres apagados.
-- Sí: el repositorio agenda en la 0064 lo que desagenda en la 0081. Está escrito a propósito, no
-- es un descuido.
--
-- Mismo patrón de la 0052:297-299: cron.unschedule de un job inexistente lanza excepción, y hoy no
-- existe ninguno de los tres.
--
-- La otra mitad del hallazgo —la Edge Function auto-cierre-reportes, ACTIVE y alcanzable con la
-- clave anónima que viaja en el bundle del ERP— NO se resuelve acá: se da de baja desde la consola
-- de Supabase.
--
-- Verificación después de aplicar:  select jobname from cron.job;
-- Esperado: sólo generar-alertas-am y generar-alertas-pm.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
do $$ begin perform cron.unschedule('reportes-auto-cierre');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('reportes-auto-cierre-M');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('reportes-auto-cierre-TC'); exception when others then null; end $$;
