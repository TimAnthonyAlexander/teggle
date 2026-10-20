import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import {
  afterLevel,
  carriesBalls,
  CHALLENGE_GROUPS,
  CHALLENGE_ORANGE,
  CHALLENGES,
  challengeById,
  challengesOf,
  drawPool,
  inCampaignOrder,
  isHidden,
  levelConfig,
  levelsToOpen,
  namedSlots,
  RANDOM_POOL,
  randomCount,
  randomPool,
  resolveLevels,
  slotNumber,
  startRun,
  unplayable,
  type ChallengeDef,
  type LevelOutcome,
} from './challenges';
import { attemptConfig } from './config';
import { DEFAULT_ORANGE_COUNT, ORIGINAL_ORANGE_COUNT } from './tuning';

function def(id: string): ChallengeDef {
  const c = challengeById(id);
  if (c === null) throw new Error(`no challenge ${id}`);
  return c;
}

const WIN: LevelOutcome = { won: true, score: 200_000, fullClear: false, ballsLeft: 4 };
const LOSS: LevelOutcome = { won: false, score: 50_000, fullClear: false, ballsLeft: 0 };

describe('the challenge set', () => {
  it('has 75 challenges in 15 groups of 5', () => {
    expect(CHALLENGE_GROUPS).toHaveLength(15);
    expect(CHALLENGES).toHaveLength(75);
    for (const g of CHALLENGE_GROUPS) expect(challengesOf(g.id)).toHaveLength(5);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(75);
  });

  it("names the original's levels by slot, group by group", () => {
    const slots = (group: string): string[] => challengesOf(group).flatMap(namedSlots);
    expect(slots('orange-1')).toEqual(['1-3', '2-2', '3-1', '4-3', '5-1']);
    expect(slots('orange-2')).toEqual(['2-1', '3-4', '4-1', '5-2', '6-2']);
    expect(slots('orange-3')).toEqual(['3-5', '4-2', '5-5', '6-1', '7-1']);
    expect(slots('cup-1')).toEqual(['1-5', '2-3', '3-3', '4-3', '5-4']);
    expect(slots('cup-2')).toEqual(['1-2', '3-2', '4-1', '5-5', '8-1']);
    expect(slots('cup-3')).toEqual(['2-1', '4-2', '5-1', '6-5', '9-1']);
    expect(slots('clear-1')).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
    expect(slots('clear-2')).toEqual(['2-2', '3-1', '5-1', '6-2', '7-2']);
    expect(slots('duel-1')).toEqual(['1-4', '2-1', '3-2', '4-3', '5-2']);
    expect(slots('duel-2')).toEqual(['6-4', '7-1', '8-3', '9-1', '10-4']);
    expect(slots('duel-3')).toEqual(['6-1', '7-4', '8-3', '9-2', '10-1']);
    expect(challengesOf('runs').map(randomCount)).toEqual([2, 3, 4, 5, 6]);
    expect(challengesOf('totals').map((c) => c.levels)).toEqual([
      ['2-2', '3-1', '4-3'],
      ['5-1', '7-1', '9-1'],
      ['2-3', '5-5', '6-1'],
      ['1-1', '1-3', '1-2'],
      ['1-5', '2-1', '3-5'],
    ]);
    expect(challengesOf('insane').map((c) => c.levels)).toEqual([
      ['1-1'],
      ['1-4'],
      ['1-1', '1-2', '1-4'],
      ['pick'],
      new Array<string>(10).fill('random'),
    ]);
  });

  it('marks exactly the four duel pages as post-MVP', () => {
    expect(CHALLENGE_GROUPS.filter((g) => g.duel).map((g) => g.id)).toEqual([
      'duel-1',
      'duel-2',
      'duel-3',
      'tri-duel',
    ]);
    for (const c of CHALLENGES) expect(c.duel !== null).toBe(c.group.includes('duel'));
  });

  it('keeps the goals of each kind', () => {
    for (const c of challengesOf('clear-1')) expect(c.fullClear).toBe(true);
    for (const c of challengesOf('cup-3')) expect(c.score).not.toBeNull();
    expect(def('insane.1').balls).toBeLessThan(def('insane.3').balls ?? 0);
    expect(def('insane.2').balls).toBe(1);
    expect(def('insane.4').score).not.toBeNull();
  });

  it('fits the numbers to Teggle (spec 14.2)', () => {
    // More orange than the usual 20, each group more than the last, and never past what every
    // campaign level flags (58, for 55 orange plus green and purple).
    expect(CHALLENGE_ORANGE).toEqual([26, 27, 30]);
    const counts = ['orange-1', 'orange-2', 'orange-3'].map((g) => challengesOf(g)[0]?.orange);
    expect(counts).toEqual([...CHALLENGE_ORANGE]);
    for (const n of CHALLENGE_ORANGE) expect(n).toBeGreaterThan(DEFAULT_ORANGE_COUNT);
    // At 25 or more orange the fever meter and Orange Rush keep the original's rules.
    for (const n of CHALLENGE_ORANGE) expect(n).toBeGreaterThanOrEqual(ORIGINAL_ORANGE_COUNT);
    expect(challengesOf('cup-1').map((c) => c.score)).toEqual(new Array(5).fill(300_000));
    expect(challengesOf('cup-3').map((c) => c.score)).toEqual(new Array(5).fill(400_000));
    expect(challengesOf('totals').map((c) => c.score)).toEqual([
      750_000, 800_000, 850_000, 900_000, 1_000_000,
    ]);
  });
});

