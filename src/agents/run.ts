// One self-play run: a whole attempt at a level under the full rules (spec 13.5: bucket, free
// ball thresholds, coin flip, stuck-ball removal, the master's power on green pegs, the flipper
// input), played by an agent, with the numbers the metrics need. A run is a pure function of
// its setup and index (seeds.ts), so it gives the same result in any worker and any engine.
//
// The real attempt collects rules events (they are read after every shot); the agent's trial
// shots run without them.

import { Rng } from '../core/rng';
import { Attempt } from '../rules/attempt';
import type { AttemptConfig } from '../rules/config';
import type { RulesEvent } from '../rules/events';
import { MASTERS } from '../rules/masters';
import { BASE_POWERS } from '../rules/powers';
import { aimDirection } from '../sim/aim';
import type { CompiledLevel } from '../sim/compile';
import { Agent, type AgentSpec } from './agent';
import { flipperPolicy } from './flippers';
import { agentSeed, attemptSeed, masterSeed } from './seeds';
import { MAX_RUN_SHOTS } from './tuning';

export interface RunSetup {
  readonly level: CompiledLevel;
  /** Stable name of the level ("1-3", "original 2-4", a file path): the run seeds derive from it. */
  readonly levelKey: string;
  /** Rules of every attempt. Its power is replaced per run when `anyMaster` is set. */
  readonly config: AttemptConfig;
  /** The player picks the master (the Master levels): each run draws one of the ten. */
  readonly anyMaster: boolean;
  readonly agent: AgentSpec;
  readonly baseSeed: number;
}

export interface FreeBallCounts {
  readonly bucket: number;
  readonly threshold: number;
  readonly coinFlip: number;
  readonly power: number;
}

/** Plain data: it crosses from worker threads to the report as JSON. */
export interface RunResult {
  readonly run: number;
  /** The attempt's seed. */
  readonly seed: number;
  /** Id of the power the green pegs triggered, or null. */
  readonly power: string | null;
  readonly won: boolean;
  readonly fullClear: boolean;
  /** Stopped at MAX_RUN_SHOTS; counts as not cleared. */
  readonly capped: boolean;
  /** Shots taken, which is the balls used. */
  readonly shots: number;
  /** Balls in stock at the end (they convert to points on a win). */
  readonly ballsLeft: number;
  readonly score: number;
  /** Orange pegs at the start and left at the end. */
  readonly orangeStart: number;
  readonly orangeLeft: number;
  readonly freeBalls: FreeBallCounts;
  readonly coinFlips: number;
  /** Stuck-ball removals: lit pegs taken out, or balls taken as the last resort. */
  readonly stuck: number;
  /** Fever bucket the first ball landed in (0 = leftmost), or -1. */
  readonly feverBucket: number;
  /** Green pegs lit, by the ball or by a power. */
  readonly greens: number;
  readonly styleShots: number;
  /** 1-based shot that first lit an orange peg, or 0 if none did. */
  readonly firstOrangeShot: number;
  /** Orange pegs each shot lit, by any cause, in shot order. */
  readonly orangePerShot: readonly number[];
  /** Element ids of the can-be-orange pegs and bricks lit in this run (any color, any cause). */
  readonly litFlagged: readonly number[];
  /** Ticks of the real shots. */
  readonly ticks: number;
  /** Ticks of the agent's trial shots. */
  readonly searchTicks: number;
}

/** Element ids of the level's can-be-orange pegs and bricks, ascending. */
export function flaggedIds(level: CompiledLevel): number[] {
  const ids: number[] = [];
  for (const i of level.scoringBodies) {
    const e = level.bodies[i]?.element;
    if (e !== undefined && e !== null && 'canBeOrange' in e && e.canBeOrange) ids.push(e.id);
  }
  return ids.sort((a, b) => a - b);
}

const flaggedCache = new WeakMap<CompiledLevel, ReadonlySet<number>>();

function flaggedSet(level: CompiledLevel): ReadonlySet<number> {
  let set = flaggedCache.get(level);
  if (set === undefined) {
    set = new Set(flaggedIds(level));
    flaggedCache.set(level, set);
  }
  return set;
}

