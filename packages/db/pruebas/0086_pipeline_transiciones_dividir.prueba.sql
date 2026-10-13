-- Prueba de la migración 0086_pipeline_transiciones_dividir.sql
--
-- No comprueba que las funciones existan: comprueba que CUMPLAN lo que prometen
-- (docs/superpowers/specs/pipeline/2026-08-23-transiciones-y-division-design.md §6).
--
-- Ataca las dos mitades del hallazgo F22 —saltarse etapas y inventar una etapa— y la pérdida de
-- `necesita_compostura` al dividir un terno (F23). Todo tiene que FALLAR salvo el camino feliz, y
-- **cada falla se verifica por el CÓDIGO del error** (`TRANSICION:` para la lista blanca, el
-- SQLSTATE 23514 para el check de esquema), no sólo por "lanzó algo": una función que se rompe y
-- lanza un error distinto al esperado tiene que reportarse como hallazgo, no pasar por "ok" de
-- casualidad.
--
-- Importa que el rechazo sea LIMPIO: cuando la transición no se permite, la prenda no se mueve,
-- no queda historial y —sobre todo— **no se escribe en pipeline_puntos**, que es el primer
-- eslabón de la cadena del sueldo. Por eso cada ataque mide las tres cosas, no sólo la excepción.
--
-- SE DESCARTA SOLA. Todo el escenario vive dentro de un bloque que termina lanzando una excepción
-- con el resultado: eso aborta la transacción y no queda ni una fila. El "error" final ES la
-- salida esperada — se lee la línea RESULTADO.
--
-- OJO — mismo aviso que las pruebas de la 0073 y la 0080 (docs/aprendizajes.md, fila del 22-ago):
-- las tres RPC de esta migración son `security invoker` y arrancan con `if auth.uid() is null then
-- raise 'No autenticado'`. El editor SQL de Supabase (y cualquier `psql` sin sesión) corre con
-- `auth.uid()` en null, así que sin el `set_config('request.jwt.claims', ...)` de más abajo TODO
-- devuelve 'No autenticado' y la prueba no comprueba nada. Quien la corra tiene que dejar ese
-- bloque intacto, y correr el archivo ENTERO de una sola vez (el `set_config(..., true)` vale sólo
-- dentro de esta misma transacción).
--
-- Cómo se corre:  bash tools/probar-migracion.sh 0086
-- (o pegar el archivo entero en el SQL editor de Supabase, proyecto scilb, y leer el mensaje de
-- error P0001 que empieza con "RESULTADO 0086")

do $$
declare
  actor      uuid;
  sede       text;
  p_salto    uuid;  -- para el ataque de saltarse etapas
  p_invento  uuid;  -- para el ataque del destino inventado
  p_nulo     uuid;  -- para el destino nulo
  p_listo    uuid;  -- ya en 'listo': no se puede "avanzar" a enviado
  p_feliz    uuid;  -- recorre el camino completo
  p_check    uuid;  -- para el update directo contra el check de esquema
  p_terno    uuid;  -- terno con compostura, para dividir
  h_saco     uuid;
  h_pant     uuid;
  v_etapa    text;
  v_aprob    boolean;
  v_n        int;
  v_pares    text[][] := array[
                ['recepcion','lavado'], ['lavado','empatado'], ['empatado','refaccion'],
                ['refaccion','compostura'], ['compostura','planchado'],
                ['planchado','control_calidad'], ['control_calidad','listo']];
  v_i        int;
  r          text := '';