describe('the random pool', () => {
  it("is the original's 43 levels", () => {
    expect(RANDOM_POOL).toHaveLength(43);
    for (const id of ['1-1', '1-4', '5-1', '9-3', '9-5', '10-3', '10-5', '11-1', '11-5']) {
      expect(RANDOM_POOL).not.toContain(id);
    }
    for (const id of ['1-2', '2-1', '6-5', '8-5', '9-4', '10-4']) expect(RANDOM_POOL).toContain(id);
  });

  it('draws without repeats from the levels in the game', () => {
    const c = def('runs.3');
    const pool = ['1-2', '1-3', '1-5', '2-1', '2-2'];
    for (let seed = 1; seed <= 40; seed++) {
      const levels = resolveLevels(c, pool, Rng.fromSeed(seed));
      expect(levels).toHaveLength(4);
      expect(new Set(levels).size).toBe(4);
      for (const id of levels) expect(pool).toContain(id);
    }
    expect(() => resolveLevels(def('runs.5'), pool, Rng.fromSeed(1))).toThrow(RangeError);
  });

  it('keeps named levels and the pick', () => {
    expect(resolveLevels(def('totals.4'), [], Rng.fromSeed(1))).toEqual(['1-1', '1-3', '1-2']);
    expect(resolveLevels(def('insane.4'), [], Rng.fromSeed(1), '1-5')).toEqual(['1-5']);
    expect(() => resolveLevels(def('insane.4'), [], Rng.fromSeed(1))).toThrow(RangeError);
  });
});

