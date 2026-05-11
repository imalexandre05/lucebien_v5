# FIX #09 · Roles `auxiliar` y `trabajador` en DEFAULT_PERMS sin empleados reales

## Contexto

`public/js/app.js:1684-1693` define `DEFAULT_PERMS` con 9 roles:
`dueno, admin, encargado_tienda, encargado_almacen, ventas_junior,
ventas_junior_2, auxiliar, confeccionista, trabajador`.

Roles que tienen empleados reales: `admin (3), dueno (1),
encargado_tienda (8), encargado_almacen (1), confeccionista (2),
ventas_junior (1), ventas_junior_2 (2)`. Total 18.

Roles muertos: `auxiliar`, `trabajador`. Cero empleados.

## Fix sugerido

Decisión simple: dejar SOLO los roles vivos:

```js
var DEFAULT_PERMS = {
  dueno:              Object.keys(PAGES_CONFIG),
  admin:              Object.keys(PAGES_CONFIG),
  encargado_tienda:   ['reporte','evaluacion','lavanderia','solicitudes','prestamos','mi-desempeno','eval-valores','pipeline-envios','retorno','incidencias-admin'],
  encargado_almacen:  ['reporte','evaluacion','solicitudes','prestamos','mi-desempeno','eval-valores','kanban-almacen','retorno','garantias','incidencias-admin'],
  ventas_junior:      ['reporte','evaluacion','lavanderia','solicitudes','mi-desempeno','eval-valores','pipeline-envios'],
  ventas_junior_2:    ['reporte','evaluacion','lavanderia','solicitudes','mi-desempeno','eval-valores','pipeline-envios'],
  confeccionista:     ['mi-desempeno','solicitudes','eval-valores'],
};
// auxiliar y trabajador removidos — sin empleados reales
```

**Verificar también** en `routes/auth.js`, `routes/empleados.js`, etc.
si hay validación que acepte solo estos roles.

## Bonus: revisar permisos del confeccionista

Hoy `confeccionista` solo tiene acceso a 3 módulos. ¿Es correcto?
Probablemente debería poder:
- Ver el kanban del pipeline (read-only) para ver qué prendas tienen pendientes
- Marcar prendas como "refaccionado" (avanzar etapa)
- Ver lista de actividades del día

**Confirmar con el usuario** qué debe poder hacer un confeccionista.

## Validar

Reload del frontend tras cambiar app.js. Verificar:
- Login como cualquier rol vivo sigue funcionando
- Dropdowns de "rol" en gestión de empleados ya no incluyen 'auxiliar' ni 'trabajador'

## Reglas

- Buscar referencias a 'auxiliar' y 'trabajador' en TODO el código antes de borrar.
- Commit: `chore(perms): eliminar roles fantasma auxiliar y trabajador`.
