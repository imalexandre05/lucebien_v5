import { test, expect } from '@playwright/test';
import { pasarReauth } from './sesiones';

/**
 * F-2 de la hoja de ruta del 25-ago: el dashboard de personal (/personal/dashboard).
 *
 * `admin.navegacion.spec.ts` ya comprueba que la ruta no revienta y no queda en blanco (está en
 * `RUTAS_ADMIN`, rutas.ts). Esto va más allá: comprueba el CONTENIDO específico que la spec
 * promete (docs/superpowers/specs/evaluaciones/2026-09-08-dashboard-personal-design.md) — las
 * columnas del desglose, y que cada fila muestre una nota/banda o el aviso de "sin actividad",
 * nunca las dos cosas ni ninguna.
 */
test.setTimeout(60_000);

test.describe('dashboard de personal', () => {
  test('muestra el desglose de puntos por persona, ordenado', async ({ page }) => {
    await page.goto('/personal/dashboard');
    await pasarReauth(page, 'admin');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Dashboard de personal' })).toBeVisible({ timeout: 30_000 });

    // Las cinco columnas del desglose (spec §3) — encabezados de tabla, no cualquier texto suelto.
    for (const columna of ['Pipeline', 'Actividades', 'Ventas', 'Extras', 'Descuento', 'Nota']) {
      await expect(page.getByRole('columnheader', { name: columna })).toBeVisible();
    }

    const filas = page.locator('tbody tr');
    await expect(filas.first(), 'debería listar al menos un empleado activo').toBeVisible({ timeout: 15_000 });

    // Cada fila dice una cosa sola: nota/banda, o "sin actividad", o el aviso de error de escala —
    // nunca dos de las tres, y nunca ninguna (spec §3, §5).
    const total = await filas.count();
    for (let i = 0; i < total; i++) {
      const fila = filas.nth(i);
      const tieneNota = await fila.getByText(/\d+[.,]\d{2}\s*·/).isVisible().catch(() => false);
      const sinActividad = await fila.getByText('Sin actividad este período').isVisible().catch(() => false);
      const errorCalculo = await fila.getByText('No se pudo calcular').isVisible().catch(() => false);
      const señales = [tieneNota, sinActividad, errorCalculo].filter(Boolean).length;
      expect(señales, `la fila ${i} de la tabla debería mostrar exactamente una señal de estado`).toBe(1);
    }
  });
});
