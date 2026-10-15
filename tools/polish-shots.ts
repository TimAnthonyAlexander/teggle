// Plays real shots on the play route and captures the power presentation and the master-specific
// style shot callouts at 1600 x 900 into reference/teggle-shots/polish/ (gitignored), for review.
//
// Shots are found on copies of the attempt in the page (window.__teggle.searchAim) and fired at
// an exact tick (fire), so the page plays exactly the shot that was found. Starts its own dev
// server without file watching (tests/browser/vite.config.ts) on port 47853 and stops it after;
// it never touches the dev server on 47823.
//
// Usage: npx tsx tools/polish-shots.ts [scenario ...]   (default: all)

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { AimGoal } from '../src/game/play/debug';
import { POWER_STYLE_SHOTS, styleShotName } from '../src/rules/style';

const PORT = 47853;
/** The example levels' board width (visual guide 16): its middle is under the launcher. */
const BOARD_WIDTH = 916;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'polish');

interface Snapshot {
  phase: string;
  ready: boolean;
  holding: boolean;
  wheel: boolean;
  greenHits: number;
  actions: string[];
  callouts: string[];
  balls: { id: number; x: number; y: number; r: number }[];
  effects: string[];
  flippers: boolean;
  pyramid: boolean;
  shotsTaken: number;
  result: string | null;
  returning: number[];
}

interface Debug {
  snapshot(): Snapshot;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
  searchAim(
    goal: AimGoal,
    maxWait?: number,
    fire?: boolean,
  ): { angle: number; wait: number } | null;
  fire(angle: number, wait?: number): boolean;
  setAutoFlip(on: boolean): void;
  setFrozen(on: boolean): void;
  perf(reset?: boolean): Record<string, number>;
}

/** The page's window with the play screen's dev handle (src/game/play/debug.ts). */
interface DevWindow {
  __teggle?: Debug;
}

/** Where the mouse rests: on the board, away from the HUD; it never moves during a run. */
const REST = { x: 800, y: 620 };

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const d = (window as unknown as DevWindow).__teggle;
    if (d === undefined) throw new Error('no dev handle');
    return d.snapshot();
  });
}

/**
 * Waits until `test` holds and freezes the play screen in that very frame, so a screenshot
 * catches it; unfreeze with frozen(page, false).
 */
async function freezeWhen(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const d = window.__teggle; const s = d?.snapshot(); if (s === undefined || !(${test})) return false; d.setFrozen(true); return true; })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function frozen(page: Page, on: boolean): Promise<void> {
  await page.evaluate((f) => {
    (window as unknown as DevWindow).__teggle?.setFrozen(f);
  }, on);
}

