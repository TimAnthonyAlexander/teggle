// Background pictures of campaign levels: found on the web (never generated, never a paid
// service, spec 12), processed in code into the stage's look (look.ts).
//
//   npm run campaign:art -- search <id> "<query>" [--source pixabay|pexels|wallhaven|openverse|
//                           commons] [--page n]
//       Searches one source (sources.ts; default pixabay), prints the candidates (ref, size,
//       author, title) and renders a numbered contact sheet into reference/teggle-art/sheets/.
//   npm run campaign:art -- show <ref|url>
//       Downloads a candidate's file (cached) and renders it with a grid in tenths and the
//       largest crop at the playfield's aspect, into reference/teggle-art/previews/.
//   npm run campaign:art -- import <id> <ref|url> [--crop x,y,w|center] [--flop | --no-flop]
//                           [--kind painting|photo] [--set key=value ...] [--reset] [--dry]
//                           [--page <url> --title .. --author .. --author-url .. --license ..
//                           --license-url ..]   (the last for a file given by its URL)
//       Downloads the file, records it in campaign/levels/<id>.json (background.picture) and
//       writes public/backgrounds/<background id>.webp. A crop is x,y,w in the file's pixels,
//       or in fractions of its size when every value is at most 1; the height follows from the
//       aspect. Re-importing the recorded ref keeps its crop, flop and adjustments unless the
//       options change them; --set changes one adjustment of the stage's look (lookSchema),
//       --reset drops them. --dry writes only the review copy in reference/teggle-art/previews/.
//   npm run campaign:art -- process [<id> ...]
//       Renders the shipped pictures again from the cached files and the recorded settings
//       (every level with a picture by default), after a stage's look changes.
//   npm run campaign:art -- sheet [--pegs]
//       A contact sheet of every shipped background, into reference/teggle-shots/backgrounds/;
//       with --pegs one sheet per stage, each picture at the logical canvas's size under pegs
//       of all four colors.
//   npm run campaign:art -- manifest
//       Prints the background tables of docs/assets.md from the sources and the shipped files
//       (manifest.ts); tools/campaign/backgrounds.test.ts checks that the document holds them.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  lookOf,
  lookSchema,
  PICTURE_KINDS,
  pictureSchema,
  type Picture,
} from '../../src/gen/campaign-source';
import { sourceJson } from '../../src/gen/json';
import { ASPECT, centerCrop, imageSize, parseCrop, render, toolVersions, type Crop } from './look';
import { backgroundsManifest, type ShippedFile } from './manifest';
import { BACKGROUNDS_DIR, loadCampaign, ROOT, SOURCE_DIR, type LoadedLevelSource } from './source';
import {
  ART_DIR,
  download,
  findCandidate,
  search,
  sha256,
  SOURCES,
  type Candidate,
  type SourceName,
} from './sources';

const SHEETS_DIR = path.join(ART_DIR, 'sheets');
const PREVIEW_DIR = path.join(ART_DIR, 'previews');
const SHOTS_DIR = path.join(ROOT, 'reference', 'teggle-shots', 'backgrounds');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function args(name: string): string[] {
  return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1] ?? ''] : []));
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** The positional arguments, options and their values left out. */
function positional(): string[] {
  const valued = new Set([
    '--source',
    '--page',
    '--crop',
    '--kind',
    '--set',
    '--title',
    '--author',
    '--author-url',
    '--license',
    '--license-url',
  ]);
  return process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1] ?? ''));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function level(id: string): Promise<LoadedLevelSource> {
  const campaign = await loadCampaign();
  const src = campaign.levels.find((l) => l.level.id === id);
  if (src === undefined) throw new Error(`No campaign level ${id}.`);
  return src;
}

