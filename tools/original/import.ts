// Imports the original game's 55 campaign levels from the owner's copy (reference/, gitignored)
// into public/original/ for Quick Play's Original section (spec 14.1, "The original's levels"):
//
//   public/original/levels/<stage>-<level>.json   the level as tools/agents/original.ts converts
//                                                 it, at the original's 650 x 560 board, with its
//                                                 display name and picture id
//   public/original/backgrounds/<id>.webp         its picture, from the JPEG 2000 file
//   public/original/manifest.json                 the list the menus read (src/level/original.ts)
//
// Names come from the original's stages.cfg. Pictures are 646 x 543 and the game draws them at
// ORIGINAL_PICTURE; the two made for the whole 800 x 600 window (3d, whirlpool) are cropped to
// that rectangle, the part the original's frame leaves visible. Nothing else is done to them.
// WebP from cwebp at the settings of the campaign backgrounds (method 6, sharp YUV, no metadata)
// at quality 92, their highest. opj_decompress, magick and cwebp must be on the PATH; the same
// inputs and tool versions give the same bytes. The report says which files changed.
//
// Usage: npm run original:import

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { levelJson } from '../../src/gen/serialize';
import {
  ORIGINAL_PICTURE,
  parseOriginalManifest,
  type OriginalManifest,
} from '../../src/level/original';
import { parseLevel } from '../../src/level/schema';
import { compileLevel } from '../../src/sim/compile';
import { loadOriginal, ORIGINAL_CAMPAIGN } from '../agents/original';
import { parseStageLevels } from './stages';

const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PAK_LEVELS = path.join(ROOT, 'reference', 'peggle-2007', 'pak', 'levels');
const OUT = path.join(ROOT, 'public', 'original');
/** The original's window offset of the board (docs/research/original-tech.md 1.2). */
const BOARD_IN_WINDOW = { x: 75, y: 40 } as const;
const WEBP_QUALITY = 92;

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Writes a file unless it already has these bytes; says which. */
async function writeIfChanged(file: string, data: string | Buffer): Promise<string> {
  const before = await readFile(file).catch(() => null);
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  if (before !== null && before.equals(bytes)) return 'unchanged';
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return before === null ? 'new' : 'updated';
}

/** The file in `dir` named `name` plus `ext`, matched without regard to case. */
async function findFile(dir: string, name: string, ext: string): Promise<string> {
  const want = `${name}${ext}`.toLowerCase();
  const match = (await readdir(dir)).find((f) => f.toLowerCase() === want);
  if (match === undefined) throw new Error(`${dir} has no ${name}${ext}`);
  return path.join(dir, match);
}

/** Decodes a level's picture and encodes it as WebP: the 646 x 543 the original shows. */
async function picture(jp2: string): Promise<Buffer> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'teggle-original-'));
  try {
    const decoded = path.join(tmp, 'decoded.png');
    await run('opj_decompress', ['-quiet', '-i', jp2, '-o', decoded]);
    const { stdout } = await run('magick', ['identify', '-format', '%w %h', decoded]);
    const [w = 0, h = 0] = stdout.trim().split(' ').map(Number);
    const { width, height } = ORIGINAL_PICTURE;
    let crop: string[];
    if (w === width && h === height) {
      crop = [];
    } else if (w === 800 && h === 600) {
      const x = BOARD_IN_WINDOW.x + ORIGINAL_PICTURE.x;
      const y = BOARD_IN_WINDOW.y + ORIGINAL_PICTURE.y;
      crop = ['-crop', `${width}x${height}+${x}+${y}`, '+repage'];
    } else {
      throw new Error(`${jp2} is ${w} x ${h}, neither ${width} x ${height} nor 800 x 600`);
    }
    const png = path.join(tmp, 'picture.png');
    await run('magick', [decoded, '-alpha', 'off', ...crop, '-depth', '8', '-strip', png]);
    const webp = path.join(tmp, 'picture.webp');
    await run('cwebp', [
      '-quiet',
      '-q',
      String(WEBP_QUALITY),
      '-m',
      '6',
      '-sharp_yuv',
      '-metadata',
      'none',
      png,
      '-o',
      webp,
    ]);
    return await readFile(webp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const cfg = await readText(path.join(PAK_LEVELS, 'stages.cfg'));
  if (cfg === null)
    throw new Error(`${PAK_LEVELS}/stages.cfg is missing; unpack the owner's copy.`);
  const listed = parseStageLevels(cfg);
  if (listed.length !== ORIGINAL_CAMPAIGN.length) {
    throw new Error(`stages.cfg lists ${listed.length} levels, not ${ORIGINAL_CAMPAIGN.length}`);
  }
  const manifest: OriginalManifest = { formatVersion: 1, levels: [] };
  const levels: OriginalManifest['levels'][number][] = [];
  for (let n = 1; n <= ORIGINAL_CAMPAIGN.length; n++) {
    const file = ORIGINAL_CAMPAIGN[n - 1] ?? '';
    const entry = listed[n - 1];
    if (entry?.file.toLowerCase() !== file) {
      throw new Error(`stages.cfg has ${entry?.file ?? 'nothing'} where level ${n} is ${file}`);
    }
    const o = loadOriginal(n);
    const level = { ...o.level, name: entry.name, background: file };
    const text = levelJson(level);
    // What the game reads must parse and compile.
    compileLevel(parseLevel(JSON.parse(text)));
    const levelFile = `levels/${o.id}.json`;
    const levelWhat = await writeIfChanged(path.join(OUT, levelFile), text);
    const webp = await picture(await findFile(PAK_LEVELS, file, '.jp2'));
    const pictureWhat = await writeIfChanged(path.join(OUT, 'backgrounds', `${file}.webp`), webp);
    console.log(
      `${o.id.padEnd(5)} ${entry.name.padEnd(22)} level ${levelWhat}, picture ${pictureWhat} (${webp.length} bytes)`,
    );
    levels.push({
      id: o.id,
      number: n,
      stage: o.stage,
      name: entry.name,
      file: levelFile,
      background: file,
    });
  }
  const checked = parseOriginalManifest({ ...manifest, levels });
  const what = await writeIfChanged(
    path.join(OUT, 'manifest.json'),
    `${JSON.stringify(checked, null, 2)}\n`,
  );
  console.log(`manifest ${what}: ${checked.levels.length} levels`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
