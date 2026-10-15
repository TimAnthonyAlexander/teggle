import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { linesJson, sourceJson } from './json';
import { parseLines } from './lines';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOURCES = path.join(ROOT, 'campaign', 'levels');
const LINES = path.join(ROOT, 'public', 'levels', 'campaign');

async function prettierAccepts(text: string): Promise<boolean> {
  const filepath = path.join(SOURCES, 'test.json');
  const config = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.check(text, { ...config, filepath });
}

describe('source files (Prettier style)', () => {
  const files = readdirSync(SOURCES).filter((f) => f.endsWith('.json'));

  it.each(files)('rewrites campaign/levels/%s byte for byte', (file) => {
    const text = readFileSync(path.join(SOURCES, file), 'utf8');
    expect(sourceJson(JSON.parse(text))).toBe(text);
  });

  it('rewrites campaign/stages.json byte for byte', () => {
    const text = readFileSync(path.join(ROOT, 'campaign', 'stages.json'), 'utf8');
    expect(sourceJson(JSON.parse(text))).toBe(text);
  });

  it('writes what Prettier accepts unchanged, edits and long arrays included', async () => {
    const value = {
      id: '2-1',
      name: 'A Test',
      concept: { subject: 's', composition: 'c', layout: 'l' },
      background: { id: 'a-b', prompt: 'p'.repeat(150) },
      recipe: {
        seed: 201,
        targetCount: 158,
        lines: ['one', 'two', 'three-is-a-rather-long-line-name', 'four-is-even-longer-than-three'],
        fill: { style: 'lattice', spacing: 38.25, clearance: 22, within: 'crown' },
        corners: Array.from({ length: 40 }, (_, i) => i * 3),
        edits: [
          { at: [412.35, 233.1], to: [420, 240.5] },
          { at: [100, 200], delete: true },
          { add: 'brick', at: [300, 300], rotation: 1.5708, length: 35, quickDisappear: true },
          { at: [10, 20], canBeOrange: false },
        ],
        single: [{ a: 1, b: 2 }],
        empty: [],
        nothing: {},
        nested: { deeper: { deepest: [1, 2, 3], words: ['a', 'b'] } },
      },
    };
    const text = sourceJson(value);
    expect(JSON.parse(text)).toEqual(value);
    expect(await prettierAccepts(text)).toBe(true);
  });
});

describe('lines files', () => {
  const files = readdirSync(LINES).filter((f) => f.endsWith('.lines.json'));

  // Some files have hand-wrapped point rows, so the test asks for the same content in the same
  // layout of keys, and a text that comes back unchanged when written again.
  it.each(files)('rewrites public/levels/campaign/%s stably', (file) => {
    const text = readFileSync(path.join(LINES, file), 'utf8');
    const parsed = parseLines(JSON.parse(text));
    const written = linesJson(parsed);
    expect(parseLines(JSON.parse(written))).toEqual(parsed);
    expect(linesJson(parseLines(JSON.parse(written)))).toBe(written);
    const keys = (t: string) => t.split('\n').filter((l) => !l.trimStart().startsWith('['));
    expect(keys(written)).toEqual(keys(text));
  });

  it('packs point rows up to 100 columns', () => {
    const text = readFileSync(path.join(LINES, '1-1.lines.json'), 'utf8');
    const rows = linesJson(parseLines(JSON.parse(text)))
      .split('\n')
      .filter((l) => l.trimStart().startsWith('['));
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(100);
  });

  it('writes an empty lines file', () => {
    const file = parseLines({
      formatVersion: 1,
      background: 'a-b',
      board: { width: 916, height: 560 },
      lines: [],
    });
    expect(parseLines(JSON.parse(linesJson(file)))).toEqual(file);
  });
});