async function dataUri(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Renders HTML in Chromium and saves it as an image. */
async function screenshot(html: string, width: number, out: string): Promise<void> {
  await mkdir(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    await page.screenshot({
      path: out,
      fullPage: true,
      type: out.endsWith('.png') ? 'png' : 'jpeg',
    });
  } finally {
    await browser.close();
  }
  console.log(path.relative(ROOT, out));
}

const SHEET_CSS =
  'body{margin:0;padding:8px;background:#222;color:#ddd;font:12px/1.3 Menlo,monospace}' +
  '.g{display:grid;gap:8px}figure{margin:0}img{width:100%;display:block;background:#444}' +
  'figcaption{padding:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  'b{color:#fff}';

async function searchCommand(id: string, query: string): Promise<void> {
  await level(id);
  const source = (arg('source') ?? 'pixabay') as SourceName;
  if (!SOURCES.includes(source)) throw new Error(`--source is one of ${SOURCES.join(', ')}.`);
  if (source === 'pexels') loadEnv();
  const page = Number(arg('page') ?? 1);
  const results = await search(source, query, page);
  if (results.length === 0) {
    console.log('No results.');
    return;
  }
  const cells: string[] = [];
  for (const [i, c] of results.entries()) {
    const size = c.width > 0 ? `${c.width}x${c.height}` : '?';
    console.log(
      `${String(i + 1).padStart(2)} ${c.ref}  ${size}  ${c.author ?? ''}  ${(c.title ?? '').slice(0, 70)}`,
    );
    const thumb = await download(source, c.thumb, 'thumbs').catch(() => null);
    cells.push(
      `<figure>${thumb === null ? '<div style="height:150px;background:#444"></div>' : `<img src="${await dataUri(thumb)}">`}<figcaption><b>${i + 1}</b> ${escape(c.ref.split(':').slice(1).join(':').slice(0, 24))} ${size}</figcaption></figure>`,
    );
  }
  const html = `<!doctype html><style>${SHEET_CSS}.g{grid-template-columns:repeat(6,1fr)}.g img{height:175px;object-fit:contain}</style><div class="g">${cells.join('')}</div>`;
  await screenshot(html, 1800, path.join(SHEETS_DIR, `${id}-${source}-${slug(query)}-${page}.jpg`));
}

/** Loads the Pexels key from .env.local into the environment (never printed). */
function loadEnv(): void {
  if (process.env.PEXELS_API_KEY !== undefined) return;
  try {
    process.loadEnvFile(path.join(ROOT, '.env.local'));
  } catch {
    // Without the file the search says the key is missing.
  }
}

/** A candidate by ref from an earlier search, or a file given by URL with its details. */
async function resolve(ref: string): Promise<{ candidate: Candidate; source: SourceName | 'web' }> {
  if (/^https?:\/\//.test(ref)) {
    const page = arg('page');
    if (page === undefined)
      throw new Error('A file given by URL needs --page <the page it is on>.');
    const kind = (arg('kind') ?? 'painting') as Candidate['kind'];
    return {
      source: 'web',
      candidate: {
        ref: 'web',
        source: new URL(page).host.replace(/^www\./, ''),
        kind,
        page,
        image: ref,
        thumb: ref,
        width: 0,
        height: 0,
        title: arg('title') ?? null,
        author: arg('author') ?? null,
        authorUrl: arg('author-url') ?? null,
        license: arg('license') ?? null,
        licenseUrl: arg('license-url') ?? null,
      },
    };
  }
  const candidate = await findCandidate(ref);
  if (candidate === null) throw new Error(`${ref} is in no earlier search; search for it first.`);
  return { candidate, source: ref.split(':')[0] as SourceName };
}

async function showCommand(ref: string): Promise<void> {
  const { candidate, source } = await resolve(ref);
  const file = await download(source, candidate.image, 'originals');
  const [w, h] = await imageSize(file);
  const [cx, cy, cw, ch] = centerCrop(w, h);
  const lines: string[] = [];
  for (let i = 1; i < 10; i++) {
    lines.push(
      `<line x1="${(w * i) / 10}" y1="0" x2="${(w * i) / 10}" y2="${h}"/>`,
      `<line x1="0" y1="${(h * i) / 10}" x2="${w}" y2="${(h * i) / 10}"/>`,
      `<text x="${(w * i) / 10 + w / 200}" y="${h / 25}">${i / 10}</text>`,
      `<text x="${w / 200}" y="${(h * i) / 10 - h / 200}">${i / 10}</text>`,
    );
  }
  const k = 1600 / w;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="1600" height="${Math.round(h * k)}"><image href="${await dataUri(file)}" width="${w}" height="${h}"/><g stroke="rgba(255,0,0,0.6)" stroke-width="${1.5 / k}" fill="#fff" font-size="${14 / k}" font-family="Menlo" paint-order="stroke">${lines.join('')}</g><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="none" stroke="#0f0" stroke-width="${2 / k}" stroke-dasharray="${8 / k}"/></svg>`;
  console.log(
    `${candidate.ref}: ${w} x ${h}, ${candidate.kind}, ${candidate.page}\n  largest crop at the aspect: ${cw} x ${ch} (fractions w ${(cw / w).toFixed(3)}, h ${(ch / h).toFixed(3)})`,
  );
  await screenshot(
    `<!doctype html><style>body{margin:0}</style>${svg}`,
    1600,
    path.join(PREVIEW_DIR, `show-${slug(ref)}.jpg`),
  );
}

/** Adjustments from --set key=value, checked against the look's schema. */
function settings(base: Picture['adjust']): Picture['adjust'] {
  const out: Record<string, unknown> = flag('reset') ? {} : { ...base };
  for (const s of args('set')) {
    const [key = '', value = ''] = s.split('=');
    out[key] = key === 'palette' ? value.split(',') : Number(value);
  }
  return lookSchema.partial().parse(out);
}

async function importCommand(id: string, ref: string): Promise<void> {
  const src = await level(id);
  const { candidate, source } = await resolve(ref);
  const file = await download(source, candidate.image, 'originals');
  const bytes = await readFile(file);
  const size = await imageSize(file);
  const before = src.level.background.picture;
  const same = before !== undefined && before.image === candidate.image;
  const spec = arg('crop');
  const crop: Crop =
    spec !== undefined
      ? parseCrop(spec, size[0], size[1])
      : same
        ? before.crop
        : centerCrop(size[0], size[1]);
  const [, , cw, ch] = crop;
  if (Math.abs(cw / ch - ASPECT) / ASPECT > 0.005) {
    throw new Error(`The crop's aspect ${(cw / ch).toFixed(4)} is not ${ASPECT.toFixed(4)}.`);
  }
  const kind = (arg('kind') ?? (same ? before.kind : candidate.kind)) as Picture['kind'];
  if (!PICTURE_KINDS.includes(kind)) throw new Error(`--kind is ${PICTURE_KINDS.join(' or ')}.`);
  const picture = pictureSchema.parse({
    ref: candidate.ref,
    kind,
    source: candidate.source,
    page: candidate.page,
    image: candidate.image,
    ...(candidate.title === null ? {} : { title: candidate.title }),
    ...(candidate.author === null ? {} : { author: candidate.author }),
    ...(candidate.authorUrl === null ? {} : { authorUrl: candidate.authorUrl }),
    ...(candidate.license === null ? {} : { license: candidate.license }),
    ...(candidate.licenseUrl === null ? {} : { licenseUrl: candidate.licenseUrl }),
    fetched: same ? before.fetched : today(),
    sha256: sha256(bytes),
    size,
    crop,
    flop: flag('flop') ? true : flag('no-flop') ? false : same ? before.flop : false,
    adjust: settings(same ? before.adjust : {}),
  });
  const look = lookOf(src.stage, picture);
  await mkdir(PREVIEW_DIR, { recursive: true });
  const review = path.join(PREVIEW_DIR, `${id}.png`);
  if (flag('dry')) {
    const webp = path.join(PREVIEW_DIR, `${id}.webp`);
    const r = await render(file, crop, picture.flop, look, webp, review);
    console.log(`${id} (dry): quality ${r.quality}, ${r.bytes} bytes`);
    await pegPreview(webp, path.join(PREVIEW_DIR, `${id}-pegs.jpg`));
    return;
  }
  // The level's source keeps every field it had; only background.picture changes.
  const sourceFile = path.join(SOURCE_DIR, 'levels', `${id}.json`);
  const raw = JSON.parse(await readFile(sourceFile, 'utf8')) as {
    background: Record<string, unknown>;
  };
  raw.background = { ...raw.background, picture: pictureRecord(picture) };
  await writeFile(sourceFile, sourceJson(raw));
  await renderLevel({
    ...src,
    level: { ...src.level, background: { ...src.level.background, picture } },
  });
}

/** The picture as written in the source file: optional fields only when set. */
function pictureRecord(p: Picture): Record<string, unknown> {
  return {
    ref: p.ref,
    kind: p.kind,
    source: p.source,
    page: p.page,
    image: p.image,
    ...(p.title === undefined ? {} : { title: p.title }),
    ...(p.author === undefined ? {} : { author: p.author }),
    ...(p.authorUrl === undefined ? {} : { authorUrl: p.authorUrl }),
    ...(p.license === undefined ? {} : { license: p.license }),
    ...(p.licenseUrl === undefined ? {} : { licenseUrl: p.licenseUrl }),
    fetched: p.fetched,
    sha256: p.sha256,
    size: p.size,
    crop: p.crop,
    flop: p.flop,
    adjust: p.adjust,
  };
}

/** Renders a level's shipped picture from its cached file and recorded settings. */
async function renderLevel(src: LoadedLevelSource): Promise<void> {
  const picture = src.level.background.picture;
  if (picture === undefined) throw new Error(`${src.level.id} has no picture yet.`);
  const source = picture.ref.split(':')[0] as SourceName | 'web';
  const file = await download(
    SOURCES.includes(source as SourceName) ? source : 'web',
    picture.image,
    'originals',
  );
  const got = sha256(await readFile(file));
  if (got !== picture.sha256) {
    throw new Error(`${src.level.id}: the cached file's SHA-256 is ${got}, not the recorded one.`);
  }
  await mkdir(BACKGROUNDS_DIR, { recursive: true });
  await mkdir(PREVIEW_DIR, { recursive: true });
  const out = path.join(BACKGROUNDS_DIR, `${src.level.background.id}.webp`);
  const r = await render(
    file,
    picture.crop,
    picture.flop,
    lookOf(src.stage, picture),
    out,
    path.join(PREVIEW_DIR, `${src.level.id}.png`),
  );
  console.log(
    `${src.level.id} ${path.relative(ROOT, out)}: quality ${r.quality}, ${r.bytes} bytes, sha256 ${sha256(await readFile(out))}`,
  );
}

async function processCommand(ids: readonly string[]): Promise<void> {
  const campaign = await loadCampaign();
  const chosen = campaign.levels.filter(
    (l) =>
      (ids.length === 0 || ids.includes(l.level.id)) && l.level.background.picture !== undefined,
  );
  for (const l of chosen) await renderLevel(l);
}

/** Peg colors from the original's sprite (visual guide 4.2): outline, rim, ring, body, lit. */
const PEG_COLORS = [
  ['#1b2646', '#728abd', '#162a68', '#22409a', '#e1fbff'],
  ['#4a2d13', '#be9056', '#7f2b10', '#d24429', '#f9e7b9'],
  ['#174214', '#5bb351', '#0b6908', '#0aaa02', '#cafeb6'],
  ['#49194c', '#c063c5', '#7a0875', '#cd17c2', '#ffdfff'],
] as const;
const LIT = ['#0f2595', '#326ed8', '#448cca', '#ceffff', '#ffffff'] as const;

/**
 * Pegs of all four colors (and some lit ones) drawn over a picture, in its world units
 * (910.67 x 548): a staggered grid at the original's median spacing, the cannon's area left
 * out. A stand-in for the game's renderer on levels that have no layout yet.
 */
function pegOverlay(): string {
  const out: string[] = [];
  let n = 0;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 22; col++) {
      const x = 24 + col * 41 + (row % 2) * 20.5;
      const y = 60 + row * 40;
      if (x > 890 || (Math.abs(x - 455) < 120 && y < 140)) continue;
      const lit = n % 11 === 5;
      const [outline, rim, ring, body, spec] = lit ? LIT : (PEG_COLORS[n % 4] ?? PEG_COLORS[0]);
      n++;
      out.push(
        `<circle cx="${x - 4}" cy="${y + 3}" r="10" fill="#000" opacity="0.45"/>`,
        `<circle cx="${x}" cy="${y}" r="10" fill="${outline}"/>`,
        `<circle cx="${x}" cy="${y}" r="9" fill="${rim}"/>`,
        `<circle cx="${x}" cy="${y}" r="7" fill="${ring}"/>`,
        `<circle cx="${x}" cy="${y}" r="5" fill="${body}"/>`,
        `<circle cx="${x - 2.5}" cy="${y - 3}" r="1.6" fill="${spec}"/>`,
      );
    }
  }
  return out.join('');
}