describe('a challenge run', () => {
  it('plays each level with the challenge rules', () => {
    const c = def('orange-1.1');
    const run = startRun(c, ['1-3']);
    const config = levelConfig(c, run.balls, 'guide');
    expect(config.orangeCount).toBe(c.orange);
    expect(config.balls).toBe(10);
    expect(config.greens && config.purple).toBe(true);
    expect(config.seededGreens).toBe(false);
    expect(config.campaignTry).toBeNull();
    expect(config.power).toBe('guide');
  });

  it('passes a one-level challenge on a win and fails on a loss', () => {
    const c = def('orange-1.1');
    expect(afterLevel(c, startRun(c, ['1-3']), WIN).status).toBe('passed');
    const lost = afterLevel(c, startRun(c, ['1-3']), LOSS);
    expect(lost).toMatchObject({ status: 'failed', reason: 'lost', won: 0 });
  });

  it('needs a full clear where the challenge asks for one', () => {
    const c = def('clear-1.1');
    expect(afterLevel(c, startRun(c, ['1-1']), WIN).reason).toBe('notCleared');
    expect(afterLevel(c, startRun(c, ['1-1']), { ...WIN, fullClear: true }).status).toBe('passed');
  });

  it('needs strictly more than the score', () => {
    const c = def('cup-1.1');
    const target = c.score ?? 0;
    const at = afterLevel(c, startRun(c, ['1-5']), { ...WIN, score: target });
    expect(at).toMatchObject({ status: 'failed', reason: 'score', total: target });
    expect(afterLevel(c, startRun(c, ['1-5']), { ...WIN, score: target + 1 }).status).toBe(
      'passed',
    );
  });

  it('adds up a total over three levels, each with 10 balls', () => {
    const c = def('totals.4');
    let run = startRun(c, ['1-1', '1-3', '1-2']);
    run = afterLevel(c, run, { ...WIN, ballsLeft: 2 });
    expect(run).toMatchObject({ status: 'playing', index: 1, balls: 10, total: 200_000 });
    run = afterLevel(c, run, WIN);
    const last = (c.score ?? 0) - 400_000;
    expect(afterLevel(c, run, { ...WIN, score: last }).reason).toBe('score');
    expect(afterLevel(c, run, { ...WIN, score: last + 1 }).status).toBe('passed');
  });

  it('carries the balls left from level to level when the challenge sets the balls', () => {
    const c = def('insane.3');
    let run = startRun(c, ['1-1', '1-2', '1-4']);
    expect(run.balls).toBe(c.balls);
    run = afterLevel(c, run, { ...WIN, ballsLeft: 3 });
    expect(run).toMatchObject({ status: 'playing', index: 1, balls: 3 });
    const out = afterLevel(c, run, { ...WIN, ballsLeft: 0 });
    expect(out).toMatchObject({ status: 'failed', reason: 'noBalls', won: 2 });
  });

  it('ignores outcomes after the run is over', () => {
    const c = def('runs.1');
    const over = afterLevel(c, startRun(c, ['1-2', '1-3']), LOSS);
    expect(afterLevel(c, over, WIN)).toBe(over);
  });

  it('gives a 20-orange, 10-ball challenge level exactly the Quick Play rules', () => {
    expect(levelConfig(def('runs.1'), 10, 'guide')).toEqual(attemptConfig({ power: 'guide' }));
    expect(levelConfig(def('orange-3.1'), 10, null).orangeCount).toBe(30);
    expect(CHALLENGES.every((c) => levelConfig(c, 10, null).orangeDraw === undefined)).toBe(true);
  });

  it('carries balls only where a stock spans several levels', () => {
    expect(CHALLENGES.filter(carriesBalls).map((c) => c.id)).toEqual(['insane.3']);
  });
});

describe('what can be played', () => {
  const stage1 = new Set(['1-1', '1-2', '1-3', '1-4', '1-5']);

  it('locks duels, missing levels and random runs the pool cannot fill', () => {
    expect(unplayable(def('duel-1.1'), stage1)).toEqual({ kind: 'duel' });
    expect(unplayable(def('orange-1.2'), stage1)).toEqual({ kind: 'levels', missing: ['2-2'] });
    expect(unplayable(def('totals.5'), stage1)).toEqual({
      kind: 'levels',
      missing: ['2-1', '3-5'],
    });
    // Stage 1's random pool holds 1-2, 1-3 and 1-5 (the original's pool leaves out 1-1, 1-4).
    expect(randomPool(stage1)).toEqual(['1-2', '1-3', '1-5']);
    expect(unplayable(def('runs.2'), stage1)).toBeNull();
    expect(unplayable(def('runs.3'), stage1)).toEqual({ kind: 'pool', needed: 4, available: 3 });
    expect(unplayable(def('insane.5'), stage1)).toEqual({
      kind: 'pool',
      needed: 10,
      available: 3,
    });
    for (const id of ['orange-1.1', 'cup-1.1', 'clear-1.4', 'totals.4', 'insane.3', 'insane.4']) {
      expect(unplayable(def(id), stage1)).toBeNull();
    }
  });

  it('opens more as the manifest grows', () => {
    const more = new Set([...stage1, '2-1', '2-2', '2-3', '2-4', '2-5']);
    expect(unplayable(def('orange-1.2'), more)).toBeNull();
    expect(unplayable(def('runs.5'), more)).toBeNull();
    expect(unplayable(def('insane.5'), more)).toEqual({ kind: 'pool', needed: 10, available: 8 });
  });
});

/** The slots of stages 1 to `n`. */
function stages(n: number): Set<string> {
  const out = new Set<string>();
  for (let s = 1; s <= n; s++) for (let l = 1; l <= 5; l++) out.add(`${s}-${l}`);
  return out;
}

