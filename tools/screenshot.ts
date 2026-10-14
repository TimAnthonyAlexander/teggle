// Captures the dev review routes (#/dev/kit/<page>, #/dev/board) and the title screen at
// 1600 x 900 and at an iPhone landscape size into reference/teggle-shots/ (gitignored).
//
// Uses the dev server on http://localhost:47823 when one is already running (the orchestrator
// keeps one up); otherwise starts its own on that port and stops it afterwards. It never starts
// a server on any other port and never stops one it did not start.
//
// Usage: npm run shots [-- name-filter ...]

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContextOptions } from '@playwright/test';

const PORT = 47823;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots');

interface Shot {
  readonly name: string;
  readonly hash: string;
  /** Devices to capture; all by default. */
  readonly only?: readonly string[];
}

const KIT_PAGES = ['pegs', 'hud', 'top', 'themes', 'text', 'controls', 'dialogs', 'buckets'];

const SHOTS: readonly Shot[] = [
  { name: 'title', hash: '' },
  { name: 'board', hash: '#/dev/board?still=1&aim=24' },
  { name: 'board-gold', hash: '#/dev/board?still=1&theme=2&aim=-38&balls=3&orange=19&score=60000' },
  {
    name: 'board-silver',
    hash: '#/dev/board?still=1&theme=9&aim=60&balls=10&orange=0&score=0',
    only: ['desktop'],
  },
  { name: 'kit-index', hash: '#/dev/kit', only: ['desktop'] },
  ...KIT_PAGES.map((p) => ({ name: `kit-${p}`, hash: `#/dev/kit/${p}?t=1200`, only: ['desktop'] })),
  { name: 'rotate', hash: '', only: ['iphone-portrait'] },
];

const DEVICES: Record<string, BrowserContextOptions> = {
  desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
  iphone: {
    viewport: { width: 852, height: 393 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-portrait': {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

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

async function main(): Promise<void> {
  const filters = process.argv.slice(2);
  const shots = SHOTS.filter(
    (s) => filters.length === 0 || filters.some((f) => s.name.includes(f)),
  );
  await mkdir(OUT, { recursive: true });
  let server: ChildProcess | null = null;
  if (await isUp()) {
    console.log(`Using the dev server already running on ${BASE}.`);
  } else {
    console.log(`Nothing on ${BASE}; starting a dev server for this run.`);
    server = await startServer();
  }
  const browser = await chromium.launch();
  try {
    for (const [device, options] of Object.entries(DEVICES)) {
      const todo = shots.filter((s) =>
        s.only === undefined ? device !== 'iphone-portrait' : s.only.includes(device),
      );
      if (todo.length === 0) continue;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      let n = 0;
      for (const shot of todo) {
        // A fresh query string forces a full load, so every shot starts from boot.
        await page.goto(`${BASE}/?shot=${n++}${shot.hash}`);
        await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
          timeout: 20_000,
        });
        await page.waitForTimeout(250);
        const file = path.join(OUT, `${shot.name}-${device}.png`);
        await page.screenshot({ path: file });
        console.log(`  ${path.relative(ROOT, file)}`);
      }
      if (errors.length > 0) {
        console.error(`Page errors on ${device}:\n  ${errors.join('\n  ')}`);
        process.exitCode = 1;
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
