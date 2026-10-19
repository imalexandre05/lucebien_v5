# Extras del reporte: cantidad con tope y a nombre de alguien del turno

Auditoría 1 · Zona crítica (cadena del sueldo, no-negociable 1) · Migración 0171 · Corrige
`reportes_crear` (0146) y `reportes_marcar_asistencia` (0081)

## Problema (comprobado en Postgres local con un rol simulado)
`reportes_crear` es `security definer` y guarda los extras tal como llegan del navegador:

- **`cantidad` no tiene límite ni signo.** Un operario `ventas_junior` envió un extra de catálogo
  (peso 2) con `cantidad = 5000` a su nombre y `evaluacion_componentes` le devolvió
  `puntosTotal = 10000`. Con `cantidad = -5000` a nombre de un compañero le restó 10 000 puntos.
  `puntos_total = peso_unitario × cantidad` entra en la nota /20 y de ahí al pago; `monto_total =
  precio_unitario × cantidad` entra como «Bonos extras» en soles. Se cuenta aunque el reporte no
  esté evaluado.
- **`registrado_por_id` acepta cualquier uuid**, de cualquier sede, aunque esa persona no haya
  trabajado el turno.
- **`reportes_marcar_asistencia`** no pide ni sesión ni sede: cualquiera con sesión puede crear
  filas de asistencia en reportes de otra sede (id adivinable `DD-MM-YY_SEDE_T`).

## Reglas
1. **R1 — Cantidad entera entre 1 y el tope.** Si `cantidad` falta, vale 1 (como hoy). Si es menor
   que 1, no es un entero o supera `config.reporte_extra_cantidad_max` → `CANTIDAD:` y no se
   escribe nada del reporte (todo o nada).
2. **R2 — El extra es de alguien del turno.** `registrado_por_id`, si llega, debe estar entre los
   trabajadores del reporte o ser su encargado; si no → `PERMISO:`. Si no llega, queda como hoy
   (operador con token, o la sesión).
3. **R3 — Los trabajadores existen y están activos.** Un uuid de `p_trabajadores` que no es un
   empleado activo → `PERMISO:`. (No se restringe por sede: hoy se puede sumar a alguien de otra
   tienda que vino a ayudar; ver «Pendiente del dueño».)
4. **R4 — Marcar asistencia exige permiso sobre el reporte.** `reportes_marcar_asistencia` sólo
   corre para el administrador, el encargado del reporte o alguien con la sede del reporte en
   `app_sedes()`; si no → `PERMISO:`. Sin sesión → `No autenticado`.
5. **R5 — La pantalla acompaña.** En `/reportes/nuevo`, «¿Quién lo hizo?» ofrece sólo a las personas
   del equipo del turno, y el botón «+» no pasa del tope.
6. Nada cambia en cómo se evalúa ni se paga un reporte válido.

## Defaults inventados
- `reporte_extra_cantidad_max = 50` por extra y por reporte. **Provisional**: nadie lo confirmó.
  Editable en `/configuracion` (sección Reportes de turno) y anotado en `docs/pendientes-negocio.md`.

## Pendiente del dueño
- ¿Un extra debe sumar antes de que el administrador evalúe el reporte? Hoy suma apenas se envía.
- ¿Se puede poner en el equipo a alguien de otra sede? Hoy sí; R3 no lo cambia.

## Pruebas (packages/db/pruebas/0171_extras_con_tope.prueba.sql, escrita antes que la migración)
1. Operario de la sede, extra de catálogo con `cantidad = 5000` → `CANTIDAD:` y sin reporte.
2. `cantidad = -5` y `cantidad = 0` → `CANTIDAD:`.
3. `cantidad = 3` dentro del tope → se guarda y `puntos_total = peso × 3`.
4. `registrado_por_id` de alguien que no está en el turno → `PERMISO:` y sin reporte.
5. `registrado_por_id` de un trabajador del turno → se guarda a su nombre.
6. Un trabajador inexistente o inactivo → `PERMISO:`.
7. `reportes_marcar_asistencia` desde otra sede → `PERMISO:` y sin filas nuevas; desde la sede → funciona.
9. El mismo extra de catálogo repetido en varias filas (3 × 50) → `CANTIDAD:`: el tope es por extra
   del reporte, sumando sus filas.
8. Sigue habiendo una sola firma de `reportes_crear` y ninguna de las dos es ejecutable por `anon`.