/** One picture with pegs over it at the logical canvas's size. */
async function pegPreview(picture: string, out: string): Promise<void> {
  const html = `<!doctype html><style>body{margin:0}</style><svg viewBox="0 0 910.67 548" width="1366" height="822"><image href="${await dataUri(picture)}" width="910.67" height="548" preserveAspectRatio="none"/>${pegOverlay()}</svg>`;
  await screenshot(html, 1366, out);
}

async function sheetCommand(): Promise<void> {
  const campaign = await loadCampaign();
  if (flag('pegs')) {
    // One sheet per stage: each picture at the logical canvas's size with pegs over it.
    for (const stage of campaign.stages) {
      const cells: string[] = [];
      for (const l of campaign.levels.filter((x) => x.stage.stage === stage.stage)) {
        const file = path.join(BACKGROUNDS_DIR, `${l.level.background.id}.webp`);
        if ((await readFile(file).catch(() => null)) === null) continue;
        cells.push(
          `<figure><svg viewBox="0 0 910.67 548" width="1100" height="662"><image href="${await dataUri(file)}" width="910.67" height="548" preserveAspectRatio="none"/>${pegOverlay()}</svg><figcaption><b>${l.level.id}</b> ${escape(l.level.name)}</figcaption></figure>`,
        );
      }
      if (cells.length === 0) continue;
      const html = `<!doctype html><style>${SHEET_CSS}.g{grid-template-columns:repeat(2,1100px)}</style><div class="g">${cells.join('')}</div>`;
      await screenshot(html, 2224, path.join(SHOTS_DIR, `pegs-stage-${stage.stage}.jpg`));
    }
    return;
  }
  const rows: string[] = [];
  for (const stage of campaign.stages) {
    const cells: string[] = [];
    for (const l of campaign.levels.filter((x) => x.stage.stage === stage.stage)) {
      const file = path.join(BACKGROUNDS_DIR, `${l.level.background.id}.webp`);
      const have = await readFile(file).catch(() => null);
      cells.push(
        `<figure>${have === null ? '<div style="aspect-ratio:1.662;background:#444"></div>' : `<img src="${await dataUri(file)}">`}<figcaption><b>${l.level.id}</b> ${escape(l.level.name)}</figcaption></figure>`,
      );
    }
    rows.push(
      `<h3 style="margin:10px 0 4px">${stage.stage} ${escape(stage.world)}</h3><div class="g">${cells.join('')}</div>`,
    );
  }
  const html = `<!doctype html><style>${SHEET_CSS}.g{grid-template-columns:repeat(5,1fr)}h3{font-size:14px;color:#fff}</style>${rows.join('')}`;
  await screenshot(html, 2400, path.join(SHOTS_DIR, 'contact-sheet.jpg'));
}

