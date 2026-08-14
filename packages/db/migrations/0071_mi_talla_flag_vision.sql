-- 0071_mi_talla_flag_vision.sql — F3: interruptor de publicación del motor de visión.
--
-- El paso "Afinar con cámara" de /mi-talla queda construido pero APAGADO: el
-- spec §8 (gate F4) exige que la visión solo se publique cuando su MAE contra
-- la cinta del taller sea menor que el del motor estadístico en pecho Y
-- cintura — condición numérica, no opinión. Este flag es ese interruptor,
-- editable sin deploy (filosofía todo-configurable; el flag NO es un
-- parámetro de negocio inventado: su default OFF es la regla del spec).
-- Para probar en local/preview sin tocarlo: NEXT_PUBLIC_VISION_PREVIEW=true.
--
-- Idempotente: on conflict do nothing (no pisa un flag ya prendido).

insert into mt_config (clave, valor, descripcion) values (
  'vision_publica',
  '{"activa": false}',
  'Publica el paso "Afinar con cámara" en /mi-talla. Se prende SOLO cuando MAE(visión) < MAE(estadístico) en pecho y cintura contra mt_medicion_real (spec §8, gate F4).'
) on conflict (clave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Verificación (correr tras aplicar):
--   select valor from mt_config where clave = 'vision_publica';  -- {"activa": false}
-- ═══════════════════════════════════════════════════════════════════════════════════════════
