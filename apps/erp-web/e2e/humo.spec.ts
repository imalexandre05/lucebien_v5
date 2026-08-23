import { test, expect } from '@playwright/test';

/**
 * Prueba de humo — lo mínimo que tiene que ser cierto para que la aplicación sirva de algo.
 *
 * No necesita sesión iniciada ni datos de prueba, así que se puede correr hoy, contra el servidor
 * local o contra un despliegue. Atrapa el fallo más común después de un despliegue: la aplicación
 * compila, los tests pasan, y la pantalla está en blanco porque falta una variable de entorno.
 *
 * La tercera prueba es la más importante de las tres: comprueba el no-negociable 3 desde afuera.
 * Si el middleware dejara de redirigir, cualquiera vería datos de personas sin estar logueado, y
 * ningún test unitario lo notaría.
 */

test('el login se dibuja y pide credenciales', async ({ page }) => {
  const respuesta = await page.goto('/login');

  expect(respuesta?.status(), 'la página de login tiene que responder 200').toBeLessThan(400);

  // No se busca un texto exacto: la pantalla se rediseña y el test no debería romperse por eso.
  // Lo que no puede faltar es la forma: algo donde escribir y algo que enviar.
  await expect(page.locator('input')).not.toHaveCount(0);
  await expect(page.locator('button, input[type="submit"]')).not.toHaveCount(0);
});

test('la página no quedó en blanco', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));

  await page.goto('/login');
  await expect(page.locator('body')).not.toBeEmpty();

  // Un error de JavaScript sin capturar deja la pantalla vacía aunque el HTML haya llegado bien.
  expect(errores, `errores de JavaScript en el login: ${errores.join(' · ')}`).toHaveLength(0);
});

test('una ruta protegida no muestra datos sin sesión', async ({ page }) => {
  // /empleados lista personas. Sin sesión tiene que terminar en el login, nunca en la lista.
  await page.goto('/empleados');

  await expect(
    page,
    'sin sesión, una ruta protegida tiene que redirigir al login (no-negociable 3)',
  ).toHaveURL(/\/login/);
});
