-- 0089_config_pts_recepcion.sql — el peso de la etapa "recepción" deja de estar escondido en el
-- código de la RPC y pasa a ser un parámetro editable, con el MISMO valor que ya se aplicaba.
--
-- Qué estaba mal (F20 de la auditoría del 23-ago-2026):
--   `pipeline_avanzar` arma la clave del peso como 'pts_' || etapa y, si la fila no existe en
--   `config`, cae a `v_peso := 1` (0009_pipeline_rpc.sql:24-26; la 0086 recreó la función y
--   conserva esa misma caída, ver 0086:103-106). Las nueve claves pts_* sembradas por seed.sql
--   NO incluyen 'pts_recepcion', así que ese 1 nunca fue una decisión del administrador: era un
--   valor de negocio hardcodeado en silencio dentro de una función SQL, que es exactamente lo
--   que prohíbe el no-negociable 5 de CLAUDE.md.
--
-- Verificado contra la base viva antes de escribir esto: `config` tiene nueve claves pts_* y
-- 'pts_recepcion' no está entre ellas, y `pipeline_puntos` acumula 39 filas con etapa='recepcion'
-- que suman 34,50 puntos — consistente con un peso de 1 exacto (las medias prendas aportan 0,5).
--
-- DEFAULT PROVISIONAL, declarado como tal (no-negociable 5): el valor 1 NO es una regla nueva ni
-- un número elegido acá. Es el que la RPC venía aplicando de hecho desde la 0009, y se siembra
-- tal cual precisamente para que ningún cálculo existente cambie: antes y después de esta
-- migración, completar la recepción de un terno completo otorga 1 punto. Queda pendiente que
-- Alexander confirme si 1 es el peso que quiere para recepción frente a las otras ocho etapas
-- (lavado normal 1, empatado 0,5, refacción 2, compostura 5, planchado 3, control de calidad 2).
-- Desde ahora esa decisión se toma desde /configuracion → "Puntos del pipeline", sin tocar SQL.
--
-- Sin cambios de lógica: esta migración no toca `pipeline_avanzar`. La caída a 1 se deja donde
-- está a propósito, como red de seguridad por si alguien borra la fila desde /configuracion.
--
-- Idempotente: un único insert con `on conflict (clave) do nothing`. Reaplicarla no pisa el valor
-- que el administrador haya guardado.

-- Se insertan sólo (clave, valor), igual que seed.sql y que las otras nueve filas pts_* que hoy
-- viven en la base con tipo/descripcion/seccion en null: para los parámetros que el sistema ya
-- conoce, la fuente de verdad de tipo, rango y descripción es apps/erp-web/lib/config-catalogo.ts
-- (ver el comentario de cabecera de la 0058). Las columnas de `config` son para los parámetros
-- que el administrador crea a mano desde la pantalla.
insert into config (clave, valor) values
  ('pts_recepcion', '1')   -- default provisional: es el peso que la RPC ya aplicaba de hecho
on conflict (clave) do nothing;
