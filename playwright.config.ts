import { defineConfig, devices } from '@playwright/test';

const remote = process.env.SMOKE_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: remote ?? 'http://127.0.0.1:4173/Multiverse_Simulator/',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: remote ? undefined : {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/Multiverse_Simulator/',
    reuseExistingServer: !process.env.CI,
  },
});
