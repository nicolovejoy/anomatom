import { defineConfig, devices } from '@playwright/test';

// The browser smoke test (SPEC §7.8). Always headless: never --headed, --ui, --debug or PWDEBUG.
// Locally it runs on Edge (`npm run e2e`); CI runs the bundled Chromium (`--project=chromium`).
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', headless: true } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } },
  ],
  // What ships: the production build, served by Vite's preview server.
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
