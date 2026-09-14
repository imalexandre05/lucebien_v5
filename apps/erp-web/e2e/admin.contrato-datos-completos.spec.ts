import { test, expect } from '@playwright/test';
import { pasarReauth } from './sesiones';
import { idDePersonaReal } from './rutas';

/**
 * C-2 de la hoja de ruta del 25-ago: el contrato muestra DNI, teléfono y recomendaciones
 * (docs/superpowers/specs/empleados/2026-09-08-contrato-datos-completos-design.md).
 *
 * No verifica valores concretos (dependen de qué haya cargado cada persona) — verifica que las
 * TRES líneas existen siempre, con "—" cuando falta el dato (spec §4: lo que falta se ve como
 * falta, nunca se oculta la línea entera).
 */
test.setTimeout(60_000);

test('el contrato de cualquier persona muestra DNI, teléfono y recomendaciones', async ({ page }) => {
  await page.goto('/personal');
  await pasarReauth(page, 'admin');
  await page.waitForLoadState('domcontentloaded');
  const id = await idDePersonaReal(page);

  await page.goto(`/personal/${id}/contrato`);
  await pasarReauth(page, 'admin');
  await page.waitForLoadState('domcontentloaded');

  // Las tres líneas viven dentro del editor (spec §4) — si la persona no tiene ningún contrato
  // arranca ahí sola; si ya tiene uno, hay que entrar a editarlo para verlas.
  const nuevo = page.getByRole('button', { name: 'Nuevo contrato' });
  const editar = page.getByRole('button', { name: 'Editar contrato' }).first();
  if (await nuevo.isVisible().catch(() => false)) await nuevo.click();
  else if (await editar.isVisible().catch(() => false)) await editar.click();

  for (const etiqueta of ['DNI:', 'Teléfono:', 'Recomendaciones:']) {
    await expect(page.getByText(etiqueta), `debería mostrar la línea "${etiqueta}"`).toBeVisible({ timeout: 15_000 });
  }
});