/** Waits until `test`, an expression over the snapshot `s`, holds on the page. */
async function until(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const s = window.__teggle?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function open(page: Page, level: string, query: string): Promise<void> {
  await page.goto(`${BASE}/?r=${Date.now()}#/play/examples/${level}.json?${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 30_000,
  });
  await page.waitForFunction(() => (window as unknown as DevWindow).__teggle !== undefined);
  await page.mouse.move(REST.x, REST.y);
  await aiming(page);
  // Frame timings from here on: the loading frames (which build the sprites) are left out.
  await page.evaluate(() => (window as unknown as DevWindow).__teggle?.perf(true));
}

async function aiming(page: Page): Promise<void> {
  await until(page, "(s.phase === 'aim' && s.ready && !s.holding) || s.phase === 'over'", 60_000);
}

/**
 * Searches a shot that reaches `goal` and, in the same call, schedules it for the exact tick the
 * search tried (no tick passes in between); waits until it is in play. False if none was found.
 */
async function searchFire(page: Page, goal: AimGoal, maxWait = 0): Promise<boolean> {
  const found = await page.evaluate(
    ([g, w]) => (window as unknown as DevWindow).__teggle?.searchAim(g, w, true) ?? null,
    [goal, maxWait] as const,
  );
  if (found === null) return false;
  await until(page, "s.phase === 'shot'", 30_000);
  return true;
}

async function fire(page: Page, angle: number, wait = 0): Promise<void> {
  const ok = await page.evaluate(
    ([a, w]) => (window as unknown as DevWindow).__teggle?.fire(a, w) ?? false,
    [angle, wait] as const,
  );
  if (!ok) throw new Error('the shot could not be fired');
  await until(page, "s.phase === 'shot'", 10_000);
}

async function pick(page: Page, goal: 'best' | 'green'): Promise<number> {
  return page.evaluate((g) => {
    const d = (window as unknown as DevWindow).__teggle;
    if (d === undefined) return Number.NaN;
    const a = d.pickAim(g);
    return Number.isNaN(a) ? d.pickAim('best') : a;
  }, goal);
}

/** Fires the best shot that lights a green peg (or the best at all) and waits for its end. */
async function shootGreen(page: Page): Promise<void> {
  await fire(page, await pick(page, 'green'));
  await aiming(page);
}

/** A shot that lights no orange or green peg, to move the attempt on; else the best one. */
async function shootQuiet(page: Page): Promise<void> {
  if (!(await searchFire(page, { quiet: true }))) await fire(page, await pick(page, 'best'));
  await aiming(page);
}

const nothing = (): Promise<void> => Promise.resolve();

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function clip(
  page: Page,
  name: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, clip: box });
  console.log(`  ${path.relative(ROOT, file)}`);
}

/**
 * Plays until a shot that reaches `goal` exists, fires it, and captures its callout as soon as
 * it shows. `prepare` runs before each search (a green hit to start the power, say).
 */
async function styleCallout(
  page: Page,
  name: string,
  styleId: string,
  maxWait: number,
  prepare: (page: Page) => Promise<void> = nothing,
  tries = 12,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    await prepare(page);
    if ((await snap(page)).phase === 'over') throw new Error(`${name}: the attempt ended`);
    if (await calloutNow(page, name, styleId, maxWait)) return;
    await shootQuiet(page);
  }
  throw new Error(`${name}: no shot found`);
}

/** Fires a shot that earns `styleId` now, if there is one, and captures its callout. */
async function calloutNow(
  page: Page,
  name: string,
  styleId: string,
  maxWait: number,
): Promise<boolean> {
  if (!(await searchFire(page, { style: styleId }, maxWait))) return false;
  const text = `style:${styleShotName(styleId as `power:${string}`).toUpperCase()}!`;
  await until(page, `s.callouts.includes(${JSON.stringify(text)})`, 60_000);
  await page.waitForTimeout(220);
  await frozen(page, true);
  await shot(page, name);
  await frozen(page, false);
  return true;
}

/** The Lucky Spin draws Multiball; the new ball must stay hidden until the wheel stops. */
async function luckySpinMultiball(page: Page): Promise<void> {
  for (let seed = 1; seed <= 200; seed++) {
    await open(page, 'plinko', `power=luckySpin&seed=${seed}&balls=20`);
    if (!(await searchFire(page, { action: 'luckySpin:multiball' }))) continue;
    console.log(`  seed ${seed}`);
    await until(page, 's.wheel && s.holding', 20_000);
    await page.waitForTimeout(900);
    const during = await snap(page);
    console.log(`  balls in the world while the wheel turns: ${during.balls.length}`);
    await shot(page, 'lucky-spin-multiball-wheel');
    await until(page, '!s.holding', 10_000);
    await page.waitForTimeout(250);
    await shot(page, 'lucky-spin-multiball-after');
    return;
  }
  throw new Error('no seed drew Multiball');
}

/** A Spooky Ball that comes back near the middle, under the launcher housing. */
async function spookyReturn(page: Page): Promise<void> {
  await open(page, 'web', 'power=spookyBall&seed=3&balls=30');
  const middle = BOARD_WIDTH / 2;
  for (let i = 0; i < 15; i++) {
    if (!(await searchFire(page, { returnNear: middle }))) {
      await shootQuiet(page);
      continue;
    }
    // Right after the return the ball sits at the top edge, under the housing, and is drawn
    // over it until it has cleared it.
    await freezeWhen(page, 's.returning.length > 0');
    await shot(page, 'spooky-return');
    await clip(page, 'spooky-return-over-housing', { x: 560, y: 0, width: 480, height: 270 });
    await frozen(page, false);
    // A few ticks later, still under the housing's lower edge.
    await page.waitForTimeout(60);
    await frozen(page, true);
    await clip(page, 'spooky-return-later', { x: 560, y: 0, width: 480, height: 270 });
    await frozen(page, false);
    return;
  }
  throw new Error('no Spooky return near the middle');
}

const SCENARIOS: Record<string, (page: Page) => Promise<void>> = {
  luckySpinMultiball,
  spookyReturn,
  pyramid: async (page) => {
    await open(page, 'plinko', 'power=pyramid&seed=7&balls=30');
    await shootGreen(page);
    await until(page, 's.pyramid', 5000);
    await page.waitForTimeout(300);
    await shot(page, 'pyramid-bucket');
    await clip(page, 'pyramid-bucket-zoom', { x: 0, y: 720, width: 1600, height: 180 });
  },
  flippers: async (page) => {
    await open(page, 'plinko', 'power=flippers&seed=7&balls=30');
    await shootGreen(page);
    await until(page, 's.flippers', 5000);
    await page.waitForTimeout(300);
    await shot(page, 'flippers-rest');
    await clip(page, 'flippers-rest-left', { x: 100, y: 660, width: 420, height: 240 });
    await clip(page, 'flippers-rest-right', { x: 1080, y: 660, width: 420, height: 240 });
    await fire(page, await pick(page, 'best'));
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await clip(page, 'flippers-up-left', { x: 100, y: 660, width: 420, height: 240 });
    await page.keyboard.up('Space');
    await aiming(page);
  },
  feverMultiball: async (page) => {
    // One orange peg: a shot that lights it and then a green peg starts a Multiball in Fever.
    const s = POWER_STYLE_SHOTS.feverMultiball.shot;
    for (let seed = 1; seed <= 200; seed++) {
      await open(page, 'plinko', `power=multiball&seed=${seed}&orange=1`);
      if (await calloutNow(page, 'callout-fever-multiball', s, 0)) return;
    }
    throw new Error('no Fever Multiball');
  },
  doubleCatch: async (page) => {
    await open(page, 'plinko', 'power=multiball&seed=7&balls=60');
    await styleCallout(page, 'callout-double-catch', 'doubleCatch', 600, nothing, 30);
  },
  pyramidCatch: async (page) => {
    await open(page, 'plinko', 'power=pyramid&seed=7&balls=60');
    await styleCallout(
      page,
      'callout-pyramid-catch',
      POWER_STYLE_SHOTS.pyramidCatch.shot,
      300,
      async (p) => {
        if (!(await snap(p)).pyramid) await shootGreen(p);
      },
      20,
    );
  },
  flipperRally: async (page) => {
    await open(page, 'plinko', 'power=flippers&seed=7&balls=60');
    await page.evaluate(() => (window as unknown as DevWindow).__teggle?.setAutoFlip(true));
    await styleCallout(
      page,
      'callout-flipper-rally',
      POWER_STYLE_SHOTS.flipperRally.shot,
      0,
      async (p) => {
        if (!(await snap(p)).flippers) await shootGreen(p);
      },
      25,
    );
  },
  fireballCatch: async (page) => {
    await open(page, 'mixed', 'power=fireball&seed=7&balls=60');
    await styleCallout(
      page,
      'callout-fireball-catch',
      POWER_STYLE_SHOTS.fireballCatch.shot,
      300,
      async (p) => {
        const s = await snap(p);
        if (!s.effects.some((e) => e.startsWith('fireball:') && !e.endsWith(':next'))) {
          await shootGreen(p);
        }
      },
      25,
    );
  },
  bigBallCatch: async (page) => {
    for (let seed = 1; seed <= 200; seed++) {
      await open(page, 'plinko', `power=luckySpin&seed=${seed}&balls=40`);
      if (!(await searchFire(page, { action: 'luckySpin:bigBall' }))) continue;
      await aiming(page);
      try {
        await styleCallout(
          page,
          'callout-big-ball-catch',
          POWER_STYLE_SHOTS.bigBallCatch.shot,
          300,
          nothing,
          2,
        );
        return;
      } catch {
        // The Big Ball's two shots found no catch; spin again on another seed.
      }
    }
    throw new Error('no Big Ball catch');
  },
};

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('the dev server did not start');
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const names = Object.keys(SCENARIOS).filter((n) => only.length === 0 || only.includes(n));
  await mkdir(OUT, { recursive: true });
  const server = spawn(
    'npx',
    ['vite', '--config', 'tests/browser/vite.config.ts', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' },
  );
  const browser = await chromium.launch();
  let failed = false;
  try {
    await waitForServer();
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
    for (const name of names) {
      console.log(name);
      const run = SCENARIOS[name];
      try {
        if (run !== undefined) await run(page);
        const perf = await page.evaluate(() => (window as unknown as DevWindow).__teggle?.perf());
        if (perf !== undefined) {
          console.log(
            `  render ${perf.renderAvg?.toFixed(2)} ms avg, ${perf.renderMax?.toFixed(1)} max, ` +
              `${perf.framesOver20ms} frames over 20 ms`,
          );
        }
      } catch (err) {
        failed = true;
        console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length > 0) {
      failed = true;
      console.error(`Page errors:\n  ${errors.join('\n  ')}`);
    }
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
