# SPEC corta — Lista de precios de confecciones (6A-5)

**Pedido del cliente:** una lista de precios de confecciones, editable por el administrador, para ventas.

## Alcance
- Tabla `lista_precios`: `nombre`, `categoria` (`prenda` | `servicio`), `precio` (S/, ≥ 0), `activo`.
  **Nace vacía**: no se inventa ningún precio.
- RLS: **el administrador escribe; todo empleado activo lee**. Auditoría con el trigger existente.
- Pantalla `/configuracion/lista-precios` (solo administrador): alta, edición, activar/desactivar y quitar.
  Enlace en /configuración. Un artículo desactivado no se ofrece en ventas pero conserva su historia.
- Ventas (`/sueldos/ventas`): junto al «Total de la boleta», un selector con los artículos **activos**;
  «Sumar» agrega su precio al total (se pueden sumar varios y corregir a mano). Solo prellena el campo:
  el monto que se guarda sigue siendo el que el administrador confirma. Con la lista vacía, el selector
  no aparece.
- Fuera de alcance: cantidades, descuentos, precios por sede, historial de precios.

## Pruebas
`packages/db/pruebas/0161_lista_precios.prueba.sql`: nace vacía; el administrador inserta; una persona
común lee pero no escribe; precio negativo y nombre vacío se rechazan; nombre repetido (sin importar
mayúsculas) se rechaza.

## Defaults
Ninguno de negocio (ningún precio precargado). Se anota en `docs/pendientes-negocio.md` que el catálogo
inicial lo carga la dueña desde la pantalla.
