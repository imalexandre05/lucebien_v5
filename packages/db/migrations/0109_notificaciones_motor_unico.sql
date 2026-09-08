-- 0109_notificaciones_motor_unico.sql — un solo motor de alertas: el guard vive adentro de
-- generar_alertas() para que el botón manual (rol `authenticated`) pueda llamarla sin volver a
-- bypassear RLS con getAdminClient().
--
-- Implementa docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md
-- §5 C-3 y su Addendum del 8-sep-2026, paso 4 de la §8.
--
-- EL PROBLEMA. Hoy hay dos motores para las mismas reglas: generar_alertas() en SQL (lo corre el
-- cron, migraciones 0042/0046/0052/0100/0101/0107) y packages/core/src/alertas.ts en TypeScript
-- (lo corría el botón manual del administrador, vía apps/erp-web/lib/notificaciones-repo.ts). El de
-- TypeScript sólo tenía las 5 reglas viejas — nunca se actualizó con las 6 de la 0107 — así que el
-- botón manual y el cron ya daban resultados DISTINTOS. El lado TypeScript se borra en esta misma
-- tanda de cambios (fuera de esta migración) y el botón pasa a llamar generar_alertas() directo.
-- Esta migración SÓLO ajusta el GUARD y los GRANT de la función para habilitar esa llamada — NO
-- toca ninguna de las once reglas (las 5 de 0101 + las 6 de 0107).
--
-- QUÉ CAMBIA, EXACTO. Dos cosas, nada más:
--   1. Primera línea del `begin`: `if not private.app_es_admin() then raise exception
--      'PERMISO:...'; end if;` — mismo patrón que empleado_borrar_alta/sueldo_entrada/
--      huellero_declarar_faltas_del_dia (0085/0097/0099): el guard vive adentro de la función, no
--      depende de que la pantalla lo pregunte (cinturón: TS en generarAlertasAction(); tirantes:
--      esto).
--   2. `revoke execute ... from public, anon; grant execute ... to authenticated, service_role;` en
--      vez de `revoke ... from public, anon, authenticated; grant ... to service_role` (0107).
--      `service_role` se mantiene además de `authenticated`: no hace daño, y cubre un cron
--      reconfigurado a futuro que no corra como superusuario.
--
-- El resto del cuerpo es EXACTAMENTE el que dejó la 0107 — carácter por carácter, ninguna regla
-- reescrita. Confirmado por grep sobre las 7 migraciones que mencionan "generar_alertas" (0042,
-- 0046, 0052, 0100, 0101, 0107, 0108) que ninguna posterior a la 0107 vuelve a definir la función:
-- la 0108 (8-sep-2026, el mismo día que este Addendum) sólo toca la política de RLS `notif_sel`,
-- nunca `generar_alertas()` — lo dice su propio comentario en la línea 28 ("generar_alertas()
-- (security definer, no evalúa RLS)"), de pasada, sin redefinirla.
--
-- LÍMITE DE ESTA SESIÓN (implementador, sin acceso al MCP de Supabase ni a psql/SUPABASE_DB_URL —
-- ver docs/aprendizajes.md, filas de "Coordinación entre agentes" del 24/25-ago-2026). El encargo
-- pide traer el cuerpo con `pg_get_functiondef('public.generar_alertas()'::regprocedure)` ANTES de
-- escribir esto, y esta sesión no tiene forma de ejecutar esa consulta. El cuerpo de abajo se tomó
-- del archivo 0107_notificaciones_reglas_control_interno.sql tal cual vive en el repo, cruzado con
-- el grep de arriba para confirmar que nada posterior lo tocó. Falta el último paso: que quien
-- aplique esto corra `pg_get_functiondef` contra `scilb` y lo compare carácter por carácter con lo
-- que sigue antes de aplicar — es la comprobación que el encargo pidió y que esta sesión no puede
-- hacer por sí sola.
--
-- ⚠️ HALLAZGO DE ESTA SESIÓN, A CONFIRMAR ANTES DE APLICAR (no es parte del cambio que se pidió;
-- es una duda real sobre si el cambio pedido rompe algo que hoy funciona). `private.app_es_admin()`
-- depende de `auth.uid()`, que lee el GUC `request.jwt.claims` — un valor que sólo existe cuando
-- PostgREST (o una prueba que lo simula con `set_config('request.jwt.claims', ..., true)`) lo puso
-- ahí en la transacción actual. NI una conexión directa (psql/MCP, sin impersonar) NI un trabajo de
-- `pg_cron` (que ejecuta `select generar_alertas()` crudo, sin pasar nunca por PostgREST) fijan ese
-- GUC jamás, sin importar qué tan privilegiado sea el rol que corre la sesión — ser superusuario
-- evita los chequeos de GRANT de Postgres, pero no evita esta línea de código, que es lógica de la
-- función, no un permiso del motor.
--
-- Evidencia, del propio repo, de que esto es así y no una suposición:
--   · packages/db/pruebas/0099_borrar_alta_por_error.sql prueba el MISMO patrón de guard (en
--     empleado_borrar_alta) y necesita `set_config('request.jwt.claims', ...)` ANTES de cada
--     llamada para pasar la comprobación (líneas 46-48 y 229-230) — si no lo hiciera, la función
--     rechazaría hasta al propio administrador.
--   · packages/db/pruebas/0101_alertas_se_retiran.prueba.sql NO hace un solo `set_config` en sus
--     194 líneas y llama `generar_alertas()` siete veces (líneas 100, 113, 128, 142, 156, 169, 182).
--   · packages/db/pruebas/0107_notificaciones_reglas_control_interno.prueba.sql llama
--     `generar_alertas()` por primera vez en la línea 161, ANTES de cualquier `set_config` del
--     archivo (el primero aparece recién en la línea 215, dentro del caso 9).
-- Con el guard puesto tal cual pide el encargo, las tres llamadas de arriba deberían fallar con
-- 'PERMISO:sólo el administrador puede generar alertas' en vez de llegar a su 'RESULTADO' — y el
-- cron (generar-alertas-am/generar-alertas-pm, 0042) se quedaría sin poder generar una sola alerta
-- desde el momento en que esto se aplique, porque tampoco pasa por PostgREST.
--
-- Esta migración se escribe TAL CUAL la pide la spec porque no es decisión de quien implementa
-- relajar un guard de seguridad ya aprobado (no-negociable 6, Zone Guard) — pero antes de aplicarla
-- hace falta (a) correr `pg_get_functiondef` para confirmar el cuerpo, y (b) correr
-- `bash tools/probar-migracion.sh 0101` y `0107` contra `scilb` DESPUÉS de aplicar esta migración
-- para ver si de verdad fallan como predice este análisis. Si fallan, la spec necesita un ajuste
-- (p.ej. eximir del guard el caso "sin sesión" con
-- `current_setting('request.jwt.claims', true) is null` — que distingue "nadie impersonó nada,
-- viene de un cron o de la consola de administración" de "un `authenticated` real que no es admin")
-- antes de que esto llegue a producción, no después.
--
-- Idempotente: create or replace function.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · Toda tabla con RLS necesita policy de LECTURA y de ESCRITURA (no aplica: esta migración no
--     crea tablas).
--   · Todo default de negocio va comentado como provisional (no aplica: esta migración no agrega
--     ningún parámetro nuevo).

create or replace function generar_alertas()
  returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Lima')::date;
  v_total int  := 0;
  v_n     int;
  v_dp_umbral  int := coalesce((select umbral from alertas_reglas where tipo = 'devolucion_proxima'), 2)::int;
  v_re_umbral  int := coalesce((select umbral from alertas_reglas where tipo = 'reporte_sin_evaluar'), 2)::int;
  v_pl_umbral  int := coalesce((select umbral from alertas_reglas where tipo = 'periodo_liquidable'), 3)::int;
  v_dsm_umbral int := coalesce((select umbral from alertas_reglas where tipo = 'dia_sin_marca'), 7)::int;
  v_rol   text;
  v_keys  text[];
begin
  if not private.app_es_admin() then
    raise exception 'PERMISO:sólo el administrador puede generar alertas';
  end if;

  -- ── Devoluciones vencidas ──
  if coalesce((select activa from alertas_reglas where tipo = 'devolucion_vencida'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'devolucion_vencida');

    select coalesce(array_agg('devolucion_vencida:' || p.id::text), array[]::text[]) into v_keys
    from pedidos p
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion < v_hoy;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'devolucion_vencida', 'Devolución vencida',
           'La devolución' || coalesce(' de ' || c.nombre, '') || ' venció hace ' || (v_hoy - p.fecha_devolucion) || ' día(s).',
           'critica', v_rol, p.sede_cod, 'pedido', p.id::text, 'devolucion_vencida:' || p.id::text
    from pedidos p left join clientes c on c.id = p.cliente_id
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion < v_hoy
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'devolucion_vencida' and not (dedup_key = any(v_keys));
  end if;

  -- ── Devoluciones por vencer (0..umbral días) ──
  if coalesce((select activa from alertas_reglas where tipo = 'devolucion_proxima'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'devolucion_proxima');

    select coalesce(array_agg('devolucion_proxima:' || p.id::text), array[]::text[]) into v_keys
    from pedidos p
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion >= v_hoy and (p.fecha_devolucion - v_hoy) <= v_dp_umbral;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'devolucion_proxima', 'Devolución por vencer',
           case when p.fecha_devolucion = v_hoy
                then 'La devolución' || coalesce(' de ' || c.nombre, '') || ' es hoy.'
                else 'La devolución' || coalesce(' de ' || c.nombre, '') || ' vence en ' || (p.fecha_devolucion - v_hoy) || ' día(s).' end,
           'warn', v_rol, p.sede_cod, 'pedido', p.id::text, 'devolucion_proxima:' || p.id::text
    from pedidos p left join clientes c on c.id = p.cliente_id
    where p.fecha_devolucion is not null and p.estado in ('abierto', 'entregado')
      and p.fecha_devolucion >= v_hoy and (p.fecha_devolucion - v_hoy) <= v_dp_umbral
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'devolucion_proxima' and not (dedup_key = any(v_keys));
  end if;

  -- ── Stock bajo mínimo (activo, mínimo > 0, actual < mínimo) ──
  if coalesce((select activa from alertas_reglas where tipo = 'stock_bajo'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'stock_bajo');

    select coalesce(array_agg('stock_bajo:' || m.id::text), array[]::text[]) into v_keys
    from materiales m
    where coalesce(m.activo, true) and m.stock_minimo > 0 and m.stock_actual < m.stock_minimo;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'stock_bajo', 'Stock bajo mínimo',
           m.nombre || ': ' || (m.stock_actual::float8)::text || ' (mínimo ' || (m.stock_minimo::float8)::text || ').',
           'warn', v_rol, m.sede_cod, 'material', m.id::text, 'stock_bajo:' || m.id::text
    from materiales m
    where coalesce(m.activo, true) and m.stock_minimo > 0 and m.stock_actual < m.stock_minimo
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'stock_bajo' and not (dedup_key = any(v_keys));
  end if;

  -- ── Caja de un día anterior que sigue abierta ──
  if coalesce((select activa from alertas_reglas where tipo = 'caja_sin_cerrar'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'caja_sin_cerrar');

    select coalesce(array_agg('caja_sin_cerrar:' || s.id::text), array[]::text[]) into v_keys
    from caja_sesiones s
    where s.estado = 'abierta' and (v_hoy - s.fecha) >= 1;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'caja_sin_cerrar', 'Caja sin cerrar',
           'La caja de ' || s.sede_cod || ' del ' || to_char(s.fecha, 'YYYY-MM-DD') || ' sigue abierta.',
           'warn', v_rol, s.sede_cod, 'caja', s.id::text, 'caja_sin_cerrar:' || s.id::text
    from caja_sesiones s
    where s.estado = 'abierta' and (v_hoy - s.fecha) >= 1
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'caja_sin_cerrar' and not (dedup_key = any(v_keys));
  end if;

  -- ── Reportes de actividades sin evaluar pasado el margen ──
  if coalesce((select activa from alertas_reglas where tipo = 'reporte_sin_evaluar'), false) then
    v_rol := (select destinatario_rol from alertas_reglas where tipo = 'reporte_sin_evaluar');

    select coalesce(array_agg('reporte_sin_evaluar:' || r.id), array[]::text[]) into v_keys
    from reportes r
    where not r.evaluado and not coalesce(r.no_evaluable, false) and (v_hoy - r.fecha) >= v_re_umbral;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, ref_tipo, ref_id, dedup_key)
    select 'reporte_sin_evaluar', 'Reporte de Actividades sin evaluar',
           'El reporte de ' || r.sede_cod || ' del ' || to_char(r.fecha, 'YYYY-MM-DD') || ' lleva ' || (v_hoy - r.fecha) || ' día(s) sin evaluar.',
           'info', v_rol, r.sede_cod, 'reporte', r.id, 'reporte_sin_evaluar:' || r.id
    from reportes r
    where not r.evaluado and not coalesce(r.no_evaluable, false) and (v_hoy - r.fecha) >= v_re_umbral
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'reporte_sin_evaluar' and not (dedup_key = any(v_keys));
  end if;

  -- ═══════════════════════════════════════════════════════════════════════════════════════════
  -- C-4 — Las seis reglas nuevas de control interno (0107). Ninguna de arriba se tocó.
  -- ═══════════════════════════════════════════════════════════════════════════════════════════

  -- ── declaracion_incompleta: liquidación 'borrador' con días sin declarar (B-9 literal) ────────
  -- Mismas dos guardas que sueldo_entrada(uuid,date,date) (0093/0085), sólo CONTADAS, no
  -- reimplementadas: un día contratado sin ninguna fila declarada, y un día con una fila 'sin_dato'
  -- Y una fila declarada a la vez (tramo a medio cerrar). Sólo administrador (C-5): habla de plata.
  if coalesce((select activa from alertas_reglas where tipo = 'declaracion_incompleta'), false) then

    select coalesce(array_agg('declaracion_incompleta:' || c.liquidacion_id::text), array[]::text[])
      into v_keys
    from (
      select l.id as liquidacion_id,
        (
          select count(*)
          from generate_series(l.periodo_desde, l.periodo_hasta, interval '1 day') as d(dia)
          where exists (
                  select 1 from sueldo_acuerdo_turnos t
                  where t.acuerdo_id = l.acuerdo_id and t.dia_semana = extract(isodow from d.dia)
                )
            and not exists (
                  select 1 from asistencias s
                  where s.empleado_id = l.empleado_id
                    and s.fecha = d.dia::date
                    and s.condicion <> 'sin_dato'
                )
        )
        +
        (
          select count(*) from (
            select s.fecha
            from asistencias s
            where s.empleado_id = l.empleado_id
              and s.fecha between l.periodo_desde and l.periodo_hasta
            group by s.fecha
            having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
          ) m
        ) as n_dias
      from sueldo_liquidaciones l
      where l.estado = 'borrador'
    ) c
    where c.n_dias > 0;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'declaracion_incompleta', 'Liquidación con días sin declarar',
           e.nombre || ': ' || c.n_dias || ' día(s) sin declarar en el período ' ||
             to_char(c.periodo_desde, 'YYYY-MM-DD') || ' a ' || to_char(c.periodo_hasta, 'YYYY-MM-DD') ||
             ' — la liquidación no se puede calcular hasta completarlos.',
           'critica', 'admin', null, null, 'liquidacion', c.liquidacion_id::text,
           'declaracion_incompleta:' || c.liquidacion_id::text
    from (
      select l.id as liquidacion_id, l.empleado_id, l.periodo_desde, l.periodo_hasta,
        (
          select count(*)
          from generate_series(l.periodo_desde, l.periodo_hasta, interval '1 day') as d(dia)
          where exists (
                  select 1 from sueldo_acuerdo_turnos t
                  where t.acuerdo_id = l.acuerdo_id and t.dia_semana = extract(isodow from d.dia)
                )
            and not exists (
                  select 1 from asistencias s
                  where s.empleado_id = l.empleado_id
                    and s.fecha = d.dia::date
                    and s.condicion <> 'sin_dato'
                )
        )
        +
        (
          select count(*) from (
            select s.fecha
            from asistencias s
            where s.empleado_id = l.empleado_id
              and s.fecha between l.periodo_desde and l.periodo_hasta
            group by s.fecha
            having bool_or(s.condicion = 'sin_dato') and bool_or(s.condicion <> 'sin_dato')
          ) m
        ) as n_dias
      from sueldo_liquidaciones l
      where l.estado = 'borrador'
    ) c
    join empleados e on e.id = c.empleado_id
    where c.n_dias > 0
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'declaracion_incompleta' and not (dedup_key = any(v_keys));
  end if;

  -- ── periodo_liquidable: contrato vencido, todavía sin una liquidación que lo cierre ────────────
  -- Reusa el estado que ya mantiene sueldo_liquidacion_cerrar() (0093, C-7): no se reconstruye la
  -- lógica de tramos. Sólo administrador (C-5).
  if coalesce((select activa from alertas_reglas where tipo = 'periodo_liquidable'), false) then

    select coalesce(array_agg('periodo_liquidable:' || a.id::text), array[]::text[]) into v_keys
    from sueldo_acuerdos a
    where a.estado = 'vigente'
      and a.fecha_fin < (v_hoy - v_pl_umbral)
      and a.fecha_fin >= a.fecha_inicio;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'periodo_liquidable', 'Contrato vencido sin liquidación',
           e.nombre || ': su contrato venció el ' || to_char(a.fecha_fin, 'YYYY-MM-DD') ||
             ' y todavía no tiene una liquidación que lo cierre.',
           'warn', 'admin', null, null, 'acuerdo', a.id::text, 'periodo_liquidable:' || a.id::text
    from sueldo_acuerdos a
    join empleados e on e.id = a.empleado_id
    where a.estado = 'vigente'
      and a.fecha_fin < (v_hoy - v_pl_umbral)
      and a.fecha_fin >= a.fecha_inicio
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'periodo_liquidable' and not (dedup_key = any(v_keys));
  end if;

  -- ── dia_con_hora_estimada: días 'trabajado' con la hora puesta por el huellero (0096/0097) ─────
  -- Agrupado por empleado y por el período de SU liquidación 'borrador' si el día cae dentro de
  -- una (el left join no puede matchear más de una: los acuerdos de una persona no se solapan y un
  -- tramo no se sale de su acuerdo); si no, por mes calendario. Admin Y la persona (C-5): dos filas,
  -- mismo dedup_key sufijado ':admin'/':persona'.
  if coalesce((select activa from alertas_reglas where tipo = 'dia_con_hora_estimada'), false) then

    with dias_est as (
      select s.empleado_id,
             coalesce(l.periodo_desde, date_trunc('month', s.fecha)::date) as periodo_desde,
             coalesce(l.periodo_hasta, (date_trunc('month', s.fecha) + interval '1 month' - interval '1 day')::date) as periodo_hasta
      from asistencias s
      left join sueldo_liquidaciones l
        on l.empleado_id = s.empleado_id
       and l.estado = 'borrador'
       and s.fecha between l.periodo_desde and l.periodo_hasta
      where s.condicion = 'trabajado' and (s.entrada_estimada or s.salida_estimada)
    ),
    grupos as (
      select empleado_id, periodo_desde, periodo_hasta, count(*) as n_dias
      from dias_est
      group by empleado_id, periodo_desde, periodo_hasta
    )
    select coalesce(array_agg(k), array[]::text[]) into v_keys
    from (
      select 'dia_con_hora_estimada:' || g.empleado_id::text || ':' || to_char(g.periodo_desde, 'YYYY-MM-DD') || suf as k
      from grupos g cross join unnest(array[':admin', ':persona']) as suf
    ) t;

    with dias_est as (
      select s.empleado_id,
             coalesce(l.periodo_desde, date_trunc('month', s.fecha)::date) as periodo_desde,
             coalesce(l.periodo_hasta, (date_trunc('month', s.fecha) + interval '1 month' - interval '1 day')::date) as periodo_hasta
      from asistencias s
      left join sueldo_liquidaciones l
        on l.empleado_id = s.empleado_id
       and l.estado = 'borrador'
       and s.fecha between l.periodo_desde and l.periodo_hasta
      where s.condicion = 'trabajado' and (s.entrada_estimada or s.salida_estimada)
    ),
    grupos as (
      select empleado_id, periodo_desde, periodo_hasta, count(*) as n_dias
      from dias_est
      group by empleado_id, periodo_desde, periodo_hasta
    )
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'dia_con_hora_estimada', 'Días con hora puesta por el sistema',
           e.nombre || ': ' || g.n_dias || ' día(s) del período ' || to_char(g.periodo_desde, 'YYYY-MM-DD') ||
             ' a ' || to_char(g.periodo_hasta, 'YYYY-MM-DD') ||
             ' tienen la hora puesta por el sistema, no marcada — revisalos en Asistencias.',
           'warn', 'admin', null, null, 'empleado', g.empleado_id::text,
           'dia_con_hora_estimada:' || g.empleado_id::text || ':' || to_char(g.periodo_desde, 'YYYY-MM-DD') || ':admin'
    from grupos g
    join empleados e on e.id = g.empleado_id
    union all
    select 'dia_con_hora_estimada', 'Días con hora puesta por el sistema',
           e.nombre || ': ' || g.n_dias || ' día(s) del período ' || to_char(g.periodo_desde, 'YYYY-MM-DD') ||
             ' a ' || to_char(g.periodo_hasta, 'YYYY-MM-DD') ||
             ' tienen la hora puesta por el sistema, no marcada — revisalos en Asistencias.',
           'warn', null, null, g.empleado_id, 'empleado', g.empleado_id::text,
           'dia_con_hora_estimada:' || g.empleado_id::text || ':' || to_char(g.periodo_desde, 'YYYY-MM-DD') || ':persona'
    from grupos g
    join empleados e on e.id = g.empleado_id
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'dia_con_hora_estimada' and not (dedup_key = any(v_keys));
  end if;

  -- ── dia_sin_marca: día laborable pasado, sin ninguna marca ni declaración (candidato a falta) ──
  -- "Ninguna marca" es literal: ni siquiera 'sin_dato' (a diferencia de declaracion_incompleta, que
  -- SÍ ve la fila 'sin_dato' — ahí el problema es la asistencia incompleta, acá es que nadie ni
  -- siquiera abrió el día). Turno contratado del acuerdo 'vigente' de la persona, dentro de los
  -- últimos v_dsm_umbral días, SIN CONTAR HOY. Admin Y la persona (C-5), mismo patrón de dos filas.
  if coalesce((select activa from alertas_reglas where tipo = 'dia_sin_marca'), false) then

    with dias_falta as (
      select a.empleado_id, d.dia
      from sueldo_acuerdos a
      join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
      cross join lateral generate_series(
        greatest(a.fecha_inicio, v_hoy - v_dsm_umbral),
        least(a.fecha_fin, v_hoy - 1),
        interval '1 day'
      ) as d(dia)
      where a.estado = 'vigente'
        and t.dia_semana = extract(isodow from d.dia)
        and not exists (
              select 1 from asistencias s
              where s.empleado_id = a.empleado_id and s.fecha = d.dia::date
            )
      group by a.empleado_id, d.dia
    ),
    grupos as (
      select empleado_id, count(*) as n_dias from dias_falta group by empleado_id
    )
    select coalesce(array_agg(k), array[]::text[]) into v_keys
    from (
      select 'dia_sin_marca:' || g.empleado_id::text || suf as k
      from grupos g cross join unnest(array[':admin', ':persona']) as suf
    ) t;

    with dias_falta as (
      select a.empleado_id, d.dia
      from sueldo_acuerdos a
      join sueldo_acuerdo_turnos t on t.acuerdo_id = a.id
      cross join lateral generate_series(
        greatest(a.fecha_inicio, v_hoy - v_dsm_umbral),
        least(a.fecha_fin, v_hoy - 1),
        interval '1 day'
      ) as d(dia)
      where a.estado = 'vigente'
        and t.dia_semana = extract(isodow from d.dia)
        and not exists (
              select 1 from asistencias s
              where s.empleado_id = a.empleado_id and s.fecha = d.dia::date
            )
      group by a.empleado_id, d.dia
    ),
    grupos as (
      select empleado_id, count(*) as n_dias from dias_falta group by empleado_id
    )
    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'dia_sin_marca', 'Días sin ninguna marca ni declaración',
           e.nombre || ': ' || g.n_dias || ' día(s) laborable(s) de los últimos ' || v_dsm_umbral ||
             ' sin ninguna marca ni declaración — candidato a falta.',
           'warn', 'admin', null, null, 'empleado', g.empleado_id::text,
           'dia_sin_marca:' || g.empleado_id::text || ':admin'
    from grupos g
    join empleados e on e.id = g.empleado_id
    union all
    select 'dia_sin_marca', 'Días sin ninguna marca ni declaración',
           e.nombre || ': ' || g.n_dias || ' día(s) laborable(s) de los últimos ' || v_dsm_umbral ||
             ' sin ninguna marca ni declaración — candidato a falta.',
           'warn', null, null, g.empleado_id, 'empleado', g.empleado_id::text,
           'dia_sin_marca:' || g.empleado_id::text || ':persona'
    from grupos g
    join empleados e on e.id = g.empleado_id
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'dia_sin_marca' and not (dedup_key = any(v_keys));
  end if;

  -- ── extra_sin_valor: actividad extra del catálogo registrada sin valor ──────────────────────────
  -- `cod is not null` distingue el extra de catálogo del "libre" (0053), que sale en 0 A PROPÓSITO
  -- (ver 0081, casos R/S) y no es esto. Sólo administrador (C-5): es dato de configuración del
  -- catálogo, no de la persona. Si registrado_por_id es null, agrupa aparte ('sin_registrar').
  if coalesce((select activa from alertas_reglas where tipo = 'extra_sin_valor'), false) then

    select coalesce(array_agg('extra_sin_valor:' || coalesce(g.registrado_por_id::text, 'sin_registrar')), array[]::text[])
      into v_keys
    from (
      select registrado_por_id, count(*) as n
      from reporte_extras
      where cod is not null and puntos_total = 0
      group by registrado_por_id
    ) g;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'extra_sin_valor', 'Actividad extra del catálogo sin valor',
           coalesce(e.nombre, 'Sin registrar') || ': ' || g.n ||
             ' actividad(es) extra del catálogo registrada(s) sin valor — revisar el peso en el catálogo de esa sede.',
           'warn', 'admin', null, null, 'empleado', g.registrado_por_id::text,
           'extra_sin_valor:' || coalesce(g.registrado_por_id::text, 'sin_registrar')
    from (
      select registrado_por_id, count(*) as n
      from reporte_extras
      where cod is not null and puntos_total = 0
      group by registrado_por_id
    ) g
    left join empleados e on e.id = g.registrado_por_id
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'extra_sin_valor' and not (dedup_key = any(v_keys));
  end if;

  -- ── falta_fecha_ingreso: persona activa sin fecha de ingreso ────────────────────────────────────
  -- Un aviso POR PERSONA (no agrupado). Sólo administrador (C-5): bloquea el ciclo de pago por
  -- aniversario, es un dato administrativo.
  if coalesce((select activa from alertas_reglas where tipo = 'falta_fecha_ingreso'), false) then

    select coalesce(array_agg('falta_fecha_ingreso:' || e.id::text), array[]::text[]) into v_keys
    from empleados e
    where e.activo and e.fecha_ingreso is null;

    insert into notificaciones (tipo, titulo, mensaje, severidad, destinatario_rol, destinatario_sede, destinatario_id, ref_tipo, ref_id, dedup_key)
    select 'falta_fecha_ingreso', 'Falta la fecha de ingreso',
           e.nombre || ' no tiene fecha de ingreso cargada — bloquea su ciclo de pago por aniversario.',
           'warn', 'admin', null, null, 'empleado', e.id::text, 'falta_fecha_ingreso:' || e.id::text
    from empleados e
    where e.activo and e.fecha_ingreso is null
    on conflict (dedup_key) do update set
      mensaje = excluded.mensaje, severidad = excluded.severidad, updated_at = now();
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    delete from notificaciones
    where tipo = 'falta_fecha_ingreso' and not (dedup_key = any(v_keys));
  end if;

  return v_total;
end;
$$;

revoke execute on function generar_alertas() from public, anon;
grant  execute on function generar_alertas() to authenticated, service_role;
