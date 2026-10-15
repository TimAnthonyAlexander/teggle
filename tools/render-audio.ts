// Renders every synthesized sound, the Fever music and a few whole scenes to WAV files in
// reference/teggle-audio/ (gitignored) for listening. The rendering runs in Chromium through the
// game's own audio code (tools/render-audio-page.ts, served by the dev server), with an
// OfflineAudioContext at 44.1 kHz. Prints each file's length, peak and RMS level.
//
// Uses the dev server on http://localhost:47823 when one is running; otherwise starts its own
// on that port and stops it afterwards.
//
// Usage: npm run audio:render [-- [--raw] name-filter ...]
// --raw makes the limiter transparent and writes to reference/teggle-audio/raw/: the levels and
// shapes going into the limiter, for balancing the mix and comparing with the original.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

type PageModule = typeof import('./render-audio-page');

const PORT = 47823;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-audio');
const PAGE_MODULE = '/tools/render-audio-page.ts';

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
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const filters = args.filter((a) => a !== '--raw');
  const dir = raw ? path.join(OUT, 'raw') : OUT;
  await mkdir(dir, { recursive: true });
  let server: ChildProcess | null = null;
  if (!(await isUp())) {
    console.log(`Nothing on ${BASE}; starting a dev server for this run.`);
    server = await startServer();
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    // A plain static file on the dev server: same origin for the module import, but no game and
    // no hot-reload client, so edits elsewhere in the project cannot reload the page mid-run.
    await page.goto(`${BASE}/fonts/overload-LICENSE.txt`);
    const names = await page.evaluate(async (url) => {
      const mod = (await import(url)) as PageModule;
      return mod.renderNames();
    }, PAGE_MODULE);
    const todo = names.filter((n) => filters.length === 0 || filters.some((f) => n.includes(f)));
    for (const name of todo) {
      const r = await page.evaluate(
        async ([url, n, unlimited]) => {
          const mod = (await import(url)) as PageModule;
          return mod.render(n, unlimited);
        },
        [PAGE_MODULE, name, raw] as const,
      );
      await writeFile(path.join(dir, `${name}.wav`), Buffer.from(r.wav, 'base64'));
      console.log(
        `${name.padEnd(28)} ${r.seconds.toFixed(2).padStart(6)} s  peak ${String(r.peakDb).padStart(6)} dBFS  rms ${String(r.rmsDb).padStart(6)} dBFS`,
      );
    }
    if (errors.length > 0) {
      console.error(`Page errors:\n  ${errors.join('\n  ')}`);
      process.exitCode = 1;
    }
    console.log(`${todo.length} files in ${path.relative(ROOT, dir)}/`);
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
