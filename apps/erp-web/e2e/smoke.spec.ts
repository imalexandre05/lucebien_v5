import { test, expect } from '@playwright/test';

// Credenciales de prueba (admin). Sobrescribibles por env para no fijar el código en el repo.
const COD = process.env.E2E_COD || '8686';
const SEDE = process.env.E2E_SEDE || 'AL';

// Flujo base end-to-end: login (código + sede) → dashboard → navegar módulos clave sin errores.
test('login y navegación por módulos internos y comerciales', async ({ page }) => {
  await page.goto('/login');
  await page.selectOption('select[name="sede"]', SEDE);
  await page.fill('input[name="cod"]', COD);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // Tras el login, cae en el Dashboard.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Cada módulo carga su encabezado (PageHeader h1) sin romper.
  const rutas: Array<[string, RegExp]> = [
    ['/reportes', /Reportes/i],
    ['/evaluar-reportes', /Evaluaci[oó]n de reportes/i],
    ['/incidencias', /Incidencias/i],
    ['/asistencias', /Asistencias/i],
    ['/pagos', /Pagos/i],
    ['/clientes', /Clientes/i],
    ['/caja', /Caja/i],
    ['/finanzas', /Finanzas/i],
    ['/pedidos/devoluciones', /Devoluciones/i],
  ];
  for (const [href, heading] of rutas) {
    await page.goto(href);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
});

test('rechaza credenciales inválidas (no entra al dashboard)', async ({ page }) => {
  await page.goto('/login');
  await page.selectOption('select[name="sede"]', SEDE);
  await page.fill('input[name="cod"]', 'abcd'); // código inexistente (los reales son 4 dígitos)
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForLoadState('networkidle');
  // Clave de seguridad: credenciales inválidas NO deben dar acceso.
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
});
