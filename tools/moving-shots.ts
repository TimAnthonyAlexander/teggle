// Review screenshots of the moving lines (src/gen/movers.ts) at 1600 x 900 into
// reference/teggle-shots/moving-lines/ (gitignored):
//   - each moving-line example (public/levels/examples/) on the play route: the board at the
//     start and a second and a half later as its parts move, then shots in flight, aimed with the
//     dev handle (window.__teggle.pickAim) and fired with real clicks, until the level is won or
//     lost; it reports the result and the shots taken;
//   - the line editor with each example's lines (loaded into the draft 3-2 through the editor's
//     dev handle, never saved): a moving line selected with its swept area and pivot, the motion
//     at another tick, the group's panel, and the preview playing.
//
// Uses the dev server on http://localhost:47823, or the one TEGGLE_BASE names (a separate server
// keeps edits elsewhere from reloading the page mid-run). It never starts or stops a server.
//
// Usage: npx tsx tools/moving-shots.ts [eight fish bubbles mill] [--no-play] [--no-editor]

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { EXAMPLES } from '../src/gen/examples';
import { linesJson } from '../src/gen/json';

const BASE = process.env.TEGGLE_BASE ?? 'http://localhost:47823';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'moving-lines');
const REST = { x: 800, y: 620 };

/** The line each example's editor shots select, and a tick to show the motion at. */
const EDITOR: Readonly<Record<string, { line: string; tick: number }>> = {
  eight: { line: 'wire', tick: 900 },
  fish: { line: 'fish-tail', tick: 450 },
  bubbles: { line: 'ring-7', tick: 400 },
  mill: { line: 'water-wheel-rim-1', tick: 300 },
};

interface PlaySnapshot {
  phase: string;
  result: string | null;
  ready: boolean;
  holding: boolean;
  dialog: string | null;
  shotsTaken: number;
  orangeLeft: number;
  balls: { x: number; y: number }[];
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function untilPlay(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const s = window.__teggle?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 'raf' });
}

async function playSnap(page: Page): Promise<PlaySnapshot> {
  return page.evaluate(() =>
    (window as unknown as { __teggle: { snapshot(): PlaySnapshot } }).__teggle.snapshot(),
  );
}

async function play(page: Page, file: string): Promise<void> {
  console.log(`${file}: play`);
  await page.goto(`${BASE}/?moving=${file}#/play/examples/${file}.json?seed=3`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 20_000,
  });
  await page.waitForFunction(() => '__teggle' in window);
  await page.mouse.move(REST.x, REST.y);
  await page.waitForTimeout(500);
  await shot(page, `${file}-play-start`);
  await page.waitForTimeout(1500);
  await shot(page, `${file}-play-later`);
  for (let n = 1; n <= 30; n++) {
    await untilPlay(
      page,
      "(s.phase === 'aim' && s.ready && !s.holding) || s.dialog !== null",
      60_000,
    );
    const s = await playSnap(page);
    if (s.dialog !== null || s.result !== null) {
      console.log(`  ${s.result ?? s.dialog ?? 'over'} after ${s.shotsTaken} shots`);
      await page.waitForTimeout(600);
      await shot(page, `${file}-play-end`);
      return;
    }
    await page.mouse.move(REST.x, REST.y);
    await page.evaluate(() => {
      const d = (
        window as unknown as { __teggle: { setAim(a: number): void; pickAim(g: string): number } }
      ).__teggle;
      d.setAim(d.pickAim('best'));
    });
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.mouse.up();
    await untilPlay(page, "s.phase === 'shot'", 5000);
    if (n === 2 || n === 5) {
      await untilPlay(page, "s.balls.some((b) => b.y > 280) || s.phase !== 'shot'", 15_000);
      await page.waitForTimeout(100);
      await shot(page, `${file}-play-shot-${n}`);
    }
    await untilPlay(page, "s.phase !== 'shot'", 120_000);
  }
  const s = await playSnap(page);
  console.log(`  stopped after ${s.shotsTaken} shots, ${s.orangeLeft} orange left`);
}

interface EditorHandle {
  setView(zoom: number, x: number, y: number): void;
  setTick(tick: number): void;
  loadLines(text: string): void;
  snapshot(): { loaded: boolean; fitted: boolean; playing: boolean; tick: number };
}

async function untilEditor(page: Page, test: string, timeout = 60_000): Promise<void> {
  const expression = `(() => { const s = window.__teggleEditor?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 100 });
}

async function loadLines(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as { __teggleEditor: EditorHandle }).__teggleEditor.loadLines(t);
  }, text);
}

async function setTick(page: Page, tick: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as { __teggleEditor: EditorHandle }).__teggleEditor.setTick(t);
  }, tick);
}

async function showSection(page: Page, title: string): Promise<void> {
  await page.evaluate((t) => {
    const s = [...document.querySelectorAll('.ted-section > summary')].find((x) =>
      x.textContent.startsWith(t),
    );
    s?.parentElement?.scrollIntoView({ block: 'start' });
  }, title);
  await page.waitForTimeout(150);
}

async function editor(page: Page, file: string): Promise<void> {
  const example = EXAMPLES.find((e) => e.file === file);
  const plan = EDITOR[file];
  if (example?.lines === undefined || plan === undefined) return;
  console.log(`${file}: editor`);
  await page.goto(`${BASE}/?moving-editor=${file}#/editor/3-2`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 20_000,
  });
  await untilEditor(page, 's.loaded');
  await loadLines(page, linesJson(example.lines));
  await untilEditor(page, 's.fitted');
  await page.waitForTimeout(400);
  // Select the moving line from the lines list: its swept area and pivot show.
  await page
    .locator('.ted-side .ted-list li')
    .filter({ has: page.locator('.ted-grow', { hasText: new RegExp(`^${plan.line}$`) }) })
    .first()
    .click();
  await page.waitForTimeout(500);
  await shot(page, `${file}-editor-swept`);
  await setTick(page, plan.tick);
  await page.waitForTimeout(300);
  await showSection(page, 'Motion');
  await shot(page, `${file}-editor-tick-${plan.tick}`);
  await page.keyboard.press('k');
  await page.waitForTimeout(1200);
  await shot(page, `${file}-editor-playing`);
  await page.keyboard.press('k');
  await untilEditor(page, '!s.playing');
  await page.evaluate(() => {
    document.querySelector('.ted-subhead')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(200);
  await shot(page, `${file}-editor-panel`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const chosen = files.length > 0 ? files : Object.keys(EDITOR);
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
    for (const file of chosen) {
      if (!args.includes('--no-play')) await play(page, file);
      if (!args.includes('--no-editor')) await editor(page, file);
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
