// Background pictures of campaign levels.
//
//   npm run campaign:art -- prompt <id>          prints the prompt for the level's picture (stage
//                                                style, shared layout part, subject), and the one
//                                                the kept picture was made with if it differs
//   npm run campaign:art -- import <id> <file>   turns a generated picture into the shipped one:
//                                                public/backgrounds/<background id>.webp
//
// The shipped picture covers the playfield opening (layout.opening, 910.67 x 548 world units) at
// 3 px per world unit, twice the 1600 x 900 logical canvas: 2732 x 1644. The generation is
// scaled with Lanczos to cover that size and center-cropped (ImageMagick), then encoded as WebP
// (cwebp, method 6, sharp YUV) at the highest quality that stays within 300,000 bytes. Both tools
// must be on the PATH. Raw generations stay out of the repository (reference/teggle-art/).

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { layout } from '../../src/game/layout';
import { BACKGROUNDS_DIR, composePrompt, loadCampaign, ROOT } from './source';

const run = promisify(execFile);

/** Device pixels per world unit: 2x the logical canvas's 1.5. */
const SCALE = 3;
export const PICTURE_W = Math.round(layout.opening.w * SCALE);
export const PICTURE_H = Math.round(layout.opening.h * SCALE);
/** Size budget per picture. */
export const MAX_BYTES = 300_000;
const QUALITY_MIN = 40;
const QUALITY_MAX = 92;

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

async function importPicture(id: string, raw: string): Promise<void> {
  const campaign = await loadCampaign();
  const src = campaign.levels.find((l) => l.level.id === id);
  if (src === undefined) throw new Error(`No campaign level ${id}.`);
  const tmp = await mkdtemp(path.join(tmpdir(), 'teggle-art-'));
  try {
    const png = path.join(tmp, 'picture.png');
    await run('magick', [
      raw,
      '-colorspace',
      'sRGB',
      '-filter',
      'Lanczos',
      '-resize',
      `${PICTURE_W}x${PICTURE_H}^`,
      '-gravity',
      'center',
      '-extent',
      `${PICTURE_W}x${PICTURE_H}`,
      '-strip',
      png,
    ]);
    // Highest quality within the budget (size grows with quality).
    let lo = QUALITY_MIN;
    let hi = QUALITY_MAX;
    let best: { q: number; bytes: number } | null = null;
    const webp = path.join(tmp, 'picture.webp');
    while (lo <= hi) {
      const q = Math.floor((lo + hi) / 2);
      const bytes = await encode(png, webp, q);
      if (bytes <= MAX_BYTES) {
        best = { q, bytes };
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }
    if (best === null) throw new Error(`Even quality ${QUALITY_MIN} is over ${MAX_BYTES} bytes.`);
    await encode(png, webp, best.q);
    await mkdir(BACKGROUNDS_DIR, { recursive: true });
    const out = path.join(BACKGROUNDS_DIR, `${src.level.background.id}.webp`);
    await copyFile(webp, out);
    console.log(
      `${path.relative(ROOT, out)}: ${PICTURE_W} x ${PICTURE_H}, WebP quality ${best.q}, ${best.bytes} bytes`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [command, id, file] = process.argv.slice(2);
  if (command === 'prompt' && id !== undefined) {
    const campaign = await loadCampaign();
    const src = campaign.levels.find((l) => l.level.id === id);
    if (src === undefined) throw new Error(`No campaign level ${id}.`);
    console.log(composePrompt(campaign.layout, src.stage, src.level));
    const sent = src.level.background.picture?.sent;
    if (sent !== undefined) {
      console.log(`\nThe kept picture was made with a different prompt:\n\n${sent}`);
    }
    return;
  }
  if (command === 'import' && id !== undefined && file !== undefined) {
    await importPicture(id, path.resolve(file));
    return;
  }
  throw new Error('Usage: campaign:art -- prompt <id> | import <id> <file>');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
