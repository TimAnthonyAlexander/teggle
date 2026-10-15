// Cross-engine checks that run the same in Node and in the browsers (spec 13.4, 14.1): the digests
// tools/engine-digest.ts prints, and whole attempts with powers that one engine records and
// another replays, digested event by event. tests/browser/determinism.spec.ts records in Node and
// replays in Chromium, WebKit and Firefox through the dev-only page tests/browser/checks.html.

import { Digest } from '../../src/core/digest';
import type { Level } from '../../src/level/schema';
import { Attempt } from '../../src/rules/attempt';
import { attemptConfig } from '../../src/rules/config';
import type { RulesEvent } from '../../src/rules/events';
import { BASE_POWERS, type PowerId } from '../../src/rules/powers';
import { parseAttemptRecord, replayAttempt, type AttemptRecord } from '../../src/rules/record';
import { compileLevel } from '../../src/sim/compile';
import { engineDigest } from './golden';
import { benchLevel, mixedLevel, plinkoLevel } from './levels';
import { feed, powersDigest } from './powers-golden';
import { randomPlay } from './rules';
import { rulesDigest } from './rules-golden';

export interface EngineDigests {
  readonly sim: string;
  readonly rules: string;
  readonly powers: string;
}

/** The three digests tools/engine-digest.ts prints. */
export function engineDigests(): EngineDigests {
  return { sim: engineDigest(), rules: rulesDigest(), powers: powersDigest() };
}

const LEVELS = {
  plinko: plinkoLevel,
  bench: benchLevel,
  mixed: mixedLevel,
} as const satisfies Record<string, () => Level>;

export type FixtureLevel = keyof typeof LEVELS;

export interface RecordedAttempt {
  readonly name: string;
  readonly level: FixtureLevel;
  /** Plain JSON data: it crosses from Node into the page. */
  readonly record: AttemptRecord;
}

/**
 * One attempt per master power, on seeds that light green pegs (the golden power attempts'
 * seeds): random aims and waits, and random flipper presses with the Flippers.
 */
const RECORDINGS: readonly {
  readonly power: PowerId;
  readonly level: FixtureLevel;
  readonly seed: number;
}[] = [
  { power: 'guide', level: 'plinko', seed: 1 },
  { power: 'multiball', level: 'plinko', seed: 1 },
  { power: 'pyramid', level: 'bench', seed: 2 },
  { power: 'spaceBlast', level: 'plinko', seed: 2 },
  { power: 'flippers', level: 'plinko', seed: 6 },
  { power: 'spookyBall', level: 'mixed', seed: 1 },
  { power: 'flowerPower', level: 'plinko', seed: 9 },
  { power: 'luckySpin', level: 'plinko', seed: 11 },
  { power: 'fireball', level: 'bench', seed: 2 },
  { power: 'zenBall', level: 'plinko', seed: 12 },
];

/** Plays and records every attempt of RECORDINGS in this engine. */
export function recordedAttempts(): RecordedAttempt[] {
  return RECORDINGS.map((r) => {
    const attempt = new Attempt(
      compileLevel(LEVELS[r.level]()),
      { levelId: r.power, seed: r.seed, config: attemptConfig({ power: r.power }) },
      { powers: BASE_POWERS },
    );
    randomPlay(attempt, r.seed * 1000, { flippers: r.power === 'flippers' });
    return { name: r.power, level: r.level, record: attempt.record() };
  });
}

/**
 * Replays a recorded attempt (validated first: it arrives as untrusted JSON) and digests every
 * rules event, the final score, tick and result.
 */
export function replayDigest(recorded: RecordedAttempt): string {
  const record = parseAttemptRecord(recorded.record);
  const events: RulesEvent[] = [];
  const attempt = replayAttempt(compileLevel(LEVELS[recorded.level]()), record, {
    powers: BASE_POWERS,
    observe: (a) => {
      events.push(...a.takeEvents());
    },
  });
  const d = new Digest();
  feed(d, events);
  d.number(attempt.score)
    .int(attempt.world.tick)
    .string(attempt.result ?? 'none');
  return d.hex();
}