class Tally {
  bucket = 0;
  threshold = 0;
  coinFlip = 0;
  power = 0;
  coinFlips = 0;
  stuck = 0;
  feverBucket = -1;
  greens = 0;
  styleShots = 0;
  firstOrangeShot = 0;
  readonly lit = new Set<number>();

  constructor(private readonly flagged: ReadonlySet<number>) {}

  read(events: readonly RulesEvent[], shot: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'freeBall':
          this[e.reason]++;
          break;
        case 'coinFlip':
          this.coinFlips++;
          break;
        case 'stuck':
          this.stuck++;
          break;
        case 'feverBucket':
          if (this.feverBucket < 0) this.feverBucket = e.bucket;
          break;
        case 'styleShot':
          this.styleShots++;
          break;
        case 'pegScored':
          if (this.flagged.has(e.element)) this.lit.add(e.element);
          if (e.color === 'orange' && this.firstOrangeShot === 0) this.firstOrangeShot = shot;
          else if (e.color === 'green') this.greens++;
          break;
        default:
          break;
      }
    }
  }
}

/** Launches at `angle` and plays the shot out with the flipper policy. Returns its ticks. */
function playShot(attempt: Attempt, angle: number): number {
  attempt.launch(aimDirection(angle));
  let ticks = 0;
  while (attempt.phase === 'shot') {
    attempt.setFlipperInput(flipperPolicy(attempt.world));
    attempt.step();
    ticks++;
  }
  return ticks;
}

/** Plays run `run` of a setup to the end. */
export function playRun(setup: RunSetup, run: number): RunResult {
  const seed = attemptSeed(setup.baseSeed, setup.levelKey, run);
  let config = setup.config;
  if (setup.anyMaster) {
    const master = MASTERS[Rng.fromSeed(masterSeed(seed)).nextInt(MASTERS.length)];
    config = { ...config, power: master?.power ?? null };
  }
  const attempt = new Attempt(
    setup.level,
    { levelId: setup.levelKey, seed, config },
    { powers: BASE_POWERS, events: true },
  );
  const agent = new Agent(setup.agent, Rng.fromSeed(agentSeed(seed)));
  const tally = new Tally(flaggedSet(setup.level));
  const orangePerShot: number[] = [];
  let ticks = 0;
  let capped = false;
  tally.read(attempt.takeEvents(), 0);
  while (attempt.phase === 'aim') {
    if (attempt.shotsTaken >= MAX_RUN_SHOTS) {
      capped = true;
      break;
    }
    const orangeBefore = attempt.orangeLeft;
    attempt.setFlipperInput(false);
    ticks += playShot(attempt, agent.chooseAngle(attempt));
    tally.read(attempt.takeEvents(), attempt.shotsTaken);
    orangePerShot.push(orangeBefore - attempt.orangeLeft);
  }
  return {
    run,
    seed,
    power: config.power,
    won: attempt.result === 'won',
    fullClear: attempt.fullClear,
    capped,
    shots: attempt.shotsTaken,
    ballsLeft: attempt.ballsLeft,
    score: attempt.score,
    orangeStart: config.orangeCount,
    orangeLeft: attempt.orangeLeft,
    freeBalls: {
      bucket: tally.bucket,
      threshold: tally.threshold,
      coinFlip: tally.coinFlip,
      power: tally.power,
    },
    coinFlips: tally.coinFlips,
    stuck: tally.stuck,
    feverBucket: tally.feverBucket,
    greens: tally.greens,
    styleShots: tally.styleShots,
    firstOrangeShot: tally.firstOrangeShot,
    orangePerShot,
    litFlagged: [...tally.lit].sort((a, b) => a - b),
    ticks,
    searchTicks: agent.searchTicks,
  };
}

/** Plays runs `first` to `first + count - 1` in order. */
export function playRuns(setup: RunSetup, first: number, count: number): RunResult[] {
  const out: RunResult[] = [];
  for (let k = 0; k < count; k++) out.push(playRun(setup, first + k));
  return out;
}
