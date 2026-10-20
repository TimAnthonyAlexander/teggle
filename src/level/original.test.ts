import { describe, expect, it } from 'vitest';
import { OriginalFormatError, parseOriginalManifest } from './original';

function level(number: number, more: Record<string, unknown> = {}) {
  const stage = Math.ceil(number / 5);
  const id = `${stage}-${number - (stage - 1) * 5}`;
  return {
    id,
    number,
    stage,
    name: `Level ${id}`,
    file: `levels/${id}.json`,
    background: `picture${number}`,
    ...more,
  };
}

function manifest(levels: unknown[]) {
  return { formatVersion: 1, levels };
}

function rejects(json: unknown, message: RegExp): void {
  expect(() => parseOriginalManifest(json)).toThrow(OriginalFormatError);
  expect(() => parseOriginalManifest(json)).toThrow(message);
}

describe('parseOriginalManifest', () => {
  it('reads the levels in play order across stages', () => {
    const m = parseOriginalManifest(
      manifest(Array.from({ length: 55 }, (_, i) => level(i + 1, { name: `Name ${i + 1}` }))),
    );
    expect(m.levels).toHaveLength(55);
    expect(m.levels[5]).toEqual({
      id: '2-1',
      number: 6,
      stage: 2,
      name: 'Name 6',
      file: 'levels/2-1.json',
      background: 'picture6',
    });
    expect(m.levels[54]?.id).toBe('11-5');
  });

  it('checks order, ids, stages and file paths', () => {
    rejects(manifest([level(2)]), /entry 1 should be level 1-1/);
    rejects(manifest([level(1, { stage: 2 })]), /entry 1 should be level 1-1/);
    rejects(manifest([level(1, { file: 'levels/1-2.json' })]), /file is levels\/1-1\.json/);
    rejects(manifest([level(1, { file: '../secret.json' })]), /Invalid manifest/);
    rejects(manifest([level(1, { id: '12-1' })]), /Invalid manifest/);
  });

  it('rejects a picture used twice, a bad picture id and unknown fields', () => {
    rejects(manifest([level(1), level(2, { background: 'picture1' })]), /"picture1" is used twice/);
    rejects(manifest([level(1, { background: '../x' })]), /background/);
    rejects(manifest([level(1, { extra: true })]), /extra/);
  });

  it('rejects other format versions, an empty list and more than 55 levels', () => {
    rejects({ ...manifest([level(1)]), formatVersion: 2 }, /formatVersion/);
    rejects(manifest([]), /levels/);
    rejects(manifest(Array.from({ length: 56 }, (_, i) => level(i + 1))), /levels/);
  });
});
