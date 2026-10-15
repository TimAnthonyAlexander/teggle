// Renders a campaign level's picture in board coordinates with a coordinate grid over it, for
// tracing lines and solids by eye, and optionally the traced lines (smoothed, with numbered
// control points), the built level's objects and the placement limits (cannon clearance,
// bottom limit, the flippers' swing). Output: reference/teggle-shots/campaign/grid/
// (gitignored), via Chromium.
// A level without a picture yet gets a plain sky field instead.
//
// Usage: npm run campaign:grid -- <id> [--crop x0,y0,x1,y1] [--step 20] [--lines] [--level]
//        [--limits] [--picture <file>] [--level-file <file>] [--name <suffix>] [--sketch]
// --picture draws another file (a raw generation) instead of public/backgrounds/<id>.webp;
// --level-file draws another level file instead of public/levels/campaign/<id>.json;
// --sketch renders the lines and solids alone over exactly the picture's frame, into
// reference/teggle-art/sketches/<id>.png, as a layout guide for painting the picture.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  BOTTOM_LIMIT,
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  MIN_GAP,
} from '../../src/gen/constants';
import { flipperSweeps } from '../../src/gen/flippers';
import { smoothLine } from '../../src/gen/lines';
import { elementShape, filePose } from '../../src/gen/shapes';
import { BOARD_X, BOARD_Y, layout } from '../../src/game/layout';
import { parseLevel, type Level } from '../../src/level/schema';
import {
  BACKGROUNDS_DIR,
  LEVELS_DIR,
  loadCampaign,
  ROOT,
  type CampaignLevelSource,
} from './source';

const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'campaign', 'grid');
const SKETCH_DIR = path.join(ROOT, 'reference', 'teggle-art', 'sketches');
/** The picture covers the playfield opening, in board coordinates. */
const PIC = {
  x: layout.opening.x - BOARD_X,
  y: layout.opening.y - BOARD_Y,
  w: layout.opening.w,
  h: layout.opening.h,
};
const MAX_W = 1800;
const MAX_H = 1250;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function mime(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function grid(x0: number, y0: number, x1: number, y1: number, step: number, k: number): string {
  const out: string[] = [];
  const major = step * 5;
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const strong = x % major === 0;
    out.push(
      `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${strong ? 'rgba(255,40,40,0.75)' : 'rgba(0,0,0,0.28)'}" stroke-width="${(strong ? 1.6 : 0.8) / k}"/>`,
    );
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const strong = y % major === 0;
    out.push(
      `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${strong ? 'rgba(255,40,40,0.75)' : 'rgba(0,0,0,0.28)'}" stroke-width="${(strong ? 1.6 : 0.8) / k}"/>`,
    );
  }
  // Labels at every major intersection, so a crop always shows its coordinates.
  const fs = 11 / k;
  for (let x = Math.ceil(x0 / major) * major; x <= x1; x += major) {
    for (let y = Math.ceil(y0 / major) * major; y <= y1; y += major) {
      out.push(
        `<text x="${x + 2 / k}" y="${y - 2 / k}" font-size="${fs}" font-family="Menlo, monospace" fill="#fff" stroke="#000" stroke-width="${2.5 / k}" paint-order="stroke">${x},${y}</text>`,
      );
    }
  }
  return out.join('');
}

function limits(k: number): string {
  // The flippers' swing plus the minimum gap, as one area (src/gen/flippers.ts).
  const swing = flipperSweeps(916, 560)
    .flatMap((s) => s.poses)
    .map((p) => {
      const pts = p.xs.map((x, i) => `${n(x)},${n(p.ys[i] ?? 0)}`).join(' ');
      return `<polygon points="${pts}" fill="#f00" stroke="#f00" stroke-width="${2 * MIN_GAP}" stroke-linejoin="round"/>`;
    })
    .join('');
  return [
    `<circle cx="${CANNON_X}" cy="${CANNON_Y}" r="${CANNON_CLEARANCE}" fill="rgba(255,0,0,0.12)" stroke="#f33" stroke-width="${1.5 / k}" stroke-dasharray="${6 / k}"/>`,
    `<line x1="0" y1="${BOTTOM_LIMIT}" x2="916" y2="${BOTTOM_LIMIT}" stroke="#f33" stroke-width="${1.5 / k}" stroke-dasharray="${6 / k}"/>`,
    `<g opacity="0.2">${swing}</g>`,
  ].join('');
}

