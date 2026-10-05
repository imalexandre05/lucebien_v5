-- 0116_valores360_anonimato.sql — Valores 360°: sólo el administrador ve quién puntuó a quién.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-10-05-valores360-anonimato-design.md §2 y §6.
-- Decisión del dueño (05-oct-2026): «sólo el administrador puede ver quién puntuó a quién».
-- Ticket imalexandre05/lucebien-tablero#40.
--
-- Idempotente: `drop policy if exists` + `create policy`; `drop function if exists` + `create`
-- (cambia el tipo de retorno, así que `create or replace` no alcanza); el `insert` de config lleva
-- `on conflict do nothing`.
--
-- NO APLICADA a ninguna base. La aplica Alexander. Prueba: packages/db/pruebas/0116_valores360_anonimato.prueba.sql

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

-- ── 3) Ayudantes: mes actual (hora Perú) y mínimo ──────────────────────────────────────────
-- Las fechas son hora Perú (UTC−5) y el servidor corre en UTC: el «mes actual» se calcula con
-- `America/Lima`, no con `now()` a secas (no-negociable 4).
-- El mínimo se lee de config; si falta o no es un entero de 1 a 3 dígitos y >= 1 cae a 3 — NUNCA a 0,
-- que apagaría el anonimato en silencio. Una sola definición, usada por la función y por el envoltorio.
create or replace function private.valores_mes_actual()
returns text
language sql
stable
set search_path to ''
as $$ select to_char(now() at time zone 'America/Lima', 'YYYY-MM') $$;

create or replace function private.valores_min_evaluaciones()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select case when c.valor ~ '^\s*[0-9]{1,3}\s*$' and btrim(c.valor)::int >= 1
                 then btrim(c.valor)::int end
       from public.config c where c.clave = 'valores_min_evaluaciones'),
    3)
$$;

revoke all on function private.valores_mes_actual()        from public, anon, authenticated;
revoke all on function private.valores_min_evaluaciones()  from public, anon, authenticated;

-- ── 4) La función: sólo promedios, sólo de un mes CERRADO y con mínimo ──────────────────────
-- Antes devolvía una fila por evaluador (el vector de seis notas de cada uno): en un equipo de once,
-- con una o dos evaluaciones eso identifica a quien puntuó. Ahora devuelve A LO SUMO UNA fila con el
-- mes, la cantidad y el promedio por valor, y NADA si ningún mes cerrado alcanza el mínimo (ni
-- siquiera la cantidad: «hay 2» ya es información).
--
-- REGLA ÚNICA (spec §6, decisión del dueño): lo que ve un no-administrador es el último mes YA
-- CERRADO (mes < mes actual, hora Perú) que cumpla el mínimo; nunca en vivo. En vivo, dos lecturas
-- consecutivas restadas despejan cada voto nuevo; un mes cerrado no cambia. `p_mes` es opcional: si
-- se pasa, sólo se considera ese mes (y sigue exigiéndose cerrado y con mínimo).
--
-- `security definer` a propósito: la policy ya no deja al evaluado ver esas filas. `auth.uid()` se
-- lee acá adentro; si fuera parámetro, cualquiera pediría el resumen de otra persona.
-- Cambia el tipo de retorno y se vuelve opcional el argumento: se borra la versión anterior.
drop function if exists public.valores_mis_puntajes(text);
create function public.valores_mis_puntajes(p_mes text default null)
returns table (
  mes        text,
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
  select v.mes,
         count(*)::int,
         round(avg(v.integridad), 2),
         round(avg(v.respeto), 2),
         round(avg(v.honestidad), 2),
         round(avg(v.amabilidad), 2),
         round(avg(v.relacion), 2),
         round(avg(v.actitud), 2)
  from public.evaluaciones_valores v
  where v.evaluado_id = auth.uid()
    and v.mes < private.valores_mes_actual()
    and (p_mes is null or v.mes = p_mes)
  group by v.mes
  having count(*) >= private.valores_min_evaluaciones()
  order by v.mes desc
  limit 1;
$function$;

revoke all on function public.valores_mis_puntajes(text) from public;
revoke execute on function public.valores_mis_puntajes(text) from anon;   -- como 0090
grant execute on function public.valores_mis_puntajes(text) to authenticated;

-- ── 5) evaluacion_componentes llamada por uno mismo: la misma regla ─────────────────────────
-- El envoltorio público (0067) deja pasar «administrador o la propia persona». El cuerpo
-- (`private.evaluacion_componentes_datos`, 0091/0095, NO se toca: alimenta la evaluación del
-- administrador y el pago) devuelve `valores` y `valoresCantidad` del mes de `p_desde`, en vivo y sin
-- mínimo. Por eso la regla vive acá, en el único lugar que sabe quién pregunta: si NO es
-- administrador, `valores` y `valoresCantidad` salen en null salvo que el mes de `p_desde` esté
-- cerrado y alcance el mínimo. Para el administrador no cambia nada.
create or replace function public.evaluacion_componentes(p_empleado uuid, p_desde date, p_hasta date)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_res jsonb;
begin
  -- El administrador consulta a cualquiera; cualquier otro, sólo a sí mismo.
  if not (private.app_es_admin() or p_empleado = auth.uid()) then
    raise exception 'PERMISO:no puede consultar los componentes de evaluación de otra persona';
  end if;
  v_res := private.evaluacion_componentes_datos(p_empleado, p_desde, p_hasta);
  if private.app_es_admin() then
    return v_res;
  end if;
  if to_char(p_desde, 'YYYY-MM') < private.valores_mes_actual()
     and coalesce((v_res ->> 'valoresCantidad')::int, 0) >= private.valores_min_evaluaciones() then
    return v_res;
  end if;
  return v_res || jsonb_build_object('valores', null, 'valoresCantidad', null);
end;
$$;

revoke execute on function public.evaluacion_componentes(uuid, date, date) from public, anon;
grant  execute on function public.evaluacion_componentes(uuid, date, date) to authenticated;
