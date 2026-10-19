-- 0176 · Índices de rendimiento (auditoría 2, 19-oct-2026).
--
-- Sólo índices: no cambia ninguna regla, RPC ni política. Cubre columnas que hoy se filtran o se unen
-- (RLS por sede, fichas del colaborador, desempeño, campana, pipeline) y no tenían índice propio.
-- Postgres no indexa las claves foráneas solo: sin esto, cada lectura de «reportes de una persona» o
-- «prendas de una sede» recorre la tabla completa y empeora con cada mes de datos.
-- Idempotente (if not exists). Sin `concurrently`: las migraciones corren dentro de una transacción
-- y las tablas son pequeñas (18 empleados, 4 sedes); el bloqueo dura milisegundos.

create index if not exists reporte_trabajadores_reporte_idx   on reporte_trabajadores (reporte_id);
create index if not exists reporte_trabajadores_empleado_idx  on reporte_trabajadores (empleado_id, reporte_id);
create index if not exists reporte_extras_reporte_idx         on reporte_extras (reporte_id);
create index if not exists pipeline_puntos_pasada_idx         on pipeline_puntos (pasada_id);
create index if not exists pipeline_puntos_empleado_fecha_idx on pipeline_puntos (empleado_id, fecha);
create index if not exists prenda_historial_empleado_fecha_idx on prenda_historial (empleado_id, fecha);
create index if not exists prenda_pasada_sede_etapa_idx       on prenda_pasada (sede_origen_cod, etapa);
create index if not exists incidencias_responsable_idx        on incidencias (responsable_id);
create index if not exists incidencias_reporte_idx            on incidencias (reporte_id) where reporte_id is not null;
create index if not exists notificaciones_destinatario_idx    on notificaciones (destinatario_id) where destinatario_id is not null and not leida;
create index if not exists reportes_encargado_fecha_idx       on reportes (encargado_id, fecha);
create index if not exists sueldo_ventas_empleado_fecha_idx   on sueldo_ventas (empleado_id, fecha) where empleado_id is not null;
