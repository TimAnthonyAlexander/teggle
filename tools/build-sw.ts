// Writes dist/sw.js after `vite build`: a service worker that keeps the whole built game (the
// page, its scripts, fonts, levels, pictures, icons) in one cache, so an installed Teggle plays
// offline; the original's levels (original/) stay out and come from the network, as anything
// outside the cache does. The cache is named after a hash of every file it holds, so each build
// that changes anything gets a new cache, and the old one goes once no page uses it any more. A
// new version installs in the background and waits; the page lets it take over once a reload
// loses nothing (a menu, a level before its first shot) and then reloads
// (src/game/app/offline.ts), so a page never mixes files of two builds.
//
// Only production builds register it (src/main.ts); the Vite dev server never does.
//
// Usage: npx tsx tools/build-sw.ts [dist directory]   (npm run build runs it)

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.resolve(process.argv[2] ?? path.join(ROOT, 'dist'));

/**
 * Files left out of the cache: those the game never fetches (source maps, the editor's line
 * sources, the worker itself), and the original's levels and pictures (original/), which only
 * Quick Play's Original section loads, from the network, so they do not grow the first load.
 */
function skipped(rel: string): boolean {
  return (
    rel === 'sw.js' ||
    rel.endsWith('.map') ||
    rel.endsWith('.lines.json') ||
    rel.startsWith('original/')
  );
}

async function files(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** The worker, with the cache name and the file list filled in. */
function worker(version: string, urls: readonly string[]): string {
  return `// Teggle's service worker, written by tools/build-sw.ts. Build ${version}.
const CACHE = 'teggle-${version}';
const FILES = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

// The page asks a waiting new version to take over once nothing is in play.
self.addEventListener('message', (event) => {
  if (event.data === 'activate') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('teggle-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The page itself, whatever its query and hash: this build's index.html. Vary headers are
      // ignored: module scripts ask with an Origin header the stored requests did not have.
      if (request.mode === 'navigate') {
        const page = await cache.match('./', { ignoreVary: true });
        if (page !== undefined) return page;
      }
      const hit = await cache.match(request, { ignoreVary: true });
      if (hit !== undefined) return hit;
      return fetch(request);
    })(),
  );
});
`;
}

async function main(): Promise<void> {
  const all = (await files(DIST)).filter((f) => !skipped(f)).sort();
  if (!all.includes('index.html')) throw new Error(`${DIST} holds no index.html; build first.`);
  const hash = createHash('sha256');
  // The worker's own code counts too, so a change to it also gets a new cache.
  hash.update(worker('', []));
  for (const f of all) {
    hash.update(f);
    hash.update('\0');
    hash.update(await readFile(path.join(DIST, f)));
    hash.update('\0');
  }
  const version = hash.digest('hex').slice(0, 12);
  // Relative to the worker, so the game also works under a sub-path. The page is "./".
  const urls = all.map((f) => (f === 'index.html' ? './' : f));
  await writeFile(path.join(DIST, 'sw.js'), worker(version, urls));
  console.log(`sw.js: cache teggle-${version}, ${urls.length} files`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
