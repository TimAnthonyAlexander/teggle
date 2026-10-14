// Golden rules scenarios: whole attempts whose every rules event, final score and world tick
// feed a digest. Node and Bun must agree on it (tools/engine-digest.ts), and it changes only on
// purpose (src/rules/golden.test.ts). The attempts cover color assignment, scoring, the meter,
// free balls, the coin flip, the purple peg, style shots, stuck handling, Fever, bonuses, a
// power with flipper input, and replay.

import { Digest } from '../../src/core/digest';
import { Attempt } from '../../src/rules/attempt';
import { attemptConfig, campaignConfig, type AttemptConfig } from '../../src/rules/config';
import type { RulesEvent } from '../../src/rules/events';
import { replayAttempt } from '../../src/rules/record';
import { compileLevel } from '../../src/sim/compile';
import { benchLevel, mixedLevel, plinkoLevel } from './levels';
import { randomPlay, TEST_POWERS } from './rules';

function feed(d: Digest, events: readonly RulesEvent[]): void {
  for (const e of events) {
    for (const [key, value] of Object.entries(e)) {
      d.string(key);
      if (typeof value === 'number') d.number(value);
      else if (typeof value === 'boolean') d.int(value ? 1 : 0);
      else d.string(String(value));
    }
  }
}

interface Scenario {
  readonly name: string;
  readonly level: () => ReturnType<typeof plinkoLevel>;
  readonly config: AttemptConfig;
  readonly seed: number;
  readonly flippers?: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'plinko', level: plinkoLevel, config: attemptConfig(), seed: 1 },
  {
    name: 'bench',
    level: benchLevel,
    config: campaignConfig({ level: 23, try: 2, firstPlay: false, power: null }),
    seed: 2,
  },
  // Seeds picked so the random play wins: Fever, a Fever bucket and every bonus.
  {
    name: 'fever',
    level: plinkoLevel,
    config: attemptConfig({ orangeCount: 5, campaignTry: 1 }),
    seed: 12,
  },
  {
    name: 'slide',
    level: benchLevel,
    config: attemptConfig({ orangeCount: 5, campaignTry: 3 }),
    seed: 17,
  },
  {
    name: 'mixed',
    level: mixedLevel,
    config: attemptConfig({ orangeCount: 20, power: 'testFlippers' }),
    seed: 4,
    flippers: true,
  },
];

export function rulesScenarioDigests(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of SCENARIOS) {
    const level = compileLevel(s.level());
    const attempt = new Attempt(
      level,
      { levelId: s.name, seed: s.seed, config: s.config },
      { powers: TEST_POWERS },
    );
    const events = randomPlay(attempt, s.seed * 1000, { flippers: s.flippers === true });
    const d = new Digest();
    feed(d, events);
    d.number(attempt.score)
      .int(attempt.world.tick)
      .string(attempt.result ?? 'none');
    // The replay has to land on the same bits.
    const replayed = replayAttempt(level, attempt.record(), { powers: TEST_POWERS });
    d.number(replayed.score).int(replayed.world.tick);
    out[s.name] = d.hex();
  }
  return out;
}

/** One digest over every rules scenario, for the cross-engine check. */
export function rulesDigest(): string {
  const d = new Digest();
  for (const [name, hex] of Object.entries(rulesScenarioDigests())) d.string(name).string(hex);
  return d.hex();
}
