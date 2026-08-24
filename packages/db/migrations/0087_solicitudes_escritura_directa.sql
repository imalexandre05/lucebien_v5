-- 0087_solicitudes_escritura_directa.sql — cierra el UPDATE/DELETE directo sobre solicitudes: la
-- transición sólo se puede hacer por RPC, y queda auditada.
--
-- Implementa <docs/superpowers/specs/permisos/2026-08-23-solicitudes-escritura-directa-design.md §3>,
-- rama de la spec paraguas 2026-08-23-escritura-directa-y-anonimato-design.md §1 A-2 (hallazgo F29).
--
-- EL FALLO. `solicitudes_rw` (0056_solicitudes.sql:88) es `for all` con la misma condición en
-- `using` y en `with check`: quien puede VER una solicitud puede REESCRIBIRLA entera. Toda la
-- autoridad del módulo (aprobar/entregar/rechazar/confirmar) vive dentro de las RPC, y un
-- `PATCH /rest/v1/solicitudes` no las toca. Verificado en vivo el 23-ago-2026: una colaboradora de
-- ventas, sin ninguna autoridad de almacén, dejó una solicitud en 'confirmada' con
-- `confirmado = true` por escritura directa.
--
-- EL ARREGLO. Con RLS activa, la AUSENCIA de política deniega. Se parte la política en SELECT +
-- INSERT y no se crea ninguna de UPDATE ni de DELETE: el único camino de escritura que queda son
-- las RPC. Y como las RPC son `security invoker` —corren con la RLS del actor—, quitarles la
-- política de UPDATE también las cerraría a ellas: por eso las cinco que actualizan pasan a
-- `security definer`. No afloja nada, porque la autoridad ya estaba escrita adentro de cada una
-- (private.app_es_gestor_solicitudes(), 0056:253) y ahora es la única que queda en pie.
--
-- Idempotente: se puede reaplicar sin fallar. `drop policy if exists` antes de cada `create`, el
-- cambio de `security definer` es un `alter function` (no reescribe el cuerpo, así que no puede
-- quedar desincronizado con la 0056), y el trigger va con su `drop trigger if exists`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Acá se usa
--     igual porque es la condición de VISIBILIDAD que la 0056 ya le daba a esta tabla —que no
--     tiene datos de personas— y esta migración no cambia quién ve qué.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA. Con RLS activa y sólo
--     select, las escrituras fallan en silencio. Acá eso es DELIBERADO para UPDATE/DELETE, y por
--     eso el único camino legítimo que escribía sin RPC (marcar impreso) se convierte en RPC más
--     abajo: un `update` sin política no da error, devuelve cero filas — el peor modo de fallo.
--   · Todo default de negocio va comentado como provisional y anotado en
--     docs/pendientes-negocio.md (no-negociable 5). Esta migración no introduce ninguno.

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 0) COMPROBACIÓN PREVIA — que las RPC de la 0056 existan ANTES de tocar una política.
--
-- Va primero por el orden en que fallaría si no. El bloque 2 convierte esas funciones y aborta si
-- alguna falta; pero para entonces el bloque 1 ya borró las políticas viejas, y sobre una base
-- donde el error deje algo a medias las solicitudes quedarían sin ninguna puerta de escritura:
-- un `update` sin política no falla, devuelve cero filas — el peor modo de fallo que hay.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.solicitud_aprobar(uuid, text, jsonb)',
    'public.solicitud_rechazar(uuid, text)',
    'public.solicitud_entregar(uuid, text, jsonb)',
    'public.solicitud_confirmar(uuid, jsonb)',
    'public.solicitud_deshacer(uuid)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'Falta %. Aplica primero 0056_solicitudes.sql', v_sig;
    end if;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1) POLÍTICAS — SELECT y INSERT explícitos; UPDATE y DELETE, ninguna.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- La política vieja `for all` cubría las cuatro operaciones: se va entera y se reemplaza.
drop policy if exists solicitudes_rw    on solicitudes;
drop policy if exists solicitudes_select on solicitudes;
drop policy if exists solicitudes_insert on solicitudes;

