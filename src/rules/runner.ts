// Headless play for self-play agents and the level generator: an attempt driven by a list of
// shot choices or a callback, as fast as the simulation runs. With `events: false` the rules
// allocate nothing per tick; the attempt still records every shot for replay.

import type { Vec2 } from '../level/geometry';
import type { CompiledLevel } from '../sim/compile';
import { Attempt, type AttemptInit, type AttemptOptions } from './attempt';

export interface ShotChoice {
  /** Launch direction (any non-zero vector). */
  readonly direction: Vec2;
  /** Ticks to aim before the launch: moving parts and the bucket move meanwhile. Default 0. */
  readonly wait?: number;
  /** Flipper button for the coming tick, asked before every tick of the shot. */
  readonly flipper?: (attempt: Attempt) => boolean;
}

/** Picks the next shot from the attempt's state, or null to stop. */
export type ShotChooser = (attempt: Attempt) => ShotChoice | null;

/** Aims for `choice.wait` ticks, launches, and steps until the shot is over. */
export function playShot(attempt: Attempt, choice: ShotChoice): void {
  const wait = choice.wait ?? 0;
  for (let t = 0; t < wait; t++) attempt.step();
  attempt.launch(choice.direction);
  const flipper = choice.flipper;
  while (attempt.phase === 'shot') {
    if (flipper !== undefined) attempt.setFlipperInput(flipper(attempt));
    attempt.step();
  }
}

/**
 * Plays an attempt until it is over or the shots run out. Events default to off here; pass
 * `events: true` to collect them.
 */
export function playAttempt(
  level: CompiledLevel,
  init: AttemptInit,
  shots: ShotChooser | readonly ShotChoice[],
  options: AttemptOptions = {},
): Attempt {
  const attempt = new Attempt(level, init, { ...options, events: options.events ?? false });
  const next: ShotChooser =
    typeof shots === 'function' ? shots : (a) => shots[a.shotsTaken] ?? null;
  while (attempt.phase === 'aim') {
    const choice = next(attempt);
    if (choice === null) break;
    playShot(attempt, choice);
  }
  return attempt;
}
