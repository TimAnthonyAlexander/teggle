// Self-play agents (spec 13.5). Each picks the launch angle of the next shot from the attempt's
// state; the run loop (run.ts) launches it and plays the shot under the full rules.
//
// - random: a uniform angle over the cannon's range. The floor of difficulty.
// - greedy: tries SEARCH_ANGLES angles spread evenly over the range (one random offset per
//   shot), plays each to its end on a trial copy of the attempt, and takes the best by, in
//   order: a win, the most orange pegs lit, the most free balls, the highest score gain (style
//   points included). Ties keep the first angle tried. This is roughly what Zen Ball does for a
//   single shot.
// - noisy: the greedy angle plus a normal aim error with standard deviation `noise` radians,
//   clamped to the cannon's range. The error size is the skill setting.
//
// Trial shots launch at the same tick as the real one, so moving parts, the bucket and the
// powers play out exactly as they would; the flipper policy drives the button in trials too.
// A ball the coin flip would return counts as no free ball, so the search cannot read the coin
// from the attempt's random numbers. Other random rules inside a shot (Lucky Spin's wheel) draw
// from the same numbers in the trial and the real shot, so the search sees their outcome, as
// Zen Ball's does.
//
// The inner loop (one tick of a trial) allocates nothing; each candidate costs a copy of the
// attempt and a launch.

import { z } from 'zod';
import type { Rng } from '../core/rng';
import type { Attempt } from '../rules/attempt';
import { aimDirection } from '../sim/aim';
import { flipperPolicy } from './flippers';
import { gaussian } from './noise';
import { AIM_LIMIT, SEARCH_ANGLES, SEARCH_TICK_LIMIT } from './tuning';

export const AGENT_TIERS = ['random', 'greedy', 'noisy'] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];

export const agentSpecSchema = z.strictObject({
  tier: z.enum(AGENT_TIERS),
  /** Standard deviation of the aim error in radians; noisy agents only, 0 for the others. */
  noise: z.number().min(0).max(1),
  /** Angles the greedy search tries per shot. */
  angles: z.int().min(1).max(3600),
  /** Ticks each searched shot is played out for at most. */
  searchTicks: z.int().min(1).max(100000),
});

export type AgentSpec = z.output<typeof agentSpecSchema>;

/** An agent spec with the defaults filled in. Throws on invalid values. */
export function agentSpec(
  tier: AgentTier,
  options: { noise?: number; angles?: number; searchTicks?: number } = {},
): AgentSpec {
  return agentSpecSchema.parse({
    tier,
    noise: tier === 'noisy' ? (options.noise ?? 0) : 0,
    angles: options.angles ?? SEARCH_ANGLES,
    searchTicks: options.searchTicks ?? SEARCH_TICK_LIMIT,
  });
}

/** Short name for tables: "random", "greedy", "noisy 0.03". */
export function agentLabel(spec: AgentSpec): string {
  return spec.tier === 'noisy' ? `noisy ${spec.noise}` : spec.tier;
}

function clampAim(angle: number): number {
  return angle > AIM_LIMIT ? AIM_LIMIT : angle < -AIM_LIMIT ? -AIM_LIMIT : angle;
}

export class Agent {
  /** Simulation ticks spent on trial shots so far. */
  searchTicks = 0;
  private trial: Attempt | null = null;

  /** `rng` drives the agent's own choices only; the attempt keeps its own random numbers. */
  constructor(
    readonly spec: AgentSpec,
    private readonly rng: Rng,
  ) {}

  /** Launch angle for the attempt's next shot (radians from straight down, + to the right). */
  chooseAngle(attempt: Attempt): number {
    switch (this.spec.tier) {
      case 'random':
        return -AIM_LIMIT + 2 * AIM_LIMIT * this.rng.nextFloat();
      case 'greedy':
        return this.search(attempt);
      case 'noisy': {
        const best = this.search(attempt);
        return clampAim(best + this.spec.noise * gaussian(this.rng));
      }
    }
  }

  private search(attempt: Attempt): number {
    let trial = this.trial;
    if (trial?.level !== attempt.level) {
      trial = attempt.trialClone();
      this.trial = trial;
    }
    const n = this.spec.angles;
    const limit = this.spec.searchTicks;
    const jitter = this.rng.nextFloat();
    const orangeBefore = attempt.orangeLeft;
    const ballsBefore = attempt.ballsLeft;
    const scoreBefore = attempt.score;
    let bestAngle = 0;
    let bestWon = -1;
    let bestOrange = 0;
    let bestBalls = 0;
    let bestScore = 0;
    for (let i = 0; i < n; i++) {
      const angle = -AIM_LIMIT + (2 * AIM_LIMIT * (i + jitter)) / n;
      trial.copyFrom(attempt);
      trial.launch(aimDirection(angle));
      let ticks = 0;
      while (trial.phase === 'shot' && ticks < limit) {
        trial.setFlipperInput(flipperPolicy(trial.world));
        trial.step();
        ticks++;
      }
      this.searchTicks += ticks;

      const finished = trial.phase !== 'shot';
      const won = trial.result === 'won' ? 1 : 0;
      const orange = orangeBefore - trial.orangeLeft;
      // Launching took a ball; a finished shot that lit nothing and missed the bucket can only
      // have won the coin flip, which the search must not read.
      let balls = trial.ballsLeft - ballsBefore + 1;
      if (finished && trial.shotCount === 0 && !trial.shotCaught) balls = 0;
      let score = trial.score - scoreBefore;
      if (!finished) score += trial.shotScore + trial.shotStyle;

      const better =
        won !== bestWon
          ? won > bestWon
          : orange !== bestOrange
            ? orange > bestOrange
            : balls !== bestBalls
              ? balls > bestBalls
              : score > bestScore;
      if (better) {
        bestAngle = angle;
        bestWon = won;
        bestOrange = orange;
        bestBalls = balls;
        bestScore = score;
      }
    }
    return bestAngle;
  }
}
