// Cross-browser determinism (spec 13.4; target browsers in 14.1): `npm run test:browsers` runs
// tests/browser/*.spec.ts in Chromium, WebKit and Firefox against a dev server of its own
// (tests/browser/vite.config.ts), started and stopped here. Install the engines once with
// `npx playwright install chromium webkit firefox`; PLAYWRIGHT_PROJECTS=chromium,webkit picks some.

import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { CHECKS_PORT } from './vite.config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ALL = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
];
const only = (process.env.PLAYWRIGHT_PROJECTS ?? '').split(',').filter((p) => p !== '');

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: `${ROOT}/test-results/browsers`,
  reporter: 'list',
  timeout: 120_000,
  fullyParallel: true,
  use: { baseURL: `http://127.0.0.1:${CHECKS_PORT}` },
  projects: only.length === 0 ? ALL : ALL.filter((p) => only.includes(p.name)),
  webServer: {
    command: 'npx vite --config tests/browser/vite.config.ts',
    cwd: ROOT,
    url: `http://127.0.0.1:${CHECKS_PORT}/tests/browser/checks.html`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
