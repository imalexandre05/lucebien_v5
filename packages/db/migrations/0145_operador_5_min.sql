-- 0145 — El operador de un equipo compartido se cierra a los 5 minutos sin actividad.
-- Spec: docs/superpowers/specs/pipeline/2026-10-18-operador-pc-compartida-design.md
-- Prueba: packages/db/pruebas/0145_operador_5_min.prueba.sql (escrita antes). Idempotente.
--
-- DEFAULT: el dueño pidió 5 minutos (antes 10, provisional de la 0112). Sólo se baja si la fila
-- sigue en el valor provisional «10»: si el administrador ya lo cambió desde /configuracion, se
-- respeta. Sigue editable allí. Anotado en docs/pendientes-negocio.md.
insert into config (clave, valor) values ('codigo_operador_min', '5')
on conflict (clave) do update set valor = '5' where config.valor = '10';
