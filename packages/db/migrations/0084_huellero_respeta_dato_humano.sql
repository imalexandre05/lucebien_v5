-- 0084_huellero_respeta_dato_humano.sql — la reversión del huellero no borra una hora humana
--
-- Implementa docs/superpowers/specs/asistencias/2026-08-23-huellero-respeta-dato-humano-design.md
-- §4, cambio D-2 (regla RN-H1.b).
--
-- EL PROBLEMA. `huellero_limpiar_dia_sin_marcas` borraba la fila entera con una sola salvaguarda:
-- que `fuente = 'huellero'`. Y `fuente` NO cambia nunca por mano humana — ni `declararDia()` ni
-- `crearAsistencia()` la reescriben, y las dos lo dicen explícito en su comentario. O sea: una
-- fila que nació del huellero y que después alguien corrigió a mano seguía diciendo 'huellero', y
-- se borraba entera con la condición declarada, las horas escritas a mano, la justificación y el
-- motivo adentro.
--
-- El bloque de abajo, el del `update`, hacía justo lo contrario y con cuidado: quitaba SÓLO las
-- horas que la máquina había puesto. Ese cuidado nunca llegó al `delete`.
--
-- CUÁNDO SE DISPARA. `huellero_reresolver_identificador` (0075:761) llama a esta función para
-- cada día afectado al crear, cerrar, ignorar o borrar un mapeo. Es la operación normal de
-- corregir a quién pertenece un identificador del equipo, no un caso raro.
--
-- QUÉ CAMBIA, exactamente dos cosas:
--   1) El `delete` sólo se lleva la fila si NINGUNA de sus horas es de autor humano.
--   2) El `update` deja de exigir `fuente <> 'huellero'`.
-- El segundo es lo que hace que el primero sirva: sin él, la fila que deja de calificar para el
-- `delete` tampoco calificaba para el `update` —su `fuente` sigue diciendo 'huellero'— y se
-- quedaba con la hora de la máquina pegada, que es justo lo que la reversión existe para quitar.
--
-- EFECTO SOBRE LOS DATOS QUE YA EXISTEN: NINGUNO HOY. Medido contra esta base: 1.118 filas, 1.105
-- de fuente 'huellero'. Ninguna tiene la entrada de autor humano; 4 tienen la salida de autor
-- humano y las 4 conservan marcas del huellero ese día, así que el guard de arriba
-- (`if exists ... then return`) las intercepta antes de llegar al delete/update de abajo: hoy no
-- cambia nada para ellas. Si alguna vez pierden esas marcas propias -- p.ej. al corregirse el
-- mapeo que las asocia hoy, ver huellero_reresolver_identificador -- es este cambio el que evita
-- que se borren enteras en vez de conservar la hora que alguien corrigió a mano. No necesita
-- backfill: ya están en el estado correcto. Detalle y verificación contra la base en la spec,
-- docs/superpowers/specs/asistencias/2026-08-23-huellero-respeta-dato-humano-design.md §4 D-2.
--
-- Idempotente: es un único `create or replace function` con la misma firma. No toca datos ni
-- esquema, y reaplicarla deja exactamente el mismo estado. El `revoke` del final se repite porque
-- también es idempotente y porque esta función NO debe ser llamable por HTTP (0075:960).
--
-- Prueba: packages/db/pruebas/0084_huellero_respeta_dato_humano.prueba.sql
--         bash tools/probar-migracion.sh 0084

create or replace function huellero_limpiar_dia_sin_marcas(p_empleado_id uuid, p_fecha date)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $fn$
begin
  if p_empleado_id is null or p_fecha is null then return; end if;

  if exists (
    select 1 from marcas_huellero m
    where m.empleado_id = p_empleado_id
      and (m.marcada_en at time zone 'America/Lima')::date = p_fecha
  ) then
    return;   -- todavía tiene marcas: no hay nada que revertir
  end if;

  -- La fila la creó el huellero Y no sobrevive en ella ninguna hora humana: se va entera.
  --
  -- Las dos condiciones nuevas se leen así: «la hora no existe, o existe pero la puso la máquina».
  -- Si las dos se cumplen, borrar no pierde nada que haya escrito una persona. Basta con que UNA
  -- hora sea humana para que la fila deje de calificar y caiga en el `update` de más abajo.
  --
  -- El sello es el único testigo de la autoría: `fuente` dice de dónde NACIÓ la fila, no quién
  -- escribió cada hora, y por eso no alcanzaba.
  delete from asistencias a
  where a.empleado_id = p_empleado_id
    and a.fecha = p_fecha
    and a.fuente = 'huellero'
    and a.condicion <> 'falta'
    and (a.hora_entrada is null or a.huellero_puso_entrada)
    and (a.hora_salida  is null or a.huellero_puso_salida);

  -- Al huellero se le quitan SÓLO las horas que puso él.
  --
  -- Antes se anulaban las dos, y eso borraba dato humano: una fila con la entrada cargada a mano
  -- y la salida puesta por la máquina perdía también la entrada, y el día quedaba sin nada.
  --
  -- Y antes este bloque exigía `fuente <> 'huellero'`. Se saca: después del `delete` de arriba,
  -- las filas de fuente 'huellero' que siguen en pie son exactamente las que conservan una hora
  -- humana (o son 'falta', y las excluye la condición que sigue). Son las que necesitan este
  -- tratamiento, no el borrado.
  update asistencias a
     set hora_entrada = case when a.huellero_puso_entrada then null else a.hora_entrada end,
         hora_salida  = case when a.huellero_puso_salida  then null else a.hora_salida  end,
         huellero_puso_entrada = false,
         huellero_puso_salida  = false,
         -- Si se le quita una hora, el día deja de estar completo. Se vuelve a 'sin_dato', que
         -- es lo que hace que la liquidación corte nombrando la fecha en vez de pagarla mal.
         condicion = case
           when (case when a.huellero_puso_entrada then null else a.hora_entrada end) is not null
            and (case when a.huellero_puso_salida  then null else a.hora_salida  end) is not null
           then a.condicion
           else 'sin_dato'
         end,
         obs = nullif(btrim(regexp_replace(coalesce(a.obs, ''),
                 '\s*·\s*revisar:[^·]*|revisar:[^·]*·\s*|revisar:[^·]*', '', 'g'), ' ·'), '')
   where a.empleado_id = p_empleado_id
     and a.fecha = p_fecha
     and a.condicion <> 'falta'
     and (a.huellero_puso_entrada or a.huellero_puso_salida);
end;
$fn$;

comment on function huellero_limpiar_dia_sin_marcas(uuid, date) is
  'Revierte lo que el huellero escribió en un día que se quedó sin marcas: borra su propia fila
   sólo si ninguna hora es de autor humano, y a las demás les quita únicamente las horas que puso
   la máquina, bajándolas a sin_dato. Nunca toca una falta ni borra una hora que escribió una
   persona (spec asistencias/2026-08-23-huellero-respeta-dato-humano §4 D-2).';

-- Interna: se llega a ella desde `huellero_reresolver_identificador`, que tiene portero. Nadie la
-- llama por HTTP. `create or replace` conserva los privilegios, pero se repite para que la
-- migración deje el estado correcto también en una base donde alguien los haya cambiado a mano.
revoke execute on function huellero_limpiar_dia_sin_marcas(uuid, date) from public, anon, authenticated;
