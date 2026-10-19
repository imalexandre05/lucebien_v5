-- 0182 — Accesorios: enviar y validar solo por RPC, con código personal (sesión 10A, 19-oct-2026).
-- Spec: docs/superpowers/specs/pipeline/2026-10-19-accesorios-con-codigo-design.md
-- Prueba: packages/db/pruebas/0182_accesorios_con_codigo.prueba.sql (escrita antes). Idempotente.
--
-- Antes: la remesa y su validación se escribían directo con la sesión (sin código) y envios_acc_rw
-- dejaba escribir a cualquiera con la sede. Ahora cada acción queda a nombre del dueño del código.

create or replace function public.accesorios_enviar(p_sede text, p_obs text, p_items jsonb, p_operador uuid default null)
  returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid; v_id uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not (private.app_es_admin() or private.app_es_almacen()) then
    raise exception 'PERMISO: solo el almacén envía remesas de accesorios';
  end if;
  v_actor := private.actor_pipeline(p_operador);
  if p_sede is null or not exists (select 1 from sedes where cod = p_sede) then
    raise exception 'La sede de destino % no existe', coalesce(p_sede, '(vacía)');
  end if;
  select count(*) into v_n from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(tipo text, cantidad int)
    where btrim(coalesce(x.tipo, '')) <> '' and coalesce(x.cantidad, 0) > 0;
  if v_n = 0 then raise exception 'Agrega al menos un accesorio con cantidad.'; end if;
  insert into envios_accesorios (sede_destino_cod, fecha, responsable_id, obs)
    values (p_sede, now(), v_actor, nullif(btrim(coalesce(p_obs, '')), '')) returning id into v_id;
  insert into envio_accesorios_items (envio_id, tipo, cantidad)
    select v_id, btrim(x.tipo), x.cantidad
      from jsonb_to_recordset(p_items) as x(tipo text, cantidad int)
     where btrim(coalesce(x.tipo, '')) <> '' and coalesce(x.cantidad, 0) > 0;
  return v_id;
end;
$$;
revoke execute on function public.accesorios_enviar(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.accesorios_enviar(text, text, jsonb, uuid) to authenticated;

create or replace function public.accesorios_validar(p_id uuid, p_operador uuid default null)
  returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_actor uuid; v_dest text; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select sede_destino_cod, coalesce(validado_tienda, false) into v_dest, v_ok
    from envios_accesorios where id = p_id for update;
  if not found
     or not (private.app_es_admin()
             or (not private.app_es_almacen() and v_dest in (select private.app_sedes()))) then
    raise exception 'Envío no encontrado';
  end if;
  v_actor := private.actor_pipeline(p_operador);
  if v_ok then raise exception 'TRANSICION: esa remesa ya fue validada'; end if;
  update envios_accesorios set validado_tienda = true, validado_por_id = v_actor, fecha_validado = now()
    where id = p_id;
end;
$$;
revoke execute on function public.accesorios_validar(uuid, uuid) from public, anon;
grant  execute on function public.accesorios_validar(uuid, uuid) to authenticated;

-- R3: solo lectura directa (admin, almacén o sede destino).
drop policy if exists envios_acc_rw  on public.envios_accesorios;
drop policy if exists envios_acc_sel on public.envios_accesorios;
create policy envios_acc_sel on public.envios_accesorios for select
  using (private.app_es_admin() or private.app_es_almacen() or sede_destino_cod in (select private.app_sedes()));
revoke insert, update, delete, truncate on public.envios_accesorios from authenticated, anon;

drop policy if exists envio_acc_items_rw  on public.envio_accesorios_items;
drop policy if exists envio_acc_items_sel on public.envio_accesorios_items;
create policy envio_acc_items_sel on public.envio_accesorios_items for select
  using (
    private.app_es_admin() or private.app_es_almacen() or exists (
      select 1 from public.envios_accesorios e
      where e.id = envio_accesorios_items.envio_id and e.sede_destino_cod in (select private.app_sedes()))
  );
revoke insert, update, delete, truncate on public.envio_accesorios_items from authenticated, anon;
