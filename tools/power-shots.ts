// Plays real shots with each master power on the play route and captures the power moments at
// 1600 x 900 into reference/teggle-shots/powers/ (gitignored), for visual review. It aims with
// the dev handle (window.__teggle: pickAim, setAim) and fires with real mouse clicks; the
// Flippers are raised with the Space key.
//
// Uses the dev server on http://localhost:47823, which must be running, or the one TEGGLE_BASE
// names (a server without hot reload keeps edits elsewhere from reloading the page mid-run). It
// never starts or stops a server.
//
// Usage: npx tsx tools/power-shots.ts [power ...]   (default: all ten)

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const BASE = process.env.TEGGLE_BASE ?? 'http://localhost:47823';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'powers');

interface Snapshot {
  phase: string;
  ready: boolean;
  holding: boolean;
  greenHits: number;
  actions: string[];
  balls: { id: number; x: number; y: number; r: number }[];
  flippers: boolean;
  pyramid: boolean;
  covered: boolean;
  wheel: boolean;
  zen: string;
  lastZen: unknown;
  effects: string[];
  shotsTaken: number;
}

interface Debug {
  snapshot(): Snapshot;
  setAim(angle: number): void;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
  perf(): Record<string, number>;
}

declare global {
  interface Window {
    __teggle?: Debug;
  }
}

/** Where the mouse rests while the handle aims: on the board, out of the HUD's way. */
const REST = { x: 800, y: 620 };

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const d = window.__teggle;
    if (d === undefined) throw new Error('no dev handle');
    return d.snapshot();
  });
}