-- Lectura: la MISMA condición de siempre. Quien veía sigue viendo (no se rompe nada de lo que hoy
-- funciona: listado, detalle e impresión son todos SELECT).
create policy solicitudes_select on solicitudes for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()));

-- Alta: la misma condición de sede, MÁS la exigencia de que la fila nazca neutra. Sin esta segunda
-- mitad, el mismo ataque de F29 se rehace por POST — crear directamente una solicitud ya
-- 'confirmada', o a nombre de otra persona, hace el mismo daño que el PATCH.
-- Los seis valores exigidos son exactamente los que produce `solicitud_crear` (0056:298-300): esa
-- RPC sólo escribe sede/solicitante/urgencia/obs y deja que el resto lo pongan los defaults de
-- columna. Por eso `solicitud_crear` puede seguir siendo `security invoker` (permiso más chico).
create policy solicitudes_insert on solicitudes for insert
  with check (
    (private.app_es_admin() or private.app_es_almacen() or sede_cod in (select private.app_sedes()))
    and estado             = 'pendiente'
    and confirmado         = false
    and solicitante_id     = auth.uid()
    and aprobado_por_id   is null
    and entregado_por_id  is null
    and confirmado_por_id is null
    and rechazado_por_id  is null
  );

-- Ítems: mismo criterio. La visibilidad cuelga del padre, como en la 0056; los contadores que el
-- almacén usa para saber qué salió y qué llegó (cantidad_enviada / cantidad_recibida /
-- estado_item) sólo los puede mover una RPC.
drop policy if exists solicitud_items_rw     on solicitud_items;
drop policy if exists solicitud_items_select on solicitud_items;
drop policy if exists solicitud_items_insert on solicitud_items;

create policy solicitud_items_select on solicitud_items for select
  using (exists (
    select 1 from solicitudes s where s.id = solicitud_items.solicitud_id
      and (private.app_es_admin() or private.app_es_almacen() or s.sede_cod in (select private.app_sedes()))
  ));

create policy solicitud_items_insert on solicitud_items for insert
  with check (
    exists (
      select 1 from solicitudes s where s.id = solicitud_items.solicitud_id
        and (private.app_es_admin() or private.app_es_almacen() or s.sede_cod in (select private.app_sedes()))
    )
    and cantidad_enviada  = 0
    and cantidad_recibida = 0
    and estado_item       = 'pendiente'
  );

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2) LAS RPC QUE ACTUALIZAN PASAN A `security definer`
--
--    Sin esto, el punto 1 no cierra un agujero: rompe el módulo entero. Las cinco ya validan la
--    autoridad adentro; `definer` sólo les devuelve el permiso de escritura que la política nueva
--    les quita. `solicitud_crear` NO entra acá: sólo inserta, y la política de INSERT le alcanza.
--
--    `alter function` en vez de `create or replace`: no duplica el cuerpo de la 0056, así que no
--    puede quedar una copia desactualizada de la lógica de transición viviendo en dos archivos.
--    Se reafirma `search_path = public` en el mismo alter — en una función `definer` un
--    search_path suelto es un camino de escalada de privilegios, no un detalle de estilo.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.solicitud_aprobar(uuid, text, jsonb)',
    'public.solicitud_rechazar(uuid, text)',
    'public.solicitud_entregar(uuid, text, jsonb)',
    'public.solicitud_confirmar(uuid, jsonb)',
    -- No estaba en el encargo de la auditoría, pero también escribe sobre solicitudes y
    -- solicitud_items: dejarla `invoker` habría dejado el botón "Deshacer" muerto desde el día que
    -- se aplique esta migración. Su guard interno (0056:481-490) exige la misma autoridad que pudo
    -- causar la transición que revierte.
    'public.solicitud_deshacer(uuid)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'Falta %. Aplica primero 0056_solicitudes.sql', v_sig;
    end if;
    -- `pg_temp` al final y explícito: sin él, quien pueda crear objetos temporales puede
    -- anteponer una tabla o una función suya y la definer la resolvería primero. Es el error
    -- clásico de esta conversión, y una definer resuelta al revés corre con permisos de dueño.
    execute format('alter function %s security definer set search_path = public, pg_temp', v_sig);
  end loop;
end $$;

