# Puntos del pipeline: cada persona ve lo suyo, el encargado su sede y el admin todo

Auditoría 1 (hallazgo de la auditoría 2) · Aislamiento (no-negociable 3) · Migración 0174

## Problema
`pipeline_puntos` tiene dos policies de lectura (`puntos_sel` de la 0115 y `puntos_select` de la 0122)
con la misma condición: admin, `app_es_almacen()`, la propia fila **o cualquier punto de una prenda de
una sede del lector**. `app_sedes()` devuelve la sede de cualquier persona, no sólo de los encargados,
así que un operario lee los puntos de todos sus compañeros de sede. Y `app_es_almacen()` incluye al
rol `confeccionista`, que ve los puntos de todas las sedes.

Regla del dueño: cada persona ve sólo lo suyo, el encargado su sede y el administrador todo.

## Reglas
1. **R1 —** Una sola policy de lectura `puntos_sel`: administrador, **o** la propia fila, **o** un
   encargado activo (`encargado_tienda`, `encargado_almacen`) cuando la prenda es de una de sus sedes
   (`app_sedes()`).
2. **R2 —** Se borra la policy duplicada `puntos_select` (0122).
3. Escritura: sin cambios (sólo por RPC, 0115).

## Pendiente del dueño
- `pipeline_ranking_hoy()` sigue mostrando a todos el top 10 del día con nombre y puntos
  (`docs/pendientes-negocio.md`, decisión 2). No se toca hasta que el dueño decida.

## Pruebas (packages/db/pruebas/0174_puntos_solo_propios.prueba.sql, escrita antes)
1. Operario de la sede A no ve los puntos de un compañero de A; ve los suyos.
2. Encargado de tienda de A ve los puntos de A y no los de B.
3. Confeccionista no ve los puntos de otros.
4. Admin ve todo.
5. Queda una sola policy de lectura en `pipeline_puntos`.
