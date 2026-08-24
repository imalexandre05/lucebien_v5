import { test, expect, type Page } from '@playwright/test';
import { pasarReauth } from './sesiones';

/**
 * Pactar un contrato de verdad, desde la pantalla, como lo haría el administrador.
 *
 * No es una prueba de regresión: es la puesta a punto de un contrato real que Alexander pidió
 * cargar (Marylin, lunes a sábado de 14:00 a 20:00, S/ 600 el periodo). Se hace por la interfaz y
 * no por la base a propósito — cargarlo por SQL probaría que la tabla acepta filas, no que el
 * sistema sirve para pactar un contrato.
 *
 * ES IDEMPOTENTE. Si el contrato ya está, no lo vuelve a crear: sigue directo a comprobar que
 * quedó vigente. Un segundo intento chocaría contra el índice único de (persona, fecha de inicio) y
 * dejaría la pantalla con un error que no dice nada de lo que se estaba probando.
 *
 * Opt-in, porque escribe un contrato real:
 *   E2E_CONTRATO=1 npx playwright test --project=admin admin.contrato-marylin
 */

const HABILITADO = process.env.E2E_CONTRATO === '1';
const PERSONA = process.env.E2E_PERSONA_ID || '1aab028c-9d5a-4603-90d7-9116a571c25e';

const DESDE = '2026-08-23';
const HASTA = '2026-09-22';
const SUELDO = '600';
const ENTRADA = '14:00';
const SALIDA = '20:00';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

test.setTimeout(180_000);

async function abrirContrato(page: Page) {
  await page.goto(`/personal/${PERSONA}/contrato`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await pasarReauth(page, 'admin');
}

test.describe('pactar el contrato de Marylin', () => {
  test.skip(!HABILITADO, 'Opt-in: define E2E_CONTRATO=1 (escribe un contrato real en la base).');

  test('lunes a sábado de 14:00 a 20:00, S/ 600 el periodo', async ({ page }) => {
    await abrirContrato(page);

    const yaEstaba = !(await page.getByText('Todavía no hay ningún contrato').isVisible().catch(() => false));

    if (!yaEstaba) {
      // Con la persona ya dada y cero contratos, la pantalla arranca directo en el editor: no hay
      // que pedir «Nuevo contrato». Se comprueba que el editor está de verdad ahí antes de escribir.
      await expect(
        page.getByRole('button', { name: 'Pactar contrato' }),
        'con cero contratos la pantalla debería abrir el editor sola',
      ).toBeVisible({ timeout: 30_000 });

      await page.locator('#desde').fill(DESDE);
      await page.locator('#hasta').fill(HASTA);

      // Un turno por día, de lunes a sábado. Se cargan uno por uno en vez de usar «Copiar»: copiar
      // alcanza también al domingo, y el domingo no está contratado.
      for (const dia of DIAS) {
        const fila = page.locator('div').filter({ hasText: new RegExp(`^${dia}`) }).last();
        await fila.getByRole('button', { name: 'Turno' }).click();
        await page.getByLabel(`Inicio del turno de ${dia}`).last().fill(ENTRADA);
        await page.getByLabel(`Fin del turno de ${dia}`).last().fill(SALIDA);
      }

      await page.locator('#sueldo').fill(SUELDO);
      await page.getByRole('button', { name: 'Pactar contrato' }).click();
      await expect(page.getByRole('button', { name: 'Nuevo contrato' })).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    // Un contrato nace en borrador. Pactado de verdad es «vigente»: es lo que la pantalla ofrece en
    // cuanto el horario está cargado, y sin eso el contrato no es más que una intención escrita.
    const ponerVigente = page.getByRole('button', { name: 'Poner vigente' });
    if (await ponerVigente.isVisible().catch(() => false)) {
      await ponerVigente.click();
      await expect(ponerVigente, 'el contrato debería quedar vigente').toBeHidden({ timeout: 30_000 });
    }

    // Lo que tiene que quedar a la vista de quien administra, sin recargar nada.
    // La etiqueta de estado se dibuja en minúscula; se compara sin distinguir mayúsculas para no
    // atar la prueba a una decisión de tipografía.
    const cuerpo = (await page.locator('body').innerText()) || '';
    expect(cuerpo.toLowerCase(), 'el contrato debería figurar como vigente').toContain('vigente');
    expect(cuerpo, 'no debería seguir diciendo que no hay contratos').not.toContain(
      'Todavía no hay ningún contrato',
    );
  });
});
