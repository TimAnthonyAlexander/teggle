// Drives the background line editor (#/editor/<id>) in Chromium with real mouse and keys and
// captures review screenshots at 1600 x 900 into reference/teggle-shots/editor/ (gitignored):
// the lines over the picture, a selected line, a point drag with the live preview, a new line
// being drawn, a manual edit and its validity finding, the full checks' findings, and the start
// page. It never saves: the browser profile is fresh, so no repository folder is connected.
//
// Uses the dev server on http://localhost:47823, or the one TEGGLE_BASE names (a separate server
// keeps edits elsewhere from reloading the page mid-run). It never starts or stops a server.
//
// Usage: npx tsx tools/editor-shots.ts

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { parseLines } from '../src/gen/lines';

const BASE = process.env.TEGGLE_BASE ?? 'http://localhost:47823';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'editor');

interface Snapshot {
  loaded: boolean;
  version: number;
  tool: string;
  selLine: string | null;
  selObject: number | null;
  fitted: boolean;
  count: number | null;
  issues: number | null;
  checking: boolean;
  checked: { current: boolean; failures: string[] } | null;
  objects: { id: number; x: number; y: number; line: string | null }[];
}

interface Handle {
  toClient(x: number, y: number): { x: number; y: number };
  setView(zoom: number, x: number, y: number): void;
  snapshot(): Snapshot;
}

/** The page's window with the editor's dev handle (src/editor/editor.ts). */
interface EditorWindow {
  readonly __teggleEditor?: Handle;
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const h = (window as unknown as EditorWindow).__teggleEditor;
    if (h === undefined) throw new Error('no editor handle');
    return h.snapshot();
  });
}

async function until(page: Page, test: string, timeout = 30_000): Promise<void> {
  const expression = `(() => { const s = window.__teggleEditor?.snapshot(); return s !== undefined && Boolean(${test}); })()`;
  await page.waitForFunction(expression, undefined, { timeout, polling: 100 });
}

async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([bx, by]) => {
      const h = (window as unknown as EditorWindow).__teggleEditor;
      if (h === undefined) throw new Error('no editor handle');
      return h.toClient(bx ?? 0, by ?? 0);
    },
    [x, y],
  );
}

