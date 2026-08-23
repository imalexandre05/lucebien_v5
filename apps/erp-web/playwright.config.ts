import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de las pruebas de punta a punta (E2E).
 *
 * QUÉ SON. Todo lo demás que verifica este repo mira el código: los tests unitarios prueban
 * funciones sueltas, el typecheck prueba que los tipos cierren, las pruebas de migración prueban
 * la base. Ninguno abre la aplicación. Un E2E abre un navegador de verdad, entra a la pantalla,
 * hace clic donde haría clic una persona, y comprueba lo que esa persona vería.
 *
 * Es la única red que atrapa "compila, los tests pasan, y la pantalla está en blanco".
 *
 * QUÉ CUBRE HOY. Sólo lo que se puede comprobar SIN una sesión iniciada: que la aplicación
 * levante, que el login se dibuje, y que una ruta protegida mande al login en vez de mostrar
 * datos. Es poco, pero es lo que hoy se puede correr de verdad, y ya atrapa el fallo más común
 * después de un despliegue.
 *
 * QUÉ FALTA, y por qué. Probar un flujo real —entrar, liquidar un sueldo, cerrar— necesita dos
 * cosas que todavía no existen:
 *   1. Un usuario de prueba con contraseña conocida.
 *   2. Una base aparte. Contra `scilb` un E2E escribiría datos reales; y borrarlos después no
 *      alcanza, porque el trigger de inmutabilidad impide borrar una liquidación cerrada — a
 *      propósito. Una rama de Supabase resuelve las dos cosas.
 * Está anotado en docs/harness.md.
 *
 * Cómo se corre:
 *   pnpm --filter erp-web dev            # en una terminal
 *   pnpm --filter erp-web test:e2e       # en otra
 *
 * Con `E2E_URL` apunta a un despliegue en vez de al servidor local:
 *   E2E_URL=https://<preview>.vercel.app pnpm --filter erp-web test:e2e
 */

const URL_BASE = process.env.E2E_URL ?? 'http://localhost:3000';
const CONTRA_DESPLIEGUE = Boolean(process.env.E2E_URL);

export default defineConfig({
  testDir: './e2e',
  // Sin paralelismo entre archivos: apuntan a la misma base y el orden importa cuando
  // aparezcan pruebas que escriban.
  fullyParallel: false,
  workers: 1,
  // En CI, un `.only` olvidado haría pasar la suite entera comprobando una sola cosa.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: URL_BASE,
    // La traza sólo del primer reintento: pesa, y sin fallo no sirve de nada.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Tres públicos, no uno.
  //
  // `anonimo` es lo que ve alguien sin sesión: que la aplicación levante y que una ruta protegida
  // lo eche al login. No depende de nada y se puede correr siempre.
  //
  // `admin` y `colaborador` corren con la sesión ya iniciada por `auth.setup.ts`. Están separados
  // a propósito: la mitad de las cosas que hay que comprobar no son "¿funciona?" sino "¿quién lo
  // ve?" — un colaborador que alcanza la liquidación de otro es un fallo que sólo se ve teniendo
  // los dos perfiles corriendo la misma pantalla.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'anonimo',
      testMatch: /(humo|smoke)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testMatch: /admin\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.sesiones/admin.json' },
      dependencies: ['setup'],
    },
    {
      name: 'colaborador',
      testMatch: /colaborador\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.sesiones/colaborador.json' },
      dependencies: ['setup'],
    },
    // Las de escritura son opt-in (E2E_WRITE=1) y entran solas; conservan su propio login.
    { name: 'escritura', testMatch: /write-flows\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],

  // Contra un despliegue no hay nada que levantar. En local, Playwright arranca el servidor y
  // reusa el que ya esté corriendo, para no pelearse con el `pnpm dev` que tengas abierto.
  webServer: CONTRA_DESPLIEGUE
    ? undefined
    : {
        command: 'pnpm dev',
        url: URL_BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