begin
  -- Desde la 0122 las RPC del pipeline son definer con portero (admin, almacén o sede propia):
  -- el actor tiene que ser alguien autorizado, no «el primer empleado activo».
  select id into actor from empleados where activo and rol = 'admin' order by id limit 1;
  if actor is null then raise exception 'La prueba necesita al menos un admin activo'; end if;

  select cod into sede from sedes order by cod limit 1;
  if sede is null then raise exception 'La prueba necesita al menos una sede'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', actor, 'role','authenticated')::text, true);
  if auth.uid() is null then
    raise exception 'No pude hacerme pasar por un empleado; la prueba no comprobaria nada';
  end if;

  -- ── Montaje: siete prendas de prueba, todas 'Terno completo' para que el peso no se divida ──
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-SALTO',   'Terno completo', 'refaccion',       sede, false) returning id into p_salto;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-INVENTO', 'Terno completo', 'refaccion',       sede, false) returning id into p_invento;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-NULO',    'Terno completo', 'refaccion',       sede, false) returning id into p_nulo;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-LISTO',   'Terno completo', 'listo',           sede, false) returning id into p_listo;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-FELIZ',   'Terno completo', 'recepcion',       sede, false) returning id into p_feliz;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-CHECK',   'Terno completo', 'recepcion',       sede, false) returning id into p_check;
  insert into prenda_pasada (codigo, tipo, etapa, sede_origen_cod, necesita_compostura)
    values ('QA-0086-TERNO',   'Terno completo', 'refaccion',       sede, true)  returning id into p_terno;

  -- ══ (A) Saltarse etapas: refaccion → listo. Es el ataque que se probó en vivo. ═════════════
  begin
    perform pipeline_avanzar(p_salto, 'listo');
    r := r || ' [FALLA] (A) refaccion → listo pasó: se saltea planchado y control de calidad;';
  exception when others then
    if sqlerrm like 'TRANSICION:%' then
      r := r || ' [ok] (A) refaccion → listo rechazado;';
    else
      r := r || format(' [FALLA] (A) rechazó con otro error, no con TRANSICION: %s;', sqlerrm);
    end if;
  end;
  -- El rechazo tiene que ser limpio: ni movimiento, ni aprobación, ni puntos, ni historial.
  select etapa, aprobada into v_etapa, v_aprob from prenda_pasada where id = p_salto;
  if v_etapa <> 'refaccion' or coalesce(v_aprob, false) then
    r := r || format(' [FALLA] (A) la prenda quedó en "%s" con aprobada=%s;', v_etapa, coalesce(v_aprob, false));
  else
    r := r || ' [ok] (A) la prenda no se movió y sigue sin aprobar;';
  end if;
  select count(*) into v_n from pipeline_puntos where pasada_id = p_salto;
  if v_n > 0 then
    r := r || format(' [FALLA] (A) el rechazo dejó %s fila(s) en pipeline_puntos;', v_n);
  else
    r := r || ' [ok] (A) sin puntos por un avance rechazado;';
  end if;
  select count(*) into v_n from prenda_historial where pasada_id = p_salto;
  if v_n > 0 then
    r := r || format(' [FALLA] (A) el rechazo dejó %s fila(s) de historial;', v_n);
  else
    r := r || ' [ok] (A) sin historial por un avance rechazado;';
  end if;

  -- ══ (B) Destino inventado: la prenda se saldría de las nueve columnas del tablero. ═════════
  begin
    perform pipeline_avanzar(p_invento, 'etapa_inventada_xyz');
    r := r || ' [FALLA] (B) un destino inventado pasó: la prenda sale del tablero;';
  exception when others then
    if sqlerrm like 'TRANSICION:%' then
      r := r || ' [ok] (B) destino inventado rechazado;';
    else
      r := r || format(' [FALLA] (B) rechazó con otro error, no con TRANSICION: %s;', sqlerrm);
    end if;
  end;

  -- ══ (F) Destino nulo — la server action lo filtra, la RPC no puede confiar en eso. ════════
  begin
    perform pipeline_avanzar(p_nulo, null);
    r := r || ' [FALLA] (F) un destino nulo pasó;';
  exception when others then
    if sqlerrm like 'TRANSICION:%' then
      r := r || ' [ok] (F) destino nulo rechazado;';
    else
      r := r || format(' [FALLA] (F) rechazó con otro error, no con TRANSICION: %s;', sqlerrm);
    end if;
  end;

  -- ══ (E) 'listo' no avanza a 'enviado': el envío es pipeline_enviar, que crea el envío y ════
  --        libera el activo de inventario. Colarlo por acá dejaría las dos cosas sin hacer.
  begin
    perform pipeline_avanzar(p_listo, 'enviado');
    r := r || ' [FALLA] (E) listo → enviado pasó por pipeline_avanzar, sin crear el envío;';
  exception when others then
    if sqlerrm like 'TRANSICION:%' then
      r := r || ' [ok] (E) listo → enviado rechazado;';
    else
      r := r || format(' [FALLA] (E) rechazó con otro error, no con TRANSICION: %s;', sqlerrm);
    end if;
  end;

  -- ══ (C)+(D) El camino feliz completo tiene que seguir andando entero. ══════════════════════
  for v_i in 1 .. array_length(v_pares, 1) loop
    begin
      perform pipeline_avanzar(p_feliz, v_pares[v_i][2]);
    exception when others then
      r := r || format(' [FALLA] (C) el camino feliz se cortó en %s → %s: %s;',
                       v_pares[v_i][1], v_pares[v_i][2], sqlerrm);
    end;
    select etapa into v_etapa from prenda_pasada where id = p_feliz;
    if v_etapa <> v_pares[v_i][2] then
      r := r || format(' [FALLA] (C) tras %s → %s la prenda quedó en "%s";',
                       v_pares[v_i][1], v_pares[v_i][2], v_etapa);
    end if;
  end loop;
  select etapa, aprobada into v_etapa, v_aprob from prenda_pasada where id = p_feliz;
  if v_etapa = 'listo' and coalesce(v_aprob, false) then
    r := r || ' [ok] (C) camino feliz completo: la prenda llegó a listo y quedó aprobada;';
  else
    r := r || format(' [FALLA] (D) el camino feliz terminó en "%s" con aprobada=%s;',
                     v_etapa, coalesce(v_aprob, false));
  end if;
  -- Siete avances válidos = siete filas de puntos (peso 1 por defecto si no hay config).
  select count(*) into v_n from pipeline_puntos where pasada_id = p_feliz;
  if v_n = array_length(v_pares, 1) then
    r := r || format(' [ok] (C) %s avances válidos dejaron %s filas de puntos;', v_n, v_n);
  else
    r := r || format(' [FALLA] (C) %s avances válidos dejaron %s filas de puntos;',
                     array_length(v_pares, 1), v_n);
  end if;

  -- ══ (G) El check de esquema: ni siquiera un update directo puede inventar una etapa. ═══════
  --        Es la capa que cubre a pipeline_deshacer, a pipeline_calificar y a PostgREST.
  begin
    update prenda_pasada set etapa = 'etapa_inventada_xyz' where id = p_check;
    r := r || ' [FALLA] (G) un update directo metió una etapa inventada: falta el check de esquema;';
    update prenda_pasada set etapa = 'recepcion' where id = p_check;
  exception when check_violation then
    r := r || ' [ok] (G) el check de esquema rechazó la etapa inventada;';
  when others then
    r := r || format(' [FALLA] (G) el update falló con otro error, no con check_violation: %s;', sqlerrm);
  end;

  -- ══ (H)+(I) Dividir un terno marcado: las hijas heredan la compostura y NO el activo. ══════
  begin
    perform pipeline_dividir(p_terno);
  exception when others then
    r := r || format(' [FALLA] (H) pipeline_dividir reventó: %s;', sqlerrm);
  end;

  select id into h_saco from prenda_pasada where codigo = 'QA-0086-TERNO-S';
  select id into h_pant from prenda_pasada where codigo = 'QA-0086-TERNO-P';
  if h_saco is null or h_pant is null then
    r := r || ' [FALLA] (H) la división no creó las dos piezas;';
  else
    select count(*) into v_n from prenda_pasada
      where id in (h_saco, h_pant) and necesita_compostura;
    if v_n = 2 then
      r := r || ' [ok] (H) las dos piezas heredaron necesita_compostura;';
    else
      r := r || format(' [FALLA] (H) sólo %s de 2 piezas heredaron necesita_compostura;', v_n);
    end if;

    -- Decisión 13 de la spec: NO se copia el activo. Si alguien lo copiara, pipeline_enviar
    -- dejaría el terno 'disponible' al despachar la primera pieza, con la otra en el taller.
    select count(*) into v_n from prenda_pasada
      where id in (h_saco, h_pant) and activo_id is not null;
    if v_n = 0 then
      r := r || ' [ok] (I) las piezas no heredan activo_id (decisión 13);';
    else
      r := r || format(' [FALLA] (I) %s pieza(s) heredaron activo_id: el envío de una liberaría el terno entero;', v_n);
    end if;

    -- Las piezas nacen en la etapa de la madre y la madre sale del tablero.
    select count(*) into v_n from prenda_pasada
      where id in (h_saco, h_pant) and etapa = 'refaccion';
    if v_n <> 2 then
      r := r || format(' [FALLA] (H) sólo %s de 2 piezas nacieron en la etapa de la madre;', v_n);
    end if;
    select etapa into v_etapa from prenda_pasada where id = p_terno;
    if v_etapa <> 'dividido' then
      r := r || format(' [FALLA] (H) la madre quedó en "%s" en vez de "dividido";', v_etapa);
    end if;
  end if;

  raise exception 'RESULTADO 0086 -->%', r;
end $$;
