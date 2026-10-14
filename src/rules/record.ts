// Attempt records and replay. A record holds the level id and hash, the seed, the config and
// every shot as its launch tick, the player's direction vector (never an angle) and the
// flipper inputs. Replaying it from a fresh world gives the identical events and score in any
// JS engine (spec 13.4).

import { z } from 'zod';
import type { CompiledLevel } from '../sim/compile';
import { Attempt, type AttemptOptions } from './attempt';
import { attemptConfigSchema } from './config';

/** A flipper button change, applied before the step from `tick` to `tick + 1`. */
export interface InputRecord {
  readonly tick: number;
  readonly flipper: boolean;
}

export interface ShotRecord {
  /** World tick at the launch. */
  readonly tick: number;
  /** The player's launch direction, as passed to Attempt.launch. */
  readonly direction: { readonly x: number; readonly y: number };
  /** Inputs from the end of the previous shot until this shot ended, in order. */
  readonly inputs: readonly InputRecord[];
}

const tickSchema = z.int().min(0);

export const attemptRecordSchema = z.strictObject({
  format: z.literal(1),
  levelId: z.string().min(1),
  levelHash: z.string().regex(/^[0-9a-f]{16}$/),
  seed: z.int().min(0).max(0xffffffff),
  config: attemptConfigSchema,
  shots: z.array(
    z.strictObject({
      tick: tickSchema,
      direction: z.strictObject({ x: z.number(), y: z.number() }),
      inputs: z.array(z.strictObject({ tick: tickSchema, flipper: z.boolean() })),
    }),
  ),
});

export type AttemptRecord = z.output<typeof attemptRecordSchema>;

export class ReplayError extends Error {
  override readonly name = 'ReplayError';
}

/** Validates an untrusted record (a save file). Throws ReplayError. */
export function parseAttemptRecord(json: unknown): AttemptRecord {
  const result = attemptRecordSchema.safeParse(json);
  if (!result.success) {
    throw new ReplayError(`Invalid attempt record:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * Drives a fresh attempt through a record, one call at a time: each step() either launches the
 * next recorded shot (when it is due) or applies the inputs due and steps the attempt one tick.
 * The attempt's rules events queue up as in live play (Attempt.takeEvents).
 */
export class Replayer {
  readonly attempt: Attempt;
  private readonly inputs: InputRecord[];
  private nextShot = 0;
  private nextInput = 0;

  constructor(
    level: CompiledLevel,
    private readonly rec: AttemptRecord,
    options: AttemptOptions = {},
  ) {
    this.attempt = new Attempt(
      level,
      { levelId: rec.levelId, seed: rec.seed, config: rec.config },
      options,
    );
    if (this.attempt.levelHash !== rec.levelHash) {
      throw new ReplayError(
        `record of level "${rec.levelId}" was made on a different version of the level`,
      );
    }
    this.inputs = rec.shots.flatMap((s) => s.inputs);
  }

  /** Shots launched so far. */
  get shotsReplayed(): number {
    return this.nextShot;
  }

  /** The record is used up: the attempt is over, or aiming with no recorded shot left. */
  get done(): boolean {
    const a = this.attempt;
    return a.phase === 'over' || (a.phase === 'aim' && this.nextShot >= this.rec.shots.length);
  }

  step(): void {
    const a = this.attempt;
    const tick = a.world.tick;
    const shot = this.rec.shots[this.nextShot];
    if (a.phase === 'aim' && shot !== undefined) {
      if (shot.tick < tick) {
        throw new ReplayError(`shot ${this.nextShot} launches at tick ${shot.tick}, now ${tick}`);
      }
      if (shot.tick === tick) {
        this.nextShot++;
        a.launch(shot.direction);
        return;
      }
    } else if (a.phase === 'over' && shot !== undefined) {
      throw new ReplayError(`the attempt ended before shot ${this.nextShot}`);
    }
    for (;;) {
      const input = this.inputs[this.nextInput];
      if (input === undefined || input.tick > tick) break;
      if (input.tick < tick) throw new ReplayError(`input at tick ${input.tick} was missed`);
      a.setFlipperInput(input.flipper);
      this.nextInput++;
    }
    a.step();
  }
}

/** Replays a record to its end. `observe` runs after every launch and step. */
export function replayAttempt(
  level: CompiledLevel,
  record: AttemptRecord,
  options: AttemptOptions & { readonly observe?: (attempt: Attempt) => void } = {},
): Attempt {
  const r = new Replayer(level, record, options);
  while (!r.done) {
    r.step();
    options.observe?.(r.attempt);
  }
  if (r.shotsReplayed < record.shots.length) {
    throw new ReplayError(`the attempt ended before shot ${r.shotsReplayed}`);
  }
  return r.attempt;
}
