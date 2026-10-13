import { expect, type Page } from '@playwright/test';

/**
 * Quién entra a la aplicación durante las pruebas.
 *
 * El login pide usuario (el nombre del empleado) y contraseña real; el
 * código de 4 dígitos quedó como PIN interno de atribución y ya no sirve para entrar.
 *
 * Las pruebas NO usan las cuentas de las personas reales: usan dos cuentas dedicadas —una con rol
 * admin y otra con rol de colaborador— creadas para esto. Así una prueba nunca deja rastro a
 * nombre de alguien de verdad, y las contraseñas de las personas siguen siendo suyas.
 *
 * LAS CONTRASEÑAS NO ESTÁN ACÁ Y NO PUEDEN ESTAR. Llegan por variable de entorno y no tienen
 * valor por defecto: si faltan, la prueba se detiene con un mensaje que dice cómo darlas. Una
 * contraseña con valor por defecto en el repositorio es una contraseña publicada — y estas son de
 * cuentas que existen de verdad en la base.
 *
 *   E2E_ADMIN_PASSWORD=...  E2E_COLAB_PASSWORD=...  npx playwright test
 */

function exigir(variable: string): string {
  const valor = process.env[variable];
  if (!valor) {
    throw new Error(
      `Falta ${variable}. Las pruebas con sesión necesitan las contraseñas de las cuentas de ` +
        `prueba y no se guardan en el repositorio. Defínelas antes de correr Playwright.`,
    );
  }
  return valor;
}
export const PERFILES = {
  // Quien puede todo: contratos, liquidaciones, pagos, configuración.
  admin: {
    usuario: process.env.E2E_ADMIN_USUARIO || 'Prueba Admin',
    get password() {
      return exigir('E2E_ADMIN_PASSWORD');
    },
    sede: process.env.E2E_ADMIN_SEDE || 'ST',
    sedeNombre: process.env.E2E_ADMIN_SEDE_NOMBRE || 'Stand',
  },
  // Quien sólo trabaja: reporta su turno, ve lo suyo, y no debería ver lo de nadie más.
  colaborador: {
    usuario: process.env.E2E_COLAB_USUARIO || 'Prueba Colaborador',
    get password() {
      return exigir('E2E_COLAB_PASSWORD');
    },
    sede: process.env.E2E_COLAB_SEDE || 'AL',
    sedeNombre: process.env.E2E_COLAB_SEDE_NOMBRE || 'Almacen Central',
  },
} as const;

export type Perfil = keyof typeof PERFILES;

/** Dónde queda la sesión ya iniciada de cada perfil, para no repetir el login en cada archivo. */
export function archivoSesion(perfil: Perfil): string {
  return `e2e/.sesiones/${perfil}.json`;
}

/**
 * Entra con usuario y contraseña.
 *
 * La sede NO es un `<select>` desde la Fase 2 ("el dispositivo manda"): son botones grandes con
 * `role="radio"` y el valor viaja en un input oculto. Se hace clic en el botón por su nombre
 * visible; si ya viene pre-marcado por el dispositivo, el clic es inofensivo.
 */
export async function entrar(page: Page, perfil: Perfil): Promise<void> {
  const { usuario, password, sedeNombre } = PERFILES[perfil];

  await page.goto('/login');

  const boton = page.getByRole('radio', { name: sedeNombre, exact: true });
  if (await boton.isVisible().catch(() => false)) await boton.click();

  await page.fill('input[name="usuario"]', usuario);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // Cada rol aterriza donde le sirve: el admin en el dashboard (que recibe con el saludo del
  // momento del día, no con un heading "Dashboard") y quien sólo trabaja en su reporte del turno.
  // Por eso la señal de "entró" es haber salido de /login, no una pantalla concreta.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90_000 });
  await expect(
    page.locator('nav, aside, header').first(),
    `${perfil} debería ver la aplicación después de entrar`,
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Pasa la muralla de reautenticación.
 *
 * Las pantallas que cruzan sueldo, evaluación y desempeño piden la contraseña OTRA VEZ aunque ya
 * haya sesión: la PC del mostrador es compartida y "entré yo hace seis horas" no es lo mismo que
 * "soy yo ahora". La cookie que deja dura 15 minutos, así que en una suite larga la muralla vuelve
 * a aparecer sola — por eso esto se llama antes de cada pantalla protegida y no una sola vez.
 *
 * Devuelve true si tuvo que escribir la contraseña (es decir: la muralla estaba puesta).
 */
export async function pasarReauth(page: Page, perfil: Perfil): Promise<boolean> {
  // Se busca la muralla por su título, no por "hay un campo de contraseña": media aplicación tiene
  // campos de contraseña (el alta de una persona pide la inicial) y escribir ahí sin querer sería
  // peor que no probar nada.
  const muralla = page.getByText('Confirma que eres tú', { exact: false });
  if (!(await muralla.isVisible().catch(() => false))) return false;

  await page.locator('input[type="password"]').first().fill(PERFILES[perfil].password);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(muralla, 'la reautenticación no pasó').toBeHidden({ timeout: 30_000 });
  return true;
}
