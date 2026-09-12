import { test, expect } from '@playwright/test';

/**
 * "Mis reportes" (spec 2026-09-12): quien llena el turno ve el estado de sus propios reportes
 * en /reportes/nuevo -- hoy el historial completo vive en /administracion/reportes, detrás de un
 * permiso que un colaborador no tiene (ver colaborador.aislamiento.spec.ts).
 *
 * No hay una segunda cuenta de colaborador sembrada en el entorno de pruebas para comprobar de
 * punta a punta que Persona A no ve los reportes de Persona B -- ese filtro (encargado_id, en
 * reportes-repo.ts) se revisa por lectura de código hasta que exista esa segunda cuenta.
 *
 *   E2E_URL=http://localhost:3005 npx playwright test --project=colaborador colaborador.mis-reportes
 */

test('un colaborador ve el bloque "Mis reportes recientes" en su formulario de turno', async ({ page }) => {
  const respuesta = await page.goto('/reportes/nuevo', { waitUntil: 'domcontentloaded' });
  expect(respuesta?.status() ?? 0, '/reportes/nuevo respondió mal').toBeLessThan(400);
  await page.waitForLoadState('networkidle').catch(() => {});

  await expect(page.getByRole('heading', { name: 'Mis reportes recientes' })).toBeVisible();

  // O la tabla con al menos una fila, o el estado vacío -- cualquiera de los dos es "funciona
  // bien", nunca los dos juntos ni ninguno de los dos.
  const filas = page.locator('table tbody tr');
  const vacio = page.getByText('Todavía no enviaste ningún reporte');
  const hayFilas = (await filas.count()) > 0;
  const hayVacio = await vacio.isVisible().catch(() => false);
  expect(hayFilas !== hayVacio, 'debería mostrarse la tabla O el estado vacío, no ambos ni ninguno').toBe(true);
});
