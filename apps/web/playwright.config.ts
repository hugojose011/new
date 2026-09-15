import { defineConfig, devices } from '@playwright/test';

/**
 * E2E cobre os fluxos críticos descritos no README:
 * agendar -> aparecer no dashboard -> cancelar -> horário liberado
 * agendar -> reagendar -> novo horário ocupado / anterior livre
 *
 * Requer API + Web rodando e um banco de testes migrado.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Permite apontar para um Chromium já instalado no ambiente (CI,
        // container) em vez de baixar um novo.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
