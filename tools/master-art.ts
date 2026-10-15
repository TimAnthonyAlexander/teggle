// Builds the shipped master portraits from found images (docs/art/masters-sources.md; every file
// is listed in docs/assets.md). Nothing is drawn or generated here: every pixel comes from the
// downloaded originals.
//
// The cast: nine masters are Google Emoji Kitchen stickers, each the master's emoji combined with
// a face (slightly smiling: neutral, grinning: happy, star-struck: power, crying: sad). Emoji sets
// have no gopher, so the Gopher comes from Maria Letta's Free Gophers Pack (CC0), with the same
// four moods.
//
// Originals: downloaded once with curl into reference/teggle-art/found-masters/ (gitignored) and
// kept there unchanged. `sources.json` next to them records each URL, the fetch date and the
// file's SHA-256; a file that is already there is never downloaded again.
//
// Processing, the same for every file (ImageMagick and cwebp, no hand retouching):
//   1. Framing is measured on the master's neutral original: the box around its opaque pixels
//      (alpha above 4%). The originals already have transparent backgrounds; nothing is keyed.
//      - head: the box is scaled so its longer side is `fill` of the launcher window crop
//        (CROP_WINDOW in src/game/art/portrait.ts: 0.76 of the square, centered at x 0.5, y 0.45)
//        and centered there, so the face sits in the round window. `focus` moves a lower point of
//        the box to the window center instead (0.5 is the middle), for the figures whose face
//        is below the top of a tall box: the lobster, the sunflower and the owl.
//      - bust (a standing figure): the box is scaled to `height` of the square with its top at
//        `top`, centered on the opaque pixels of its upper half. What falls below the square's
//        bottom edge is cut off, which leaves head and shoulders; the window crop hides the cut.
//   2. head: the neutral's scale and offset apply to all four expressions. Their originals share
//      one canvas, so the character stays in place and only the face changes. bust: the originals
//      are separate drawings, so each one is measured itself and gets the neutral's scale.
//   3. Lanczos resize onto a transparent 640 px square (the stickers are 534 px, so the face is
//      never enlarged), then WebP quality 90 with lossless alpha.
//
// Needs ImageMagick (`magick`), `cwebp` and `curl`. Usage:
//   npx tsx tools/master-art.ts [powerId ...]

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FOUND = path.join(ROOT, 'reference', 'teggle-art', 'found-masters');
const FRAMED = path.join(FOUND, 'framed');
const PUBLIC = path.join(ROOT, 'public', 'art', 'masters');
const SIZE = 640;
const QUALITY = 90;
/** CROP_WINDOW in src/game/art/portrait.ts. */
const WINDOW_SIDE = 0.76;
const WINDOW_CY = 0.45;
const ALPHA_MIN = 10;
const AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) teggle-master-art';

const EXPRESSIONS = ['neutral', 'happy', 'power', 'sad'] as const;
type Expression = (typeof EXPRESSIONS)[number];

type Framing =
  | { readonly mode: 'head'; readonly fill: number; readonly focus: number }
  | { readonly mode: 'bust'; readonly height: number; readonly top: number };

interface Master {
  readonly power: string;
  readonly name: string;
  readonly framing: Framing;
  readonly images: Readonly<Record<Expression, string>>;
}

const KITCHEN = 'https://www.gstatic.com/android/keyboard/emojikitchen';
const GOPHERS =
  'https://raw.githubusercontent.com/MariaLetta/free-gophers-pack/master/characters/png';
const HEAD: Framing = { mode: 'head', fill: 0.9, focus: 0.5 };

