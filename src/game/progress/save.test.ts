import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  SAVE_KEY,
  campaignFinished,
  campaignTotal,
  challengeRecord,
  challengeState,
  emptyChallenge,
  emptyLevel,
  emptyProgress,
  groupOpensAfterStage,
  idOfNumber,
  isCleared,
  isPassed,
  levelRecord,
  localDate,
  numberOfId,
  openGroups,
  originalRecord,
  parseProgress,
  passedCount,
  recordAttemptStart,
  recordChallengeEnd,
  recordChallengeStart,
  recordOriginalStart,
  recordOriginalWin,
  recordPick,
  recordWin,
  serializeProgress,
  stageOfNumber,
  stageTotal,
  stagesComplete,
  unlockedMasters,
  unlockedStage,
  type ChallengeEnd,
  type Progress,
  type Win,
} from './save';
import { ProgressStore } from './store';

function win(levelId: string, score: number, more: Partial<Win> = {}): Win {
  return {
    levelId,
    campaignNumber: numberOfId(levelId),
    score,
    fullClear: false,
    master: 'guide',
    date: '2026-10-15',
    ...more,
  };
}

/** Plays the campaign up to (not including) campaign level `n`, winning each on its first try. */
function through(n: number): Progress {
  let p = emptyProgress();
  for (let i = 1; i < n; i++) {
    const id = idOfNumber(i);
    p = recordAttemptStart(p, { levelId: id, campaignNumber: i });
    p = recordWin(p, win(id, 1000 * i));
  }
  return p;
}

describe('level ids', () => {
  it('maps campaign numbers to ids and back', () => {
    expect(idOfNumber(1)).toBe('1-1');
    expect(idOfNumber(5)).toBe('1-5');
    expect(idOfNumber(6)).toBe('2-1');
    expect(idOfNumber(55)).toBe('11-5');
    for (let n = 1; n <= CAMPAIGN_LEVELS; n++) expect(numberOfId(idOfNumber(n))).toBe(n);
    expect(numberOfId('12-1')).toBeNull();
    expect(numberOfId('1-6')).toBeNull();
    expect(stageOfNumber(56)).toBe(11);
  });
});

describe('parseProgress', () => {
  it('gives an empty record for nothing, junk or another version', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '42', '{"version":2}']) {
      expect(parseProgress(raw)).toEqual(emptyProgress());
    }
  });

  it('round-trips a played record', () => {
    let p = through(4);
    p = recordPick(p, 'fireball');
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it('replaces only the damaged fields', () => {
    const raw = JSON.stringify({
      version: 1,
      campaign: { next: 'three', try: 2, pick: 'notAPower' },
      levels: {
        '1-1': { tries: 3, wins: 1, fullClear: 'yes', best: 5000, campaignScore: 5000, top: [] },
        '1-2': { tries: -4, wins: 2, fullClear: true, best: 1.5, campaignScore: null },
        '1-3': 'broken',
        '99-1': { tries: 1, wins: 1 },
        '1-4': {
          tries: 1,
          wins: 1,
          fullClear: false,
          best: 900,
          campaignScore: 900,
          top: [
            { score: 100, master: null, date: '2026-10-14' },
            { score: 'lots', master: null, date: '2026-10-14' },
            { score: 900, master: 'guide', date: '2026-10-15' },
          ],
        },
      },
    });
    const p = parseProgress(raw);
    expect(p.campaign).toEqual({ next: 1, try: 2, pick: null });
    expect(p.levels['1-1']).toMatchObject({ tries: 3, wins: 1, fullClear: false, best: 5000 });
    expect(p.levels['1-2']).toMatchObject({ tries: 0, wins: 2, fullClear: true, best: 0, top: [] });
    expect(p.levels['1-3']).toBeUndefined();
    expect(p.levels['99-1']).toBeUndefined();
    expect(p.levels['1-4']?.top.map((e) => e.score)).toEqual([900, 100]);
  });
});

