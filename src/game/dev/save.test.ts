import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  parseProgress,
  recordAttemptStart,
  recordWin,
  serializeProgress,
} from '../progress/save';
import { playedLevels, saveFileName } from './save';

describe('save export', () => {
  it('names the file by local date', () => {
    expect(saveFileName(new Date(2026, 9, 5))).toBe('teggle-save-2026-10-05.json');
  });

  it('lists the levels with tries in campaign order', () => {
    let p = emptyProgress();
    for (const id of ['10-1', '2-3', '2-3', '1-1']) {
      p = recordAttemptStart(p, { levelId: id, campaignNumber: null });
    }
    p = recordWin(p, {
      levelId: '2-3',
      campaignNumber: null,
      score: 1000,
      fullClear: false,
      master: null,
      date: '2026-10-15',
    });
    expect(playedLevels(p)).toEqual([
      { id: '1-1', tries: 1, wins: 0 },
      { id: '2-3', tries: 2, wins: 1 },
      { id: '10-1', tries: 1, wins: 0 },
    ]);
  });

  it('exports the stored record, which reads back the same', () => {
    const p = recordAttemptStart(emptyProgress(), { levelId: '1-2', campaignNumber: 2 });
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });
});
