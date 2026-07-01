-- seed.sql — Datos mínimos para demo (idempotente). Las 4 sedes, los pesos de puntos (pts_*)
-- y un puñado de activos/clientes de muestra. Ejecutar después de 0001/0002/0003.

insert into sedes (cod, nombre, direccion, interna) values
  ('LB', 'Lucebien', 'Calle Real 380', false),
  ('ST', 'Stand', 'Real 326', false),
  ('TR', 'Trece', 'Almacen secundario', false),
  ('AL', 'Almacen Central', '', true)
on conflict (cod) do nothing;

insert into config (clave, valor) values
  ('pts_lavado_normal', '1'), ('pts_lavado_seco', '3'), ('pts_lavado_especializado', '5'),
  ('pts_empatado', '0.5'), ('pts_refaccion', '2'), ('pts_compostura', '5'),
  ('pts_planchado', '3'), ('pts_control_calidad', '2'), ('pts_accesorio', '0.5')
on conflict (clave) do nothing;

insert into inventario_activo (codigo, tipo, talla, color, sede_cod, estado, precio_base, precio_alquiler, precio_venta, usos_acumulados) values
  ('TN-001', 'TN', '40', 'Navy', 'LB', 'disponible', 250, 80, 450, 12),
  ('TN-002', 'TN', '38', 'Negro', 'ST', 'alquilado', 250, 80, 450, 3),
  ('CM-008', 'CM', 'M', 'Blanco', 'LB', 'disponible', 60, 20, 90, 1),
  ('TN-014', 'TN', '42', 'Gris', 'LB', 'en_lavanderia', 250, 80, 450, 7),
  ('SC-005', 'SC', '40', 'Negro', 'TR', 'disponible', 120, 40, 200, 2)
on conflict (codigo) do nothing;

insert into clientes (nombre, dni, telefono, medidas, sede_cod) values
  ('Juan Perez', '45678912', '987654321', '{"talla":"40"}', 'LB'),
  ('Maria Quispe', '70112233', '912345678', '{"talla":"M"}', 'ST'),
  ('Luis Tarma', '41234567', '998877665', '{"talla":"42"}', 'LB');
