# Acceso rápido a «Nueva incidencia» desde la barra superior

**Ticket:** imalexandre05/lucebien-tablero#6 · **Rigor:** spec corta · **Fecha:** 3-oct-2026

## Problema

Registrar una incidencia exigía abrir el menú lateral → Incidencias → «Nueva incidencia». En móvil
son tres toques con el drawer de por medio. No había acceso en la barra superior ni en el dashboard.

## Decisión

- Un botón de ícono (`AlertTriangle`, el mismo del menú) en la barra superior, entre «Buscar» y la
  campana de notificaciones, con el mismo estilo que sus vecinos (32×32, `text-muted`, hover navy).
- Enlaza a `/incidencias?nueva=1`. No hay modal ni formulario duplicado: se reutiliza el único
  formulario de alta que ya existe (`app/incidencias/cliente.tsx`), con su validación C-2.
- La página lee `nueva=1` y lo pasa como `pedirAlta` al cliente, que abre el formulario, lo lleva a
  la vista (`scrollIntoView`; en móvil queda debajo del resumen y los filtros) y limpia el
  parámetro con `router.replace('/incidencias')`. Limpiarlo hace que un segundo clic estando ya en
  la página vuelva a abrirlo y que recargar no lo reabra.

## Permisos

Mismo gate que la página: `puede(matriz, rol, 'incidencias', 'ver', rolCod)`. Hoy pasan
admin/dueño (por mecanismo) y confeccionista, ventas_junior y ventas_junior_2 (migración 0065).
Si el botón se mostrara a otro rol, la página lo redirigiría a `/reportes/nuevo`. La acción de alta
(`accionCrearIncidencia`) sólo exige sesión; no cambia nada en servidor ni en RLS.

## Fuera de alcance

Acceso desde el dashboard (el botón de la barra superior es visible en todas las pantallas).
