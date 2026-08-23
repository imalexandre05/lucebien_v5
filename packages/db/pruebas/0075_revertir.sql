-- Deshacer la migración 0075, si hiciera falta.
--
-- CUÁNDO SE USA. Sólo si la 0075 falla a mitad de camino o si su prueba encuentra un FALLA que no
-- se puede corregir en el momento. No hace falta para "empezar de nuevo": la migración es
-- idempotente y se puede volver a aplicar encima sin problema.
--
-- QUÉ RECUPERA. Todo. La 0075 sólo agrega, así que deshacerla es borrar lo agregado: las cuatro
-- tablas nuevas, las nueve funciones y las dos columnas de `asistencias`. Ninguna fila de datos
-- preexistente se toca en ningún momento.
--
-- El respaldo `asistencias_respaldo_0075` está por si acaso, no porque la migración lo necesite.

begin;

-- 1) Las funciones. `if exists` para que se pueda correr aunque la migración haya fallado antes
--    de crear alguna.
drop function if exists huellero_borrar_mapeo(uuid);
drop function if exists huellero_reprocesar_identificador(uuid, text);
drop function if exists huellero_reprocesar_mapeo(uuid);
drop function if exists huellero_reresolver_identificador(uuid, text);
drop function if exists huellero_limpiar_dia_sin_marcas(uuid, date);
drop function if exists huellero_derivar_asistencia(uuid, date);
drop function if exists huellero_registrar_marcas(uuid, jsonb);
drop function if exists huellero_checkpoint(uuid);
drop function if exists private.app_es_colector_huellero();

-- 2) Las tablas. En este orden por las claves foráneas.
drop table if exists marcas_huellero;
drop table if exists huellero_mapeos;
drop table if exists huellero_colectores;
drop table if exists dispositivos_huellero;

-- 3) Las dos columnas de `asistencias`. Sólo las agregadas por la 0075: las de la 0072 se quedan.
alter table asistencias drop column if exists huellero_puso_entrada;
alter table asistencias drop column if exists huellero_puso_salida;

-- 4) Los dos parámetros de configuración.
delete from config where clave in ('huellero_jornada_max_horas', 'huellero_jornada_min_horas');

-- Comprobación: las 13 filas originales siguen intactas.
do $$
declare n_ahora int; n_respaldo int;
begin
  select count(*) into n_ahora    from asistencias;
  select count(*) into n_respaldo from asistencias_respaldo_0075;
  raise notice 'asistencias: % filas ahora, % en el respaldo', n_ahora, n_respaldo;
  if n_ahora < n_respaldo then
    raise exception 'FALTAN FILAS: había % y quedan %. NO confirmes esta transacción.',
      n_respaldo, n_ahora;
  end if;
end $$;

-- Revisá el aviso de arriba antes de confirmar.
commit;
