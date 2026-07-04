import { test, expect, type Page } from '@playwright/test';

// Flujos de ESCRITURA (opt-in). Solo corren con E2E_WRITE=1 porque crean datos reales en la BD.
// Diseñados para AUTO-LIMPIARSE (el reporte se anula al final) y para SALTAR con gracia cuando el
// entorno no lo permite (turno ya enviado, caja ya abierta, sin pedidos pendientes), así que son
// seguros de correr contra la demo. Para cobertura plena conviene una BD sembrada aislada.
//
//   Reporte (auto-limpia):  E2E_WRITE=1 pnpm --filter erp-web test:e2e write-flows -g "crear reporte"
//   Caja (deja sesión cerrada en el historial):  E2E_WRITE=1 pnpm --filter erp-web test:e2e write-flows -g "abrir caja"
// Requiere DEVICE_GATE en modo instalación (0 equipos aprobados) o el equipo de test aprobado.
// Config: E2E_BASE_URL (http://localhost:3005) · E2E_COD (8686) · E2E_SEDE (AL)

const COD = process.env.E2E_COD || '8686';
const SEDE = process.env.E2E_SEDE || 'AL';
const HABILITADO = process.env.E2E_WRITE === '1';

test.describe('flujos de escritura', () => {
  test.skip(!HABILITADO, 'Opt-in: define E2E_WRITE=1 para correr flujos que escriben en la BD.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // crear reporte → (evaluar) → anular. Se limpia solo: al anular, el reporte y sus hijos se borran.
  test('crear reporte, evaluar y anular (auto-limpieza)', async ({ page }) => {
    await page.goto('/reportes/nuevo');

    const turno = page.getByTestId('turno-C');
    await expect(turno, 'debería verse el selector de turno (gate en modo instalación)').toBeVisible();
    await turno.click();

    // El picker de encargado solo aparece si el turno aún no fue enviado hoy.
    const encargado = page.getByTestId('picker-encargado').getByTestId('persona-row').first();
    const hayPicker = await encargado.isVisible({ timeout: 8000 }).catch(() => false);
    test.skip(!hayPicker, 'El turno de hoy ya fue enviado (o no hay empleados); se omite.');

    // Sin trabajadores + un encargado → el admin (evaluador) no es trabajador, así puede evaluar.
    await encargado.click();

    await page.getByTestId('enviar-reporte').click();
    await page.waitForURL(/\/reportes\/[^/]+$/, { timeout: 20000 });

    // Evaluar si el panel lo permite (necesita ≥1 actividad/limpieza; si está deshabilitado, se salta).
    const enviarEval = page.getByTestId('enviar-evaluacion');
    if (await enviarEval.isVisible().catch(() => false)) {
      if (await enviarEval.isEnabled().catch(() => false)) {
        await enviarEval.click();
        await expect(enviarEval).toBeHidden({ timeout: 15000 }).catch(() => {});
      }
    }

    // Limpieza: anular como admin → confirmar en el Modal compartido → vuelve a /reportes.
    const anular = page.getByTestId('anular-reporte');
    await expect(anular).toBeVisible({ timeout: 15000 });
    await anular.click();
    const confirmarAnular = page.getByTestId('confirmar-anular');
    await expect(confirmarAnular).toBeVisible();
    await confirmarAnular.click();
    await page.waitForURL(/\/reportes(\?.*)?$/, { timeout: 20000 });
  });

  // abrir caja → (cobro si hay pendientes) → cerrar. Deja una sesión CERRADA en el historial.
  test('abrir caja, cobrar y cerrar', async ({ page }) => {
    await page.goto('/caja');

    const abrir = page.getByTestId('abrir-caja');
    const puedeAbrir = await abrir.isVisible({ timeout: 8000 }).catch(() => false);
    test.skip(!puedeAbrir, 'Ya hay una caja abierta para la sede; se omite para no interferir.');

    await page.getByTestId('monto-apertura').fill('100');
    await abrir.click();
    await expect(page.getByTestId('abrir-cerrar')).toBeVisible({ timeout: 15000 });

    // Cobro solo si hay un pedido con saldo (botón "Cobrar" en la tabla de pendientes).
    const cobrar = page.getByRole('button', { name: 'Cobrar' }).first();
    if (await cobrar.isVisible().catch(() => false)) {
      await cobrar.click();
      const confirmar = page.getByTestId('confirmar-cobro');
      await expect(confirmar).toBeVisible();
      if (await confirmar.isEnabled().catch(() => false)) {
        await confirmar.click();
        await expect(confirmar).toBeHidden({ timeout: 15000 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // Cerrar con arqueo (efectivo esperado por defecto) → vuelve al estado "Caja cerrada".
    await page.getByTestId('abrir-cerrar').click();
    const confirmarCerrar = page.getByTestId('confirmar-cerrar');
    await expect(confirmarCerrar).toBeVisible();
    await confirmarCerrar.click();
    await expect(page.getByTestId('abrir-caja')).toBeVisible({ timeout: 15000 });
  });
});

async function login(page: Page) {
  await page.goto('/login');
  await page.selectOption('select[name="sede"]', SEDE);
  await page.fill('input[name="cod"]', COD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  // El dashboard ahora recibe con el hero de saludo (no un heading "Dashboard").
  await expect(page.getByRole('heading', { name: /Buen[oa]s (días|tardes|noches)/ })).toBeVisible({
    timeout: 15000,
  });
}
