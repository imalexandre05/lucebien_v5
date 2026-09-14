-- 0101_alertas_se_retiran.sql — un aviso se retira solo cuando su condición deja de ser cierta, y
-- el mensaje se refresca en vez de quedar congelado; las cuatro reglas del módulo comercial se
-- apagan (siguen existiendo, por si el alcance vuelve a incluirlas).
--
-- Implementa docs/superpowers/specs/notificaciones/2026-09-06-notificaciones-de-control-interno-design.md
-- §5 (C-1, C-2) y §4, que es el paso 2 de la §8. SÓLO sobre las cinco reglas que YA EXISTEN
-- (0041/0042/0046) — ninguna regla nueva: eso es C-4 (paso 3 de la spec, de otra sesión).
--
-- ── C-1 ─────────────────────────────────────────────────────────────────────────────────────
-- Cada bloque, además de insertar/actualizar, borra las notificaciones VIVAS de su propio tipo
-- cuyo dedup_key no salió en esta corrida. El conjunto de dedup_key vigentes se calcula ANTES del
-- insert, con el MISMO filtro que el insert (repetido a propósito: así cada bloque sigue siendo
-- una unidad autocontenida y legible, sin CTEs encadenados difíciles de seguir), y se guarda en
-- una variable local. El borrado va DENTRO del `if activa`: una regla apagada nunca toca sus
-- filas, y si se reactiva sin que la condición haya cambiado, las que quedaron siguen ahí (C-2 las
-- refresca en vez de recrearlas — ver la prueba, caso 6).
--
-- ── C-2 ─────────────────────────────────────────────────────────────────────────────────────
-- `on conflict (dedup_key) do nothing` pasa a `do update set mensaje/severidad/updated_at`.
-- `leida` NO está en el SET: no se re-marca como no leído algo que la persona ya vio sólo porque
-- el texto cambió (p.ej. "vence en 2 días" → "vence en 1 día").
--
-- ── §4 ──────────────────────────────────────────────────────────────────────────────────────
-- `devolucion_vencida`, `devolucion_proxima`, `stock_bajo` y `caja_sin_cerrar` (las cuatro del
-- módulo comercial, fuera del menú desde el 20-ago) pasan a `activa = false`. UPDATE, no DELETE:
-- se conservan por si el alcance las vuelve a necesitar. `reporte_sin_evaluar` queda activa: es la
-- única que es control interno.
--
-- ── Fuera de alcance, a propósito ───────────────────────────────────────────────────────────
-- `reporte_auto_evaluado` tiene avisos vivos en la base (15 al medir la spec, 6-sep) pero NO tiene
-- fila en `alertas_reglas` ni lo produce esta función: lo inserta
-- `reportes_auto_evaluar_vencidos()` (migración 0064), que corre en su propio cron
-- ('reportes-auto-cierre-M'/'-TC', 0046/0052) y ya tiene su propio `on conflict (dedup_key) do
-- nothing` — ni C-1 ni C-2 lo tocan acá. El C-1 de esta migración sólo borra los tipos que ESTA
-- función (generar_alertas()) evalúa; ese tipo no es uno de ellos, así que no se toca.
--
-- ── Sobre qué versión de generar_alertas() se escribió esto ────────────────────────────────
-- Se pidió traer la definición viva con `pg_get_functiondef('public.generar_alertas()'::regprocedure)`.
-- Este entorno (sesión `implementador`) no tiene psql ni SUPABASE_DB_URL — no hay forma de
-- consultar la base real desde acá (docs/aprendizajes.md, filas del 22/23-ago sobre el mismo
-- bloqueo en las migraciones 0091/0092). En su lugar se grepeó "generar_alertas" en LAS 100
-- migraciones anteriores: sólo la redefinen 0042 y 0046 (0052 sólo la NOMBRA en un comentario, no
-- la toca). 0046 es la más nueva y corrige el título de `reporte_sin_evaluar` ("Reporte de
-- Actividades sin evaluar", no "FR-01 sin evaluar") sobre el cuerpo de 0042, sin ningún otro
-- cambio. Esta migración parte de 0046. Si algo se aplicó directo en producción por fuera de estas
-- migraciones, esta migración lo pisa igual que 0046 pisó a 0042 — hay que confirmarlo contra la
-- base antes de aplicar.
--
-- Idempotente: create or replace function + update ... where tipo in (...).

create or replace function generar_alertas()
  returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Lima')::date;
  v_total int  := 0;
  v_n     int;
  v_dp_umbral int := coalesce((select umbral from alertas_reglas where tipo = 'devolucion_proxima'), 2)::int;
  v_re_umbral int := coalesce((select umbral from alertas_reglas where tipo = 'reporte_sin_evaluar'), 2)::int;
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

  return v_total;
end;
$$;

revoke execute on function generar_alertas() from public, anon, authenticated;
grant execute on function generar_alertas() to service_role;

-- ── §4: apagar las cuatro reglas del módulo comercial. Se conservan sus filas y su umbral. ────
update alertas_reglas
   set activa = false
 where tipo in ('devolucion_vencida', 'devolucion_proxima', 'stock_bajo', 'caja_sin_cerrar');