/** Prints the asset manifest's background tables (manifest.ts) and the tools that made them. */
async function manifestCommand(): Promise<void> {
  const campaign = await loadCampaign();
  const files = new Map<string, ShippedFile>();
  for (const l of campaign.levels) {
    const id = l.level.background.id;
    const bytes = await readFile(path.join(BACKGROUNDS_DIR, `${id}.webp`)).catch(() => null);
    if (bytes !== null) files.set(id, { bytes: bytes.length, sha256: sha256(bytes) });
  }
  console.log(`Processed with ${await toolVersions()}.\n`);
  console.log(backgroundsManifest(campaign.stages, campaign.levels, files));
}

async function main(): Promise<void> {
  const [command, a, b] = positional();
  if (command === 'search' && a !== undefined && b !== undefined) return searchCommand(a, b);
  if (command === 'show' && a !== undefined) return showCommand(a);
  if (command === 'import' && a !== undefined && b !== undefined) return importCommand(a, b);
  if (command === 'process') return processCommand(positional().slice(1));
  if (command === 'sheet') return sheetCommand();
  if (command === 'manifest') return manifestCommand();
  throw new Error(
    'Usage: campaign:art -- search <id> "<query>" [--source s] [--page n] | show <ref> | import <id> <ref|url> [--crop x,y,w] [--flop] [--set k=v] [--dry] | process [<id> ...] | sheet [--pegs] | manifest',
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
