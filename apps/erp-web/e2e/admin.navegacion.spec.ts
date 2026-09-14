import { test, expect, type Page } from '@playwright/test';
import { RUTAS_INTERNO, RUTAS_ADMIN, RUTAS_COMERCIAL, SECCIONES_PERSONA, idDePersonaReal } from './rutas';
import { pasarReauth } from './sesiones';

/**
 * Barrido de pantallas con sesión de administrador.
 *
 * Lo que comprueba no es que cada pantalla haga bien su trabajo —eso son las pruebas de flujo—
 * sino algo más básico y más caro de que falle: que la pantalla EXISTA, que no reviente, y que no
 * quede en blanco. En una aplicación con renderizado en el servidor, un dato nulo que nadie
 * contempló no rompe el build ni los tests unitarios: rompe la pantalla, en producción, delante de
 * la persona que la abrió.
 *
 * Se corre con:
 *   E2E_URL=http://localhost:3005 npx playwright test --project=admin
 */

// El servidor de desarrollo compila cada ruta la primera vez que se la pide, y algunas tardan.
test.setTimeout(120_000);

/** Lo que delata una pantalla rota aunque el HTTP haya dado 200. */
const SENALES_DE_ERROR = [
  'Application error',
  'Unhandled Runtime Error',
  'This page could not be found',
  'Internal Server Error',
];

async function abrir(page: Page, ruta: string) {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));

  const respuesta = await page.goto(ruta, { waitUntil: 'domcontentloaded' });
  const estado = respuesta?.status() ?? 0;

  expect(estado, `${ruta} respondió ${estado}`).toBeLessThan(400);
  expect(page.url(), `${ruta} echó al login estando con sesión de administrador`).not.toContain('/login');

  // Las pantallas de sueldo/evaluación piden la contraseña otra vez cada 15 minutos. Si aparece la
  // muralla, se pasa y se comprueba la pantalla de verdad — no la muralla, que siempre "funciona".
  if (await pasarReauth(page, 'admin')) {
    await page.waitForLoadState('domcontentloaded');
  }

  const cuerpo = (await page.locator('body').innerText().catch(() => '')) || '';
  for (const senal of SENALES_DE_ERROR) {
    expect(cuerpo, `${ruta} muestra "${senal}"`).not.toContain(senal);
  }
  expect(cuerpo.trim().length, `${ruta} quedó en blanco`).toBeGreaterThan(40);
  expect(errores, `${ruta} lanzó errores de JavaScript: ${errores.join(' | ')}`).toHaveLength(0);

  return cuerpo;
}

test.describe('el administrador puede abrir todo lo que el menú le ofrece', () => {
  for (const ruta of [...RUTAS_INTERNO, ...RUTAS_ADMIN]) {
    test(`abre ${ruta}`, async ({ page }) => {
      await abrir(page, ruta);
    });
  }
});

test.describe('las rutas del módulo comercial siguen sin reventar', () => {
  // Están fuera del menú desde el 20-ago-2026, pero un enlace viejo o un favorito siguen llevando
  // ahí. Que no muestren nada útil es una decisión; que muestren un error es un descuido.
  for (const ruta of RUTAS_COMERCIAL) {
    test(`abre ${ruta}`, async ({ page }) => {
      await abrir(page, ruta);
    });
  }
});

test('la ficha de una persona abre sus ocho secciones', async ({ page }) => {
  await page.goto('/personal');
  await page.waitForLoadState('domcontentloaded');

  const id = await idDePersonaReal(page);

  for (const seccion of SECCIONES_PERSONA) {
    await abrir(page, `/personal/${id}${seccion}`);
  }
});