/** The first `n` campaign levels, as beaten in the Adventure. */
function through(n: number): Set<string> {
  return new Set(inCampaignOrder(stages(11)).slice(0, n));
}

describe('what is shown', () => {
  it('hides duels and challenges whose levels are not in the game', () => {
    const built = stages(5);
    for (const c of CHALLENGES.filter((x) => x.duel !== null)) {
      expect(isHidden(c, stages(11))).toBe(true);
    }
    const shown = CHALLENGES.filter((c) => !isHidden(c, built)).map((c) => c.id);
    // With stages 1 to 5 built: 45 of the 75 have all their levels.
    expect(shown).toHaveLength(45);
    expect(shown).toContain('orange-2.4');
    expect(shown).not.toContain('orange-2.5');
    expect(shown).not.toContain('totals.2');
    expect(shown).toContain('insane.5');
    // A random run the pool in the game cannot fill is hidden too.
    expect(isHidden(def('runs.3'), stages(1))).toBe(true);
    expect(isHidden(def('runs.2'), stages(1))).toBe(false);
    expect(isHidden(def('insane.4'), new Set())).toBe(true);
  });

  it('orders slots as the campaign does', () => {
    expect(slotNumber('1-1')).toBe(1);
    expect(slotNumber('2-1')).toBe(6);
    expect(slotNumber('11-5')).toBe(55);
    expect(inCampaignOrder(['10-1', '2-3', '1-5', '2-1'])).toEqual(['1-5', '2-1', '2-3', '10-1']);
  });
});

describe('what opens a challenge (spec 14.2)', () => {
  const built = stages(5);

  it('opens once every level it names is beaten in the Adventure', () => {
    expect(levelsToOpen(def('orange-1.1'), built, through(2))).toEqual(['1-3']);
    expect(levelsToOpen(def('orange-1.1'), built, through(3))).toEqual([]);
    expect(levelsToOpen(def('totals.1'), built, through(6))).toEqual(['2-2', '3-1', '4-3']);
    expect(levelsToOpen(def('totals.1'), built, through(12))).toEqual(['4-3']);
    // Named levels come in campaign order, whatever order the challenge plays them in.
    expect(levelsToOpen(def('totals.4'), built, new Set())).toEqual(['1-1', '1-2', '1-3']);
    expect(levelsToOpen(def('insane.3'), built, through(4))).toEqual([]);
  });

  it('opens a random run once enough levels it can draw are beaten', () => {
    // The pool leaves out 1-1 and 1-4: after 1-1 to 1-3, two pool levels are beaten.
    expect(levelsToOpen(def('runs.1'), built, through(3))).toEqual([]);
    expect(levelsToOpen(def('runs.2'), built, through(3))).toEqual(['1-5']);
    expect(levelsToOpen(def('runs.2'), built, through(4))).toEqual(['1-5']);
    expect(levelsToOpen(def('runs.2'), built, through(5))).toEqual([]);
    expect(levelsToOpen(def('runs.5'), built, through(3))).toEqual(['1-5', '2-1', '2-2', '2-3']);
    expect(levelsToOpen(def('insane.5'), built, new Set()).at(-1)).toBe('3-2');
    expect(levelsToOpen(def('insane.5'), built, new Set())).toHaveLength(10);
  });

  it('opens the pick with one beaten level', () => {
    expect(levelsToOpen(def('insane.4'), built, new Set())).toEqual(['1-1']);
    expect(levelsToOpen(def('insane.4'), built, through(1))).toEqual([]);
  });

  it('draws random levels only from beaten pool levels', () => {
    expect(drawPool(built, through(6))).toEqual(['1-2', '1-3', '1-5', '2-1']);
    const c = def('runs.2');
    for (let seed = 1; seed <= 20; seed++) {
      const levels = resolveLevels(c, drawPool(built, through(6)), Rng.fromSeed(seed));
      for (const id of levels) expect(['1-2', '1-3', '1-5', '2-1']).toContain(id);
    }
  });

  it('opens every shown challenge once the levels in the game are beaten', () => {
    for (const c of CHALLENGES.filter((x) => !isHidden(x, built))) {
      expect(levelsToOpen(c, built, built)).toEqual([]);
    }
  });
});
