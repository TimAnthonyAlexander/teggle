// The committed output of `npm run original:import` (public/original/): the manifest parses, and
// every level and picture it names is there, the levels at the original's 650 x 560 board with
// the manifest's name and picture.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_LEVEL_COUNT, parseOriginalManifest } from '../../src/level/original';
import { parseLevel } from '../../src/level/schema';

const DIR = path.resolve(import.meta.dirname, '..', '..', 'public', 'original');

describe('the shipped original levels', () => {
  const manifest = parseOriginalManifest(
    JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')),
  );

  it('lists all 55 levels', () => {
    expect(manifest.levels).toHaveLength(ORIGINAL_LEVEL_COUNT);
  });

  it('has every level file and picture the manifest names', () => {
    for (const entry of manifest.levels) {
      const level = parseLevel(JSON.parse(readFileSync(path.join(DIR, entry.file), 'utf8')));
      expect(level.board).toEqual({ width: 650, height: 560 });
      expect(level.name).toBe(entry.name);
      expect(level.background).toBe(entry.background);
      expect(existsSync(path.join(DIR, 'backgrounds', `${entry.background}.webp`))).toBe(true);
    }
  });
});