function levelSvg(level: Level, k: number): string {
  const out: string[] = [];
  for (const e of level.elements) {
    const s = elementShape(e, filePose(e));
    if (s === null) continue;
    const scoring = e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick';
    const fill = !scoring
      ? 'rgba(40,70,80,0.85)'
      : e.canBeOrange
        ? 'rgba(34,64,154,0.85)'
        : 'rgba(150,40,40,0.85)';
    const stroke = scoring && e.quickDisappear ? '#ff0' : '#fff';
    if (s.kind === 'circle') {
      out.push(
        `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="${fill}" stroke="${stroke}" stroke-width="${1.2 / k}"/>`,
      );
    } else if (s.closed) {
      const pts = s.xs.map((x, i) => `${n(x)},${n(s.ys[i] ?? 0)}`).join(' ');
      out.push(
        `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${1.2 / k}"/>`,
      );
    } else {
      const pts = s.xs.map((x, i) => `${n(x)},${n(s.ys[i] ?? 0)}`).join(' ');
      out.push(
        `<polyline points="${pts}" fill="none" stroke="#2a4650" stroke-width="${5 / k}" stroke-linecap="round"/>`,
      );
    }
  }
  return out.join('');
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (id === undefined || id.startsWith('--')) throw new Error('Give a level id, e.g. 1-3.');
  // With --picture the level's sources may not exist yet.
  const campaign =
    arg('picture') === undefined ? await loadCampaign() : await loadCampaign().catch(() => null);
  const src = campaign?.levels.find((l) => l.level.id === id) ?? null;
  const picture =
    arg('picture') ??
    (src === null ? null : path.join(BACKGROUNDS_DIR, `${src.level.background.id}.webp`));
  if (picture === null) throw new Error(`No campaign level ${id}; give --picture.`);
  const bytes = await readFile(picture).catch(() => null);
  if (bytes === null) console.log(`No picture at ${path.relative(ROOT, picture)} yet.`);
  const sketch = flag('sketch');
  if (sketch && src === null) throw new Error('--sketch needs the level sources.');
  // A sketch covers exactly the picture, so it can guide an image edit of the same frame.
  const crop = sketch
    ? [PIC.x, PIC.y, PIC.x + PIC.w, PIC.y + PIC.h]
    : (arg('crop') ?? '-4,-4,920,564').split(',').map(Number);
  const [x0 = -4, y0 = -4, x1 = 920, y1 = 564] = crop;
  const k = Math.min(MAX_W / (x1 - x0), MAX_H / (y1 - y0));
  const step = Number(arg('step') ?? 20);
  const width = Math.round((x1 - x0) * k);
  const height = Math.round((y1 - y0) * k);
  const parts = [
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#333"/>`,
    bytes === null || sketch
      ? `<rect x="${n(PIC.x)}" y="${n(PIC.y)}" width="${n(PIC.w)}" height="${n(PIC.h)}" fill="#b9d3ea"/>`
      : `<image href="data:${mime(picture)};base64,${bytes.toString('base64')}" x="${n(PIC.x)}" y="${n(PIC.y)}" width="${n(PIC.w)}" height="${n(PIC.h)}" preserveAspectRatio="none"/>`,
  ];
  if (sketch && src !== null) {
    parts.push(sketchSvg(src, k));
    await render(parts, x0, y0, x1, y1, width, height, path.join(SKETCH_DIR, `${id}.png`));
    return;
  }
  const levelFile =
    arg('level-file') ?? (flag('level') ? path.join(LEVELS_DIR, `${id}.json`) : null);
  if (levelFile !== null) {
    parts.push(levelSvg(parseLevel(JSON.parse(await readFile(levelFile, 'utf8'))), k));
  }
  parts.push(grid(x0, y0, x1, y1, step, k));
  if (flag('limits')) parts.push(limits(k));
  if (flag('lines') && src !== null) {
    for (const line of src.lines.lines) {
      const p = smoothLine(line);
      const pts = p.points.map((q) => `${n(q.x)},${n(q.y)}`).join(' ');
      const color = line.mode === 'bricks' ? '#ffb000' : '#00f0ff';
      parts.push(
        `<${p.closed ? 'polygon' : 'polyline'} points="${pts}" fill="none" stroke="${color}" stroke-width="${2 / k}"/>`,
      );
      line.points.forEach(([x, y], i) => {
        const corner = line.corners.includes(i);
        parts.push(
          `<circle cx="${x}" cy="${y}" r="${(corner ? 4 : 3) / k}" fill="${corner ? '#f0f' : color}" stroke="#000" stroke-width="${1 / k}"/>`,
          `<text x="${x + 4 / k}" y="${y + 10 / k}" font-size="${9 / k}" font-family="Menlo, monospace" fill="${color}" stroke="#000" stroke-width="${2 / k}" paint-order="stroke">${i === 0 ? `${line.id} ` : ''}${i}</text>`,
        );
      });
    }
  }
  const suffix = arg('name') ?? (arg('crop') === undefined ? 'grid' : `crop-${crop.join('-')}`);
  await render(parts, x0, y0, x1, y1, width, height, path.join(OUT, `${id}-${suffix}.png`));
}

/**
 * The composition of a level's lines and solids as plain shapes: brick lines as wide bands,
 * peg lines as rows of dots, solids filled. Meant as the layout guide for painting or editing
 * the level's picture so that the picture follows the lines.
 */
function sketchSvg(src: CampaignLevelSource, k: number): string {
  const out: string[] = [];
  for (const line of src.lines.lines) {
    const p = smoothLine(line);
    const pts = p.points.map((q) => `${n(q.x)},${n(q.y)}`).join(' ');
    const tag = p.closed ? 'polygon' : 'polyline';
    out.push(
      line.mode === 'bricks'
        ? `<${tag} points="${pts}" fill="none" stroke="#8a5a2b" stroke-width="20" stroke-linejoin="round"/>`
        : `<${tag} points="${pts}" fill="none" stroke="#2c3e6e" stroke-width="${3 / k}" stroke-dasharray="${6 / k} ${6 / k}"/>`,
    );
  }
  const solids = src.level.recipe.solids;
  for (const poly of solids?.polygons ?? []) {
    const pts = poly.points.map(([x, y]) => `${x},${y}`).join(' ');
    out.push(`<polygon points="${pts}" fill="#6b6f74"/>`);
  }
  for (const rod of solids?.rods ?? []) {
    out.push(
      `<line x1="${rod.a[0]}" y1="${rod.a[1]}" x2="${rod.b[0]}" y2="${rod.b[1]}" stroke="#6b6f74" stroke-width="6" stroke-linecap="round"/>`,
    );
  }
  for (const c of solids?.circles ?? []) {
    out.push(`<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="#6b6f74"/>`);
  }
  return out.join('');
}

async function render(
  parts: readonly string[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
  out: string,
): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">${parts.join('')}</svg>`;
  await mkdir(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#333">${svg}</body></html>`,
    );
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
  console.log(path.relative(ROOT, out));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
