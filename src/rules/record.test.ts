import { describe, expect, it } from 'vitest';
import { compileLevel } from '../sim/compile';
import { benchLevel, plinkoLevel } from '../../tests/fixtures/levels';
import { DOWN, newAttempt, pegGrid, randomPlay, TEST_POWERS } from '../../tests/fixtures/rules';
import { Attempt } from './attempt';
import { attemptConfig, campaignConfig } from './config';
import type { RulesEvent } from './events';
import {
  parseAttemptRecord,
  replayAttempt,
  ReplayError,
  Replayer,
  type AttemptRecord,
} from './record';

function replayEvents(
  level: ReturnType<typeof compileLevel>,
  record: AttemptRecord,
  powers = TEST_POWERS,
): {
  attempt: Attempt;
  events: RulesEvent[];
} {
  const events: RulesEvent[] = [];
  const attempt = replayAttempt(level, record, {
    powers,
    observe: (a) => {
      events.push(...a.takeEvents());
    },
  });
  return { attempt, events };
}

describe('replay', () => {
  it('replays whole attempts to the identical events, score and record', () => {
    const cases = [
      { level: compileLevel(plinkoLevel()), config: attemptConfig(), seed: 11 },
      {
        level: compileLevel(benchLevel()),
        config: campaignConfig({ level: 12, try: 2, firstPlay: false, power: null }),
        seed: 12,
      },
      {
        level: compileLevel(plinkoLevel()),
        config: attemptConfig({ orangeCount: 6, campaignTry: 1 }),
        seed: 13,
      },
    ];
    for (const { level, config, seed } of cases) {
      const live = new Attempt(level, { levelId: 'case', seed, config });
      const events = randomPlay(live, seed * 7);
      expect(live.phase).toBe('over');
      const record = live.record();
      const { attempt, events: replayed } = replayEvents(level, record);
      expect(replayed).toEqual(events);
      expect(attempt.score).toBe(live.score);
      expect(attempt.result).toBe(live.result);
      expect(attempt.world.tick).toBe(live.world.tick);
      expect(attempt.record()).toEqual(record);
      // Through JSON and the save-file schema.
      const parsed = parseAttemptRecord(JSON.parse(JSON.stringify(record)));
      expect(replayEvents(level, parsed).events).toEqual(events);
    }
  });

  it('replays flipper input and power effects', () => {
    const level = compileLevel(plinkoLevel());
    const config = attemptConfig({ power: 'testFlippers' });
    const live = new Attempt(
      level,
      { levelId: 'flippers', seed: 21, config },
      { powers: TEST_POWERS },
    );
    const events = randomPlay(live, 6, { flippers: true });
    const record = live.record();
    // The scenario covers what it is meant to: flippers ran, and inputs were recorded.
    expect(events.some((e) => e.type === 'effect' && e.change === 'granted')).toBe(true);
    expect(record.shots.some((s) => s.inputs.length > 0)).toBe(true);
    const { attempt, events: replayed } = replayEvents(level, record);
    expect(replayed).toEqual(events);
    expect(attempt.score).toBe(live.score);
    expect(attempt.record()).toEqual(record);
  });

  it('stops where a record of an unfinished attempt ends', () => {
    const level = compileLevel(benchLevel());
    const live = new Attempt(level, { levelId: 'bench', seed: 3, config: attemptConfig() });
    randomPlay(live, 3, { maxShots: 4 });
    const replayer = new Replayer(level, live.record());
    while (!replayer.done) replayer.step();
    expect(replayer.shotsReplayed).toBe(4);
    expect(replayer.attempt.phase).toBe('aim');
    expect(replayer.attempt.score).toBe(live.score);
    expect(replayer.attempt.ballsLeft).toBe(live.ballsLeft);
    expect(replayer.attempt.purple).toBe(live.purple);
  });

  it('refuses a changed level, shots after the end, and shots in the past', () => {
    const live = newAttempt(pegGrid(40), attemptConfig({ balls: 1, coinFlip: false }));
    live.launch(DOWN);
    while (live.phase === 'shot') live.step();
    const record = live.record();
    const level = live.level;

    expect(() => new Replayer(compileLevel(pegGrid(41)), record)).toThrow(ReplayError);

    const extra = {
      ...record,
      shots: [...record.shots, { tick: 99999, direction: DOWN, inputs: [] }],
    };
    expect(live.phase).toBe('over');
    expect(() => replayAttempt(level, extra)).toThrow(/ended before shot 1/);

    const twice = {
      ...record,
      shots: [
        { tick: 5, direction: DOWN, inputs: [] },
        { tick: 2, direction: DOWN, inputs: [] },
      ],
    };
    expect(() =>
      replayAttempt(level, { ...twice, config: { ...record.config, balls: 2 } }),
    ).toThrow(/launches at tick 2/);
  });

  it('validates records read from saves', () => {
    const live = newAttempt(pegGrid(40), attemptConfig());
    const record = live.record();
    expect(parseAttemptRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(() => parseAttemptRecord({ ...record, seed: -1 })).toThrow(ReplayError);
    expect(() => parseAttemptRecord({ ...record, format: 2 })).toThrow(ReplayError);
    expect(() =>
      parseAttemptRecord({ ...record, shots: [{ tick: 0, direction: { x: 0 } }] }),
    ).toThrow(ReplayError);
    expect(() =>
      parseAttemptRecord({ ...record, config: { ...record.config, orangeCount: 0 } }),
    ).toThrow(ReplayError);
  });
});

describe('clone', () => {
  it('continues identically from a copy taken mid-shot', () => {
    const level = compileLevel(benchLevel());
    const a = new Attempt(level, { levelId: 'bench', seed: 8, config: attemptConfig() });
    randomPlay(a, 8, { maxShots: 3 });
    a.launch(DOWN);
    for (let t = 0; t < 40; t++) a.step();
    a.takeEvents();
    const b = a.clone();
    const reused = new Attempt(level, {
      levelId: 'other',
      seed: 99,
      config: attemptConfig({ orangeCount: 30 }),
    });
    reused.copyFrom(a);
    const run = (x: Attempt): RulesEvent[] => {
      const out: RulesEvent[] = [];
      while (x.phase === 'shot') {
        x.step();
        out.push(...x.takeEvents());
      }
      out.push(...randomPlay(x, 77));
      return out;
    };
    const original = run(a);
    expect(run(b)).toEqual(original);
    expect(run(reused)).toEqual(original);
    expect(b.score).toBe(a.score);
    expect(reused.record()).toEqual(a.record());
  });
});
