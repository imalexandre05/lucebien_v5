import { test as setup } from '@playwright/test';
import { PERFILES, archivoSesion, entrar, pasarReauth, type Perfil } from './sesiones';

/**
 * Inicia sesión una sola vez por perfil y guarda las cookies en disco.
 *
 * Sin esto, cada archivo de pruebas repetiría el login: son ~3 segundos por archivo y, peor, cada
 * repetición es una oportunidad más de que la suite falle por algo que no es lo que se está
 * probando. Playwright lo corre antes que todo lo demás gracias a `dependencies` en la
 * configuración.
 */
for (const perfil of Object.keys(PERFILES) as Perfil[]) {
  setup(`sesión de ${perfil}`, async ({ page }) => {
    await entrar(page, perfil);

    // Deja la reautenticación ya pasada en la sesión guardada. Dura 15 minutos, así que las
    // pruebas largas la vuelven a pedir; para eso está `pasarReauth` disponible en cada pantalla.
    await page.goto('/personal');
    await pasarReauth(page, perfil).catch(() => false);

    await page.context().storageState({ path: archivoSesion(perfil) });
  });
}
