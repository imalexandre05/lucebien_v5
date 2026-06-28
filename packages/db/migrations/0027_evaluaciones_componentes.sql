-- 0027_evaluaciones_componentes.sql — guarda los componentes de la nota (jsonb) en la evaluación.
-- Junto con pesos_usados (snapshot de los pesos de config al momento del cierre), permite
-- reconstruir/auditar la nota sin recalcular el pasado si luego se editan los pesos en config.

alter table evaluaciones_mensuales add column if not exists componentes jsonb;
