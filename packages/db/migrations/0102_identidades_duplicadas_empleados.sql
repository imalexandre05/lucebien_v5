-- 0102_identidades_duplicadas_empleados.sql — funde en una sola fila las tres identidades que
-- quedaron partidas entre el historial del pipeline (ETL del SQLite legacy) y la operación en
-- vivo del huellero: Mary/Marylin, Yessi/Yessica, Elthom/Elthon.
--
-- Implementa docs/superpowers/specs/empleados/2026-09-07-identidades-duplicadas-design.md.
--
-- ZONA CRÍTICA (no-negociable 1): el historial de `pipeline_puntos` de una persona real quedó
-- atrapado en una fila (`empleados.activo`) que nunca acumula asistencia ni va a evaluarse junto
-- con ese historial — dos filas de una persona es un error de identidad, más allá de qué ciclo de
-- evaluación esté corriendo hoy. Ver la spec §1 para la medición completa y la corrección del
-- 07-sep-2026 sobre el alcance real del efecto en el ciclo vigente.
--
-- Se conserva la fila que el huellero alimenta en vivo (Marylin/Yessica/Elthom — spec §3, señal:
-- `huellero_mapeos` + volumen de `marcas_huellero`) y se le mueve el historial de la fila vieja.
-- La fila vieja NO se borra (mismo criterio que F-3 el 14-ago para no perder historia de la
-- empresa): queda `activo = false` con una nota.
--
-- Qué NO toca, a propósito (spec §4): las tablas de sueldos con trigger de inmutabilidad
-- (`sueldo_liquidaciones`, `sueldo_movimientos`) — ninguna fila vieja tiene datos ahí. Quien
-- reabra esta migración como plantilla para otro par debe repetir esa comprobación a mano.
--
-- `empleado_tiendas` SÍ se toca, a diferencia de la primera versión de esta migración: dos de los
-- tres pares no tenían exactamente las mismas sedes (verificado por el subagente verificador), así
-- que se copian sólo las sedes de la fila vieja que la canónica todavía no tiene — un `insert ...
-- where not exists`, nunca un `update`, para no chocar contra la primary key
-- `(empleado_id, sede_cod)`.
--
-- El procedimiento `private.tmp_fusionar_identidad` es un helper de una sola vez: se crea, se usa
-- tres veces y se destruye en esta misma migración, para no repetir diez líneas tres veces sin
-- dejar infraestructura permanente para algo que no es un flujo recurrente de la aplicación.
--
-- Idempotente: cada par se salta entero (con un aviso) si la fila vieja ya está `activo = false`
-- — así una segunda corrida no repite ningún `update` ni duplica la nota.

create or replace procedure private.tmp_fusionar_identidad(
  old_id uuid, new_id uuid, nombre_nuevo text, cod_nuevo text
) language plpgsql as $$
declare
  v_activo boolean;
begin
  select activo into v_activo from empleados where id = old_id;
  if v_activo is distinct from true then
    raise notice 'identidades_duplicadas_empleados: % ya estaba fusionada, no se repite', old_id;
    return;
  end if;

  update pipeline_puntos      set empleado_id       = new_id where empleado_id       = old_id;
  update reportes             set encargado_id      = new_id where encargado_id      = old_id;
  update reportes             set evaluador_id      = new_id where evaluador_id      = old_id;
  update reporte_trabajadores set empleado_id       = new_id where empleado_id       = old_id;
  update prenda_historial     set empleado_id       = new_id where empleado_id       = old_id;
  update prenda_pasada        set lavador_id        = new_id where lavador_id        = old_id;
  update prenda_pasada        set planchador_id     = new_id where planchador_id     = old_id;
  update prenda_calificacion  set calificador_id    = new_id where calificador_id    = old_id;
  update envios_prendas       set responsable_id    = new_id where responsable_id    = old_id;
  update reporte_extras       set registrado_por_id = new_id where registrado_por_id = old_id;

  insert into empleado_tiendas (empleado_id, sede_cod)
  select new_id, et.sede_cod
  from empleado_tiendas et
  where et.empleado_id = old_id
    and not exists (
      select 1 from empleado_tiendas x where x.empleado_id = new_id and x.sede_cod = et.sede_cod
    );

  update empleados set activo = false, notas = trim(both E'\n' from coalesce(notas, '') ||
      format(E'\n[2026-09-07] Fusionada con %s (cod %s): misma persona, identidad partida entre el historial del pipeline y el huellero en vivo. Ver docs/superpowers/specs/empleados/2026-09-07-identidades-duplicadas-design.md.', nombre_nuevo, cod_nuevo))
    where id = old_id;
end;
$$;

do $$
declare
  v_mary_id    uuid; v_marylin_id uuid;
  v_yessi_id   uuid; v_yessica_id uuid;
  v_elthon_id  uuid; v_elthom_id  uuid;
begin
  select id into v_mary_id    from empleados where cod = '7158';
  select id into v_marylin_id from empleados where cod = '7073';
  select id into v_yessi_id   from empleados where cod = '8888';
  select id into v_yessica_id from empleados where cod = '6510';
  select id into v_elthon_id  from empleados where cod = '1021';
  select id into v_elthom_id  from empleados where cod = '6660';

  if v_mary_id is null or v_marylin_id is null or v_yessi_id is null or v_yessica_id is null
     or v_elthon_id is null or v_elthom_id is null then
    raise exception 'identidades_duplicadas_empleados: falta alguno de los seis codigos esperados (7158,7073,8888,6510,1021,6660) — revisar a mano antes de reaplicar';
  end if;

  call private.tmp_fusionar_identidad(v_mary_id,   v_marylin_id, 'Marylin', '7073');
  call private.tmp_fusionar_identidad(v_yessi_id,  v_yessica_id, 'Yessica', '6510');
  call private.tmp_fusionar_identidad(v_elthon_id, v_elthom_id,  'Elthom',  '6660');
end $$;

drop procedure if exists private.tmp_fusionar_identidad(uuid, uuid, text, text);
