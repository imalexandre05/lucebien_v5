-- 0090_anon_no_ejecuta_definer.sql — quien no inició sesión no llama a una función con permisos de dueño
--
-- QUÉ PASÓ. Supabase concede `execute` sobre las funciones nuevas del esquema `public` a los roles
-- `anon` y `authenticated` por privilegio por defecto. Las migraciones 0082 y 0087 crearon o
-- convirtieron siete funciones a `security definer` —que corren con los permisos de su dueño y por
-- lo tanto pasan por encima de la RLS— y esa concesión las dejó alcanzables **sin haber iniciado
-- sesión**, por `/rest/v1/rpc/<nombre>` con la clave anónima que viaja dentro de cada página del
-- ERP. Lo detectó el linter de Supabase (`anon_security_definer_function_executable`) después de
-- aplicarlas.
--
-- POR QUÉ NO HUBO DAÑO, Y POR QUÉ IGUAL SE CIERRA. Las siete tienen su guard adentro y ese guard
-- cuelga de `auth.uid()`, que para un anónimo es null: `solicitud_aprobar` y sus hermanas
-- responden `SIN_PERMISO`, y `valores_mis_puntajes` devuelve cero filas. O sea que hoy no filtra
-- nada. Pero una función `definer` accesible sin sesión es una puerta que sólo sostiene el guard
-- que tenga escrito adentro: el día que alguien agregue una rama o afloje una condición, ya no hay
-- una segunda cerradura detrás. La 0081 lo hizo bien desde el principio (revocó a `public`, `anon`
-- y `authenticated` y volvió a conceder sólo a quien corresponde); esto pone a las otras siete en
-- la misma línea.
--
-- LO QUE NO SE TOCA: las funciones de dispositivo (`dispositivo_registrar`, `dispositivo_estado`,
-- `dispositivo_autoaprobar`, `dispositivo_set_estado`). Ésas SÍ las llama alguien sin sesión: la
-- pantalla de login resuelve la sede del equipo antes de que nadie haya entrado. Quitarles `anon`
-- rompería el login.
--
-- Idempotente: `revoke` sobre un privilegio que ya no está no falla, y el `do` comprueba que cada
-- función exista antes de tocarla.

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    -- Escriben el circuito de solicitudes al almacén (0087).
    'public.solicitud_aprobar(uuid, text, jsonb)',
    'public.solicitud_rechazar(uuid, text)',
    'public.solicitud_entregar(uuid, text, jsonb)',
    'public.solicitud_confirmar(uuid, jsonb)',
    'public.solicitud_deshacer(uuid)',
    'public.solicitud_marcar_impreso(uuid, text)',
    -- Devuelve los puntajes que recibió quien pregunta en Valores 360° (0082).
    'public.valores_mis_puntajes(text)'
  ] loop
    if to_regprocedure(v_sig) is not null then
      execute format('revoke execute on function %s from anon', v_sig);
    end if;
  end loop;
end $$;