/** Waits until `test`, an expression over the snapshot `s`, holds on the page. */
async function until(page: Page, test: string, timeout = 20_000): Promise<void> {
  const expression = `(() => { const s = window.__teggle?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function shoot(page: Page, goal: 'best' | 'green'): Promise<void> {
  await until(page, "s.phase === 'aim' && s.ready && !s.holding");
  await page.mouse.move(REST.x, REST.y);
  await page.evaluate((g) => {
    const d = window.__teggle;
    if (d === undefined) return;
    let a = d.pickAim(g);
    if (Number.isNaN(a)) a = d.pickAim('best');
    d.setAim(a);
  }, goal);
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.mouse.up();
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

/** Fires at green pegs until one lights; captures the label and starburst. */
async function hitGreen(page: Page, power: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const before = (await snap(page)).greenHits;
    await shoot(page, 'green');
    try {
      await until(page, `s.greenHits > ${before}`, 12_000);
      await page.waitForTimeout(140);
      await shot(page, `${power}-green`);
      return;
    } catch {
      // That shot lit no green peg; try again.
    }
  }
  throw new Error(`${power}: no green peg lit`);
}

const SCRIPTS: Record<string, (page: Page) => Promise<void>> = {
  guide: async (page) => {
    await hitGreen(page, 'guide');
    await until(page, "s.phase === 'aim' && s.ready");
    await page.mouse.move(REST.x, REST.y);
    await page.evaluate(() => window.__teggle?.setAim(0.42));
    await page.waitForTimeout(500);
    await shot(page, 'guide-aim');
  },
  multiball: async (page) => {
    await hitGreen(page, 'multiball');
    await until(page, 's.balls.length >= 2', 3000);
    await page.waitForTimeout(450);
    await shot(page, 'multiball-two-balls');
  },
  pyramid: async (page) => {
    await hitGreen(page, 'pyramid');
    await page.waitForTimeout(250);
    await shot(page, 'pyramid-rays');
    await until(page, "s.phase === 'aim' && s.ready");
    await page.waitForTimeout(300);
    await shot(page, 'pyramid-aim');
  },
  spaceBlast: async (page) => {
    await hitGreen(page, 'space-blast');
    await page.waitForTimeout(120);
    await shot(page, 'space-blast');
  },
  flippers: async (page) => {
    await hitGreen(page, 'flippers');
    await page.keyboard.down('Space');
    await page.waitForTimeout(220);
    await shot(page, 'flippers-up');
    await page.keyboard.up('Space');
    await until(page, "s.phase === 'aim' && s.ready");
    await shoot(page, 'best');
    await until(page, "s.phase === 'shot' && s.balls.some((b) => b.y > 380)");
    await page.keyboard.down('Space');
    await page.waitForTimeout(160);
    await shot(page, 'flippers-flip');
    await page.keyboard.up('Space');
  },
  spookyBall: async (page) => {
    await hitGreen(page, 'spooky-ball');
    await until(page, 's.covered', 3000);
    await page.waitForTimeout(150);
    await shot(page, 'spooky-covered');
    await until(page, 's.balls.some((b) => b.y > 540)', 20_000);
    await until(page, 's.balls.some((b) => b.y < 60)', 5000);
    await page.waitForTimeout(60);
    await shot(page, 'spooky-return');
  },
  flowerPower: async (page) => {
    await hitGreen(page, 'flower-power');
    await page.waitForTimeout(240);
    await shot(page, 'flower-power');
  },
  luckySpin: async (page) => {
    await hitGreen(page, 'lucky-spin');
    await until(page, 's.wheel', 3000);
    await page.waitForTimeout(700);
    await shot(page, 'lucky-spin-spinning');
    await page.waitForTimeout(1500);
    await shot(page, 'lucky-spin-result');
  },
  fireball: async (page) => {
    await hitGreen(page, 'fireball');
    await until(page, "s.phase === 'aim' && s.ready");
    await page.waitForTimeout(300);
    await shot(page, 'fireball-aim');
    await shoot(page, 'best');
    await until(page, 's.balls.some((b) => b.r === 10)', 3000);
    await page.waitForTimeout(700);
    await shot(page, 'fireball-burning');
  },
  zenBall: async (page) => {
    await hitGreen(page, 'zen-ball');
    await until(page, "s.phase === 'aim' && s.ready");
    await shoot(page, 'best');
    await until(page, "s.zen !== 'idle'", 3000);
    await shot(page, 'zen-search');
    await until(page, "s.zen === 'swing' || s.zen === 'fire' || s.phase === 'shot'", 10_000);
    await page.waitForTimeout(200);
    await shot(page, 'zen-swing');
    await until(page, "s.phase === 'shot'", 5000);
    await page.waitForTimeout(500);
    await shot(page, 'zen-shot');
    console.log(`  search: ${JSON.stringify((await snap(page)).lastZen)}`);
  },
};

const LEVEL: Record<string, string> = {
  pyramid: 'plinko',
  flippers: 'plinko',
  spookyBall: 'web',
  fireball: 'architecture',
  zenBall: 'rotating',
};

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const powers = Object.keys(SCRIPTS).filter((p) => only.length === 0 || only.includes(p));
  await mkdir(OUT, { recursive: true });
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
    for (const power of powers) {
      const level = LEVEL[power] ?? 'plinko';
      console.log(`${power} on ${level}`);
      await page.goto(`${BASE}/?shot=${n++}#/play/examples/${level}.json?power=${power}&seed=7`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
        timeout: 20_000,
      });
      await page.waitForFunction(() => window.__teggle !== undefined);
      await page.mouse.move(REST.x, REST.y);
      const run = SCRIPTS[power];
      if (run !== undefined) await run(page);
      const perf = await page.evaluate(() => window.__teggle?.perf());
      if (perf !== undefined) {
        console.log(
          `  render ${perf.renderAvg?.toFixed(2)} ms avg, ${perf.renderMax?.toFixed(1)} max, ` +
            `${perf.fps?.toFixed(0)} fps, ${perf.framesOver20ms} frames over 20 ms`,
        );
      }
    }
    if (errors.length > 0) {
      console.error(`Page errors:\n  ${errors.join('\n  ')}`);
      process.exitCode = 1;
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
