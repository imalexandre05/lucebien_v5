-- 0054_pipeline_deshacer_division.sql — Fase 6 del plan de perfeccionamiento (tarea 6): reverso
-- de pipeline_dividir (0012). Hoy existe pipeline_deshacer (0010, revierte UN avance de etapa)
-- pero no hay forma de deshacer una división de terno mal hecha — la única salida era editar la
-- BD a mano. Solo función nueva (create or replace, idempotente); no toca schema ni RLS: las
-- policies `for all` de prenda_pasada/prenda_historial/pipeline_puntos (0006_pipeline_rls.sql) ya
-- cubren DELETE con el mismo filtro que INSERT/UPDATE, así que no hace falta ninguna policy nueva.
--
-- Regla (según el plan): borra las pasadas hijas -S/-P SOLO SI NINGUNA avanzó de etapa desde que
-- se creó, y limpia dividida/dividida_en de la madre. "Avanzó de etapa" se verifica por historial
-- (existe una fila con etapa_anterior IS NOT NULL para esa hija) en vez de comparar la etapa
-- actual contra la de nacimiento: pipeline_avanzar/pipeline_rechazar/pipeline_deshacer SIEMPRE
-- insertan con etapa_anterior no nulo, así que "nunca hubo una fila así" es exactamente "nunca se
-- tocó" — más robusto que comparar etapas (cubre el caso avanzó-y-lo-deshicieron-de-vuelta, que
-- con solo comparar etapas parecería "no se movió" pero sí dejó puntos/historial a medias).
--
-- Defensivo por diseño (lección explícita del plan): TODAS las validaciones van ANTES de borrar
-- nada. Si algo no cuadra (madre no dividida, dividida_en corrupto, hija faltante, hija que sí
-- avanzó), la función hace `raise exception` con mensaje claro y no toca una sola fila.
create or replace function pipeline_deshacer_division(p_id uuid)
  returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_actor          uuid := auth.uid();
  v_pr             prenda_pasada;
  v_hijos          uuid[];
  v_hijo_id        uuid;
  v_hijo_etapa     text;
  v_avanzo         boolean;
  v_etapa_original text;
begin
  if v_actor is null then raise exception 'No autenticado'; end if;

  select * into v_pr from prenda_pasada where id = p_id;
  if not found then raise exception 'Prenda no encontrada'; end if;
  if not v_pr.dividida or v_pr.etapa <> 'dividido' then
    raise exception 'Esta prenda no está dividida — nada que deshacer';
  end if;
  if v_pr.dividida_en is null or trim(v_pr.dividida_en) = '' then
    raise exception 'La prenda está marcada como dividida pero no tiene hijas registradas (dividida_en vacío) — revisar a mano';
  end if;

  begin
    select array_agg(x::uuid) into v_hijos from unnest(string_to_array(v_pr.dividida_en, ',')) x;
  exception when invalid_text_representation then
    raise exception 'dividida_en con formato inesperado: %', v_pr.dividida_en;
  end;
  if array_length(v_hijos, 1) is distinct from 2 then
    raise exception 'Se esperaban 2 hijas (saco+pantalón) en dividida_en, hay %: %',
      coalesce(array_length(v_hijos, 1), 0), v_pr.dividida_en;
  end if;

  -- El historial de la propia madre trae la etapa en la que estaba ANTES de dividir (la que
  -- deben tener sus dos hijas ahora mismo si ninguna avanzó) — más confiable que asumir un valor.
  select etapa_anterior into v_etapa_original
    from prenda_historial
    where pasada_id = p_id and etapa_nueva = 'dividido'
    order by fecha desc limit 1;
  if v_etapa_original is null then
    raise exception 'No se encontró en el historial la etapa previa a la división — no se puede restaurar la madre de forma segura';
  end if;

  -- 1) Validar CADA hija ANTES de borrar nada: que exista, que nunca haya avanzado de etapa
  --    (ver comentario de arriba) y que su etapa actual siga siendo la de nacimiento.
  foreach v_hijo_id in array v_hijos loop
    select etapa into v_hijo_etapa from prenda_pasada where id = v_hijo_id;
    if not found then
      raise exception 'La pieza % no existe — no se puede deshacer la división de forma segura', v_hijo_id;
    end if;

    select exists (
      select 1 from prenda_historial where pasada_id = v_hijo_id and etapa_anterior is not null
    ) into v_avanzo;
    if v_avanzo then
      raise exception 'No se puede deshacer: al menos una pieza (saco o pantalón) ya avanzó de etapa';
    end if;

    if v_hijo_etapa is distinct from v_etapa_original then
      raise exception 'No se puede deshacer: la pieza % está en una etapa distinta a la original (%)',
        v_hijo_id, v_etapa_original;
    end if;
  end loop;

  -- 2) Todo validado — recién ahora se borra. pipeline_puntos primero (defensivo: el chequeo de
  --    arriba implica que no debería haber filas, "sin puntos por dividir" ya lo garantiza 0012),
  --    después las hijas (prenda_historial cae por ON DELETE CASCADE, ver 0001_init.sql).
  delete from pipeline_puntos where pasada_id = any(v_hijos);
  delete from prenda_pasada where id = any(v_hijos);

  update prenda_pasada set
    dividida = false, dividida_en = null, etapa = v_etapa_original, fecha_actualizado = now()
  where id = p_id;
  insert into prenda_historial (pasada_id, etapa_anterior, etapa_nueva, empleado_id, obs)
    values (p_id, 'dividido', v_etapa_original, v_actor, 'Deshacer división: vuelve a ' || v_etapa_original);
end;
$$;
revoke execute on function pipeline_deshacer_division(uuid) from public;
grant execute on function pipeline_deshacer_division(uuid) to authenticated;

-- Verificación (correr manualmente tras aplicar, contra una prenda de prueba):
--   select pipeline_dividir('<id-terno>');                    -- crea -S/-P
--   select pipeline_deshacer_division('<id-terno>');          -- sin avances: OK, vuelve al tablero
--   select etapa, dividida, dividida_en from prenda_pasada where id = '<id-terno>';
--   -- esperado: etapa = la que tenía antes de dividir, dividida = false, dividida_en = null
--   select count(*) from prenda_pasada where codigo in ('<id-terno>-S', '<id-terno>-P');
--   -- esperado: 0 (las hijas ya no existen)
--   -- caso de rechazo: dividir de nuevo, avanzar una hija con pipeline_avanzar, y confirmar que
--   -- pipeline_deshacer_division revienta con 'ya avanzó de etapa' sin borrar ninguna fila.
