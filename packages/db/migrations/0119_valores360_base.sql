-- 0119_valores360_base.sql — Valores 360°: cerrar la base. Un no-administrador deja de leer
-- `evaluaciones_mensuales` directo (lo hace por RPC, sin lo que permita despejar un voto) y los
-- votos sólo se aceptan para el mes en curso y con la ventana habilitada.
--
-- Implementa docs/superpowers/specs/evaluaciones/2026-10-06-valores360-base-design.md §3.
-- Decisión del dueño: cerrar TODAS las vías para deducir quién votó. Ticket
-- imalexandre05/lucebien-tablero#45. Va encima de 0116 (PR #53).
--
-- Idempotente: `create or replace` para las funciones, `drop policy if exists` + `create policy`.
--
-- NO APLICADA a ninguna base. La aplica Alexander, ANTES de desplegar la app (la app nueva exige las
-- dos funciones). Prueba: packages/db/pruebas/0119_valores360_base.prueba.sql
--
-- No toca: la nota que se calcula y se paga, `private.evaluacion_componentes_datos`, ni la
-- liquidación (son `security definer`: el cambio de policy no las afecta). El administrador no cambia.

-- ── 1) Ayudantes de la policy de voto ───────────────────────────────────────────────────────
-- Una policy se evalúa con el rol de quien consulta, así que sus funciones necesitan `execute` para
-- `authenticated` (como `private.app_es_admin()`). `valores_mes_actual()` (0116) quedó sin ese permiso
-- porque sólo la usaban funciones `security definer`: se lo damos; es sólo una fecha.
grant execute on function private.valores_mes_actual() to authenticated;

-- ¿Está abierta la ventana de envío AHORA (hora Perú)? Misma regla que `estadoVentanaValores` /
-- `puedeEvaluarValoresHoy` de la app (migración 0058, claves valores_habilitado/_modo/_dia_inicio/_dia_fin),
-- con los mismos respaldos: habilitado salvo 'false'; modo 'siempre' salvo 'ventana'; día de 1 a 31
-- (un valor ausente o roto cae a 1 y 31, igual que `Number(x) || 1` / `|| 31` en la app). Si el inicio
-- es mayor que el fin se intercambian. El default de config (habilitado + siempre) deja todo abierto.
create or replace function private.valores_ventana_abierta()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  with c as (
    select
      coalesce((select btrim(x.valor) from public.config x where x.clave = 'valores_habilitado'), 'true') as habilitado,
      coalesce((select btrim(x.valor) from public.config x where x.clave = 'valores_modo'), 'siempre')     as modo,
      coalesce((select case when x.valor ~ '^\s*[0-9]{1,2}\s*$' and btrim(x.valor)::int >= 1 then btrim(x.valor)::int end
                  from public.config x where x.clave = 'valores_dia_inicio'), 1)  as d1,
      coalesce((select case when x.valor ~ '^\s*[0-9]{1,2}\s*$' and btrim(x.valor)::int >= 1 then btrim(x.valor)::int end
                  from public.config x where x.clave = 'valores_dia_fin'), 31)    as d2
  )
  select c.habilitado <> 'false'
         and (c.modo <> 'ventana'
              or extract(day from (now() at time zone 'America/Lima'))::int between least(c.d1, c.d2) and greatest(c.d1, c.d2))
  from c
$$;

revoke all on function private.valores_ventana_abierta() from public, anon;
grant execute on function private.valores_ventana_abierta() to authenticated;

-- ── 2) Votos: sólo el mes en curso y con la ventana abierta ─────────────────────────────────
-- Antes (0057) la policy sólo pedía `evaluador_id = auth.uid()`: por la API se podía votar en un mes
-- ya cerrado —moviendo un resultado publicado— o fuera de la ventana. El administrador conserva lo
-- que tenía (votar y moderar en cualquier mes).
drop policy if exists eval_valores_insert on public.evaluaciones_valores;
create policy eval_valores_insert on public.evaluaciones_valores
  for insert
  with check (
    evaluador_id = auth.uid()
    and evaluado_id <> auth.uid()
    and (
      private.app_es_admin()
      or (mes = private.valores_mes_actual() and private.valores_ventana_abierta())
    )
  );

-- UPDATE: `using` mira la fila que ya existe (no se corrige un voto de un mes cerrado) y `with check`
-- la fila que queda (no se puede mover un voto a otro mes ni cambiar a quién va).
drop policy if exists eval_valores_update on public.evaluaciones_valores;
create policy eval_valores_update on public.evaluaciones_valores
  for update
  using (
    private.app_es_admin()
    or (
      evaluador_id = auth.uid()
      and mes = private.valores_mes_actual()
      and private.valores_ventana_abierta()
    )
  )
  with check (
    private.app_es_admin()
    or (
      evaluador_id = auth.uid()
      and evaluado_id <> auth.uid()
      and mes = private.valores_mes_actual()
      and private.valores_ventana_abierta()
    )
  );

-- ── 3) Lectura de evaluaciones_mensuales: sólo el administrador, directo ────────────────────
-- Se quitan `empleado_id = auth.uid()` y `app_ve_datos_personas()` (0082). Con pocas evaluaciones,
-- `componentes.valores` es el voto de una persona; y en una fila `ponderado` (spec §2) `nota_final` +
-- los demás componentes + los pesos permiten despejarlo. Lo propio y lo ajeno pasan por las funciones.
drop policy if exists eval_select on public.evaluaciones_mensuales;
create policy eval_select on public.evaluaciones_mensuales
  for select
  using (private.app_es_admin());

