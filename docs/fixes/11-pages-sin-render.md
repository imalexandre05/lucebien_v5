# FIX #11 · Páginas que no inicializan al entrar desde el menú

## Contexto

El método `goTo(pageId)` en `public/js/app.js:1759` muestra la página y
opcionalmente llama una función de render. Hay 4 páginas SIN render
asociado:

- `page-asistencias` — se llena cuando se abre desde el tab "Asistencias"
  de Eval Mensual. Si el admin entra directo desde el sidebar (Gestión →
  Asistencias), queda vacía hasta que el usuario interactúe.
- `page-pagos` — vacía al entrar directo, llena solo si entras vía Eval
  Mensual → tab Pagos. Sumado al bug #01 (`/api/pagos` 500), el módulo
  está doblemente roto.
- `page-kanban-almacen` — el JSX se auto-monta, no es bug.
- `page-reporte` — landing page, viva por estado fr01, no es bug.

## Reproducción

1. Login como admin
2. Click en sidebar → Gestión → Asistencias (sin pasar por Eval Mensual)
3. Pantalla vacía sin mensaje

## Fix sugerido

```js
// public/js/app.js:1759 — agregar dentro de goTo()
if (pageId === 'asistencias' && typeof renderAsistDia === 'function') renderAsistDia();
if (pageId === 'pagos' && typeof renderPagos === 'function') renderPagos();
```

Verificar que `renderAsistDia` y `renderPagos` existen y funcionan
sin necesidad de selector previo. Si requieren un selector de mes/empleado,
mostrar un mensaje "Selecciona X para ver datos" en lugar de quedar
vacía.

## Validar

```
1. Logout/login
2. Sidebar → Gestión → Asistencias → debe mostrar contenido o mensaje claro
3. Sidebar → Gestión → Pagos → debe mostrar contenido o mensaje claro
```

## Reglas

- Commit: `fix(ux): inicializar pagos y asistencias al entrar desde menú`.
