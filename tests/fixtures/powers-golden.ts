// Golden power attempts: one whole attempt per master power, played with random aims (and a
// random flipper button for the Flippers), each digested with its replay. Together they use every
// power, Lucky Spin's outcomes and Zen Ball's search; Node and Bun must agree on the combined
// digest (tools/engine-digest.ts), and it changes only on purpose (src/rules/powers/golden.test.ts).

import { Digest } from '../../src/core/digest';
import type { Level } from '../../src/level/schema';
import { Attempt } from '../../src/rules/attempt';
import { attemptConfig } from '../../src/rules/config';
import type { RulesEvent } from '../../src/rules/events';
import { BASE_POWERS, type PowerId } from '../../src/rules/powers';
import { replayAttempt } from '../../src/rules/record';
import { compileLevel } from '../../src/sim/compile';
import { benchLevel, mixedLevel, plinkoLevel } from './levels';
import { randomPlay } from './rules';

interface PowerScenario {
  readonly name: string;
  readonly power: PowerId;
  readonly level: () => Level;
  readonly seed: number;
}

/**
 * Seeds picked so every attempt lights both green pegs at some point; the Pyramid and the
 * Fireball run on the moving bench level, the Spooky Ball on the mixed one. The two Lucky Spin
 * attempts land on Triple Score, a random Fireball that burns the dome, an extra ball and Big Ball.
 */
const SCENARIOS: readonly PowerScenario[] = [
  { name: 'guide', power: 'guide', level: plinkoLevel, seed: 1 },
  { name: 'multiball', power: 'multiball', level: plinkoLevel, seed: 1 },
  { name: 'pyramid', power: 'pyramid', level: benchLevel, seed: 5 },
  { name: 'spaceBlast', power: 'spaceBlast', level: plinkoLevel, seed: 1 },
  { name: 'flippers', power: 'flippers', level: plinkoLevel, seed: 1 },
  { name: 'spookyBall', power: 'spookyBall', level: mixedLevel, seed: 3 },
  { name: 'flowerPower', power: 'flowerPower', level: plinkoLevel, seed: 1 },
  { name: 'luckySpin', power: 'luckySpin', level: plinkoLevel, seed: 1 },
  { name: 'luckySpin2', power: 'luckySpin', level: plinkoLevel, seed: 23 },
  { name: 'fireball', power: 'fireball', level: benchLevel, seed: 9 },
  { name: 'zenBall', power: 'zenBall', level: plinkoLevel, seed: 1 },
];

/** Digests rules events field by field, in their key order. */
export function feed(d: Digest, events: readonly RulesEvent[]): void {
  for (const e of events) {
    for (const [key, value] of Object.entries(e)) {
      d.string(key);
      if (typeof value === 'number') d.number(value);
      else if (typeof value === 'boolean') d.int(value ? 1 : 0);
      else if (Array.isArray(value)) for (const v of value as number[]) d.number(v);
      else d.string(String(value));
    }
  }
}

export interface PowerGolden {
  readonly digest: string;
  /** Green hits and power actions in the attempt, so the test can tell it used its power. */
  readonly greens: number;
  readonly actions: readonly string[];
}

export function powerScenarioDigests(): Record<string, PowerGolden> {
  const out: Record<string, PowerGolden> = {};
  for (const s of SCENARIOS) {
    const level = compileLevel(s.level());
    const attempt = new Attempt(
      level,
      { levelId: s.name, seed: s.seed, config: attemptConfig({ power: s.power }) },
      { powers: BASE_POWERS },
    );
    const events = randomPlay(attempt, s.seed * 1000, { flippers: s.power === 'flippers' });
    const d = new Digest();
    feed(d, events);
    d.number(attempt.score)
      .int(attempt.world.tick)
      .string(attempt.result ?? 'none');
    const replayed = replayAttempt(level, attempt.record(), { powers: BASE_POWERS });
    d.number(replayed.score).int(replayed.world.tick);
    out[s.name] = {
      digest: d.hex(),
      greens: events.filter((e) => e.type === 'greenHit').length,
      actions: events.flatMap((e) =>
        e.type === 'powerAction' ? [`${e.action}${e.detail === '' ? '' : `:${e.detail}`}`] : [],
      ),
    };
  }
  return out;
}

/** One digest over every power attempt, for the cross-engine check. */
export function powersDigest(): string {
  const d = new Digest();
  for (const [name, g] of Object.entries(powerScenarioDigests())) d.string(name).string(g.digest);
  return d.hex();
}
