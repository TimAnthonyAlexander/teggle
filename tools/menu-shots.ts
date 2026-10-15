// Captures the menus and the Adventure flow (main menu, options, how to play, stage intro card,
// a level won and lost through the real campaign, the next level, pause and its options, the
// stage complete moment, Quick Play's level select and the master picker) at 1600 x 900 and at
// a phone's landscape size, into reference/teggle-shots/menus/ (gitignored).
//
// Runs its own Vite dev server on port 47911 (never the shared one on 47823) unless one is
// already up there, and stops a server it started. Levels are won and lost by real play: the
// DEV handle window.__teggle picks the best aim found on a trial copy of the attempt, or a weak
// one, and fires; the saved progress is set through localStorage where a step needs a state.
//
// Usage: npm run shots:menus [-- name-filter ...]   (filters match step names; set
// MENU_SHOTS_DEVICES=desktop or phone for one device)

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from '@playwright/test';

const PORT = 47911;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'menus');
const SAVE_KEY = 'teggle.save.v1';
const WORLD_W = 3200 / 3;
const WORLD_H = 600;

const DEVICES: Record<string, BrowserContextOptions> = {
  desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
  phone: {
    viewport: { width: 852, height: 393 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

// ---------------------------------------------------------------------------------------------
// Saves

interface LevelSave {
  tries: number;
  wins: number;
  fullClear: boolean;
  best: number;
  campaignScore: number | null;
  top: { score: number; master: string | null; date: string }[];
}

/** A save with campaign levels 1-1 up to (not including) number `next` cleared on try 1. */
function saveThrough(
  next: number,
  extra: Partial<Record<string, Partial<LevelSave>>> = {},
): string {
  const levels: Record<string, LevelSave> = {};
  const scores = [184310, 226540, 151280, 298770, 241900];
  for (let n = 1; n < next; n++) {
    const stage = Math.ceil(n / 5);
    const id = `${stage}-${n - (stage - 1) * 5}`;
    const score = scores[(n - 1) % scores.length] ?? 100000;
    levels[id] = {
      tries: 1,
      wins: 1,
      fullClear: false,
      best: score,
      campaignScore: score,
      top: [{ score, master: 'guide', date: '2026-10-15' }],
      ...extra[id],
    };
  }
  return JSON.stringify({ version: 1, campaign: { next, try: 1, pick: null }, levels });
}

// ---------------------------------------------------------------------------------------------
// Page helpers

interface Ctx {
  page: Page;
  device: string;
  touch: boolean;
}

async function shot(c: Ctx, name: string): Promise<void> {
  const file = path.join(OUT, `${name}-${c.device}.png`);
  await c.page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

/** World coordinates to CSS pixels, as src/game/app/viewport.ts fits the world. */
function toCss(c: Ctx, x: number, y: number): { x: number; y: number } {
  const v = c.page.viewportSize() ?? { width: 1600, height: 900 };
  const s = Math.min(v.width / WORLD_W, v.height / WORLD_H);
  return {
    x: (v.width - WORLD_W * s) / 2 + x * s,
    y: (v.height - WORLD_H * s) / 2 + y * s,
  };
}

async function click(c: Ctx, x: number, y: number): Promise<void> {
  const p = toCss(c, x, y);
  if (c.touch) await c.page.touchscreen.tap(p.x, p.y);
  else await c.page.mouse.click(p.x, p.y);
}

async function hover(c: Ctx, x: number, y: number): Promise<void> {
  const p = toCss(c, x, y);
  await c.page.mouse.move(p.x, p.y);
}

/** Loads the app fresh at `hash` with `save` in storage (null clears it). */
async function open(c: Ctx, hash: string, save: string | null, settleMs = 900): Promise<void> {
  await c.page.goto(`${BASE}/?s=${Date.now()}`);
  await c.page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    [SAVE_KEY, save] as const,
  );
  await c.page.goto(`${BASE}/?s=${Date.now()}${hash}`);
  await c.page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 20_000,
  });
  await c.page.waitForTimeout(settleMs);
}

type Snap = Record<string, unknown>;

async function snapshot(c: Ctx): Promise<Snap | null> {
  return c.page.evaluate(() => {
    const t = (window as unknown as { __teggle?: { snapshot(): Record<string, unknown> } })
      .__teggle;
    return t === undefined ? null : t.snapshot();
  });
}

async function waitPlay(c: Ctx): Promise<void> {
  await c.page.waitForFunction(
    () => (window as unknown as { __teggle?: unknown }).__teggle !== undefined,
    null,
    { timeout: 20_000 },
  );
  await c.page.waitForTimeout(800);
}

/** Waits until the screen can fire again, or a dialog opens. */
async function waitReady(c: Ctx, timeoutMs = 90_000): Promise<Snap> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshot(c);
    if (s !== null) {
      if (s.dialog !== null) return s;
      if (s.phase === 'aim' && s.ready === true && s.holding !== true) return s;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting to aim: ${JSON.stringify(s)}`);
    await c.page.waitForTimeout(250);
  }
}

/** Fires the best shot found on a trial copy, or a weak one. */
async function fire(c: Ctx, mode: 'best' | 'weak'): Promise<void> {
  await c.page.evaluate((m) => {
    const t = (
      window as unknown as {
        __teggle: { pickAim(goal: string): number; fire(a: number, w?: number): boolean };
      }
    ).__teggle;
    // A weak shot: nearly flat to one side, so it lights little and rarely an orange peg.
    const angle = m === 'best' ? t.pickAim('best') : 1.52;
    t.fire(Number.isFinite(angle) ? angle : 0, 0);
  }, mode);
  await c.page.waitForTimeout(400);
}

/** Plays shots until the level ends; returns the end dialog's kind. */
async function playOut(c: Ctx, mode: 'best' | 'weak', onShot?: (n: number) => Promise<void>) {
  for (let n = 0; n < 40; n++) {
    const s = await waitReady(c);
    if (s.dialog === 'complete' || s.dialog === 'failed') return s.dialog;
    await fire(c, mode);
    await onShot?.(n);
  }
  throw new Error('The level did not end in 40 shots.');
}

/** Clicks the end dialog's primary button (the dialog box of src/game/play/dialogs.ts). */
async function dialogButton(c: Ctx): Promise<void> {
  await click(c, 187 + 133.33 + 425 / 2, 147 + 305 - 52 + 17);
}

// ---------------------------------------------------------------------------------------------
// Steps

const MENU = {
  adventure: { x: WORLD_W - 22 - 98, y: 30 + 73 },
  quickplay: { x: WORLD_W - 22 - 98, y: 222 + 73 },
  challenges: { x: WORLD_W - 22 - 98, y: 414 + 73 },
  options: { x: 40 + 750 / 3, y: 534 + 23 },
  help: { x: 40 + 1500 / 3, y: 534 + 23 },
};
const CENTER_X = WORLD_W / 2;

type Step = (c: Ctx) => Promise<void>;

const STEPS: readonly [string, Step][] = [
  [
    'menu',
    async (c) => {
      await open(c, '', null, 1500);
      await shot(c, 'main-new');
      if (!c.touch) {
        await hover(c, MENU.quickplay.x, MENU.quickplay.y);
        await c.page.waitForTimeout(300);
        await shot(c, 'main-hover-quickplay');
      }
      await click(c, MENU.challenges.x, MENU.challenges.y);
      await c.page.waitForTimeout(300);
      await shot(c, 'main-challenges-locked');
      await click(c, MENU.options.x, MENU.options.y);
      await c.page.waitForTimeout(600);
      await shot(c, 'options');
      // How to Play from inside the options dialog.
      await click(c, CENTER_X, 104 + 70 + 142 + 13);
      await c.page.waitForTimeout(600);
      await shot(c, 'help');
      await open(c, '', saveThrough(3), 1500);
      await shot(c, 'main-progress');
    },
  ],
  [
    'adventure',
    async (c) => {
      await open(c, '', null, 1200);
      await click(c, MENU.adventure.x, MENU.adventure.y);
      await c.page.waitForTimeout(2200);
      await shot(c, 'intro-typing');
      await c.page.waitForTimeout(5500);
      await shot(c, 'intro');
      await click(c, CENTER_X, 600 - 62 + 18);
      await waitPlay(c);
      await shot(c, 'level-1-1-start');
      let won = false;
      for (let attempt = 0; attempt < 6 && !won; attempt++) {
        const end = await playOut(c, 'best', async (n) => {
          if (attempt === 0 && n === 0) {
            await c.page.waitForTimeout(700);
            await shot(c, 'level-1-1-shot');
          }
        });
        await c.page.waitForTimeout(3600);
        if (end === 'complete') {
          won = true;
          await shot(c, 'level-1-1-complete');
          await dialogButton(c);
        } else {
          await shot(c, 'level-1-1-failed');
          await dialogButton(c);
          await c.page.waitForTimeout(800);
        }
      }
      if (!won) throw new Error('Level 1-1 was not won in 6 attempts.');
      await waitPlay(c);
      await c.page.waitForTimeout(600);
      await shot(c, 'level-1-2-next');
      const end = await playOut(c, 'weak');
      await c.page.waitForTimeout(3600);
      await shot(c, end === 'failed' ? 'level-1-2-failed' : 'level-1-2-complete');
      await dialogButton(c);
      await c.page.waitForTimeout(1200);
      const s = await snapshot(c);
      console.log(`    retry: try ${String(s?.tries)}, phase ${String(s?.phase)}`);
      await shot(c, 'level-1-2-retry');
      // Pause, then its options.
      await click(c, 37, 566);
      await c.page.waitForTimeout(500);
      await shot(c, 'pause');
      await click(c, CENTER_X, 266 + 13);
      await c.page.waitForTimeout(600);
      await shot(c, 'pause-options');
    },
  ],
  [
    'stage',
    async (c) => {
      await open(c, '#/adventure/next', saveThrough(6, { '1-3': { fullClear: true } }), 2500);
      await shot(c, 'stage-complete');
      await click(c, CENTER_X, 24 + 556 - 54 + 18);
      await c.page.waitForTimeout(1200);
      await shot(c, 'adventure-ahead-of-levels');
    },
  ],
  [
    'quickplay',
    async (c) => {
      await open(c, '#/quickplay', saveThrough(3), 1500);
      await shot(c, 'quickplay-partial');
      await open(c, '#/quickplay', saveThrough(6, { '1-3': { fullClear: true } }), 1500);
      if (c.touch) {
        await click(c, 26 + 158, 62 + 113);
        await c.page.waitForTimeout(300);
      } else {
        await hover(c, 26 + 158, 62 + 113);
        await c.page.waitForTimeout(300);
      }
      await shot(c, 'quickplay');
      // A second master is unlocked, so the picker comes before the level.
      await click(c, WORLD_W - 26 - 158, 62 + 113);
      if (c.touch) {
        await c.page.waitForTimeout(200);
        await click(c, WORLD_W - 26 - 158, 62 + 113);
      }
      await c.page.waitForTimeout(1500);
      await shot(c, 'picker');
      await click(c, WORLD_W - 290 + 85, 600 - 70 + 18);
      await waitPlay(c);
      await shot(c, 'quickplay-level');
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

async function startServer(): Promise<ChildProcess> {
  const child = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' },
  );
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
  let server: ChildProcess | null = null;
  if (!(await isUp())) server = await startServer();
  const browser = await chromium.launch();
  try {
    const only = (process.env.MENU_SHOTS_DEVICES ?? '').split(',').filter((d) => d !== '');
    for (const [device, options] of Object.entries(DEVICES)) {
      if (only.length > 0 && !only.includes(device)) continue;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
      });
      const c: Ctx = { page, device, touch: options.hasTouch === true };
      for (const [name, step] of steps) {
        console.log(`${device}: ${name}`);
        await step(c);
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
