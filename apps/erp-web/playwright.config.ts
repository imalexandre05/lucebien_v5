import { defineConfig, devices } from '@playwright/test';

// E2E smoke. Corre contra un servidor YA levantado (dev en :3005 o un preview de Vercel).
// Config por variables de entorno:
//   E2E_BASE_URL (default http://localhost:3005) · E2E_COD (8686) · E2E_SEDE (AL)
// Uso:  pnpm --filter erp-web test:e2e   (con el dev server corriendo)
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3005',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