describe('campaign progress', () => {
  it('starts at level 1, try 1, with the first master only', () => {
    const p = emptyProgress();
    expect(p.campaign).toEqual({ next: 1, try: 1, pick: null });
    expect(unlockedStage(p)).toBe(1);
    expect(unlockedMasters(p)).toEqual(['guide']);
    expect(challengeState(p)).toBe('locked');
  });

  it('counts a try when the first shot leaves, at the current level only', () => {
    let p = recordAttemptStart(emptyProgress(), { levelId: '1-1', campaignNumber: 1 });
    expect(p.campaign.try).toBe(2);
    expect(levelRecord(p, '1-1').tries).toBe(1);
    // A Quick Play attempt counts as a try at the level but not in the campaign.
    p = recordAttemptStart(p, { levelId: '1-1', campaignNumber: null });
    expect(p.campaign.try).toBe(2);
    expect(levelRecord(p, '1-1').tries).toBe(2);
  });

  it('moves on after a campaign win and keeps that score once', () => {
    let p = recordAttemptStart(emptyProgress(), { levelId: '1-1', campaignNumber: 1 });
    p = recordAttemptStart(p, { levelId: '1-1', campaignNumber: 1 });
    p = recordWin(p, win('1-1', 42000, { fullClear: true }));
    expect(p.campaign).toEqual({ next: 2, try: 1, pick: null });
    expect(levelRecord(p, '1-1')).toMatchObject({
      tries: 2,
      wins: 1,
      fullClear: true,
      best: 42000,
      campaignScore: 42000,
    });
    expect(isCleared(p, '1-1')).toBe(true);
    expect(isCleared(p, '1-2')).toBe(false);
    // Replaying it later (Quick Play) raises the best score, not the campaign's.
    p = recordWin(p, win('1-1', 90000, { campaignNumber: null }));
    expect(levelRecord(p, '1-1')).toMatchObject({ wins: 2, best: 90000, campaignScore: 42000 });
    expect(p.campaign.next).toBe(2);
    expect(campaignTotal(p)).toBe(42000);
  });

  it('ignores a win at a level that is not the current one', () => {
    const p = recordWin(emptyProgress(), win('1-3', 5000));
    expect(p.campaign.next).toBe(1);
    expect(levelRecord(p, '1-3').campaignScore).toBeNull();
  });

  it('keeps the five best scores, highest first, ties in order', () => {
    let p = emptyProgress();
    for (const s of [300, 100, 500, 100, 200, 400, 50]) {
      p = recordWin(p, win('2-2', s, { campaignNumber: null, date: `2026-10-${10 + (s % 7)}` }));
    }
    const top = levelRecord(p, '2-2').top;
    expect(top.map((e) => e.score)).toEqual([500, 400, 300, 200, 100]);
    expect(top[4]?.date).toBe('2026-10-12');
    expect(levelRecord(p, '2-2').wins).toBe(7);
  });

  it('unlocks stages, masters and challenges as stages complete', () => {
    const afterStage1 = through(6);
    expect(unlockedStage(afterStage1)).toBe(2);
    expect(stagesComplete(afterStage1)).toBe(1);
    expect(unlockedMasters(afterStage1)).toEqual(['guide', 'multiball']);
    expect(stageTotal(afterStage1, 1)).toBe(15000);
    expect(challengeState(through(15))).toBe('locked');
    expect(challengeState(through(16))).toBe('partly');
    const master = through(51);
    expect(unlockedStage(master)).toBe(11);
    expect(unlockedMasters(master)).toHaveLength(10);
    const done = through(CAMPAIGN_LEVELS + 1);
    expect(campaignFinished(done)).toBe(true);
    expect(done.campaign.next).toBe(CAMPAIGN_LEVELS + 1);
    expect(challengeState(done)).toBe('open');
    expect(campaignTotal(done)).toBe((1000 * CAMPAIGN_LEVELS * (CAMPAIGN_LEVELS + 1)) / 2);
  });

  it('formats local dates', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('challenges in the save', () => {
  const end = (id: string, more: Partial<ChallengeEnd> = {}): ChallengeEnd => ({
    id,
    passed: false,
    levelsWon: 0,
    total: null,
    date: '2026-10-17',
    ...more,
  });

  it('reads a save from before the challenges as having none', () => {
    const old = JSON.stringify({
      version: 1,
      campaign: { next: 3, try: 1, pick: null },
      levels: {
        '1-1': { tries: 1, wins: 1, fullClear: false, best: 9, campaignScore: 9, top: [] },
      },
    });
    const p = parseProgress(old);
    expect(p.challenges).toEqual({});
    expect(p.campaign.next).toBe(3);
    expect(levelRecord(p, '1-1').wins).toBe(1);
    expect(challengeRecord(p, 'orange-1.1')).toEqual(emptyChallenge());
  });

  it('records tries, passes, the best run and the first pass date', () => {
    let p = recordChallengeStart(emptyProgress(), 'cup-1.1');
    p = recordChallengeEnd(p, end('cup-1.1', { levelsWon: 1, total: 287_000 }));
    expect(isPassed(p, 'cup-1.1')).toBe(false);
    p = recordChallengeStart(p, 'cup-1.1');
    p = recordChallengeEnd(p, end('cup-1.1', { passed: true, levelsWon: 1, total: 312_400 }));
    p = recordChallengeStart(p, 'cup-1.1');
    p = recordChallengeEnd(
      p,
      end('cup-1.1', { passed: true, levelsWon: 1, total: 301_000, date: '2026-10-18' }),
    );
    expect(challengeRecord(p, 'cup-1.1')).toEqual({
      tries: 3,
      passes: 2,
      bestLevels: 1,
      best: 312_400,
      passedOn: '2026-10-17',
    });
    // A run lost on its second level keeps the levels won, not a total.
    p = recordChallengeEnd(p, end('runs.3', { levelsWon: 2 }));
    expect(challengeRecord(p, 'runs.3')).toMatchObject({ bestLevels: 2, best: null, passes: 0 });
    expect(passedCount(p)).toBe(1);
    expect(passedCount(p, 'cup-1')).toBe(1);
    expect(passedCount(p, 'runs')).toBe(0);
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it('drops damaged challenge entries and challenges the game does not have', () => {
    const raw = JSON.stringify({
      version: 1,
      campaign: { next: 1, try: 1, pick: null },
      levels: {},
      challenges: {
        'orange-1.1': { tries: 2, passes: 1, bestLevels: 1, best: 9000, passedOn: '2026-10-17' },
        'cup-2.3': { tries: 'two', passes: 0, bestLevels: -1, best: 'x', passedOn: 'today' },
        'orange-9.1': { tries: 1, passes: 1, bestLevels: 1, best: 1, passedOn: null },
        'runs.2': 'broken',
      },
    });
    const p = parseProgress(raw);
    expect(Object.keys(p.challenges).sort()).toEqual(['cup-2.3', 'orange-1.1']);
    expect(p.challenges['cup-2.3']).toEqual(emptyChallenge());
    expect(isPassed(p, 'orange-1.1')).toBe(true);
  });

  it('opens one group per stage from stage 3, and all of them after the campaign', () => {
    expect(openGroups(through(15))).toBe(0);
    expect(openGroups(through(16))).toBe(1);
    expect(openGroups(through(21))).toBe(2);
    expect(openGroups(through(51))).toBe(8);
    expect(openGroups(through(55))).toBe(8);
    expect(openGroups(through(CAMPAIGN_LEVELS + 1))).toBe(15);
    expect(groupOpensAfterStage(0)).toBe(3);
    expect(groupOpensAfterStage(7)).toBe(10);
    expect(groupOpensAfterStage(8)).toBeNull();
  });
});

describe("the original's levels in the save", () => {
  const originalWin = (score: number) => ({
    levelId: '6-1',
    score,
    fullClear: false,
    master: 'guide' as const,
    date: '2026-10-20',
  });

  it('reads a save from before them as having none', () => {
    const old = JSON.stringify({
      version: 1,
      campaign: { next: 3, try: 1, pick: null },
      levels: {
        '1-1': { tries: 1, wins: 1, fullClear: false, best: 9, campaignScore: 9, top: [] },
      },
      challenges: {},
    });
    const p = parseProgress(old);
    expect(p.original).toEqual({});
    expect(originalRecord(p, '6-1')).toEqual(emptyLevel());
    expect(levelRecord(p, '1-1').wins).toBe(1);
  });

  it("keeps their tries and wins apart from Teggle's levels and the campaign", () => {
    let p = through(3);
    p = recordOriginalStart(p, '1-1');
    p = recordOriginalWin(p, { ...originalWin(250_000), levelId: '1-1', fullClear: true });
    p = recordOriginalStart(p, '6-1');
    p = recordOriginalWin(p, originalWin(90_000.4));
    p = recordOriginalWin(p, originalWin(120_000));
    expect(originalRecord(p, '1-1')).toMatchObject({
      tries: 1,
      wins: 1,
      fullClear: true,
      best: 250_000,
      campaignScore: null,
    });
    expect(originalRecord(p, '6-1').top.map((e) => e.score)).toEqual([120_000, 90_000]);
    // Teggle's 1-1, the campaign and its total are as the campaign left them.
    expect(levelRecord(p, '1-1')).toEqual(levelRecord(through(3), '1-1'));
    expect(p.campaign).toEqual(through(3).campaign);
    expect(campaignTotal(p)).toBe(campaignTotal(through(3)));
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it('drops damaged entries and ids outside the campaign grid', () => {
    const raw = JSON.stringify({
      version: 1,
      campaign: { next: 1, try: 1, pick: null },
      levels: {},
      original: {
        '6-1': { tries: 2, wins: 1, fullClear: false, best: 500, campaignScore: null, top: [] },
        '12-1': { tries: 1, wins: 1 },
        '2-2': 'broken',
      },
    });
    expect(Object.keys(parseProgress(raw).original)).toEqual(['6-1']);
  });
});

describe('ProgressStore', () => {
  class MemoryStore {
    readonly items = new Map<string, string>();
    getItem(key: string): string | null {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.items.set(key, value);
    }
  }

  it('loads, updates and writes under the versioned key', () => {
    const mem = new MemoryStore();
    mem.setItem(SAVE_KEY, serializeProgress(through(3)));
    const store = new ProgressStore(mem);
    expect(store.progress.campaign.next).toBe(3);
    store.update((p) => recordPick(p, 'zenBall'));
    expect(store.saved).toBe(true);
    expect(parseProgress(mem.getItem(SAVE_KEY)).campaign.pick).toBe('zenBall');
  });

  it('keeps working in memory when storage is missing or throws', () => {
    const none = new ProgressStore(null);
    none.update((p) => recordWin(p, win('1-1', 10)));
    expect(none.saved).toBe(false);
    expect(none.progress.campaign.next).toBe(2);

    const broken = new ProgressStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(broken.progress).toEqual(emptyProgress());
    broken.update((p) => recordWin(p, win('1-1', 10)));
    expect(broken.saved).toBe(false);
    expect(isCleared(broken.progress, '1-1')).toBe(true);
  });
});
