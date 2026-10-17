// Captures the challenges at 1600 x 900 into reference/teggle-shots/challenges/ (gitignored): the
// challenge list with the first group open, a group that is still locked, groups opened by the
// DEV ONLY unlock, a challenge in play, a passed and a failed challenge end dialog, and the stage
// intro card's 15 squares.
//
// Runs its own Vite dev server on port 47915 (never the shared one on 47823), without file
// watching, and stops it at the end. Challenges are played for real: the DEV handle window.__teggle picks the best aim found on
// a trial copy of the attempt, or a weak one, and fires. The save is set through localStorage.
//
// Usage: npm run shots:challenges [-- name-filter ...]   (filters match step names)

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const PORT = 47915;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'challenges');
const SAVE_KEY = 'teggle.save.v1';
const WORLD_W = 3200 / 3;
const WORLD_H = 600;
const CENTER_X = WORLD_W / 2;
/** The result dialogs' box (src/game/layout.ts, resultDialog). */
const DIALOG = { x: 187 + (WORLD_W - 800) / 2, y: 147, w: 425, h: 305 } as const;

// ---------------------------------------------------------------------------------------------
// Saves

interface ChallengeSave {
  tries: number;
  passes: number;
  bestLevels: number;
  best: number | null;
  passedOn: string | null;
}

/**
 * A save with campaign levels 1-1 up to (not including) number `next` cleared on try 1, and the
 * given challenge records.
 */
function save(next: number, challenges: Record<string, ChallengeSave> = {}): string {
  const levels: Record<string, unknown> = {};
  for (let n = 1; n < next; n++) {
    const stage = Math.ceil(n / 5);
    const id = `${stage}-${n - (stage - 1) * 5}`;
    const score = 150_000 + 13_000 * n;
    levels[id] = {
      tries: 1,
      wins: 1,
      fullClear: false,
      best: score,
      campaignScore: score,
      top: [{ score, master: 'guide', date: '2026-10-16' }],
    };
  }
  return JSON.stringify({
    version: 1,
    campaign: { next, try: 1, pick: null },
    levels,
    challenges,
  });
}

const passed = (best: number | null = null): ChallengeSave => ({
  tries: 2,
  passes: 1,
  bestLevels: 1,
  best,
  passedOn: '2026-10-16',
});

// ---------------------------------------------------------------------------------------------
// Page helpers

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

/** World coordinates to CSS pixels, as src/game/app/viewport.ts fits the world. */
function toCss(page: Page, x: number, y: number): { x: number; y: number } {
  const v = page.viewportSize() ?? { width: 1600, height: 900 };
  const s = Math.min(v.width / WORLD_W, v.height / WORLD_H);
  return { x: (v.width - WORLD_W * s) / 2 + x * s, y: (v.height - WORLD_H * s) / 2 + y * s };
}

async function click(page: Page, x: number, y: number): Promise<void> {
  const p = toCss(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function hover(page: Page, x: number, y: number): Promise<void> {
  const p = toCss(page, x, y);
  await page.mouse.move(p.x, p.y);
}

/** Loads the app fresh at `hash` with `saved` in storage. */
async function open(page: Page, hash: string, saved: string, settleMs = 1200): Promise<void> {
  await page.goto(`${BASE}/?s=${Date.now()}`);
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [SAVE_KEY, saved] as const,
  );
  await page.goto(`${BASE}/?s=${Date.now()}${hash}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(settleMs);
}

/** Moves to another route in the same page session (the DEV unlock lasts for the session). */
async function go(page: Page, hash: string, settleMs = 1200): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(settleMs);
}

type Snap = Record<string, unknown>;

async function snapshot(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const t = (window as unknown as { __teggle?: { snapshot(): Snap } }).__teggle;
    return t === undefined ? null : t.snapshot();
  });
}

async function waitPlay(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __teggle?: unknown }).__teggle !== undefined,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
}

/** Waits until a shot may leave, or a dialog opens. */
async function waitReady(page: Page, timeoutMs = 120_000): Promise<Snap> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshot(page);
    if (s !== null) {
      if (s.dialog !== null) return s;
      if (s.phase === 'aim' && s.ready === true && s.holding !== true) return s;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting to aim: ${JSON.stringify(s)}`);
    await page.waitForTimeout(300);
  }
}

async function fire(page: Page, mode: 'best' | 'weak'): Promise<void> {
  await page.evaluate((m) => {
    const t = (
      window as unknown as {
        __teggle: { pickAim(goal: string): number; fire(a: number, w?: number): boolean };
      }
    ).__teggle;
    // A weak shot: nearly flat to one side, so it lights little and rarely an orange peg.
    const angle = m === 'best' ? t.pickAim('best') : 1.52;
    t.fire(Number.isFinite(angle) ? angle : 0, 0);
  }, mode);
  await page.waitForTimeout(400);
}

/** Plays shots until a dialog opens; returns its kind. */
async function playOut(page: Page, mode: 'best' | 'weak', onShot?: (n: number) => Promise<void>) {
  for (let n = 0; n < 60; n++) {
    const s = await waitReady(page);
    if (typeof s.dialog === 'string') return s.dialog;
    await fire(page, mode);
    await onShot?.(n);
  }
  throw new Error('The level did not end in 60 shots.');
}