/** Stage order (spec 7). Emoji Kitchen URLs name the date and the two emoji of each sticker. */
const CAST: readonly Master[] = [
  {
    power: 'guide',
    name: 'Unicorn',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20210831/u1f984/u1f984_u1f642.png`,
      happy: `${KITCHEN}/20210831/u1f984/u1f984_u1f600.png`,
      power: `${KITCHEN}/20210831/u1f984/u1f984_u1f929.png`,
      sad: `${KITCHEN}/20210831/u1f984/u1f984_u1f622.png`,
    },
  },
  {
    power: 'multiball',
    name: 'Gopher',
    framing: { mode: 'bust', height: 0.98, top: 0.12 },
    images: {
      neutral: `${GOPHERS}/6.png`,
      happy: `${GOPHERS}/35.png`,
      power: `${GOPHERS}/63.png`,
      sad: `${GOPHERS}/12.png`,
    },
  },
  {
    power: 'pyramid',
    name: 'Cat',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20201001/u1f642/u1f642_u1f431.png`,
      happy: `${KITCHEN}/20230301/u1f600/u1f600_u1f431.png`,
      power: `${KITCHEN}/20201001/u1f929/u1f929_u1f431.png`,
      sad: `${KITCHEN}/20230301/u1f622/u1f622_u1f431.png`,
    },
  },
  {
    power: 'spaceBlast',
    name: 'Alien',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20230301/u1f642/u1f642_u1f47d.png`,
      happy: `${KITCHEN}/20230301/u1f600/u1f600_u1f47d.png`,
      power: `${KITCHEN}/20201001/u1f929/u1f929_u1f47d.png`,
      sad: `${KITCHEN}/20230301/u1f622/u1f622_u1f47d.png`,
    },
  },
  {
    power: 'flippers',
    name: 'Lobster',
    framing: { mode: 'head', fill: 1.06, focus: 0.55 },
    images: {
      neutral: `${KITCHEN}/20240206/u1f99e/u1f99e_u1f642.png`,
      happy: `${KITCHEN}/20240206/u1f99e/u1f99e_u1f600.png`,
      power: `${KITCHEN}/20240206/u1f99e/u1f99e_u1f929.png`,
      sad: `${KITCHEN}/20240206/u1f99e/u1f99e_u1f622.png`,
    },
  },
  {
    power: 'spookyBall',
    name: 'Pumpkin',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20201001/u1f642/u1f642_u1f383.png`,
      happy: `${KITCHEN}/20201001/u1f600/u1f600_u1f383.png`,
      power: `${KITCHEN}/20201001/u1f929/u1f929_u1f383.png`,
      sad: `${KITCHEN}/20201001/u1f622/u1f622_u1f383.png`,
    },
  },
  {
    power: 'flowerPower',
    name: 'Sunflower',
    framing: { mode: 'head', fill: 1.02, focus: 0.42 },
    images: {
      neutral: `${KITCHEN}/20240206/u1f33b/u1f33b_u1f642.png`,
      happy: `${KITCHEN}/20240206/u1f33b/u1f33b_u1f600.png`,
      power: `${KITCHEN}/20240206/u1f33b/u1f33b_u1f929.png`,
      sad: `${KITCHEN}/20240206/u1f33b/u1f33b_u1f622.png`,
    },
  },
  {
    power: 'luckySpin',
    name: 'Rabbit',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20230301/u1f642/u1f642_u1f430.png`,
      happy: `${KITCHEN}/20230301/u1f600/u1f600_u1f430.png`,
      power: `${KITCHEN}/20201001/u1f929/u1f929_u1f430.png`,
      sad: `${KITCHEN}/20230301/u1f622/u1f622_u1f430.png`,
    },
  },
  {
    power: 'fireball',
    name: 'Wyvern',
    framing: HEAD,
    images: {
      neutral: `${KITCHEN}/20241023/u1f409/u1f409_u1f642.png`,
      happy: `${KITCHEN}/20241023/u1f409/u1f409_u1f600.png`,
      power: `${KITCHEN}/20241023/u1f409/u1f409_u1f929.png`,
      sad: `${KITCHEN}/20241023/u1f409/u1f409_u1f622.png`,
    },
  },
  {
    power: 'zenBall',
    name: 'Owl',
    framing: { mode: 'head', fill: 0.98, focus: 0.45 },
    images: {
      neutral: `${KITCHEN}/20210831/u1f989/u1f989_u1f642.png`,
      happy: `${KITCHEN}/20210831/u1f989/u1f989_u1f600.png`,
      power: `${KITCHEN}/20210831/u1f989/u1f989_u1f929.png`,
      sad: `${KITCHEN}/20210831/u1f989/u1f989_u1f622.png`,
    },
  },
];

interface SourceRecord {
  readonly url: string;
  readonly fetched: string;
  readonly sha256: string;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Alpha {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function magick(args: readonly string[]): Buffer {
  return execFileSync('magick', args, { maxBuffer: 1 << 28 });
}

/** Where an original is kept: the set's folder and the last parts of its URL. */
function originalPath(url: string): string {
  const parts = new URL(url).pathname.split('/').filter((p) => p !== '');
  return url.startsWith(KITCHEN)
    ? path.join(FOUND, 'emoji-kitchen', parts.slice(-3).join('-'))
    : path.join(FOUND, 'free-gophers-pack', parts.slice(-3).join('-'));
}

/** Downloads the original once and records it; later runs read the kept file. */
function fetchOriginal(url: string, sources: Record<string, SourceRecord>): string {
  const file = originalPath(url);
  const key = path.relative(FOUND, file);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    execFileSync('curl', ['-fsSL', '-A', AGENT, '-o', file, url]);
    sources[key] = {
      url,
      // Local calendar date, YYYY-MM-DD.
      fetched: new Date().toLocaleDateString('en-CA'),
      sha256: sha256(readFileSync(file)),
    };
  }
  const record = sources[key];
  if (record === undefined) throw new Error(`${key} is on disk but not in sources.json`);
  if (sha256(readFileSync(file)) !== record.sha256) {
    throw new Error(`${key} changed since it was fetched`);
  }
  return file;
}

function readAlpha(file: string): Alpha {
  const [width = 0, height = 0] = magick(['identify', '-format', '%w %h', file])
    .toString()
    .trim()
    .split(' ')
    .map(Number);
  const data = magick([file, '-alpha', 'extract', '-depth', '8', 'gray:-']);
  if (data.length !== width * height) throw new Error(`${file}: unexpected alpha size`);
  return { width, height, data };
}

/** The box around pixels with alpha above ALPHA_MIN. */
function opaqueBox(a: Alpha): Box {
  let x0 = a.width;
  let y0 = a.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if ((a.data[y * a.width + x] ?? 0) > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('no opaque pixels');
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Alpha-weighted mean x of the rows y0 .. y1 - 1. */
function centroidX(a: Alpha, y0: number, y1: number): number {
  let sum = 0;
  let weight = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < a.width; x++) {
      const v = a.data[y * a.width + x] ?? 0;
      sum += v * x;
      weight += v;
    }
  }
  return weight > 0 ? sum / weight : a.width / 2;
}

/** Scales `region` of `file` by `scale` and places its top left at (dx, dy) on the square. */
function place(file: string, region: Box, scale: number, dx: number, dy: number, out: string) {
  const w = Math.max(1, Math.round(region.w * scale));
  const h = Math.max(1, Math.round(region.h * scale));
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  magick([
    '-size',
    `${SIZE}x${SIZE}`,
    'xc:none',
    '(',
    file,
    '-crop',
    `${region.w}x${region.h}+${region.x}+${region.y}`,
    '+repage',
    '-filter',
    'Lanczos',
    '-resize',
    `${w}x${h}!`,
    ')',
    '-geometry',
    `${ox >= 0 ? '+' : ''}${ox}${oy >= 0 ? '+' : ''}${oy}`,
    '-compose',
    'over',
    '-composite',
    `PNG32:${out}`,
  ]);
}

interface Built {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly scale: number;
  readonly source: string;
}

function buildMaster(m: Master, sources: Record<string, SourceRecord>): Built[] {
  const files = Object.fromEntries(
    EXPRESSIONS.map((x) => [x, fetchOriginal(m.images[x], sources)]),
  ) as Record<Expression, string>;
  const neutral = readAlpha(files.neutral);
  const nb = opaqueBox(neutral);
  mkdirSync(path.join(PUBLIC, m.power), { recursive: true });
  mkdirSync(FRAMED, { recursive: true });
  return EXPRESSIONS.map((x) => {
    const framed = path.join(FRAMED, `${m.power}-${x}.png`);
    let scale: number;
    if (m.framing.mode === 'head') {
      scale = (m.framing.fill * WINDOW_SIDE * SIZE) / Math.max(nb.w, nb.h);
      const dx = SIZE * 0.5 - (nb.x + nb.w / 2) * scale;
      const dy = SIZE * WINDOW_CY - (nb.y + nb.h * m.framing.focus) * scale;
      const whole = { x: 0, y: 0, w: neutral.width, h: neutral.height };
      place(files[x], whole, scale, dx, dy, framed);
    } else {
      scale = (m.framing.height * SIZE) / nb.h;
      const a = x === 'neutral' ? neutral : readAlpha(files[x]);
      const box = opaqueBox(a);
      // Only the rows that land on the square are resized.
      const rows = Math.min(a.height - box.y, Math.ceil((SIZE * (1 - m.framing.top)) / scale));
      const cx = centroidX(a, box.y, box.y + Math.round(box.h / 2));
      const region = { x: 0, y: box.y, w: a.width, h: rows };
      place(files[x], region, scale, SIZE / 2 - cx * scale, SIZE * m.framing.top, framed);
    }
    const webp = path.join(PUBLIC, m.power, `${x}.webp`);
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
    const bytes = readFileSync(webp);
    return {
      file: path.relative(ROOT, webp),
      bytes: bytes.length,
      sha256: sha256(bytes),
      scale,
      source: m.images[x],
    };
  });
}

function main(): void {
  const only = process.argv.slice(2);
  const unknown = only.filter((p) => !CAST.some((m) => m.power === p));
  if (unknown.length > 0) throw new Error(`unknown power id: ${unknown.join(', ')}`);
  mkdirSync(FOUND, { recursive: true });
  const sourcesPath = path.join(FOUND, 'sources.json');
  const sources = (
    existsSync(sourcesPath) ? JSON.parse(readFileSync(sourcesPath, 'utf8')) : {}
  ) as Record<string, SourceRecord>;
  let total = 0;
  try {
    for (const m of CAST) {
      if (only.length > 0 && !only.includes(m.power)) continue;
      for (const b of buildMaster(m, sources)) {
        total += b.bytes;
        console.log(`${b.file}  ${b.bytes} B  scale ${b.scale.toFixed(4)}  ${b.sha256}`);
      }
    }
  } finally {
    writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
  }
  console.log(`${(total / 1024).toFixed(1)} KB written`);
}

main();
