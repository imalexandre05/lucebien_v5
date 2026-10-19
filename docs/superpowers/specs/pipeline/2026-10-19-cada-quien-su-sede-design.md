# Cada operario solo ve lo de su sede

Sesión 10A · Zona crítica (aislamiento por sede, no-negociable 3) · Migración 0183

## Problema
Decisión del dueño (19-oct-2026): cada operario ve solo lo de su sede en las pantallas operativas;
el admin ve todo. Auditoría de lo que hoy filtra por sede:

| Pantalla | Hoy | Resultado |
|---|---|---|
| Puntos / ranking | solo propios (0174) | bien |
| Notificaciones | persona, sede o rol sin sede (0108) | bien |
| Recepción en tienda | solo tienda destino (0181) | bien |
| Tablero del pipeline | origen en `app_sedes()`, **o cualquier rol de almacén ve todo** | por decidir (ver dudas) |
| Reportes (4 tablas) | sede en `app_sedes()` **o cualquier rol de almacén ve todo** | **fuga** |

## Reglas
1. **R1 — Reportes por sede.** Las políticas de lectura de `reportes`, `reporte_trabajadores`,
   `reporte_actividades` y `reporte_extras` pasan a: admin, o sede del reporte en `app_sedes()`.
   Se retira la rama «rol de almacén ve todo»: el almacén ve los reportes de SU sede.
2. **R2 — Tablero del pipeline sin cambio.** El taller del almacén procesa prendas que entran
   desde las tiendas (`sede_origen_cod` = la tienda que las envió). Limitarlo a su propia sede lo
   dejaría sin trabajo. Se mantiene y se deja como duda para el dueño.
3. **R3 — Sin cambios de pantalla**: las pantallas leen con RLS, así que el filtro es la base.

## Pruebas
SQL `0183_reportes_por_sede.prueba.sql`: un encargado de almacén no ve reportes (ni trabajadores,
actividades, extras) de otra sede pero sí los de la suya; un encargado de tienda ve los suyos y
no los de otra; el admin ve todos.
