/**
 * El inventario de pantallas del ERP, agrupado por lo que significa que una falle.
 *
 * Está separado de las pruebas a propósito: la lista de rutas cambia seguido y así se toca en un
 * solo lugar. Las rutas con `[id]` no van acá — se resuelven en tiempo de ejecución a partir de un
 * enlace real de la lista, porque un id escrito a mano se pudre en cuanto alguien limpia la base.
 */

/** Lo que el equipo usa todos los días. Si una de estas se rompe, el trabajo se detiene. */
export const RUTAS_INTERNO = [
  '/',
  '/notificaciones',
  '/reportes',
  '/reportes/nuevo',
  '/solicitudes',
  '/pipeline',
  '/pipeline/registrar',
  '/pipeline/accesorios',
  '/pipeline/envios',
  '/pipeline/metricas',
  '/valores',
  '/mi-desempeno',
  '/inventario',
  '/envio-lavanderia',
  '/buscar?q=a',
];

/** Lo que sólo toca quien administra: personas, plata y reglas. */
export const RUTAS_ADMIN = [
  '/personal/nuevo',
  '/personal/dashboard',
  '/sueldos',
  '/sueldos/acuerdos',
  '/sueldos/liquidaciones',
  '/sueldos/movimientos',
  '/sueldos/ventas',
  '/sueldos/asistencia',
  '/evaluaciones',
  '/asistencias',
  '/asistencias/huellero',
  '/dispositivos',
  '/administracion/auditoria',
  '/administracion/reportes',
  '/configuracion',
  '/configuracion/actividades',
  '/configuracion/permisos',
  '/configuracion/sedes',
  '/configuracion/tipos-incidencia',
  '/configuracion/tipos-producto',
  '/configuracion/layout',
];

/**
 * Lo que la matriz de permisos SÍ le concede a un colaborador de ventas, aunque viva bajo el
 * rótulo "Administración" del menú: evaluar el reporte de un turno que no fue el suyo y levantar
 * una incidencia. No son pantallas de administración: son parte de su trabajo.
 */
export const RUTAS_COLABORADOR = ['/evaluar-reportes', '/incidencias'];

/**
 * `/personal` es de los dos, y por eso se prueba aparte.
 *
 * El módulo se muestra a quien pueda ver cualquiera de sus secciones que no sean de administración
 * —un colaborador puede ver Valores 360°, así que entra— pero adentro la RLS sólo le devuelve su
 * propia ficha. Lo que hay que comprobar no es si la puerta se abre, sino que del otro lado no
 * haya nadie más.
 */
export const RUTA_PERSONAL = '/personal';

/**
 * Módulo comercial: fuera del menú desde el 20-ago-2026 (lo maneja otro sistema), pero las rutas
 * siguen vivas. No se les exige nada más que no reventar: si alguien llega por un enlace viejo,
 * tiene que ver una pantalla, no un error.
 */
export const RUTAS_COMERCIAL = [
  '/caja',
  '/caja/historial',
  '/pedidos',
  '/pedidos/historial',
  '/pedidos/devoluciones',
  '/clientes',
  '/clientes/nuevo',
  '/finanzas',
  '/estadisticas',
  '/proveedores',
  '/materiales',
  '/compras',
  '/compras/nueva',
  '/pagos',
  '/empleados',
  '/colaboradores',
];

/** Las secciones de la ficha de una persona, que se cuelgan de /personal/<id>. */
export const SECCIONES_PERSONA = [
  '',
  '/datos',
  '/contrato',
  '/asistencias',
  '/movimientos',
  '/evaluacion',
  '/pago',
  '/valores',
];

/**
 * El id de una persona real, sacado de un enlace de verdad en /personal — escrito a mano se pudre
 * en cuanto cambia la base (mismo criterio que el resto de este archivo).
 *
 * NO alcanza con excluir `/personal/nuevo` por nombre: cualquier otra herramienta que cuelgue de
 * `/personal/<algo-que-no-es-un-id>` (como `/personal/dashboard`, F-2) matchea igual el prefijo y
 * un `.first()` ciego la toma por una persona — el id termina siendo la palabra "dashboard", y las
 * pantallas de ficha revientan con "invalid input syntax for type uuid". Se exige la FORMA de un
 * uuid en vez de mantener una lista de excepciones que hay que acordarse de ampliar cada vez que
 * se agrega una herramienta nueva bajo /personal/.
 */
export async function idDePersonaReal(page: import('@playwright/test').Page): Promise<string> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hrefs = await page.locator('a[href^="/personal/"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href') ?? ''),
  );
  const href = hrefs.find((h) => UUID.test(h.split('/')[2] ?? ''));
  if (!href) throw new Error('la lista de personal no ofrece ningún enlace con forma de id de persona');
  return href.split('/')[2];
}
