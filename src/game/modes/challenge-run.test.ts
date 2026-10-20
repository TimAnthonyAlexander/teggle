import { describe, expect, it } from 'vitest';
import { emptyProgress, idOfNumber, recordWin, type Progress } from '../progress/save';
import { beatenSlots, challengeSummary, shownGroups } from './challenge-run';

/** The slots of stages 1 to `n`. */
function stages(n: number): Set<string> {
  const out = new Set<string>();
  for (let s = 1; s <= n; s++) for (let l = 1; l <= 5; l++) out.add(`${s}-${l}`);
  return out;
}

/** A save that has beaten the first `n` campaign levels in the Adventure. */
function through(n: number): Progress {
  let p = emptyProgress();
  for (let i = 1; i <= n; i++) {
    p = recordWin(p, {
      levelId: idOfNumber(i),
      campaignNumber: i,
      score: 100_000,
      fullClear: false,
      master: 'guide',
      date: '2026-10-20',
    });
  }
  return p;
}

describe('the challenge list', () => {
  const built = stages(5);

  it('shows only groups and challenges whose levels are in the game, never duels', () => {
    const groups = shownGroups(emptyProgress(), built);
    expect(groups.map((g) => g.group.id)).toEqual([
      'orange-1',
      'orange-2',
      'orange-3',
      'cup-1',
      'cup-2',
      'cup-3',
      'clear-1',
      'clear-2',
      'runs',
      'totals',
      'insane',
    ]);
    expect(groups.flatMap((g) => g.challenges)).toHaveLength(45);
    expect(groups.find((g) => g.group.id === 'orange-2')?.challenges.map((s) => s.def.id)).toEqual([
      'orange-2.1',
      'orange-2.2',
      'orange-2.3',
      'orange-2.4',
    ]);
    expect(groups.find((g) => g.group.id === 'totals')?.challenges.map((s) => s.def.id)).toEqual([
      'totals.1',
      'totals.4',
      'totals.5',
    ]);
    // With stage 1 alone, the long random runs cannot be drawn and are hidden.
    const early = shownGroups(emptyProgress(), stages(1));
    expect(early.find((g) => g.group.id === 'runs')?.challenges).toHaveLength(2);
    expect(early.some((g) => g.group.id === 'orange-2')).toBe(false);
  });

  it('opens a challenge once its levels are beaten in the Adventure', () => {
    const none = shownGroups(emptyProgress(), built).flatMap((g) => g.challenges);
    expect(none.every((s) => !s.playable)).toBe(true);
    const some = shownGroups(through(3), built).flatMap((g) => g.challenges);
    const open = some.filter((s) => s.playable).map((s) => s.def.id);
    expect(open).toEqual([
      'orange-1.1',
      'cup-2.1',
      'clear-1.1',
      'clear-1.2',
      'clear-1.3',
      'runs.1',
      'totals.4',
      'insane.1',
      'insane.4',
    ]);
    expect(some.find((s) => s.def.id === 'orange-1.2')?.toOpen).toEqual(['2-2']);
    expect(beatenSlots(through(3), built)).toEqual(new Set(['1-1', '1-2', '1-3']));
  });

  it('sums up where the challenges stand for the menus', () => {
    expect(challengeSummary(emptyProgress(), built)).toEqual({
      shown: 45,
      open: 0,
      passed: 0,
      firstToOpen: ['1-1'],
    });
    expect(challengeSummary(through(1), built)).toMatchObject({ open: 3, firstToOpen: [] });
  });
});
