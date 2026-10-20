// Loads a level file for the play route `#/play/<path under public/levels/>`. The path comes
// from the address bar, so it is checked before it becomes a URL, and the file is validated by
// the level schema before the simulation sees it.

import { LevelFormatError, parseLevel, type Level } from '../../level/schema';
import { compileLevel, type CompiledLevel } from '../../sim/compile';

export class LevelLoadError extends Error {
  override readonly name = 'LevelLoadError';
}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/**
 * Checks a level path from the route ("examples/plinko.json") and returns it normalized.
 * Only plain names separated by slashes, ending in .json: no "..", no absolute paths, no query.
 */
export function checkLevelPath(segments: readonly string[]): string {
  if (segments.length === 0) throw new LevelLoadError('No level given. Use #/play/<file>.json.');
  if (segments.length > 6) throw new LevelLoadError('The level path is too deep.');
  for (const s of segments) {
    if (!SEGMENT.test(s) || s.includes('..')) {
      throw new LevelLoadError(`"${s}" is not a valid part of a level path.`);
    }
  }
  const path = segments.join('/');
  if (!path.endsWith('.json')) throw new LevelLoadError('A level path ends in .json.');
  return path;
}

export interface LoadedLevel {
  readonly path: string;
  readonly level: Level;
  readonly compiled: CompiledLevel;
}

/** Fetches, validates and compiles `levels/<path>` from the app's public folder. */
export function loadLevel(path: string, base: string): Promise<LoadedLevel> {
  return fetchLevel(`levels/${path}`, path, base);
}

/**
 * Fetches, validates and compiles the level file at `file` under the app's public folder (the
 * original's levels, under original/); its path is `file`.
 */
export function loadPublicLevel(file: string, base: string): Promise<LoadedLevel> {
  return fetchLevel(file, file, base);
}

async function fetchLevel(file: string, path: string, base: string): Promise<LoadedLevel> {
  let res: Response;
  try {
    res = await fetch(`${base}${file}`, { cache: 'no-cache' });
  } catch {
    throw new LevelLoadError(`Could not reach ${file}.`);
  }
  if (!res.ok) throw new LevelLoadError(`${file} was not found (HTTP ${res.status}).`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LevelLoadError(`${file} is not valid JSON.`);
  }
  try {
    const level = parseLevel(json);
    return { path, level, compiled: compileLevel(level) };
  } catch (err) {
    if (err instanceof LevelFormatError) throw new LevelLoadError(err.message);
    throw err;
  }
}
