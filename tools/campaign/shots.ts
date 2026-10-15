// Plays campaign levels on the play route (#/play/campaign/<id>.json?stage=<stage>) in Chromium
// and captures review screenshots at 1600 x 900 into reference/teggle-shots/campaign/
// (gitignored): the board before the first shot, a shot in the middle of the level, and the
// Fever zoomed in on the last orange peg. It aims with the dev handle (window.__teggle.pickAim,
// the shot that lights the most orange pegs) and fires with real clicks, playing on until the
// level is won or lost, and reports the shots that took. A level that is lost is played again
// with more balls to reach its Fever.
//
// Uses the dev server on http://localhost:47823, which must be running, or the one TEGGLE_BASE
// names. It never starts or stops a server.
//
// Usage: npm run campaign:shots [-- <id> ...]   (default: every level in the manifest)
//        --seed <n> (first attempt's seed, default 1)

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { parseCampaignManifest } from '../../src/level/campaign';
import { LEVELS_DIR, ROOT } from './source';

const BASE = process.env.TEGGLE_BASE ?? 'http://localhost:47823';
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'campaign');
/** Where the mouse rests while the handle aims: on the board, out of the HUD's way. */
const REST = { x: 800, y: 620 };
/** The shot captured in flight for the mid-level picture. */
const MID_SHOT = 4;

interface Snapshot {
  phase: string;
  result: string | null;
  ready: boolean;
  holding: boolean;
  dialog: string | null;
  zoom: number;
  shotsTaken: number;
  orangeLeft: number;
  ballsLeft: number;
  balls: { x: number; y: number }[];
}

interface Debug {
  snapshot(): Snapshot;
  setAim(angle: number): void;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
}

/** The page's window with the dev handle (src/game/play/debug.ts). */
interface DevWindow {
  readonly __teggle?: Debug;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const d = (window as unknown as DevWindow).__teggle;
    if (d === undefined) throw new Error('no dev handle');
    return d.snapshot();
  });
}

/** Waits until `test`, an expression over the snapshot `s`, holds on the page. */
async function until(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const s = window.__teggle?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 20_000,
  });
  await page.waitForFunction(() => (window as unknown as DevWindow).__teggle !== undefined);
  await page.mouse.move(REST.x, REST.y);
}

/** Aims at the best shot and fires. */
async function fire(page: Page): Promise<void> {
  await page.mouse.move(REST.x, REST.y);
  await page.evaluate(() => {
    const d = (window as unknown as DevWindow).__teggle;
    if (d !== undefined) d.setAim(d.pickAim('best'));
  });
  await page.waitForTimeout(350);
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * Plays to the end of the level. Captures the mid-level shot when asked and the Fever when it
 * comes. Returns the result and the shots it took.
 */
async function play(
  page: Page,
  id: string,
  captureMid: boolean,
): Promise<{ result: string; shots: number }> {
  for (;;) {
    await until(page, "(s.phase === 'aim' && s.ready && !s.holding) || s.dialog !== null", 60_000);
    const s = await snap(page);
    if (s.dialog !== null || s.result !== null) {
      return { result: s.result ?? s.dialog ?? 'unknown', shots: s.shotsTaken };
    }
    await fire(page);
    await until(page, "s.phase === 'shot'", 5000);
    if (captureMid && s.shotsTaken + 1 === MID_SHOT) {
      await until(page, "s.balls.some((b) => b.y > 260) || s.phase !== 'shot'", 15_000);
      await page.waitForTimeout(120);
      await shot(page, `${id}-mid`);
    }
    // Fever: wait for the full zoom after the last orange peg, or for the shot to end.
    await until(page, "s.zoom > 1.9 || s.phase !== 'shot'", 120_000);
    const after = await snap(page);
    if (after.zoom > 1.9) {
      await page.waitForTimeout(150);
      await shot(page, `${id}-fever`);
      await until(page, 's.dialog !== null', 120_000);
      await page.waitForTimeout(600);
      await shot(page, `${id}-end`);
    }
  }
}

async function main(): Promise<void> {
  const manifest = parseCampaignManifest(
    JSON.parse(await readFile(path.join(LEVELS_DIR, 'manifest.json'), 'utf8')),
  );
  const all = manifest.stages.flatMap((s) => s.levels.map((l) => ({ ...l, stage: s.stage })));
  const wanted = process.argv
    .slice(2)
    .filter((a, i, list) => !a.startsWith('--') && list[i - 1] !== '--seed');
  const levels = wanted.length === 0 ? all : all.filter((l) => wanted.includes(l.id));
  const seed = Number(arg('seed') ?? 1);
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
    for (const level of levels) {
      console.log(`${level.id} ${level.name}`);
      const route = `#/play/${level.file}?stage=${level.stage}&seed=${seed}`;
      await open(page, `${BASE}/?shot=${n++}${route}`);
      await page.waitForTimeout(500);
      await shot(page, `${level.id}-start`);
      const first = await play(page, level.id, true);
      console.log(`  ${first.result} after ${first.shots} shots (best aim, seed ${seed})`);
      if (first.result !== 'won') {
        await open(page, `${BASE}/?shot=${n++}${route}&balls=40`);
        const second = await play(page, level.id, false);
        console.log(`  with 40 balls: ${second.result} after ${second.shots} shots`);
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
