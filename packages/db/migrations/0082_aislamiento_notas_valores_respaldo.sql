-- 0082_aislamiento_notas_valores_respaldo.sql — tres agujeros de lectura de datos de personas
--
-- Implementa docs/superpowers/specs/permisos/2026-08-23-escritura-directa-y-anonimato-design.md
-- §1 A-3, A-4 y A-5.
--
-- Los tres rompen el no-negociable 3 («toda lectura de datos de personas pasa por RLS») y los tres
-- se verificaron contra esta base antes de escribir una línea.
--
-- Idempotente: `drop policy if exists` antes de crear, `alter table if exists`, y las funciones son
-- `create or replace`.
--
-- Recordatorios que este repo pagó caros:
--   · Los helpers de RLS viven en el schema `private` desde la 0037. SIEMPRE con el prefijo.
--   · NUNCA `private.app_es_almacen()` sobre datos de personas: devuelve true para
--     'confeccionista' además de 'encargado_almacen' (0006_pipeline_rls.sql:22-25). Justamente eso
--     es lo que corrige la parte 2 de esta migración.
--   · Toda tabla con RLS necesita policy de LECTURA **y** de ESCRITURA.

-- ── 1) La tabla de respaldo que cualquiera podía leer sin sesión ─────────────────────────────
--
-- `asistencias_respaldo_0075` se creó a mano (no la crea ningún archivo del repositorio) y quedó
-- en el esquema `public`, que PostgREST expone, con RLS DESACTIVADA y con SELECT, INSERT, UPDATE,
-- DELETE y TRUNCATE concedidos a `anon` y a `authenticated`.
--
-- Comprobado: haciéndose pasar por `anon`, sin ninguna sesión, se leyeron sus 13 filas — fecha,
-- turno y horas de entrada y salida de cinco personas. Con la misma clave anónima, que viaja
-- dentro de cada página del ERP porque el navegador la necesita, se podían borrar.
--
-- Su gemela `asistencias_respaldo_20260821` sí tiene RLS activa y ninguna política, que es
-- exactamente lo que corresponde a un respaldo: nadie llega por PostgREST, y quien tenga que
-- mirarlo lo hace desde la consola de Supabase. Se deja a las dos en ese mismo estado.
do $$
begin
  if to_regclass('public.asistencias_respaldo_0075') is not null then
    execute 'alter table public.asistencias_respaldo_0075 enable row level security';
    execute 'revoke all on public.asistencias_respaldo_0075 from anon, authenticated';
  end if;
  if to_regclass('public.asistencias_respaldo_20260821') is not null then
    execute 'alter table public.asistencias_respaldo_20260821 enable row level security';
    execute 'revoke all on public.asistencias_respaldo_20260821 from anon, authenticated';
  end if;
end $$;

-- ── 2) La nota mensual la veía el rol de almacén ─────────────────────────────────────────────
--
-- `eval_select` seguía usando `private.app_es_almacen()`, que devuelve verdadero para
-- 'encargado_almacen' Y para 'confeccionista'. La 0067 ya había reemplazado ese helper por
-- `private.app_ve_datos_personas()` en las políticas de pagos, asistencias y valores; ésta quedó
-- sin actualizar.
--
-- Hoy no hay nadie con esos roles, así que no filtró nada todavía. El día que se contrate una
-- confeccionista para el pipeline —que es el uso previsto del rol— esa persona vería la nota de
-- las once. Se corrige antes de que exista el caso, no después.
drop policy if exists eval_select on public.evaluaciones_mensuales;
create policy eval_select on public.evaluaciones_mensuales
  for select
  using (
    private.app_es_admin()
    or private.app_ve_datos_personas()
    or empleado_id = auth.uid()
  );

-- ── 3) Valores 360° no era anónimo en la base ────────────────────────────────────────────────
--
-- La política dejaba leer la FILA COMPLETA a quien fuera `evaluado_id`, y la fila incluye
-- `evaluador_id`. El anonimato lo sostenía únicamente que la aplicación no seleccionara esa
-- columna: un `GET /rest/v1/evaluaciones_valores?evaluado_id=eq.<mi id>&select=*` devolvía quién
-- puntuó a quién. Comprobado suplantando a una colaboradora sin ningún permiso especial.
--
-- La pantalla promete por escrito lo contrario (app/valores/cliente.tsx: «Quien puntuó qué no se
-- muestra a nadie»), y el no-negociable 3 lo dice con estas palabras: «Nadie sabe quién lo puntuó
-- en Valores 360° salvo el administrador». En un equipo de once personas, saber quién te puntuó
-- identifica a la persona sin margen.
--
-- POR QUÉ NO SE RESUELVE CON PERMISOS POR COLUMNA. Quitarle `select (evaluador_id)` al rol
-- `authenticated` también se lo quita al administrador, que es el mismo rol de Postgres y sí
-- necesita esa columna para el seguimiento de cumplimiento. Y una columna revocada rompe hasta el
-- `where`, no sólo el `select`.
--
-- LO QUE SE HACE: la persona evaluada deja de tener acceso a esas FILAS, y recibe lo que le
-- corresponde —sus propios puntajes, sin autoría— por una función que devuelve exactamente eso y
-- nada más. Quien puntúa sigue viendo lo que escribió (ahí no hay anonimato que proteger: es suyo).
drop policy if exists eval_valores_select on public.evaluaciones_valores;
create policy eval_valores_select on public.evaluaciones_valores
  for select
  using (
    private.app_es_admin()
    or private.app_ve_datos_personas()
    or evaluador_id = auth.uid()
  );

-- Los puntajes que recibió quien pregunta, sin decir de quién vino cada uno.
--
-- `security definer` a propósito: la política de arriba ya no le deja ver esas filas, y esta
-- función es el único camino por el que debe verlas. Devuelve las seis notas y nada más — ni
-- `evaluador_id`, ni `id`, ni las fechas, que también permitirían ordenar y adivinar.
--
-- `auth.uid()` se lee acá adentro, no se recibe por parámetro: si fuera un parámetro, cualquiera
-- podría pedir el resumen de otra persona.
create or replace function public.valores_mis_puntajes(p_mes text)
returns table (
  integridad smallint,
  respeto    smallint,
  honestidad smallint,
  amabilidad smallint,
  relacion   smallint,
  actitud    smallint
)
language sql
stable
security definer
set search_path to ''
as $function$
  select v.integridad, v.respeto, v.honestidad, v.amabilidad, v.relacion, v.actitud
  from public.evaluaciones_valores v
  where v.evaluado_id = auth.uid()
    and v.mes = p_mes;
$function$;

revoke all on function public.valores_mis_puntajes(text) from public;
grant execute on function public.valores_mis_puntajes(text) to authenticated;