async function view(page: Page, zoom: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([z, vx, vy]) => {
      (window as unknown as EditorWindow).__teggleEditor?.setView(z ?? 1, vx ?? 0, vy ?? 0);
    },
    [zoom, x, y],
  );
  await page.waitForTimeout(120);
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function open(page: Page, id: string): Promise<void> {
  // A download just before can hold the page's load event; the app's own ready flag is the
  // signal that matters.
  await page.goto(`${BASE}/?editor=${Date.now()}#/editor/${id}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 20_000,
  });
  await until(page, 's.loaded && s.fitted');
  await page.waitForTimeout(400);
}

/** Scrolls the side panel to a section. */
async function showSection(page: Page, title: string): Promise<void> {
  await page.evaluate((t) => {
    const s = [...document.querySelectorAll('.ted-section > summary')].find((x) =>
      x.textContent.startsWith(t),
    );
    s?.parentElement?.scrollIntoView({ block: 'start' });
  }, title);
  await page.waitForTimeout(100);
}

async function clickList(page: Page, text: string): Promise<void> {
  await page
    .locator('.ted-side .ted-list li')
    .filter({ has: page.locator('.ted-grow', { hasText: new RegExp(`^${text}$`) }) })
    .first()
    .click();
  await page.waitForTimeout(150);
}

/** Downloads a file through one of the Save panel's buttons and returns its text. */
async function downloaded(page: Page, label: string): Promise<string> {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: label, exact: true }).click(),
  ]);
  return readFile(await dl.path(), 'utf8');
}

/**
 * Runs the checks on an unedited campaign level in the browser and compares the editor's level
 * and recipe downloads with the files `npm run campaign:build` wrote: they must be the same bytes.
 */
async function verifyExport(page: Page, id: string): Promise<boolean> {
  await open(page, id);
  await page.keyboard.press('Control+Enter');
  await until(page, 's.checked !== null && !s.checking', 120_000);
  const level = await downloaded(page, `${id}.json (level)`);
  const recipe = await downloaded(page, `${id}.json (recipe)`);
  const onDisk = await readFile(
    path.join(ROOT, 'public', 'levels', 'campaign', `${id}.json`),
    'utf8',
  );
  const source = await readFile(path.join(ROOT, 'campaign', 'levels', `${id}.json`), 'utf8');
  const ok = level === onDisk && recipe === source;
  console.log(
    `  ${id}: level file ${level === onDisk ? 'matches' : 'DIFFERS from'} the build's, recipe ${recipe === source ? 'matches' : 'DIFFERS from'} campaign/levels/${id}.json`,
  );
  return ok;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const lines = parseLines(
    JSON.parse(
      await readFile(path.join(ROOT, 'public', 'levels', 'campaign', '1-1.lines.json'), 'utf8'),
    ),
  );
  const point = (id: string, i: number): [number, number] => {
    const p = lines.lines.find((l) => l.id === id)?.points[i];
    if (p === undefined) throw new Error(`no point ${i} on ${id}`);
    return [p[0], p[1]];
  };
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

    console.log('1-1');
    await open(page, '1-1');
    await shot(page, '1-1-lines-over-picture');

    // A selected line: the envelope, closer up, with its control points and smoothed curve.
    await clickList(page, 'envelope');
    await view(page, 2.1, 250, 40);
    await shot(page, '1-1-selected-line');

    // Dragging a control point: the preview follows the drag.
    const [px, py] = point('stripe-3', 2);
    await clickList(page, 'stripe-3');
    const from = await at(page, px, py);
    const to = await at(page, px + 46, py + 10);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.waitForTimeout(120);
    await shot(page, '1-1-drag-live-preview');
    await page.mouse.up();
    await until(page, 's.fitted');
    await page.waitForTimeout(200);
    await shot(page, '1-1-after-drag-fitted');
    await page.keyboard.press('Control+z');
    await until(page, 's.fitted');

    // Drawing a new line.
    await view(page, 1.33, -20, -30);
    await page.keyboard.press('n');
    for (const [x, y, corner] of [
      [300, 380, false],
      [350, 340, false],
      [420, 360, true],
      [470, 330, false],
    ] as const) {
      const p = await at(page, x, y);
      if (corner) await page.keyboard.down('Shift');
      await page.mouse.click(p.x, p.y);
      if (corner) await page.keyboard.up('Shift');
    }
    const c = await at(page, 520, 350);
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(120);
    await shot(page, '1-1-drawing-a-line');
    await page.keyboard.press('Escape');

    // A manual edit: the peg on the small low-left balloon moved into its ring, an invalid spot.
    await page.keyboard.press('e');
    const s = await snap(page);
    const peg = s.objects.find((o) => o.line === 'balloon-low-left-center');
    if (peg === undefined) throw new Error('no balloon center peg');
    await view(page, 3, 120, 290);
    const a2 = await at(page, peg.x, peg.y);
    const b2 = await at(page, peg.x + 14, peg.y + 22);
    await page.mouse.move(a2.x, a2.y);
    await page.mouse.down();
    await page.mouse.move(b2.x, b2.y, { steps: 6 });
    await page.mouse.up();
    await until(page, 's.fitted && s.issues !== null && s.issues > 0');
    await page.waitForTimeout(200);
    await shot(page, '1-1-manual-edit-invalid');
    // Moved to a free spot instead, plus a deleted peg and an added one.
    const c2 = await at(page, peg.x + 14, peg.y + 22);
    const d2 = await at(page, peg.x, peg.y - 4);
    await page.mouse.move(c2.x, c2.y);
    await page.mouse.down();
    await page.mouse.move(d2.x, d2.y, { steps: 6 });
    await page.mouse.up();
    await until(page, 's.fitted && s.issues === 0');
    await page.keyboard.press('q');
    await until(page, 's.fitted');
    await page.waitForTimeout(200);
    await shot(page, '1-1-manual-edit');

    // The full checks on 1-1 as edited.
    await page.keyboard.press('Control+Enter');
    await until(page, 's.checked !== null && !s.checking', 120_000);
    await page.waitForTimeout(300);
    await showSection(page, 'Checks');
    await shot(page, '1-1-checks');

    // 1-4: the checks find stuck spots in the hull's bowl and give them quick disappear.
    console.log('1-4');
    await open(page, '1-4');
    await page.keyboard.press('Control+Enter');
    await until(page, 's.checked !== null && !s.checking', 120_000);
    await page.waitForTimeout(300);
    await showSection(page, 'Checks');
    await shot(page, '1-4-check-findings');
    await view(page, 2.6, 250, 300);
    await shot(page, '1-4-check-findings-close');

    // The start page.
    await page.goto(`${BASE}/?editor=start#/editor`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await page.waitForTimeout(600);
    await shot(page, 'start-page');

    console.log('exports');
    for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5']) {
      if (!(await verifyExport(page, id))) process.exitCode = 1;
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
