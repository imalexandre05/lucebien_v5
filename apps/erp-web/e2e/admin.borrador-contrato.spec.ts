import { test, expect } from '@playwright/test';
import { pasarReauth } from './sesiones';

/**
 * F-1 de la hoja de ruta del 25-ago: el borrador de un contrato nuevo sobrevive a navegar
 * (docs/superpowers/specs/empleados/2026-09-08-borrador-persistente-design.md).
 *
 * Sólo localStorage — no escribe nada en la base, no necesita opt-in. Al terminar descarta el
 * borrador para no dejar estado en la sesión guardada de Playwright (storageState incluye
 * localStorage) que confunda una corrida futura.
 */
test.setTimeout(60_000);

test('un contrato nuevo sin guardar sobrevive a recargar la página', async ({ page }) => {
  await page.goto('/sueldos/acuerdos');
  await pasarReauth(page, 'admin');
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Nuevo contrato' }).click();
  await expect(page.getByRole('button', { name: 'Pactar contrato' })).toBeVisible({ timeout: 20_000 });

  const SUELDO_PRUEBA = '1234';
  await page.locator('#sueldo').fill(SUELDO_PRUEBA);

  // Cambiar de pantalla y volver — el caso que F-1 existe para cubrir, no sólo un F5.
  await page.goto('/personal');
  await page.goto('/sueldos/acuerdos');
  await pasarReauth(page, 'admin');
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: 'Nuevo contrato' }).click();

  await expect(
    page.getByText('Se restauró un borrador sin guardar'),
    'debería avisar que restauró un borrador',
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#sueldo'), 'el sueldo escrito antes de navegar debería seguir ahí').toHaveValue(
    SUELDO_PRUEBA,
  );

  // Limpieza: no dejar el borrador en la sesión guardada de Playwright para la próxima corrida.
  await page.getByRole('button', { name: 'Descartar y empezar de cero' }).click();
  await expect(page.getByText('Se restauró un borrador sin guardar')).toBeHidden();
  await expect(page.locator('#sueldo')).toHaveValue('');
});

test('editar un contrato que ya existe nunca restaura un borrador', async ({ page }) => {
  await page.goto('/personal');
  await pasarReauth(page, 'admin');

  // Cualquier persona con al menos un contrato ya pactado — se busca desde /sueldos/acuerdos
  // (lista completa) en vez de asumir un id fijo, que se pudre en cuanto cambia la base.
  await page.goto('/sueldos/acuerdos');
  await pasarReauth(page, 'admin');
  await page.waitForLoadState('domcontentloaded');

  const editar = page.getByRole('button', { name: 'Editar' }).first();
  test.skip(!(await editar.isVisible().catch(() => false)), 'no hay ningún contrato ya pactado para editar');

  await editar.click();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible({ timeout: 20_000 });

  // Spec §2: editar SIEMPRE carga desde la base, nunca desde un borrador — el aviso de F-1 no
  // debería aparecer nunca en este camino, tenga o no algo guardado el "Nuevo contrato" de arriba.
  await expect(page.getByText('Se restauró un borrador sin guardar')).toBeHidden();
});
