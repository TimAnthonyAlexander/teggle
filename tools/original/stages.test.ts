import { describe, expect, it } from 'vitest';
import { parseStageLevels } from './stages';

describe('parseStageLevels', () => {
  it('reads files and display names in order, skipping block comments', () => {
    const cfg = [
      '// 1. Guide',
      'Stage ',
      '{',
      '\tLevel: Level1, Peggleland',
      '\tLevel: Level2, "Slip and Slide"',
      '\tDialog: 1,"Hit all ORANGE PEGS","Instructions"',
      '/*\tLevel: Plinko',
      '\tLevel: Owl*/',
      '\tLevel: Waves\t',
      '\tLevel: Bug, "We Come In Peace"\r',
      '}',
    ].join('\n');
    expect(parseStageLevels(cfg)).toEqual([
      { file: 'Level1', name: 'Peggleland' },
      { file: 'Level2', name: 'Slip and Slide' },
      { file: 'Waves', name: 'Waves' },
      { file: 'Bug', name: 'We Come In Peace' },
    ]);
  });

  it('keeps commas inside a quoted name', () => {
    expect(parseStageLevels('Level: YinYang, "Yang, Yin"')).toEqual([
      { file: 'YinYang', name: 'Yang, Yin' },
    ]);
  });
});
