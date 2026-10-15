// Zen Ball (Owl, spec 7): the next shot is replaced by a better one found by playing out angles
// near the player's on copies of the attempt. The patent says it "evaluates a range of paths and
// nudges the ball toward the highest-scoring one, weighting bucket landings and orange pegs";
// the speedrun guide adds that it simulates nearby angles, style points count, and aiming at the
// side limit halves the options. Teggle's search (values in tuning.ts, spec 14.2):
//
// - Candidates: the player's own direction, then angles ZEN_STEP apart, nearest first and left
//   before right, up to ZEN_STEPS steps either side; angles past the cannon's limit are skipped.
// - Each candidate is launched at the same tick on a trial copy of the attempt (trialClone), so
//   moving parts, powers and every rule play out exactly as the real shot would, and played to
//   its end or ZEN_TICK_LIMIT ticks. The flipper button counts as released.
// - Value: score gain (style points included) + ZEN_ORANGE_WEIGHT per orange peg lit +
//   ZEN_BALL_WEIGHT per free ball + ZEN_WIN_WEIGHT for a win. A ball the coin flip would return
//   counts nothing, so the search cannot read the coin from the attempt's random numbers.
// - The first candidate with the highest value wins: the player's shot unless another is better,
//   then the one nearest to it.
//
// The search is deterministic, so a replay finds the same shot. It can run in slices
// (ZenSearch.run) so the play screen spreads it over frames: zenSearchFor hands the launch hook
// the search the screen already ran for the same attempt state and direction.

import { atan2 } from '../../core/dmath';
import type { Vec2 } from '../../level/geometry';
import { aimDirection } from '../../sim/aim';
import { CANNON_PIVOT_Y, MAX_AIM_ANGLE } from '../../sim/tuning';
import type { Attempt, AttemptView } from '../attempt';
import type { Power } from '../power';
import {
  ZEN_BALL_WEIGHT,
  ZEN_ORANGE_WEIGHT,
  ZEN_SHOTS,
  ZEN_STEP,
  ZEN_STEPS,
  ZEN_TICK_LIMIT,
  ZEN_WIN_WEIGHT,
} from '../tuning';
import { action } from './common';

export interface ZenResult {
  /** The shot to launch: the player's own direction (as given) when nothing beat it. */
  readonly direction: Vec2;
  /** The shot found is not the player's. */
  readonly better: boolean;
  /** Values of the player's shot and of the shot found. */
  readonly baseline: number;
  readonly value: number;
  /** Candidates played out and simulation ticks spent on them. */
  readonly candidates: number;
  readonly ticks: number;
}

export class ZenSearch {
  /** The direction it searches around and the attempt state it was made for. */
  readonly direction: Vec2;
  private readonly tick: number;
  private readonly shots: number;
  private readonly score: number;
  private readonly balls: number;
  private readonly seed: number;
  private readonly orange: number;
  private readonly base: Attempt;
  private readonly trial: Attempt;
  private readonly candidates: Vec2[] = [];
  private next = 0;
  private running = false;
  private runTicks = 0;
  private spent = 0;
  private bestIndex = -1;
  private bestValue = -Infinity;
  private baselineValue = 0;

  constructor(attempt: AttemptView, direction: Vec2) {
    if (attempt.phase !== 'aim') throw new Error('Zen Ball searches before a launch');
    this.direction = { x: direction.x, y: direction.y };
    this.tick = attempt.world.tick;
    this.shots = attempt.shotsTaken;
    this.score = attempt.score;
    this.balls = attempt.ballsLeft;
    this.seed = attempt.seed;
    this.orange = attempt.orangeLeft;
    this.base = attempt.trialClone();
    this.trial = attempt.trialClone();
    this.candidates.push(this.direction);
    const theta = atan2(direction.x, direction.y);
    for (let k = 1; k <= ZEN_STEPS; k++) {
      for (const side of [-1, 1]) {
        const a = theta + side * k * ZEN_STEP;
        if (a >= -MAX_AIM_ANGLE && a <= MAX_AIM_ANGLE) this.candidates.push(aimDirection(a));
      }
    }
  }

