// The original game's levels for Quick Play's Original section (public/original/manifest.json,
// written by `npm run original:import` and validated by src/level/original.ts). Loaded once per
// session, like the campaign manifest (manifest.ts).

import {
  OriginalFormatError,
  parseOriginalManifest,
  type OriginalEntry,
  type OriginalManifest,
} from '../../level/original';

export class OriginalLoadError extends Error {
  override readonly name = 'OriginalLoadError';
}

async function fetchManifest(base: string): Promise<OriginalManifest> {
  let res: Response;
  try {
    res = await fetch(`${base}original/manifest.json`, { cache: 'no-cache' });
  } catch {
    throw new OriginalLoadError("Could not reach the list of the original's levels.");
  }
  if (!res.ok) {
    throw new OriginalLoadError(
      `The list of the original's levels was not found (HTTP ${res.status}).`,
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new OriginalLoadError("The list of the original's levels is not valid JSON.");
  }
  try {
    return parseOriginalManifest(json);
  } catch (err) {
    if (err instanceof OriginalFormatError) throw new OriginalLoadError(err.message);
    throw err;
  }
}

let cached: Promise<OriginalManifest> | null = null;

/** The manifest, fetched and validated on first use. A failed load is retried next time. */
export function loadOriginalManifest(
  base: string = import.meta.env.BASE_URL,
): Promise<OriginalManifest> {
  cached ??= fetchManifest(base).catch((err: unknown) => {
    cached = null;
    throw err instanceof Error ? err : new OriginalLoadError(String(err));
  });
  return cached;
}

export function findOriginal(m: OriginalManifest, id: string): OriginalEntry | null {
  return m.levels.find((l) => l.id === id) ?? null;
}
