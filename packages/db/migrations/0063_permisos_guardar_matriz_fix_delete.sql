-- 0063_permisos_guardar_matriz_fix_delete.sql — Fase 10 del plan de perfeccionamiento, punto 4
-- ("Opera caja"): fix de un bug real encontrado al probar el toggle nuevo contra la base real.
--
-- `permisos_guardar_matriz` (migración 0050) hace `delete from permisos_modulos;` SIN WHERE.
-- Ejecutado como `postgres` (conexión directa) esto funciona; ejecutado por PostgREST/RPC como el
-- rol `authenticated` (que es como lo llama SIEMPRE la aplicación — la función es `security
-- invoker`, corre con los privilegios del que llama) Supabase lo bloquea con el error real
-- observado: "DELETE requires a WHERE clause". Esto significa que el botón "Guardar cambios" de
-- /configuracion/permisos probablemente NUNCA funcionó desde la app en producción — la fila
-- `pos_cobro` que ya existía para `encargado_tienda` se sembró por otra vía (SQL directo), no por
-- este botón. Se descubrió al conectar `togglePosCobro()` (Fase 10) a esta misma RPC.
--
-- Fix: `delete from permisos_modulos where true;` — sintácticamente tiene WHERE, funcionalmente
-- borra las mismas filas que antes (todas). Mismo criterio que usaría cualquier guardia de
-- "protección contra DELETE sin filtro": exigir la forma, no cambiar el efecto.

create or replace function permisos_guardar_matriz(p_filas jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not private.app_es_admin() then
    raise exception 'Solo administradores pueden editar permisos';
  end if;

  delete from permisos_modulos where true;
  insert into permisos_modulos (rol, modulo, acciones)
  select
    f->>'rol',
    f->>'modulo',
    coalesce((select array_agg(x) from jsonb_array_elements_text(f->'acciones') x), '{}')
  from jsonb_array_elements(p_filas) f
  where coalesce(f->>'rol', '') <> '' and coalesce(f->>'modulo', '') <> '';
end;
$$;
revoke execute on function permisos_guardar_matriz(jsonb) from public;
grant execute on function permisos_guardar_matriz(jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr manualmente tras aplicar, autenticado como un admin real vía la app, NO
-- por conexión directa con el rol postgres — ese camino nunca mostró el bug):
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   1) /empleados → editar un colaborador con rol NO admin/dueño → togglear "Opera caja" → debe
--      cambiar de "No opera caja" a "Sí, opera caja" sin error.
--   2) /configuracion/permisos → cambiar cualquier casilla → "Guardar cambios" → "Guardado ✓".