-- En una función `definer` el grant deja de ser burocracia: `public` incluye a `anon`, y `anon` es
-- la clave que viaja en cada página del ERP. La 0056 ya los dejó así; se reafirma porque ahora el
-- costo de equivocarse es otro.
revoke execute on function solicitud_aprobar(uuid, text, jsonb) from public;
revoke execute on function solicitud_rechazar(uuid, text)       from public;
revoke execute on function solicitud_entregar(uuid, text, jsonb) from public;
revoke execute on function solicitud_confirmar(uuid, jsonb)     from public;
revoke execute on function solicitud_deshacer(uuid)             from public;
grant execute on function solicitud_aprobar(uuid, text, jsonb) to authenticated;
grant execute on function solicitud_rechazar(uuid, text)       to authenticated;
grant execute on function solicitud_entregar(uuid, text, jsonb) to authenticated;
grant execute on function solicitud_confirmar(uuid, jsonb)     to authenticated;
grant execute on function solicitud_deshacer(uuid)             to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3) EL ÚNICO CAMINO LEGÍTIMO QUE ESCRIBÍA SIN RPC: marcar la solicitud como impresa
--
--    apps/erp-web/lib/solicitudes-repo.ts hacía un `update` plano de pedido_impreso /
--    confirmacion_impresa. Sin política de UPDATE ese update no falla: afecta cero filas y la
--    pantalla dice "listo" sin haber guardado nada.
--
--    Se resuelve con RPC y no con una política de UPDATE acotada a esas columnas porque la RLS de
--    Postgres no sabe de columnas: acotarla exigiría mover la regla a la capa de grants
--    (revoke update / grant update(col)), donde no la busca nadie y donde el próximo `alter table`
--    la pisa sin ruido — y además reabriría una política de UPDATE sobre la tabla, que es
--    justamente la superficie que esta migración elimina.
--
--    Autoridad: la MISMA que hoy decide si esa persona ve la solicitud. No agrega ni quita permiso
--    a nadie; sólo lo hace explícito.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function solicitud_marcar_impreso(p_id uuid, p_tipo text)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_sede  text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;
  if p_tipo not in ('pedido', 'confirmacion') then
    raise exception 'TIPO_INVALIDO:Tipo de impresión desconocido: %', p_tipo;
  end if;

  -- `definer` bypassa la RLS, así que la visibilidad se comprueba a mano y a propósito.
  select sede_cod into v_sede from solicitudes where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not (private.app_es_admin() or private.app_es_almacen() or v_sede in (select private.app_sedes())) then
    raise exception 'SIN_PERMISO:No puedes marcar como impresa una solicitud de otra sede';
  end if;

  if p_tipo = 'pedido' then
    update solicitudes set pedido_impreso = true, fecha_pedido_impreso = now(), updated_at = now()
    where id = p_id;
  else
    update solicitudes set confirmacion_impresa = true, fecha_confirmacion_impresa = now(), updated_at = now()
    where id = p_id;
  end if;
end;
$$;
revoke execute on function solicitud_marcar_impreso(uuid, text) from public;
grant  execute on function solicitud_marcar_impreso(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4) AUDITORÍA — la tabla no dejaba ni una fila en audit_log.
--
--    Función genérica de la 0058 (private.audit_log_trigger(), 0058:84), la misma de las cinco
--    tablas sensibles: registra antes/después y `auth.uid()` como actor, y tiene su propio
--    exception-swallow, así que un fallo de auditoría nunca bloquea la operación real.
--    `solicitud_items` queda FUERA a propósito por frecuencia (una fila por ítem), mismo criterio
--    con el que la 0058 dejó afuera a prenda_pasada; el antes/después de la cabecera alcanza para
--    reconstruir quién movió qué.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_audit_solicitudes on solicitudes;
create trigger trg_audit_solicitudes after insert or update or delete on solicitudes
  for each row execute function private.audit_log_trigger();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación: packages/db/pruebas/0087_solicitudes_escritura_directa.prueba.sql
--   bash tools/probar-migracion.sh 0087
-- (ataca las doce promesas suplantando a una persona de ventas y a un gestor, y se descarta sola)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
