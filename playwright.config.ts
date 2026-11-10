import { defineConfig, devices } from '@playwright/test';

// The browser smoke test (SPEC §7.8). Always headless: never --headed, --ui, --debug or PWDEBUG.
// Locally it runs on Edge (`npm run e2e`); CI runs the bundled Chromium, WebKit and Firefox.
const port = Number(process.env.E2E_PORT ?? 4173); // E2E_PORT: parallel worktrees need their own

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A backstop under the CI job's own timeout (.github/workflows/ci.yml, 50 minutes): a hung run
  // ends here with the specs that finished reported, not cancelled blind (#146). A run takes 20 to 26.
  globalTimeout: process.env.CI ? 40 * 60_000 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    // Locally, traces without the screencast: on macOS, while every display sleeps, WindowServer
    // keeps each WebKit window capture until a display wakes, and an unattended suite's 25 frames a
    // second filled its IOSurface table and crashed it (2026-11-09; microsoft/playwright#43066,
    // Apple FB25101947). CI runs on Linux and keeps the screenshots.
    trace: process.env.CI ? 'retain-on-failure' : { mode: 'retain-on-failure', screenshots: false },
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
