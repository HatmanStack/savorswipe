import { defineConfig, devices } from '@playwright/test';

const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

// Hermetic env: point the Expo Web bundle at fake URLs that Playwright will
// intercept via page.route(). This guarantees the e2e test never reaches
// real OpenAI / AWS endpoints.
const FAKE_API = 'https://fake-api.savorswipe.test';
const FAKE_CDN = 'https://fake-cdn.savorswipe.test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run web -- --port 8081 --non-interactive',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      EXPO_PUBLIC_API_GATEWAY_URL: FAKE_API,
      EXPO_PUBLIC_CLOUDFRONT_BASE_URL: FAKE_CDN,
      CI: '1',
    },
  },
});

export { FAKE_API, FAKE_CDN };
