// Plays levels with the Flippers power (#/play/<level>?power=flippers) in Chromium and captures
// the bottom corners into reference/teggle-shots/flippers/ (gitignored): the flippers at rest
// after a green peg granted them, and raised (Space held) while a ball is low, to review that
// the flippers' keep-out zone leaves their whole swing free on every level.
//
// Uses the dev server on http://localhost:47823, or the one TEGGLE_BASE names. It never starts
// or stops a server.
//
// Usage: npx tsx tools/flipper-shots.ts [level path ...]
//        (default: campaign/1-1 to campaign/1-5 and examples/plinko)

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const BASE = process.env.TEGGLE_BASE ?? 'http://localhost:47823';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'flippers');
const REST = { x: 800, y: 620 };
const LEVELS = [
  'campaign/1-1',
  'campaign/1-2',
  'campaign/1-3',
  'campaign/1-4',
  'campaign/1-5',
  'examples/plinko',
];

interface Snapshot {
  phase: string;
  ready: boolean;
  holding: boolean;
  greenHits: number;
  flippers: boolean;
  balls: { x: number; y: number }[];
}

interface Debug {
  snapshot(): Snapshot;
  setAim(angle: number): void;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
}

/** The page's window with the play screen's dev handle (src/game/play/debug.ts). */
interface DevWindow {
  readonly __teggle?: Debug;
}

async function until(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const s = window.__teggle?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function shoot(page: Page, goal: 'best' | 'green'): Promise<boolean> {
  await until(page, "s.phase === 'aim' && s.ready && !s.holding");
  await page.mouse.move(REST.x, REST.y);
  const ok = await page.evaluate((g) => {
    const d = (window as unknown as DevWindow).__teggle;
    if (d === undefined) return false;
    const a = d.pickAim(g);
    if (Number.isNaN(a)) return false;
    d.setAim(a);
    return true;
  }, goal);
  if (!ok) return false;
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.up();
  return true;
}

async function capture(page: Page, name: string): Promise<void> {
  const full = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: full });
  // The bottom corners, larger.
  for (const [side, x] of [
    ['left', 0],
    ['right', 1000],
  ] as const) {
    await page.screenshot({
      path: path.join(OUT, `${name}-${side}.png`),
      clip: { x, y: 560, width: 600, height: 340 },
    });
  }
  console.log(`  ${path.relative(ROOT, full)} (+ left, right)`);
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2);
  const levels = wanted.length > 0 ? wanted : LEVELS;
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
    let n = 0;
    for (const level of levels) {
      const name = level.replace('/', '-');
      console.log(level);
      await page.goto(`${BASE}/?flippers=${n++}#/play/${level}.json?power=flippers&seed=7`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
        timeout: 20_000,
      });
      await page.waitForFunction(() => (window as unknown as DevWindow).__teggle !== undefined);
      let granted = false;
      for (let i = 0; i < 8 && !granted; i++) {
        const before = await page.evaluate(
          () => (window as unknown as DevWindow).__teggle?.snapshot().greenHits ?? 0,
        );
        if (!(await shoot(page, 'green'))) break;
        try {
          await until(page, `s.greenHits > ${before}`, 15_000);
          granted = true;
        } catch {
          // That shot lit no green peg.
        }
      }
      if (!granted) {
        console.log('  no green peg lit; skipped');
        continue;
      }
      await until(page, "s.phase === 'aim' && s.ready && s.flippers", 60_000);
      await page.mouse.move(REST.x, 100);
      await page.waitForTimeout(500);
      await capture(page, `${name}-rest`);
      await shoot(page, 'best');
      await until(page, "s.phase === 'shot' && s.balls.some((b) => b.y > 330)", 20_000).catch(
        () => undefined,
      );
      await page.keyboard.down('Space');
      await page.waitForTimeout(250);
      await capture(page, `${name}-raised`);
      await page.keyboard.up('Space');
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
