// Where campaign pictures are found: search adapters for the sites the art tool searches, a
// cache under reference/teggle-art/<source>/ (gitignored) so a rerun never asks again, and the
// download of a chosen file.
//
//   pexels     photos, through the Pexels API with the key from .env.local (PEXELS_API_KEY,
//              read at run time, never printed). The API allows 200 requests an hour; every
//              request is logged in reference/teggle-art/pexels/requests.log and the tool stops
//              at 190 in the last hour.
//   pixabay    illustrations and vector art, read from the site's search pages in Chromium
//              (the site has no keyless API); files at most 1280 px wide.
//   wallhaven  wallpapers, mostly digital paintings, through its keyless API (safe for work only).
//   openverse  openly licensed images (Flickr, Wikimedia and others) through its keyless API.
//   commons    Wikimedia Commons through the MediaWiki API: paintings, book illustrations.
//
// No source is a paid service, and nothing here generates an image.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './source';

export const SOURCES = ['pexels', 'pixabay', 'wallhaven', 'openverse', 'commons'] as const;
export type SourceName = (typeof SOURCES)[number];

/** One search result, the same shape for every source. */
export interface Candidate {
  /** "<source>:<id>"; the art tool imports by it. */
  readonly ref: string;
  /** The site's name, as recorded with the picture. */
  readonly source: string;
  readonly kind: 'painting' | 'photo';
  readonly page: string;
  /** The largest file the source offers without an account. */
  readonly image: string;
  /** A small preview for the contact sheet. */
  readonly thumb: string;
  /** Pixel size of `image`, 0 when the source does not say. */
  readonly width: number;
  readonly height: number;
  readonly title: string | null;
  readonly author: string | null;
  readonly authorUrl: string | null;
  readonly license: string | null;
  readonly licenseUrl: string | null;
}

export const ART_DIR = path.join(ROOT, 'reference', 'teggle-art');
const USER_AGENT = 'teggle-campaign-art/1.0 (private game, local tool)';
const BROWSER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
/** Pexels' hourly limit is 200; the tool keeps a margin. */
const PEXELS_HOURLY = 190;

