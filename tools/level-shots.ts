// Captures generated levels on the dev route (#/dev/level/<file>) at 1600 x 900 into
// reference/teggle-shots/levels/ (gitignored), for visual review.
//
// Uses the dev server on http://localhost:47823 when it is running; otherwise starts one on
// that port for the run. It never starts a server on another port and never stops one it did
// not start.
//
// Usage: npm run shots:levels [-- examples/plinko ...]   (default: every level under
//        public/levels/examples/). Add --flags for the flag view (can be orange, quick
//        disappear) as extra *-flags.png files.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 47823;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'levels');

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isUp()) return child;
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`Vite did not come up on port ${PORT} within 30 s.`);
}

async function levelFiles(): Promise<string[]> {
  const given = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (given.length > 0) return given;
  const dir = path.join(ROOT, 'public', 'levels', 'examples');
  const names = await readdir(dir);
  return names
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => `examples/${n.slice(0, -5)}`);
}

async function main(): Promise<void> {
  const files = await levelFiles();
  const withFlags = process.argv.includes('--flags');
  await mkdir(OUT, { recursive: true });
  let server: ChildProcess | null = null;
  if (!(await isUp())) server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    let n = 0;
    for (const file of files) {
      const views = withFlags ? ['', '&view=flags'] : [''];
      for (const view of views) {
        await page.goto(`${BASE}/?shot=${n++}#/dev/level/${file}?still=1&aim=18${view}`);
        await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
          timeout: 20_000,
        });
        await page.waitForTimeout(400);
        const name = `${file.replace(/\//g, '-')}${view === '' ? '' : '-flags'}.png`;
        const out = path.join(OUT, name);
        await page.screenshot({ path: out });
        console.log(`  ${path.relative(ROOT, out)}`);
      }
    }
    if (errors.length > 0) {
      console.error(`Page errors:\n  ${errors.join('\n  ')}`);
      process.exitCode = 1;
    }
    await context.close();
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
