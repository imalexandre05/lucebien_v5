-- 0022_reportes_cron.sql — agenda el auto-cierre de reportes con pg_cron.
-- pg_cron corre en UTC. Deadlines Perú (UTC-5): M 15:00 = 20:00 UTC · T/C 23:00 = 04:00 UTC.
-- Se agenda 5 min después del deadline para dar margen. La función es idempotente (salta
-- sede/turno ya cerrado), así que reintentos o solapamientos no duplican.
-- Llama la función SQL directamente (camino confiable; el email lo hace una Edge Function aparte).

create extension if not exists pg_cron;

-- Turno M → 20:05 UTC (15:05 Perú)
select cron.schedule('reportes-auto-cierre-M', '5 20 * * *', $$select reportes_auto_cierre(array['M'])$$);

-- Turnos T y C → 04:05 UTC (23:05 Perú)
select cron.schedule('reportes-auto-cierre-TC', '5 4 * * *', $$select reportes_auto_cierre(array['T','C'])$$);