function sourceDir(source: SourceName | 'web'): string {
  return path.join(ART_DIR, source);
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

/** Text of an HTML fragment (Commons metadata holds HTML). */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Parsers: one search response to candidates. Pure, so they are tested on fixtures. ---

export function parsePexels(json: unknown): Candidate[] {
  return list(obj(json).photos).map((raw) => {
    const p = obj(raw);
    const src = obj(p.src);
    return {
      ref: `pexels:${num(p.id)}`,
      source: 'Pexels',
      kind: 'photo',
      page: str(p.url) ?? `https://www.pexels.com/photo/${num(p.id)}/`,
      image: str(src.original) ?? '',
      thumb: str(src.medium) ?? str(src.small) ?? '',
      width: num(p.width),
      height: num(p.height),
      title: str(p.alt),
      author: str(p.photographer),
      authorUrl: str(p.photographer_url),
      license: 'Pexels license',
      licenseUrl: 'https://www.pexels.com/license/',
    };
  });
}

export function parseWallhaven(json: unknown): Candidate[] {
  return list(obj(json).data).map((raw) => {
    const w = obj(raw);
    const thumbs = obj(w.thumbs);
    const original = str(w.source);
    return {
      ref: `wallhaven:${str(w.id) ?? ''}`,
      source: 'wallhaven',
      kind: 'painting',
      page: str(w.url) ?? '',
      image: str(w.path) ?? '',
      thumb: str(thumbs.small) ?? '',
      width: num(w.dimension_x),
      height: num(w.dimension_y),
      title: null,
      author: null,
      // The uploader names where the picture came from, often the artist's own page.
      authorUrl: original !== null && /^https?:\/\//.test(original) ? original : null,
      license: null,
      licenseUrl: null,
    };
  });
}

export function parseOpenverse(json: unknown): Candidate[] {
  return list(obj(json).results).map((raw) => {
    const r = obj(raw);
    const license = str(r.license);
    const version = str(r.license_version);
    const category = str(r.category);
    return {
      ref: `openverse:${str(r.id) ?? ''}`,
      source: `Openverse (${str(r.provider) ?? str(r.source) ?? 'unknown'})`,
      kind: category === 'photograph' ? 'photo' : 'painting',
      page: str(r.foreign_landing_url) ?? '',
      image: str(r.url) ?? '',
      thumb: str(r.thumbnail) ?? str(r.url) ?? '',
      width: num(r.width),
      height: num(r.height),
      title: str(r.title),
      author: str(r.creator),
      authorUrl: str(r.creator_url),
      license:
        license === null
          ? null
          : `${license === 'pdm' || license === 'cc0' ? license.toUpperCase() : `CC ${license.toUpperCase()}`}${version !== null && license !== 'pdm' ? ` ${version}` : ''}`,
      licenseUrl: str(r.license_url),
    };
  });
}

export function parseCommons(json: unknown): Candidate[] {
  const pages = Object.values(obj(obj(json).query).pages ?? {}) as unknown[];
  return pages
    .map((raw) => obj(raw))
    .sort((a, b) => num(a.index) - num(b.index))
    .flatMap((p) => {
      const info = obj(list(p.imageinfo)[0]);
      const meta = obj(info.extmetadata);
      const field = (k: string): string | null => {
        const v = str(obj(meta[k]).value);
        return v === null ? null : plainText(v);
      };
      const image = str(info.url);
      if (image === null) return [];
      const title = str(p.title) ?? '';
      return [
        {
          ref: `commons:${title.replace(/^File:/, '')}`,
          source: 'Wikimedia Commons',
          kind: 'painting',
          page: str(info.descriptionurl) ?? '',
          image: image.replace(/\?.*$/, ''),
          thumb: str(info.thumburl) ?? image,
          width: num(info.width),
          height: num(info.height),
          title: field('ObjectName') ?? title.replace(/^File:/, ''),
          author: field('Artist'),
          authorUrl: null,
          license: field('LicenseShortName'),
          licenseUrl: field('LicenseUrl'),
        } satisfies Candidate,
      ];
    });
}

/** Pixabay's search tiles as read in the page: page link, preview and the author's name. */
export interface PixabayTile {
  readonly page: string;
  readonly thumb: string;
  readonly thumbWidth: number;
  readonly thumbHeight: number;
  readonly author: string | null;
  readonly authorUrl: string | null;
  readonly alt: string | null;
}

/** The CDN serves 1280 px wide files without an account ("..._640.png" becomes "_1280.png"). */
export function parsePixabay(tiles: readonly PixabayTile[]): Candidate[] {
  return tiles.flatMap((t) => {
    const id = /-(\d+)\/?$/.exec(t.page)?.[1];
    if (id === undefined || !/_(\d+)\.(png|jpe?g)$/.test(t.thumb)) return [];
    const scale = t.thumbWidth > 0 ? 1280 / t.thumbWidth : 0;
    return [
      {
        ref: `pixabay:${id}`,
        source: 'Pixabay',
        kind: 'painting',
        page: t.page,
        image: t.thumb.replace(/_(\d+)\.(png|jpe?g)$/, '_1280.$2'),
        thumb: t.thumb,
        width: scale > 0 ? 1280 : 0,
        height: Math.round(t.thumbHeight * scale),
        title: t.alt,
        author: t.author,
        authorUrl: t.authorUrl,
        license: 'Pixabay Content License',
        licenseUrl: 'https://pixabay.com/service/license-summary/',
      },
    ];
  });
}

// --- Requests ---

/** Requests to Pexels in the last hour, from the log. */
async function pexelsRecent(): Promise<number> {
  const text = await readFile(path.join(sourceDir('pexels'), 'requests.log'), 'utf8').catch(
    () => '',
  );
  const since = Date.now() - 3_600_000;
  return text.split('\n').filter((l) => Date.parse(l.split(' ')[0] ?? '') > since).length;
}

async function pexelsGet(url: string): Promise<unknown> {
  const key = process.env.PEXELS_API_KEY;
  if (key === undefined || key === '') {
    throw new Error('PEXELS_API_KEY is not set (run through npm run campaign:art, which loads .env.local).');
  }
  const recent = await pexelsRecent();
  if (recent >= PEXELS_HOURLY) {
    throw new Error(`${recent} Pexels requests in the last hour; wait before searching again.`);
  }
  const res = await fetch(url, { headers: { Authorization: key } });
  await mkdir(sourceDir('pexels'), { recursive: true });
  await appendFile(
    path.join(sourceDir('pexels'), 'requests.log'),
    `${new Date().toISOString()} ${res.status} ${url.replace('https://api.pexels.com', '')}\n`,
  );
  const remaining = res.headers.get('x-ratelimit-remaining');
  console.log(
    `Pexels: ${res.status}, ${recent + 1} request(s) in the last hour${remaining === null ? '' : `, ${remaining} left this month`}`,
  );
  if (!res.ok) throw new Error(`Pexels answered ${res.status}.`);
  return res.json();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}.`);
  return res.json();
}

async function pixabayTiles(query: string, page: number): Promise<PixabayTile[]> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ userAgent: BROWSER_AGENT });
    const tab = await ctx.newPage();
    const url = `https://pixabay.com/illustrations/search/${encodeURIComponent(query)}/?pagi=${page}`;
    const res = await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (res === null || !res.ok()) throw new Error(`pixabay.com answered ${res?.status() ?? '?'}.`);
    await tab.waitForTimeout(2500);
    return await tab.$$eval('a[href*="/illustrations/"], a[href*="/vectors/"]', (links) =>
      links.flatMap((a) => {
        const img = a.querySelector('img');
        const href = (a as HTMLAnchorElement).href;
        if (img === null || !/\/(illustrations|vectors)\/[a-z0-9-]+-\d+\/?$/.test(href)) return [];
        const src = img.currentSrc || img.src;
        if (!src.includes('cdn.pixabay.com/photo/')) return [];
        const card = a.closest('div[class*="container"]') ?? a.parentElement;
        const user = card?.querySelector('a[href*="/users/"]') as HTMLAnchorElement | null;
        return [
          {
            page: href,
            thumb: src,
            thumbWidth: img.naturalWidth,
            thumbHeight: img.naturalHeight,
            author: user?.textContent?.trim() ?? null,
            authorUrl: user?.href ?? null,
            alt: img.alt || null,
          },
        ];
      }),
    );
  } finally {
    await browser.close();
  }
}