// ---------------------------------------------------------------------------------------------
// Steps

/** Cell `slot` of the list grid (src/game/menus/quickplay.ts, cellBox), its center. */
function cell(slot: number): { x: number; y: number } {
  const cols = [26, CENTER_X - 158, WORLD_W - 26 - 316];
  const rows = [62, 302];
  const at = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
  ][slot] ?? [0, 0];
  return { x: (cols[at[0] ?? 0] ?? 0) + 158, y: (rows[at[1] ?? 0] ?? 0) + 113 };
}

type Step = (page: Page) => Promise<void>;

const STEPS: readonly [string, Step][] = [
  [
    'list',
    async (page) => {
      // Stage 3 complete: the first group is open; its other levels are not built yet.
      await open(page, '#/challenges', save(16, { 'orange-1.1': passed() }));
      await shot(page, 'list-first-group');
      const second = cell(1);
      await hover(page, second.x, second.y);
      await page.waitForTimeout(400);
      await shot(page, 'list-level-not-built');
      // The next group is still locked by the campaign.
      await click(page, CENTER_X + 9 + 57, WORLD_H - 56 + 17);
      await page.waitForTimeout(600);
      await shot(page, 'list-locked-group');
      await hover(page, cell(0).x, cell(0).y);
      await page.waitForTimeout(400);
      await shot(page, 'list-locked-challenge');
    },
  ],
  [
    'dev',
    async (page) => {
      // A cup passed, every full clear of the first group (its square gets the medal), a run
      // tried three times.
      const records: Record<string, ChallengeSave> = {
        'cup-1.1': passed(318_400),
        'runs.1': { tries: 3, passes: 0, bestLevels: 1, best: null, passedOn: null },
      };
      for (let i = 1; i <= 5; i++) records[`clear-1.${i}`] = passed();
      await open(page, '#/challenges?group=insane&unlock=all', save(3, records));
      await hover(page, cell(2).x, cell(2).y);
      await page.waitForTimeout(400);
      await shot(page, 'list-insane-dev');
      await go(page, '#/challenges?group=runs');
      await hover(page, cell(0).x, cell(0).y);
      await page.waitForTimeout(400);
      await shot(page, 'list-runs-dev');
      await go(page, '#/challenges?group=duel-2');
      await shot(page, 'list-duel-dev');
      // The intro card's squares with the session's open groups and the passes.
      await go(page, '#/adventure', 7000);
      await shot(page, 'intro-squares-dev');
    },
  ],
  [
    'intro',
    async (page) => {
      // The shipped rule before stage 3 is complete: every square locked.
      await open(page, '#/adventure', save(3), 7000);
      await shot(page, 'intro-squares-locked');
    },
  ],
  [
    'passed',
    async (page) => {
      await open(page, '#/challenges?unlock=all', save(3));
      await go(page, '#/challenges/orange-1.1/play?master=guide');
      await waitPlay(page);
      await shot(page, 'running-start');
      let kind = '';
      for (let attempt = 0; attempt < 4 && kind !== 'passed'; attempt++) {
        const end = await playOut(page, 'best', async (n) => {
          if (attempt === 0 && n === 3) {
            await page.waitForTimeout(900);
            await shot(page, 'running-shot');
          }
        });
        await page.waitForTimeout(3600);
        const s = await snapshot(page);
        kind = end === 'challenge' && s?.result === 'won' ? 'passed' : 'failed';
        if (kind === 'passed') await shot(page, 'end-passed');
        else {
          // The failed dialog's Try Again: a new run.
          await click(page, DIALOG.x + DIALOG.w - 30 - 85.5, DIALOG.y + DIALOG.h - 52 + 17);
          await waitPlay(page);
        }
      }
      if (kind !== 'passed') throw new Error('Orange Grove was not passed in 4 runs.');
    },
  ],
  [
    'failed',
    async (page) => {
      await open(page, '#/challenges?unlock=all', save(3));
      await go(page, '#/challenges/insane.2/play?master=guide');
      await waitPlay(page);
      const end = await playOut(page, 'weak');
      await page.waitForTimeout(3600);
      await shot(page, end === 'challenge' ? 'end-failed' : `end-${end}`);
    },
  ],
];

// ---------------------------------------------------------------------------------------------

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The checks' server config (tests/browser/vite.config.ts) on this tool's port: no file watching
 * or hot reload, so edits elsewhere in the repository never reload a page mid-run.
 */
async function startServer(): Promise<ChildProcess> {
  const vite = path.join(ROOT, 'node_modules', '.bin', 'vite');
  const args = ['--config', 'tests/browser/vite.config.ts', '--port', String(PORT), '--strictPort'];
  const child = spawn(vite, args, { cwd: ROOT, stdio: 'ignore' });
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
  const steps = STEPS.filter(
    ([name]) => filters.length === 0 || filters.some((f) => name.includes(f)),
  );
  await mkdir(OUT, { recursive: true });
  if (await isUp()) throw new Error(`Port ${PORT} is taken; stop what runs there first.`);
  const server = await startServer();
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
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
    });
    for (const [name, step] of steps) {
      console.log(name);
      await step(page);
    }
    if (errors.length > 0) {
      console.error(`Page errors:\n  ${errors.join('\n  ')}`);
      process.exitCode = 1;
    }
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
