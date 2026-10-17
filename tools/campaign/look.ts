// Turns a found picture into a shipped background: crop at the playfield's aspect, soften toward
// a painted look, grade toward the stage's palette, keep the values light to medium so all four
// peg colors read, and encode within the size budget (spec 14.2, "Decided in the backgrounds").
//
// The shipped picture covers the playfield opening (layout.opening, 910.67 x 548 world units) at
// 3 px per world unit, twice the 1600 x 900 logical canvas: 2732 x 1644. ImageMagick does the
// pixels and cwebp the encoding (method 6, sharp YUV) at the highest quality that stays within
// 300,000 bytes; both must be on the PATH. The same file and settings give the same bytes with
// the same tool versions, which docs/assets.md records.

import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { layout } from '../../src/game/layout';
import type { Look } from '../../src/gen/campaign-source';

const run = promisify(execFile);

/** Device pixels per world unit: 2x the logical canvas's 1.5. */
const SCALE = 3;
export const PICTURE_W = Math.round(layout.opening.w * SCALE);
export const PICTURE_H = Math.round(layout.opening.h * SCALE);
export const ASPECT = PICTURE_W / PICTURE_H;
/** Softening runs at half the shipped size, so its radius means the same on every picture. */
const WORK_W = PICTURE_W / 2;
const WORK_H = PICTURE_H / 2;
/** Size budget per picture. */
export const MAX_BYTES = 300_000;
const QUALITY_MIN = 40;
const QUALITY_MAX = 92;
/**
 * ImageMagick's threads: one, so a batch keeps the machine quiet. The bytes do not depend on
 * the count (the shipped files came out the same with ImageMagick's default and with 1 and 4).
 */
const MAGICK_THREADS = 1;

/** x, y, width, height in the source file's pixels. */
export type Crop = readonly [number, number, number, number];

/** Height of a crop of width w at the shipped aspect. */
function heightFor(w: number): number {
  return Math.round(w / ASPECT);
}

/** The largest crop at the shipped aspect, centered. */
export function centerCrop(width: number, height: number): Crop {
  const w = Math.min(width, Math.floor(height * ASPECT));
  const h = Math.min(height, heightFor(w));
  return [Math.floor((width - w) / 2), Math.floor((height - h) / 2), w, h];
}

/**
 * A crop from "x,y,w" (pixels, the height follows from the aspect) or, when every value is at
 * most 1, from fractions of the file's width and height; "center" for the largest centered crop.
 */
