# Ocultar Ventas (POS) e Inventario del menú y la navegación

> Spec corta · sesión 7 · 18-oct-2026 · decisión del dueño n.º 9.

## Decisión del dueño (18-oct-2026)

> «OCULTAR del menú y de la navegación Ventas/punto de venta (POS) e Inventario: no tienen que ver
> con este sistema. No borres el código (se conectará luego por API); solo que no se vean ni se
> pueda llegar desde el menú.»

Esto **revierte la excepción del 21-ago-2026** que mantenía `/inventario` en «Interno» como
herramienta de almacén.

## Qué cambia

| Lugar | Antes | Después |
|---|---|---|
| Menú lateral y menú del celular (`components/shell/sidebar.tsx`) | Entrada «Inventario» en «Interno» | Sin entrada |
| Buscador de ternos (`/buscar`) | El código del terno enlazaba a `/inventario` | El código se muestra sin enlace |
| Avisos viejos del módulo comercial (`lib/notificaciones-enlace.ts`) | Abrían `/pedidos/…`, `/caja`, `/materiales` | Sin enlace (el aviso se lee, no navega) |
| Configuración → Permisos | Grupos POS, Comercial y Abastecimiento visibles | Ocultos; sus permisos se conservan tal cual al guardar |
| Configuración (parámetros) | Tarjetas «Inventario» y «Caja y POS» | Ocultas; sus valores no se tocan |

## Qué NO cambia

- Las rutas siguen vivas (`/inventario`, `/caja`, `/pedidos`, …): quien escriba la dirección ve la
  pantalla. Hay datos vivos detrás y se conectarán por API.
- El código, las tablas, las RPC y los permisos en la base no se tocan.
- `/buscar` se queda: responde «¿dónde está este terno?» para el pipeline.
- La pantalla de ventas por persona para comisiones (sueldo) no es el POS y se queda.

## Cómo se comprueba

- Prueba de `notificaciones-enlace`: los tipos comerciales devuelven `null`.
- Prueba del menú: ninguna entrada apunta a una ruta del módulo comercial ni a `/inventario`.
