# Limpieza: el 100 % son las zonas de MI turno; las del otro turno suman encima

**Decisión del dueño (17-oct-2026).** El porcentaje de limpieza de un reporte se calcula solo con las zonas
del turno de la persona (turno C = todas). Las zonas del otro turno que limpie suman como **extra**
encima del 100 %: puede pasar de 100 % (p. ej. 50 puntos sobre 43,1 del turno = 116 %).

## Regla
- `propiosTot` = Σ peso de las zonas puntuables (tipo ≠ `area`) que aplican al turno del reporte.
- `propiosGot` = Σ peso×calificación de las zonas del turno que se limpiaron.
- `extraGot` = Σ peso×calificación de las zonas **del otro turno** que se limpiaron.
- `pct` = round((propiosGot + extraGot) / propiosTot × 100). Si `propiosTot` = 0, `pct` = 0.
- Antes (error): el total crecía con cada zona del otro turno marcada, así que el % nunca pasaba de 100.

## Pantalla
Resumen con desglose: «Del turno 43,1/43,1 · Extra +6,9 → 116 %». Los puntos de los extras se muestran
al operativo (ya hecho en #79; se mantiene).

## Fuera de alcance (a confirmar)
`calcularPuntajeEval` (nota del evaluador) no cambia en este PR: la nota de la evaluación sigue su fórmula.

## Pruebas
`resumenLimpieza` en `packages/core/src/reportes.test.ts`: sin extras; con extras (116 %); turno C sin
extras; zonas `area` ignoradas; calificación parcial; sin zonas del turno.