export function parseCrop(spec: string, width: number, height: number): Crop {
  if (spec === 'center') return centerCrop(width, height);
  const v = spec.split(',').map(Number);
  if (v.length !== 3 || v.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--crop takes x,y,w (pixels or fractions), not "${spec}".`);
  }
  const [a = 0, b = 0, c = 0] = v;
  const fractions = v.every((n) => n <= 1);
  const x = Math.round(fractions ? a * width : a);
  const y = Math.round(fractions ? b * height : b);
  const w = Math.round(fractions ? c * width : c);
  const h = heightFor(w);
  if (w < 1 || x + w > width || y + h > height) {
    throw new Error(`The crop ${x},${y} ${w}x${h} leaves the ${width}x${height} picture.`);
  }
  return [x, y, w, h];
}

function pct(v: number): string {
  return String(Math.round(v * 10_000) / 100);
}

/** ImageMagick arguments that make the shipped pixels (a PNG) from the source file. */
export function magickArgs(
  input: string,
  crop: Crop,
  flop: boolean,
  look: Look,
  out: string,
): string[] {
  const [x, y, w, h] = crop;
  const [dark, middle, light] = look.palette;
  return [
    `${input}[0]`,
    '-auto-orient',
    '-colorspace',
    'sRGB',
    // Transparent parts of an illustration take the palette's light color.
    '-background',
    light,
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-crop',
    `${w}x${h}+${x}+${y}`,
    '+repage',
    ...(flop ? ['-flop'] : []),
    '-filter',
    'Lanczos',
    '-resize',
    `${WORK_W}x${WORK_H}!`,
    // Softening: fine texture (grass, leaves, grain) melts where it is low in contrast, then
    // the edge-preserving smoothing flattens what is left into patches...
    ...(look.paint > 0
      ? ['-selective-blur', `0x${look.paint * 2}+12%`, '-kuwahara', String(look.paint)]
      : []),
    '-filter',
    'Lanczos',
    '-resize',
    `${PICTURE_W}x${PICTURE_H}!`,
    // ...whose edges a soft blur rounds off, like the strokes of a soft brush.
    ...(look.paint > 0 ? ['-blur', `0x${Math.round(look.paint * 120) / 100}`] : []),
    '-modulate',
    `${pct(look.brightness)},${pct(look.saturation)},100`,
    // The palette's gradient map: the picture's luminance through shadow, middle and light.
    '(',
    '+clone',
    '-colorspace',
    'Gray',
    '-colorspace',
    'sRGB',
    '(',
    '-size',
    '1x128',
    `gradient:${dark}-${middle}`,
    '-size',
    '1x128',
    `gradient:${middle}-${light}`,
    '-append',
    ')',
    '-clut',
    ')',
    '-compose',
    'dissolve',
    '-define',
    `compose:args=${pct(look.tint)}`,
    '-composite',
    '-gamma',
    String(look.gamma),
    '+level',
    `${pct(look.floor)}%,${pct(look.ceiling)}%`,
    '-depth',
    '8',
    '-strip',
    out,
  ];
}

async function encode(png: string, out: string, quality: number): Promise<number> {
  await run('cwebp', [
    '-quiet',
    '-q',
    String(quality),
    '-m',
    '6',
    '-sharp_yuv',
    '-metadata',
    'none',
    png,
    '-o',
    out,
  ]);
  return (await stat(out)).size;
}

export interface Rendered {
  readonly quality: number;
  readonly bytes: number;
}

/**
 * Renders the shipped picture: the processed PNG (kept at `png` when given, for review) and
 * the WebP at the highest quality within the budget.
 */
export async function render(
  input: string,
  crop: Crop,
  flop: boolean,
  look: Look,
  webpOut: string,
  pngOut?: string,
): Promise<Rendered> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'teggle-look-'));
  try {
    const png = path.join(tmp, 'picture.png');
    await run('magick', magickArgs(input, crop, flop, look, png), {
      maxBuffer: 1 << 24,
      env: { ...process.env, MAGICK_THREAD_LIMIT: String(MAGICK_THREADS) },
    });
    if (pngOut !== undefined) await copyFile(png, pngOut);
    // Highest quality within the budget (size grows with quality).
    let lo = QUALITY_MIN;
    let hi = QUALITY_MAX;
    let best: Rendered | null = null;
    const webp = path.join(tmp, 'picture.webp');
    while (lo <= hi) {
      const q = Math.floor((lo + hi) / 2);
      const bytes = await encode(png, webp, q);
      if (bytes <= MAX_BYTES) {
        best = { quality: q, bytes };
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }
    if (best === null) throw new Error(`Even quality ${QUALITY_MIN} is over ${MAX_BYTES} bytes.`);
    await encode(png, webp, best.quality);
    await copyFile(webp, webpOut);
    return best;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Pixel size of a WebP file from its header (lossy, lossless or extended), or null. */
export function webpSize(bytes: Uint8Array): [number, number] | null {
  const text = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 30 || text(0) !== 'RIFF' || text(8) !== 'WEBP') return null;
  const b = (i: number): number => bytes[i] ?? 0;
  switch (text(12)) {
    case 'VP8 ':
      // A key frame: 3 bytes of frame tag, the start code, then 14-bit width and height.
      if (b(23) !== 0x9d || b(24) !== 0x01 || b(25) !== 0x2a) return null;
      return [(b(26) | (b(27) << 8)) & 0x3fff, (b(28) | (b(29) << 8)) & 0x3fff];
    case 'VP8L': {
      if (b(20) !== 0x2f) return null;
      const bits = b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    case 'VP8X':
      return [
        (b(24) | (b(25) << 8) | (b(26) << 16)) + 1,
        (b(27) | (b(28) << 8) | (b(29) << 16)) + 1,
      ];
    default:
      return null;
  }
}

/** Pixel size of an image file. */
export async function imageSize(file: string): Promise<[number, number]> {
  const { stdout } = await run('magick', ['identify', '-format', '%w %h\n', `${file}[0]`]);
  const [w = 0, h = 0] = stdout.trim().split('\n')[0]?.split(' ').map(Number) ?? [];
  if (w <= 0 || h <= 0) throw new Error(`Could not read the size of ${file}.`);
  return [w, h];
}

/** The tool versions that decide the bytes, for the asset manifest. */
export async function toolVersions(): Promise<string> {
  const magick = (await run('magick', ['-version'])).stdout.split('\n')[0] ?? '';
  const cwebp = (await run('cwebp', ['-version'])).stdout.trim().split('\n')[0] ?? '';
  return `${/ImageMagick \S+/.exec(magick)?.[0] ?? magick}, cwebp ${cwebp}`;
}
