# Envío de reporte con el código del encargado

Sesión 5A · Zona crítica (sueldo y no-negociable 3) · Migración 0146 · Usa la sesión de operador de
[operador-pc-compartida](../pipeline/2026-10-18-operador-pc-compartida-design.md)

## Problema
En una PC compartida de tienda, el reporte de turno sale a nombre de la cuenta con la que se abrió
la sesión. El reporte es el origen de los puntos y del sueldo: debe quedar a nombre del encargado
que lo envía.

## Reglas
1. **R1 — Misma sesión de operador.** Al enviar el reporte, en un equipo compartido se pide el
   código personal (usuario + PIN) con el mismo chip y la misma sesión corta de 5 min del pipeline
   (0112/0145). Si ya hay un operador vigente, no se vuelve a pedir.
2. **R2 — `reportes_crear` acepta `p_operador uuid default null`** y lo resuelve con
   `private.actor_pipeline`: cuenta de equipo compartido sin token → `CODIGO:`; token ajeno o
   vencido → `CODIGO:` y no se escribe nada; cuenta personal sin token → igual que hoy.
3. **R3 — Con token, el encargado es el dueño del token.** `reportes.encargado_id` = operador.
   Si además llega `p_encargado` distinto del operador → `PERMISO:`. El operador debe estar activo
   y ser de la sede del reporte (`empleado_tiendas`/`sede_cod`) o administrador; si no → `PERMISO:`.
   Los extras sin `registrado_por_id` quedan a nombre del operador.
4. **R4 — Sin sobrecargas.** Se elimina la firma de 9 argumentos (0127). Grants solo a
   `authenticated`.
5. Nada cambia en cómo se evalúa ni se paga el reporte (`evaluaciones`, `puntos`, `reportes` del core).

## Defaults inventados
Ninguno.

## Pruebas (packages/db/pruebas/0146_reporte_con_codigo.prueba.sql)
1. Cuenta compartida sin token → `CODIGO:`, sin reporte.
2. Token válido de un encargado de la sede → `encargado_id` = operador; el operador figura en
   `reporte_trabajadores`.
3. Token de un operador de otra sede (no admin) → `PERMISO:`, sin reporte.
4. Token de otra sesión → `CODIGO:`, sin reporte.
5. `p_encargado` distinto del operador → `PERMISO:`.
6. Cuenta personal sin token → funciona como antes (encargado = sesión).
7. Una sola firma y sin `execute` para anon.