-- ── 4) La regla única de publicación, en un solo lugar ──────────────────────────────────────
-- Una evaluación tiene Valores 360° PÚBLICO cuando su mes ya cerró (mes < mes actual, hora Perú), el mes
-- tiene hoy >= `valores_min_evaluaciones` votos (la misma regla que `valores_mis_puntajes`, 0116) Y la foto
-- guardada al evaluar (`componentes.valores`) se calculó con >= ese mínimo (`componentes.valoresCantidad`,
-- igual que `evaluacion_componentes`, 0116). Sin lo último, una foto tomada EN VIVO con un solo voto se
-- publicaría al cerrar el mes aunque después lleguen más votos. Una foto sin cantidad nunca es pública.
-- Si no es público:
--   · `componentes` sale SIN `valores` ni `valoresCantidad`;
--   · en una fila `metodo = 'ponderado'`, `nota_final` sale null («en cálculo»): con la fórmula
--     Σ componente × peso − descuento + bono se despejaría `valores`. Las filas `puntos` (todas las
--     evaluaciones nuevas) calculan la nota sólo con puntos: no dependen de `valores` y se ven siempre.
-- La cantidad de votos de un mes no público NUNCA sale de acá («hay 2» ya es información).
--
-- `p_solo_propias`: true = sólo las de quien llama; false = además las de otras personas SI quien llama
-- tiene `datos_personas` (permiso que ya leía notas ajenas en la policy anterior). `auth.uid()` se lee
-- acá adentro: como parámetro, cualquiera pediría la evaluación de otra persona.
create or replace function private.evaluaciones_mensuales_publicas(p_solo_propias boolean, p_mes text)
returns table (
  id               uuid,
  empleado_id      uuid,
  mes              text,
  nota_final       numeric,
  pesos_usados     jsonb,
  ciclo_desde      date,
  ciclo_hasta      date,
  created_at       timestamptz,
  componentes      jsonb,
  metodo           text,
  puntos_total     numeric,
  valores_publicos boolean
)
language sql
stable
security definer
set search_path to ''
as $$
  select e.id,
         e.empleado_id,
         e.mes,
         case when p.publico or e.metodo <> 'ponderado' then e.nota_final end,
         e.pesos_usados,
         e.ciclo_desde,
         e.ciclo_hasta,
         e.created_at,
         case when p.publico then e.componentes else e.componentes - 'valores' - 'valoresCantidad' end,
         e.metodo,
         e.puntos_total,
         p.publico
  from public.evaluaciones_mensuales e
  cross join lateral (
    select e.mes < private.valores_mes_actual()
           and (select count(*) from public.evaluaciones_valores v
                 where v.evaluado_id = e.empleado_id and v.mes = e.mes) >= private.valores_min_evaluaciones()
           and coalesce(case when e.componentes ->> 'valoresCantidad' ~ '^[0-9]{1,6}$'
                             then (e.componentes ->> 'valoresCantidad')::int end, 0) >= private.valores_min_evaluaciones()
           as publico
  ) p
  where (e.empleado_id = auth.uid() or (not p_solo_propias and private.app_ve_datos_personas()))
    and (p_mes is null or e.mes = p_mes)
  order by e.created_at desc
$$;

revoke all on function private.evaluaciones_mensuales_publicas(boolean, text) from public, anon, authenticated;

-- ── 5) Las dos funciones públicas ───────────────────────────────────────────────────────────
-- `mi_evaluacion_mensual(p_mes)`: las evaluaciones de quien llama, la más reciente primero.
create or replace function public.mi_evaluacion_mensual(p_mes text default null)
returns table (
  id               uuid,
  empleado_id      uuid,
  mes              text,
  nota_final       numeric,
  pesos_usados     jsonb,
  ciclo_desde      date,
  ciclo_hasta      date,
  created_at       timestamptz,
  componentes      jsonb,
  metodo           text,
  puntos_total     numeric,
  valores_publicos boolean
)
language sql
stable
security definer
set search_path to ''
as $$ select * from private.evaluaciones_mensuales_publicas(true, p_mes) $$;

-- `evaluaciones_mensuales_visibles()`: las propias y, con `datos_personas`, las de otras personas, con
-- la misma regla. Existe para no quitarle a un encargado una pantalla que hoy usa; si el dueño prefiere
-- que los encargados dejen de ver notas ajenas, se quita la segunda mitad del `where` de la función
-- privada y listo.
create or replace function public.evaluaciones_mensuales_visibles()
returns table (
  id               uuid,
  empleado_id      uuid,
  mes              text,
  nota_final       numeric,
  pesos_usados     jsonb,
  ciclo_desde      date,
  ciclo_hasta      date,
  created_at       timestamptz,
  componentes      jsonb,
  metodo           text,
  puntos_total     numeric,
  valores_publicos boolean
)
language sql
stable
security definer
set search_path to ''
as $$ select * from private.evaluaciones_mensuales_publicas(false, null) $$;

revoke all on function public.mi_evaluacion_mensual(text)          from public;
revoke execute on function public.mi_evaluacion_mensual(text)      from anon;
grant  execute on function public.mi_evaluacion_mensual(text)      to authenticated;
revoke all on function public.evaluaciones_mensuales_visibles()    from public;
revoke execute on function public.evaluaciones_mensuales_visibles() from anon;
grant  execute on function public.evaluaciones_mensuales_visibles() to authenticated;
