// Turns a raw generated master portrait into the shipped file (docs/art/masters-prompts.md).
//
// The image model refuses transparent output on this account, so portraits are generated on a
// flat chroma-key background (pure green, or magenta or blue for masters that are green or pink)
// and cut out here:
//   1. Key: alpha from how far a pixel leans toward the key color, only in a thin zone around
//      clearly-background pixels so the character's own colors stay opaque; the background is
//      unmixed from antialiased edges and the rim is despilled.
//   2. Frame: if the character's top is closer than 5.5% to the top edge, scale it down around
//      the bottom center, so the bust still runs off the bottom. A master's neutral portrait sets
//      the scale (stored in framing.json next to the raw files); its other expressions reuse it
//      so the character does not jump between expressions.
//   3. Resize to 896 px (the 190-unit intro portrait at k = 4.5, the 3x cap on the 1600 x 900
//      logical canvas) and encode WebP with lossless alpha.
//
// Needs ImageMagick (`magick`) and `cwebp`. Usage:
//   npx tsx tools/master-art.ts <powerId> <expression> <raw.png> <green|magenta|blue>

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ART = path.join(ROOT, 'reference', 'teggle-art', 'masters');
const PUBLIC = path.join(ROOT, 'public', 'art', 'masters');
const SIZE = 896;
const QUALITY = 80;
const HEADROOM = 0.055;
/** Rim zone around background pixels where soft alpha and despill apply, px. */
const RIM = 4;

type KeyName = 'green' | 'magenta' | 'blue';

