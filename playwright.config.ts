import { defineConfig, devices } from '@playwright/test';

// The browser smoke test (SPEC §7.8). Always headless: never --headed, --ui, --debug or PWDEBUG.
// Locally it runs on Edge (`npm run e2e`); CI runs the bundled Chromium, WebKit and Firefox.
const port = Number(process.env.E2E_PORT ?? 4173); // E2E_PORT: parallel worktrees need their own

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
    // SPEC §7: Chrome, Safari and Firefox on a laptop. WebKit stands in for Safari.
    { name: 'webkit', use: { ...devices['Desktop Safari'], headless: true } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], headless: true } },
  ],
  // What ships: the production build, served by Vite's preview server.
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false, // a stale preview from another checkout must never be reused
    timeout: 120_000,
  },
});
