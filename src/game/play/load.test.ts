import { describe, expect, it } from 'vitest';
import { checkLevelPath, LevelLoadError } from './load';

describe('level path from the route', () => {
  it('accepts plain names under public/levels', () => {
    expect(checkLevelPath(['examples', 'plinko-01.json'])).toBe('examples/plinko-01.json');
    expect(checkLevelPath(['dev', 'teggle_dev.v1.json'])).toBe('dev/teggle_dev.v1.json');
  });

  it('refuses anything that could leave the folder or is not a level file', () => {
    for (const bad of [
      [],
      ['..', 'secret.json'],
      ['a..b.json'],
      ['.hidden.json'],
      ['examples', 'x.txt'],
      ['examples', 'x.json?y=1'],
      ['http:', 'evil.json'],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g.json'],
    ]) {
      expect(() => checkLevelPath(bad)).toThrow(LevelLoadError);
    }
  });
});