  /** True when this search was made for `attempt` in its current state and `direction`. */
  matches(attempt: AttemptView, direction: Vec2): boolean {
    return (
      attempt.phase === 'aim' &&
      attempt.world.tick === this.tick &&
      attempt.shotsTaken === this.shots &&
      attempt.score === this.score &&
      attempt.ballsLeft === this.balls &&
      attempt.seed === this.seed &&
      direction.x === this.direction.x &&
      direction.y === this.direction.y
    );
  }

  get done(): boolean {
    return this.next >= this.candidates.length;
  }

  /** Candidates in all, and how many are played out. */
  get total(): number {
    return this.candidates.length;
  }

  get tried(): number {
    return this.next;
  }

  /** The best shot so far (the player's until a better one turns up). */
  get best(): Vec2 {
    return this.candidates[Math.max(0, this.bestIndex)] ?? this.direction;
  }

  /** Simulation ticks spent so far. */
  get ticks(): number {
    return this.spent;
  }

  /**
   * Plays candidates for up to `maxTicks` simulation ticks, continuing a candidate where the last
   * call stopped. Returns true once every candidate is done.
   */
  run(maxTicks: number): boolean {
    let left = maxTicks;
    const t = this.trial;
    while (!this.done && left > 0) {
      if (!this.running) {
        t.copyFrom(this.base);
        t.setFlipperInput(false);
        t.launch(this.candidates[this.next] ?? this.direction);
        this.running = true;
        this.runTicks = 0;
      }
      while (t.phase === 'shot' && this.runTicks < ZEN_TICK_LIMIT && left > 0) {
        t.step();
        this.runTicks++;
        this.spent++;
        left--;
      }
      if (t.phase === 'shot' && this.runTicks < ZEN_TICK_LIMIT) break;
      this.evaluate(this.next);
      this.next++;
      this.running = false;
    }
    return this.done;
  }

  /** Runs whatever is left and returns the shot found. */
  finish(): ZenResult {
    while (!this.run(100000)) {
      // Slices of 100,000 ticks until every candidate is done.
    }
    return {
      direction: this.best,
      better: this.bestIndex > 0,
      baseline: this.baselineValue,
      value: this.bestValue,
      candidates: this.candidates.length,
      ticks: this.spent,
    };
  }

  /** Values the candidate just played out on the trial copy. */
  private evaluate(index: number): void {
    const t = this.trial;
    const finished = t.phase !== 'shot';
    let gain = t.score - this.score;
    if (!finished) gain += t.shotScore + t.shotStyle;
    // Launching took a ball; a shot that lit nothing and missed the bucket can only have won
    // the coin flip, which the search must not read.
    let balls = t.ballsLeft - this.balls + 1;
    if (finished && t.shotCount === 0 && !t.shotCaught) balls = 0;
    const value =
      gain +
      (this.orange - t.orangeLeft) * ZEN_ORANGE_WEIGHT +
      balls * ZEN_BALL_WEIGHT +
      (t.result === 'won' ? ZEN_WIN_WEIGHT : 0);
    if (index === 0) this.baselineValue = value;
    if (value > this.bestValue) {
      this.bestValue = value;
      this.bestIndex = index;
    }
  }
}

const searches = new WeakMap<AttemptView, ZenSearch>();

/**
 * The search for launching `attempt` toward `direction` now: the one already started for this
 * state if there is one, else a new one. The play screen runs it over several frames before the
 * launch; the launch hook then only finishes it.
 */
export function zenSearchFor(attempt: AttemptView, direction: Vec2): ZenSearch {
  const known = searches.get(attempt);
  if (known !== undefined && known.matches(attempt, direction)) return known;
  const search = new ZenSearch(attempt, direction);
  searches.set(attempt, search);
  return search;
}

export const ZEN_BALL: Power = {
  id: 'zenBall',
  name: 'Zen Ball',
  onGreen(ctx) {
    ctx.grant('zenBall', ZEN_SHOTS, 'next');
  },
  launch(ctx, _fx, plan) {
    const attempt = ctx.attempt;
    // A trial copy is a candidate of a search already running.
    if (attempt.trial) return;
    const result = zenSearchFor(attempt, plan.direction).finish();
    searches.delete(attempt);
    plan.direction = result.direction;
    ctx.announce(
      action('zenShot', attempt.level.width / 2, CANNON_PIVOT_Y, {
        value: Math.round(result.value - result.baseline),
        detail: result.better ? 'better' : 'kept',
        dx: result.direction.x,
        dy: result.direction.y,
      }),
    );
  },
};