function searchUrl(source: SourceName, query: string, page: number): string {
  const q = encodeURIComponent(query);
  switch (source) {
    case 'pexels':
      return `https://api.pexels.com/v1/search?query=${q}&orientation=landscape&per_page=40&page=${page}`;
    case 'wallhaven':
      return `https://wallhaven.cc/api/v1/search?q=${q}&categories=110&purity=100&atleast=1600x900&ratios=landscape&sorting=relevance&page=${page}`;
    case 'openverse':
      // Keyless requests may ask for at most 20 results a page.
      return `https://api.openverse.org/v1/images/?q=${q}&aspect_ratio=wide&size=large&page_size=20&page=${page}`;
    case 'commons':
      return `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=40&gsroffset=${(page - 1) * 40}&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=360`;
    case 'pixabay':
      return `pixabay:${query}:${page}`;
  }
}

/** Searches one source, from the cache when the same search ran before. */
export async function search(source: SourceName, query: string, page: number): Promise<Candidate[]> {
  const key = searchUrl(source, query, page);
  const file = path.join(sourceDir(source), 'search', `${hash(key).slice(0, 20)}.json`);
  const cached = await readJson<{ key: string; results: Candidate[] }>(file);
  if (cached !== null && cached.key === key) return cached.results;
  let results: Candidate[];
  switch (source) {
    case 'pexels':
      results = parsePexels(await pexelsGet(key));
      break;
    case 'wallhaven':
      results = parseWallhaven(await getJson(key));
      break;
    case 'openverse':
      results = parseOpenverse(await getJson(key));
      break;
    case 'commons':
      results = parseCommons(await getJson(key));
      break;
    case 'pixabay':
      results = parsePixabay(await pixabayTiles(query, page));
      break;
  }
  results = results.filter((c) => c.image !== '' && c.thumb !== '');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ key, query, page, results }, null, 1)}\n`);
  return results;
}

/** A candidate from any earlier search, by its ref. */
export async function findCandidate(ref: string): Promise<Candidate | null> {
  const source = ref.split(':')[0] as SourceName;
  if (!SOURCES.includes(source)) return null;
  const dir = path.join(sourceDir(source), 'search');
  const files = await readdir(dir).catch(() => [] as string[]);
  for (const f of files) {
    const cached = await readJson<{ results: Candidate[] }>(path.join(dir, f));
    const hit = cached?.results.find((c) => c.ref === ref);
    if (hit !== undefined) return hit;
  }
  return null;
}

/** File extension of an image URL. */
function extension(url: string): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.img';
}

/** Where a downloaded file is cached. */
export function cachePath(source: SourceName | 'web', url: string, kind: 'originals' | 'thumbs'): string {
  return path.join(sourceDir(source), kind, `${hash(url).slice(0, 24)}${extension(url)}`);
}

/** Downloads a file once; later calls read the cached copy. Image CDNs are not API calls. */
export async function download(
  source: SourceName | 'web',
  url: string,
  kind: 'originals' | 'thumbs',
): Promise<string> {
  const file = cachePath(source, url, kind);
  const have = await readFile(file).catch(() => null);
  if (have !== null && have.length > 0) return file;
  const res = await fetch(url, {
    headers: {
      'User-Agent': source === 'pixabay' || source === 'web' ? BROWSER_AGENT : USER_AGENT,
      ...(source === 'pixabay' ? { Referer: 'https://pixabay.com/' } : {}),
    },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
