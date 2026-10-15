// The dev server for the browser checks (playwright.config.ts) and for screenshot runs: its own
// port, and no file watching or hot reload, so edits elsewhere never reload a page mid-run. It
// serves the project root like the main config, so the dev-only page tests/browser/checks.html
// and the game itself are both reachable. Another port: `vite --config <this> --port <n>`.

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export const CHECKS_PORT = 47852;

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: CHECKS_PORT,
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
