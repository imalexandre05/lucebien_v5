import { test, expect, type Page } from '@playwright/test';
import { RUTAS_ADMIN, RUTAS_COLABORADOR, SECCIONES_PERSONA } from './rutas';
import { PERFILES } from './sesiones';

/**
 * El no-negociable 3, comprobado desde afuera y con la sesión de quien no debería poder.
 *
 * "Nadie ve el sueldo de otro. Nadie ve la nota de otro. Nadie sabe quién lo puntuó en Valores
 * 360° salvo el administrador. Un encargado ve sólo su sede."
 *
 * Estas cuatro frases son las que sostienen la confianza del equipo en el sistema. Un test
 * unitario no las puede comprobar: la filtración no ocurre en una función, ocurre cuando una
 * pantalla se dibuja para la persona equivocada. Por eso esto se prueba con un navegador, con la
 * sesión de un colaborador de verdad, escribiendo a mano la dirección que no debería funcionar
 * — que es exactamente lo que haría alguien con curiosidad.
 *
 *   E2E_URL=http://localhost:3005 npx playwright test --project=colaborador
 */

test.setTimeout(120_000);

/** Señales de que una pantalla mostró plata o notas de alguien. */
const PALABRAS_DE_PLATA = [
  'Sueldo pactado',
  'Liquidación',
  'Neto a pagar',
  'Valor de la hora',
  'Saldo pendiente',
];

/** Lo que tiene que pasar cuando alguien pide algo que no le toca: puerta cerrada, no pantalla. */
async function puertaCerrada(page: Page, ruta: string) {
  const respuesta = await page.goto(ruta, { waitUntil: 'domcontentloaded' });
  const estado = respuesta?.status() ?? 0;

  // Varias pantallas rebotan con redirect() del lado del servidor y otras del lado del cliente.
  // Sin esperar a que la navegación termine, se lee la dirección de la pantalla que ya no está y
  // el cuerpo a medio dibujar — y la prueba falla por su propio apuro, no por el sistema.
  await page.waitForLoadState('networkidle').catch(() => {});

  const url = page.url();
  const cuerpo = (await page.locator('body').innerText().catch(() => '')) || '';

  const rebotado = !url.includes(ruta.split('?')[0]) || url.includes('/login');
  // El sistema no dice "403": dice, en castellano y sin retar a nadie, que esa pantalla no es
  // suya. Cualquiera de esas formas cuenta como puerta cerrada; lo que no cuenta es que la
  // pantalla se dibuje con datos adentro.
  const negado =
    /esta pantalla es del (administrador|due|dueñ)|s[oó]lo (el|los) administrador|solo (el|los) admin|no tienes permiso|sin permiso|no autorizado|acceso restringido|no encontrad|404/i.test(
      cuerpo,
    );

  expect(
    rebotado || negado || estado === 403 || estado === 404,
    `${ruta} se abrió para un colaborador y mostró contenido:\n${cuerpo.slice(0, 400)}`,
  ).toBe(true);
}

test.describe('un colaborador no entra a lo de administración', () => {
  for (const ruta of RUTAS_ADMIN) {
    test(`no entra a ${ruta}`, async ({ page }) => {
      await puertaCerrada(page, ruta);
    });
  }
});

test.describe('un colaborador sí entra a lo que la matriz de permisos le concede', () => {
  for (const ruta of RUTAS_COLABORADOR) {
    test(`entra a ${ruta}`, async ({ page }) => {
      const respuesta = await page.goto(ruta, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(respuesta?.status() ?? 0, `${ruta} respondió mal`).toBeLessThan(400);
      expect(page.url(), `${ruta} lo rebotó, y la matriz dice que puede`).toContain(ruta);
    });
  }
});

test('un colaborador no ve la ficha de otra persona', async ({ page }) => {
  // El id de otro se consigue igual de fácil en la vida real: sale de cualquier lista donde
  // aparezca gente. Acá se toma del propio Valores 360°, que sí es legítimo que vea.
  await page.goto('/valores');
  const cuerpo = (await page.locator('body').innerText().catch(() => '')) || '';
  test.skip(cuerpo.includes('Confirma que eres tú'), 'Valores pide reautenticación; se prueba aparte.');

  const idOtro = process.env.E2E_ID_OTRA_PERSONA || '';
  test.skip(!idOtro, 'Define E2E_ID_OTRA_PERSONA con el id de alguien que no sea el colaborador.');

  for (const seccion of SECCIONES_PERSONA) {
    await puertaCerrada(page, `/personal/${idOtro}${seccion}`);
  }
});

test('la pantalla de un colaborador no filtra plata de nadie', async ({ page }) => {
  // Recorre lo que un colaborador SÍ puede abrir y comprueba que ninguna de esas pantallas se le
  // escape con cifras de sueldo. Es la contracara del test anterior: allá se prueba la puerta,
  // acá se prueba que no haya una ventana abierta.
  for (const ruta of ['/', '/mi-desempeno', '/valores', '/notificaciones', '/buscar?q=a']) {
    // `/` rebota a la pantalla del rol; sin esperar a que ese rebote termine, la navegación
    // siguiente se cancela sola (ERR_ABORTED) y parece un fallo del sistema cuando es del apuro.
    await page.goto(ruta, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    const cuerpo = (await page.locator('body').innerText().catch(() => '')) || '';
    if (cuerpo.includes('Confirma que eres tú')) continue;

    for (const palabra of PALABRAS_DE_PLATA) {
      // "Mi desempeño" puede hablar del propio bono; lo que no puede es nombrar a otra persona.
      const otros = ['Alexander', 'Jordan', 'Marylin', 'Yessica']
        .filter((n) => n !== PERFILES.colaborador.usuario)
        .some((n) => cuerpo.includes(n));
      const hayPlata = cuerpo.includes(palabra);
      expect(
        hayPlata && otros,
        `${ruta} muestra "${palabra}" junto al nombre de otra persona`,
      ).toBe(false);
    }
  }
});