const EXCESS: Record<KeyName, (r: number, g: number, b: number) => number> = {
  green: (r, g, b) => g - Math.max(r, b),
  magenta: (r, g, b) => Math.min(r, b) - g,
  blue: (r, g, b) => b - Math.max(r, g),
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

function magick(args: string[]): Buffer {
  return execFileSync('magick', args, { maxBuffer: 1 << 28 });
}

/** Keys the background out of `input`, writes an RGBA PNG to `output`. */
function key(input: string, output: string, keyName: KeyName): void {
  const [W = 0, H = 0] = magick(['identify', '-format', '%w %h', input])
    .toString()
    .trim()
    .split(' ')
    .map(Number);
  const rgb = magick([input, '-alpha', 'off', '-depth', '8', 'rgb:-']);
  const excess = EXCESS[keyName];
  const N = W * H;
  const px = (i: number, c: number) => rgb[i * 3 + c] ?? 0;
  const ex = new Float32Array(N);
  for (let i = 0; i < N; i++) ex[i] = excess(px(i, 0), px(i, 1), px(i, 2));

  // Key color: median of the strongly keyed pixels in the outer 6 px ring.
  const ring: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((x < 6 || y < 6 || x >= W - 6 || y >= H - 6) && (ex[i] ?? 0) > 100) ring.push(i);
    }
  }
  if (ring.length === 0) throw new Error(`${input}: no ${keyName} background found at the edges`);
  const K = [0, 1, 2].map((c) => median(ring.map((i) => px(i, c))));
  const [kr = 0, kg = 0, kb = 0] = K;
  const E = excess(kr, kg, kb);

  const bg = new Uint8Array(N);
  for (let i = 0; i < N; i++) bg[i] = (ex[i] ?? 0) > 0.5 * E ? 1 : 0;
  const zone = new Uint8Array(bg);
  for (let pass = 0; pass < RIM; pass++) {
    const prev = zone.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (prev[i] === 1) continue;
        if (
          (x > 0 && prev[i - 1] === 1) ||
          (x < W - 1 && prev[i + 1] === 1) ||
          (y > 0 && prev[i - W] === 1) ||
          (y < H - 1 && prev[i + W] === 1)
        ) {
          zone[i] = 1;
        }
      }
    }
  }

  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    let r = px(i, 0);
    let g = px(i, 1);
    let b = px(i, 2);
    let a = 1;
    if (zone[i] === 1) {
      const e = ex[i] ?? 0;
      a = e < 0.04 * E ? 1 : Math.min(1, Math.max(0, 1 - e / (0.9 * E)));
      if (a > 0 && a < 1) {
        r = (r - (1 - a) * kr) / a;
        g = (g - (1 - a) * kg) / a;
        b = (b - (1 - a) * kb) / a;
      }
      if (keyName === 'green') g = Math.min(g, Math.max(r, b));
      else if (keyName === 'blue') b = Math.min(b, Math.max(r, g));
      else {
        const spill = Math.min(r, b) - g;
        if (spill > 0) {
          r -= spill;
          b -= spill;
        }
      }
    }
    if (a <= 0) r = g = b = 0;
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    out[i * 4] = clamp(r);
    out[i * 4 + 1] = clamp(g);
    out[i * 4 + 2] = clamp(b);
    out[i * 4 + 3] = clamp(a * 255);
  }
  const tmp = mkdtempSync(path.join(ART, '.tmp-'));
  try {
    const raw = path.join(tmp, 'out.rgba');
    writeFileSync(raw, out);
    magick(['-size', `${W}x${H}`, '-depth', '8', `rgba:${raw}`, `PNG32:${output}`]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

interface Framing {
  readonly scale: number;
  readonly bbox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

function main(): void {
  const [id, expression, raw, keyArg] = process.argv.slice(2);
  if (
    id === undefined ||
    expression === undefined ||
    raw === undefined ||
    (keyArg !== 'green' && keyArg !== 'magenta' && keyArg !== 'blue')
  ) {
    throw new Error('usage: master-art.ts <powerId> <expression> <raw.png> <green|magenta|blue>');
  }
  for (const dir of [path.join(ART, 'keyed'), path.join(ART, 'final'), path.join(PUBLIC, id)]) {
    mkdirSync(dir, { recursive: true });
  }
  const keyed = path.join(ART, 'keyed', `${id}-${expression}.png`);
  key(raw, keyed, keyArg);

  const W = Number(magick(['identify', '-format', '%w', keyed]).toString());
  const trim = magick([keyed, '-alpha', 'extract', '-threshold', '4%', '-format', '%@', 'info:'])
    .toString()
    .trim();
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(trim);
  if (m === null) throw new Error(`${keyed}: no opaque pixels (${trim})`);
  const [bw = 0, bh = 0, bx = 0, by = 0] = m.slice(1).map(Number);

  const framingPath = path.join(ART, 'framing.json');
  const framing = (
    existsSync(framingPath) ? JSON.parse(readFileSync(framingPath, 'utf8')) : {}
  ) as Record<string, Framing>;
  const want = HEADROOM * W;
  const fit = by < want ? (W - want) / (W - by) : 1;
  const stored = framing[id];
  let scale: number;
  if (expression === 'neutral' || stored === undefined) {
    scale = fit;
    if (expression === 'neutral') {
      framing[id] = { scale, bbox: { x: bx, y: by, w: bw, h: bh } };
      writeFileSync(framingPath, `${JSON.stringify(framing, null, 2)}\n`);
    }
  } else {
    // An expression that reaches higher than its neutral (raised ears, flames) keeps headroom.
    scale = Math.min(stored.scale, fit);
  }

  const framed = path.join(ART, 'final', `${id}-${expression}.png`);
  const scaled = Math.round(W * scale);
  magick([
    keyed,
    '-resize',
    `${scaled}x${scaled}`,
    '-background',
    'none',
    '-gravity',
    'south',
    '-extent',
    `${W}x${W}`,
    '-filter',
    'Lanczos',
    '-resize',
    `${SIZE}x${SIZE}`,
    `PNG32:${framed}`,
  ]);
  const webp = path.join(PUBLIC, id, `${expression}.webp`);
  execFileSync('cwebp', [
    '-quiet',
    '-q',
    String(QUALITY),
    '-alpha_q',
    '100',
    '-m',
    '6',
    '-sharp_yuv',
    framed,
    '-o',
    webp,
  ]);
  const kb = readFileSync(webp).length / 1024;
  console.log(
    `${path.relative(ROOT, webp)}: ${kb.toFixed(1)} KB, top ${by}px, scale ${scale.toFixed(4)}`,
  );
}

main();
