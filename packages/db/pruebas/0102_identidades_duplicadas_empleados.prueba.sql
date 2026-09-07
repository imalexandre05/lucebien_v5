-- Prueba de la migración 0102_identidades_duplicadas_empleados.sql
--
-- A diferencia de las pruebas anteriores, esta migración no crea una policy ni una RPC reusable:
-- es un arreglo puntual de tres personas reales. No tiene sentido montar un escenario sintético
-- de "Mary" y "Marylin" de mentira — el problema y su corrección son sobre las filas reales. Esta
-- prueba es por eso de VERIFICACIÓN, no de ataque: se corre DESPUÉS de aplicar la 0102 contra
-- scilb, es de sólo lectura (no escribe nada, no necesita autodescartarse) y confirma, por
-- síntoma exacto, las promesas de la spec §6:
--
--   · cero filas, en cualquiera de las DIEZ columnas que la migración puede tocar, siguen
--     apuntando al id de Mary, Yessi o Elthon (las tres fusiones quedaron completas, no a medias
--     — comprobado contra los tres pares por igual, no sólo contra los que tenían datos en la
--     medición del 07-sep: el subagente verificador encontró que una prueba anterior de este
--     mismo archivo sólo miraba 5 de las 10 columnas para Mary/Yessi y ninguna para Elthon, lo que
--     habría dejado pasar en silencio cualquier fila nueva que Elthon hubiera generado entre la
--     medición y el apply);
--   · Marylin/Yessica/Elthom —las filas que se conservan— suman al menos los puntos y reportes
--     que antes estaban partidos (no se perdió historia en el camino);
--   · la canónica de cada par tiene ahora la UNIÓN de sedes de las dos filas (no perdió ninguna
--     sede que la vieja tuviera y ella no);
--   · Mary, Yessi y Elthon quedan `activo = false` (no se borraron, y tampoco compiten como
--     empleados activos en ningún listado ni en el conteo de la Fase 1).
--
-- Cómo se corre: pegar el archivo entero en el SQL editor de Supabase (proyecto scilb) después
-- de aplicar la 0102, o bash tools/probar-migracion.sh 0102 con psql. Lee la línea RESULTADO.

do $$
declare
  v_mary_id    uuid; v_marylin_id uuid;
  v_yessi_id   uuid; v_yessica_id uuid;
  v_elthon_id  uuid; v_elthom_id  uuid;
  v_huerfanos  int;
  v_activos    int;
  v_puntos_marylin int; v_puntos_yessica int;
  v_reportes_elthom int;
  v_sedes_faltantes int;
  v_fallas text := '';
begin
  select id into v_mary_id    from empleados where cod = '7158';
  select id into v_marylin_id from empleados where cod = '7073';
  select id into v_yessi_id   from empleados where cod = '8888';
  select id into v_yessica_id from empleados where cod = '6510';
  select id into v_elthon_id  from empleados where cod = '1021';
  select id into v_elthom_id  from empleados where cod = '6660';

  -- 1) Cero filas huérfanas en las DIEZ columnas, contra las TRES filas viejas por igual.
  select
      (select count(*) from pipeline_puntos      where empleado_id       in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from reportes             where encargado_id      in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from reportes             where evaluador_id      in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from reporte_trabajadores where empleado_id       in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from prenda_historial     where empleado_id       in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from prenda_pasada        where lavador_id        in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from prenda_pasada        where planchador_id     in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from prenda_calificacion  where calificador_id    in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from envios_prendas       where responsable_id    in (v_mary_id, v_yessi_id, v_elthon_id))
    + (select count(*) from reporte_extras       where registrado_por_id in (v_mary_id, v_yessi_id, v_elthon_id))
    into v_huerfanos;

  if v_huerfanos <> 0 then
    v_fallas := v_fallas || format(E'\n  · quedaron %s filas huérfanas apuntando a una fila vieja (alguna de las diez columnas)', v_huerfanos);
  end if;

  -- 2) Las tres filas viejas quedaron inactivas.
  select count(*) into v_activos from empleados
    where id in (v_mary_id, v_yessi_id, v_elthon_id) and activo;
  if v_activos <> 0 then
    v_fallas := v_fallas || format(E'\n  · %s de las tres filas viejas sigue activa', v_activos);
  end if;

  -- 3) empleado_tiendas: la canónica tiene ahora la unión de sedes (ninguna sede de la vieja
  -- quedó sin copiar). Medido contra scilb el 07-sep-2026: Yessi/Elthon tenían TR y
  -- Yessica/Elthom no la tenían todavía antes de aplicar.
  select
      (select count(*) from empleado_tiendas v where v.empleado_id = v_mary_id
        and not exists (select 1 from empleado_tiendas c where c.empleado_id = v_marylin_id and c.sede_cod = v.sede_cod))
    + (select count(*) from empleado_tiendas v where v.empleado_id = v_yessi_id
        and not exists (select 1 from empleado_tiendas c where c.empleado_id = v_yessica_id and c.sede_cod = v.sede_cod))
    + (select count(*) from empleado_tiendas v where v.empleado_id = v_elthon_id
        and not exists (select 1 from empleado_tiendas c where c.empleado_id = v_elthom_id and c.sede_cod = v.sede_cod))
    into v_sedes_faltantes;
  if v_sedes_faltantes <> 0 then
    v_fallas := v_fallas || format(E'\n  · %s sedes de una fila vieja no se copiaron a la canónica', v_sedes_faltantes);
  end if;

  -- 4) Los puntos y reportes de la fila vieja aparecen ahora en la canónica (no se perdieron).
  -- Medido contra scilb el 07-sep-2026 antes de aplicar: Mary tenía 1.819 eventos de puntos,
  -- Yessi 1.450, y Marylin/Yessica tenían 0 — así que el mínimo esperado después de fusionar es
  -- exactamente esa suma (podría ser mayor si el sistema siguió operando entre la medición y el
  -- apply, nunca menor).
  select count(*) into v_puntos_marylin from pipeline_puntos where empleado_id = v_marylin_id;
  select count(*) into v_puntos_yessica from pipeline_puntos where empleado_id = v_yessica_id;
  select count(*) into v_reportes_elthom
    from reporte_trabajadores where empleado_id = v_elthom_id;

  if v_puntos_marylin < 1819 then
    v_fallas := v_fallas || format(E'\n  · Marylin tiene %s eventos de pipeline_puntos, esperaba al menos 1819', v_puntos_marylin);
  end if;
  if v_puntos_yessica < 1450 then
    v_fallas := v_fallas || format(E'\n  · Yessica tiene %s eventos de pipeline_puntos, esperaba al menos 1450', v_puntos_yessica);
  end if;
  if v_reportes_elthom < 4 then
    v_fallas := v_fallas || format(E'\n  · Elthom tiene %s filas de reporte_trabajadores, esperaba al menos 4', v_reportes_elthom);
  end if;

  if v_fallas = '' then
    raise exception 'RESULTADO 0102: OK — sin huérfanos en las diez columnas, sedes completas, las tres filas viejas inactivas, historial preservado en la canónica (Marylin % eventos, Yessica % eventos, Elthom % reportes)', v_puntos_marylin, v_puntos_yessica, v_reportes_elthom;
  else
    raise exception 'RESULTADO 0102: FALLAS —%', v_fallas;
  end if;
end $$;
