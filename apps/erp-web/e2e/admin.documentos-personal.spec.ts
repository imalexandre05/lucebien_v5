import { test, expect } from '@playwright/test';
import { pasarReauth } from './sesiones';

/**
 * C-3 de la hoja de ruta del 25-ago: adjuntar DNI/CV/imágenes desde la ficha
 * (docs/superpowers/specs/empleados/2026-09-08-documentos-adjuntos-design.md).
 *
 * Sube un archivo de verdad a Storage y lo borra al final — opt-in porque escribe en la base y en
 * el bucket privado, igual que el resto de los flujos de escritura de esta suite.
 *
 * Corre contra "Prueba Colaborador" (cuenta de prueba dedicada, nunca una persona real) para que
 * un fallo a mitad de camino no deje un documento huérfano en la ficha de alguien de verdad.
 *
 *   E2E_WRITE=1 npx playwright test --project=admin admin.documentos-personal
 */
const HABILITADO = process.env.E2E_WRITE === '1';
const PERSONA_PRUEBA = process.env.E2E_COLAB_ID || 'a31cfd62-d812-4c5c-840c-71ec6ea2e879';
const NOMBRE_ARCHIVO = `e2e-prueba-${Date.now()}.png`;

// El PNG 1×1 más chico posible — sólo hace falta que Storage acepte el mime type, no una imagen real.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.setTimeout(60_000);

test.describe('adjuntar y borrar un documento', () => {
  test.skip(!HABILITADO, 'Opt-in: define E2E_WRITE=1 (sube y borra un archivo real en Storage).');

  test('sube un archivo, aparece en la lista, se puede borrar', async ({ page }) => {
    await page.goto(`/personal/${PERSONA_PRUEBA}/datos`);
    await pasarReauth(page, 'admin');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Documentos', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.locator('input[type="file"]').setInputFiles({
      name: NOMBRE_ARCHIVO,
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });

    const fila = page.locator('li', { hasText: NOMBRE_ARCHIVO });
    await expect(fila, 'el documento subido debería aparecer en la lista').toBeVisible({ timeout: 20_000 });

    // Ver/descargar: pide una URL firmada y abre pestaña nueva — sólo se comprueba que no tira error,
    // no hace falta seguir la descarga.
    const [popup] = await Promise.all([
      page.waitForEvent('popup').catch(() => null),
      fila.getByTitle('Ver / descargar').click(),
    ]);
    if (popup) await popup.close();

    await fila.getByTitle('Borrar').click();
    // El diálogo de confirmación tiene role="dialog" — sin acotar ahí, "Borrar" también matchea el
    // botón-ícono de la fila (su accesible name sale del title, sin texto visible).
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();

    await expect(fila, 'el documento borrado no debería seguir en la lista').toBeHidden({ timeout: 20_000 });
  });
});
