import { test, expect, type Page } from '@playwright/test';
import { pasarReauth } from './sesiones';

/**
 * Pactar un contrato de verdad, desde la pantalla, como lo haría el administrador.
 *
 * No es una prueba de regresión: es la puesta a punto de un contrato real que Alexander pidió
 * cargar (Marylin, lunes a sábado de 14:00 a 20:00). Se hace por la interfaz y no por la base a
 * propósito — cargarlo por SQL probaría que la tabla acepta filas, no que el sistema sirve para
 * pactar un contrato.
 *
 * CONVERGE, no crea a ciegas. Si no hay contrato lo pacta; si hay uno y no coincide con lo que
 * dicen las constantes de acá abajo, lo edita; si ya coincide, no toca nada. Crear a ciegas chocaba
 * contra el índice único de (persona, fecha de inicio) y dejaba la pantalla con un error que no
 * decía nada de lo que se estaba probando.
 *
 * OJO CON EL SUELDO: en este sistema `sueldo pactado` es lo que se paga por TODO el período del
 * contrato, no por mes. S/ 1.800 en un contrato de tres meses son S/ 600 mensuales.
 *
 * Opt-in, porque escribe un contrato real:
 *   E2E_CONTRATO=1 npx playwright test --project=admin admin.contrato-marylin
 */

const HABILITADO = process.env.E2E_CONTRATO === '1';
const PERSONA = process.env.E2E_PERSONA_ID || '1aab028c-9d5a-4603-90d7-9116a571c25e';

const DESDE = process.env.E2E_DESDE || '2026-07-01';
const HASTA = process.env.E2E_HASTA || '2026-09-30';
const SUELDO = process.env.E2E_SUELDO || '1800';
const ENTRADA = '14:00';
const SALIDA = '20:00';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

test.setTimeout(180_000);

async function abrirContrato(page: Page) {
  await page.goto(`/personal/${PERSONA}/contrato`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await pasarReauth(page, 'admin');
}

/** Escribe el período, el horario y el sueldo en el editor ya abierto. */
async function llenarEditor(page: Page, conHorario: boolean) {
  await page.locator('#desde').fill(DESDE);
  await page.locator('#hasta').fill(HASTA);

  if (conHorario) {
    // Un turno por día, de lunes a sábado. Se cargan uno por uno en vez de usar «Copiar»: copiar
    // alcanza también al domingo, y el domingo no está contratado.
    for (const dia of DIAS) {
      const fila = page.locator('div').filter({ hasText: new RegExp(`^${dia}`) }).last();
      await fila.getByRole('button', { name: 'Turno' }).click();
      await page.getByLabel(`Inicio del turno de ${dia}`).last().fill(ENTRADA);
      await page.getByLabel(`Fin del turno de ${dia}`).last().fill(SALIDA);
    }
  }

  await page.locator('#sueldo').fill(SUELDO);
}

test.describe('el contrato de Marylin', () => {
  test.skip(!HABILITADO, 'Opt-in: define E2E_CONTRATO=1 (escribe un contrato real en la base).');

  test('lunes a sábado de 14:00 a 20:00, del 1 de julio al 30 de septiembre', async ({ page }) => {
    await abrirContrato(page);

    const vacio = await page.getByText('Todavía no hay ningún contrato').isVisible().catch(() => false);

    if (vacio) {
      // Con la persona ya dada y cero contratos, la pantalla arranca directo en el editor.
      await expect(
        page.getByRole('button', { name: 'Pactar contrato' }),
        'con cero contratos la pantalla debería abrir el editor sola',
      ).toBeVisible({ timeout: 30_000 });
      await llenarEditor(page, true);
      await page.getByRole('button', { name: 'Pactar contrato' }).click();
    } else {
      // Ya hay uno: se edita en vez de crear otro. El horario no se vuelve a cargar — editar
      // conserva los turnos que ya tiene, y volver a agregarlos duplicaría cada día.
      await page.getByRole('button', { name: 'Editar contrato' }).first().click();
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible({ timeout: 30_000 });
      await llenarEditor(page, false);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
    }

    await expect(page.getByRole('button', { name: 'Nuevo contrato' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    // Un contrato nace en borrador. Pactado de verdad es «vigente»: es lo que la pantalla ofrece en
    // cuanto el horario está cargado, y sin eso el contrato no es más que una intención escrita.
    const ponerVigente = page.getByRole('button', { name: 'Poner vigente' });
    if (await ponerVigente.isVisible().catch(() => false)) {
      await ponerVigente.click();
      await expect(ponerVigente, 'el contrato debería quedar vigente').toBeHidden({ timeout: 30_000 });
    }

    // GUARDAR NO REPINTA AL INSTANTE. La acción del servidor vuelve, el editor se cierra, y recién
    // después `router.refresh()` va a buscar la página de nuevo: medido, entre uno y tres segundos
    // en el servidor de desarrollo, que además compila. Durante esa ventana la lista todavía
    // muestra los números viejos. Por eso se espera al dato y no se lee el cuerpo de una vez — una
    // lectura inmediata da un falso negativo que parece un fallo del sistema y es del apuro.
    await expect(
      page.getByText(DESDE, { exact: false }),
      'el período nuevo debería aparecer en la lista sin recargar',
    ).toBeVisible({ timeout: 20_000 });

    // La etiqueta de estado se dibuja en minúscula; se compara sin distinguir mayúsculas para no
    // atar la prueba a la tipografía.
    const cuerpo = (await page.locator('body').innerText()) || '';
    expect(cuerpo.toLowerCase(), 'el contrato debería figurar como vigente').toContain('vigente');
    expect(cuerpo, 'el período nuevo debería verse completo').toContain(HASTA);
    expect(cuerpo, 'no debería seguir diciendo que no hay contratos').not.toContain(
      'Todavía no hay ningún contrato',
    );
  });
});
