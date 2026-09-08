-- 0107_notificaciones_reglas_control_interno.sql — seis reglas nuevas de control interno (C-4),
-- con su alcance de aislamiento (C-5): quién ve cada aviso.
--
-- Implementa docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md
-- §5 (C-4, C-5), paso 3 de la §8. SÓLO agrega reglas NUEVAS dentro de generar_alertas() —
-- las cinco que ya existen (0041/0046, reescritas por 0100/0101) NO SE TOCAN, se copian tal cual.
--
-- Las seis reglas, agrupadas por persona y período (no por día, spec §5 C-4):
--   declaracion_incompleta  — crítica, sin umbral — liquidación en 'borrador' con días sin declarar
--   periodo_liquidable      — warn,    umbral (3)  — contrato vencido sin una liquidación que lo cierre
--   dia_con_hora_estimada   — warn,    sin umbral  — días 'trabajado' con la hora puesta por el huellero
--   dia_sin_marca           — warn,    umbral (7)  — día laborable pasado sin ninguna marca ni declaración
--   extra_sin_valor         — warn,    sin umbral  — reporte_extras de catálogo con puntos_total = 0
--   falta_fecha_ingreso     — warn,    sin umbral  — persona activa sin fecha_ingreso
--
-- ── Quién ve cada aviso (C-5) ───────────────────────────────────────────────────────────────────
-- declaracion_incompleta/periodo_liquidable/extra_sin_valor/falta_fecha_ingreso: SÓLO admin —
-- hablan de plata y de datos de la empresa, no de una persona en particular.
-- dia_con_hora_estimada/dia_sin_marca: admin Y la persona — es SU asistencia. Una fila de
-- `notificaciones` no admite dos destinatarios, así que estas dos insertan DOS filas por caso
-- (mismo tipo, mismo contenido, dedup_key sufijado ':admin'/':persona', un destinatario cada una).
--
-- El destinatario_rol='admin' de estas seis reglas va LITERAL en el INSERT (no se lee desde
-- alertas_reglas.destinatario_rol como sí hacen las cinco reglas viejas): es una garantía de
-- aislamiento del no-negociable 3 ("un aviso que nombra a una persona es del administrador y de esa
-- persona, de nadie más" — spec §5 C-5), no un parámetro de negocio libre. C-6 (la pantalla de
-- Configuración, paso 5, sin empezar) va a poder tocar `activa` y `umbral` de estas seis filas, pero
-- nunca `destinatario_rol`: aflojar quién ve un aviso de asistencia de otra persona sería reabrir el
-- agujero que cerraron las migraciones 0100/0101.
--
-- ── declaracion_incompleta: MISMAS dos guardas que sueldo_entrada(uuid,date,date) (0093, sobre
--    0085), sin reimplementarlas — sólo se CUENTAN los días que esa función ya corta ────────────
--   Guarda 1 ("falta declarar"): día contratado (turno en sueldo_acuerdo_turnos para ese día de la
--   semana, dentro del período de la liquidación) sin ninguna fila en asistencias con
--   condicion <> 'sin_dato'.
--   Guarda 2 ("tramo a medio declarar", 0085): día con al menos una fila 'sin_dato' Y al menos una
--   fila que no lo es, para el mismo empleado+fecha. Las dos son mutuamente excluyentes por día
--   (la guarda 2 exige que SÍ exista una fila no-sin_dato; la 1 exige que NO exista ninguna), así
--   que sumarlas no duplica ningún día.
--
-- ── periodo_liquidable: reusa el estado que ya mantiene sueldo_liquidacion_cerrar() (0093, C-7) ──
--   Confirmado contra la base (packages/db/migrations/0072_sueldos_esquema.sql:93,
--   sueldo_acuerdos_estado_chk): los tres valores son 'borrador' | 'vigente' | 'liquidado'. La spec
--   asumía 'vigente' y coincide exacto — no se reconstruye la lógica de tramos, sólo se mira
--   estado='vigente' y fecha_fin < hoy-umbral.
--
-- ── dia_con_hora_estimada: agrupación por período de la liquidación 'borrador' de la persona SI
--    EXISTE, o mes calendario si no ──────────────────────────────────────────────────────────────
--   El left join contra sueldo_liquidaciones sólo puede matchear COMO MUCHO una fila por fecha: los
--   acuerdos de una misma persona no se solapan (sueldo_acuerdos_sin_solape, 0072) y un tramo nunca
--   se sale de su acuerdo (trigger sueldo_liq_coherente, 0072) — así que no hay riesgo de que un día
--   caiga dentro de dos liquidaciones 'borrador' a la vez y duplique filas.
--
-- ── dia_sin_marca: "ninguna marca" es literal, ni siquiera 'sin_dato' ──────────────────────────
--   A diferencia de declaracion_incompleta (que SÍ ve la fila 'sin_dato', el problema ahí es que
--   está incompleta), acá el día no tiene ninguna fila en absoluto: nadie marcó y nadie declaró. Se
--   mira el turno contratado del acuerdo 'vigente' de la persona, dentro de los últimos `umbral`
--   días, SIN CONTAR HOY (un día en curso todavía no es "pasado").
--
-- ── extra_sin_valor: `cod is not null` distingue el extra de catálogo del "libre" ──────────────
--   El extra "libre" (sin cod) sale en 0/revisar=true A PROPÓSITO desde la 0053 (ver
--   packages/db/pruebas/0081_reportes_escritura_directa.prueba.sql, casos R/S) — no es esto. Acá el
--   catálogo SÍ respalda la fila pero con peso=0 en esa sede: dato de configuración a revisar, no un
--   defecto de código (ya descartado el 6-sep-2026, ver docs/aprendizajes.md).
--
-- Idempotente: create or replace function + insert ... on conflict (tipo) do nothing.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5): periodo_liquidable.umbral=3,
--     dia_sin_marca.umbral=7.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- El catálogo: las seis reglas nuevas, todas activa=true de entrada (spec §5 C-4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
insert into alertas_reglas (tipo, descripcion, severidad, umbral, activa, destinatario_rol) values
  ('declaracion_incompleta', 'Liquidación en borrador con días sin declarar dentro de su período (B-9)', 'critica', null, true, 'admin'),
  ('periodo_liquidable',     'Contrato vencido hace más de N días sin una liquidación que lo cierre',     'warn',    3,    true, 'admin'),
  ('dia_con_hora_estimada',  'Días trabajados cuya entrada o salida la puso el sistema, no la persona',   'warn',    null, true, 'admin'),
  ('dia_sin_marca',          'Día laborable de los últimos N días sin ninguna marca ni declaración',      'warn',    7,    true, 'admin'),
  ('extra_sin_valor',        'Actividad extra del catálogo registrada con puntaje en cero',                'warn',    null, true, 'admin'),
  ('falta_fecha_ingreso',    'Persona activa sin fecha de ingreso cargada',                                'warn',    null, true, 'admin')
on conflict (tipo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- generar_alertas() — las cinco reglas de la 0101, SIN TOCAR, más las seis nuevas al final,
-- antes del `return v_total`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
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

revoke execute on function generar_alertas() from public, anon, authenticated;
grant execute on function generar_alertas() to service_role;
