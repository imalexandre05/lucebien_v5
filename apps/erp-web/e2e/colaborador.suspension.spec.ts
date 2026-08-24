import { test, expect } from '@playwright/test';

/**
 * La segunda cerradura de la suspensión, comprobada desde el navegador.
 *
 * Banear a alguien en Supabase Auth le impide volver a entrar, pero no mata la sesión que su
 * navegador ya tenía: ese token sigue siendo válido hasta que expire, y podían pasar horas. Por
 * eso `getSesion()` devuelve null cuando la persona no está activa.
 *
 * Esta prueba usa la sesión YA INICIADA del colaborador, suspende su ficha por detrás, y comprueba
 * que la aplicación deja de reconocerlo sin que él haga nada. Al terminar lo reactiva, pase lo que
 * pase.
 *
 * Opt-in porque escribe en la base:
 *   E2E_SUSPENSION=1 npx playwright test --project=colaborador colaborador.suspension
 */

const HABILITADO = process.env.E2E_SUSPENSION === '1';
const ID = process.env.E2E_COLAB_ID || 'a31cfd62-d812-4c5c-840c-71ec6ea2e879';

async function marcarActivo(activo: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/empleados?id=eq.${ID}`, {
    method: 'PATCH',
    headers: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo, estado: activo ? 'activo' : 'suspendido' }),
  });
  if (!r.ok) throw new Error(`no pude marcar activo=${activo}: ${r.status} ${await r.text()}`);
}

test.describe('una persona suspendida deja de tener sesión', () => {
  test.skip(!HABILITADO, 'Opt-in: define E2E_SUSPENSION=1 (escribe en la base y lo revierte).');

  test.afterAll(async () => {
    await marcarActivo(true);
  });

  test('la pantalla que abría hace un minuto ahora la manda al login', async ({ page }) => {
    await page.goto('/reportes/nuevo');
    await expect(page.locator('body')).not.toContainText('Confirma que eres tú');
    expect(page.url(), 'antes de suspender debería estar adentro').not.toContain('/login');

    await marcarActivo(false);

    await page.goto('/reportes/nuevo');
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(page.url(), 'después de suspender debería estar en el login').toContain('/login');
  });
});
