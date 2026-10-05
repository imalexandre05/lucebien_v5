-- 0112_valores360_anonimato.sql — Valores 360°: sólo el administrador ve quién puntuó a quién.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-10-05-valores360-anonimato-design.md §2.
-- Decisión del dueño (05-oct-2026): «sólo el administrador puede ver quién puntuó a quién».
-- Ticket imalexandre05/lucebien-tablero#40.
--
-- Idempotente: `drop policy if exists` + `create policy`; `drop function if exists` + `create`
-- (cambia el tipo de retorno, así que `create or replace` no alcanza); el `insert` de config lleva
-- `on conflict do nothing`.
--
-- NO APLICADA a ninguna base. La aplica Alexander. Prueba: packages/db/pruebas/0112_valores360_anonimato.prueba.sql

-- ── 1) La policy: se quita `app_ve_datos_personas()` ────────────────────────────────────────
-- Con ese término, un encargado con permiso `datos_personas` leía la fila completa, `evaluador_id`
-- incluido. Ahora la lee el administrador, y cada quien ve lo que ÉL envió (para no re-evaluar a
-- quien ya evaluó este mes). Quien es evaluado no ve las filas que lo nombran.
drop policy if exists eval_valores_select on public.evaluaciones_valores;
create policy eval_valores_select on public.evaluaciones_valores
  for select
  using (
    private.app_es_admin()
    or evaluador_id = auth.uid()
  );

-- ── 2) Mínimo de evaluaciones para mostrar un resultado ─────────────────────────────────────
-- DEFAULT INVENTADO, no confirmado por el dueño (no-negociable 5): 3, el menor número con el que
-- no se deduce por descarte el voto de una persona. Editable por el administrador en
-- /configuracion (sección Valores 360°). Anotado en docs/pendientes-negocio.md.
insert into public.config (clave, valor) values
  ('valores_min_evaluaciones', '3')   -- PROVISIONAL: mínimo de evaluaciones recibidas para ver el resultado
on conflict (clave) do nothing;

-- ── 3) La función: sólo promedios, sólo si hay suficientes ──────────────────────────────────
-- Antes devolvía una fila por evaluador (el vector de seis notas de cada uno): en un equipo de once,
-- con una o dos evaluaciones eso identifica a quien puntuó. Ahora devuelve A LO SUMO UNA fila con la
-- cantidad y el promedio por valor, y NADA si hay menos del mínimo (ni siquiera la cantidad: «hay 2»
-- ya es información).
--
-- `security definer` a propósito: la policy ya no deja al evaluado ver esas filas. `auth.uid()` se
-- lee acá adentro; si fuera parámetro, cualquiera pediría el resumen de otra persona.
-- El mínimo se lee de config; si falta o no es un entero >= 1 cae a 3 — NUNCA a 0, que apagaría el
-- anonimato en silencio. Redondeo a 2 decimales, igual que promediosPorValor() del core.
drop function if exists public.valores_mis_puntajes(text);
create function public.valores_mis_puntajes(p_mes text)
returns table (
  cantidad   integer,
  integridad numeric,
  respeto    numeric,
  honestidad numeric,
  amabilidad numeric,
  relacion   numeric,
  actitud    numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with minimo as (
    select coalesce(
      (select case when c.valor ~ '^\s*[0-9]+\s*$' and btrim(c.valor)::int >= 1
                   then btrim(c.valor)::int end
         from public.config c where c.clave = 'valores_min_evaluaciones'),
      3) as n
  )
  select count(*)::int,
         round(avg(v.integridad), 2),
         round(avg(v.respeto), 2),
         round(avg(v.honestidad), 2),
         round(avg(v.amabilidad), 2),
         round(avg(v.relacion), 2),
         round(avg(v.actitud), 2)
  from public.evaluaciones_valores v
  where v.evaluado_id = auth.uid()
    and v.mes = p_mes
  having count(*) >= (select n from minimo);
$function$;

revoke all on function public.valores_mis_puntajes(text) from public;
revoke execute on function public.valores_mis_puntajes(text) from anon;   -- como 0090
grant execute on function public.valores_mis_puntajes(text) to authenticated;
