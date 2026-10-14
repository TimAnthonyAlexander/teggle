// Reachability and stuck checks (spec 13.3, items 3 and 4), on the physics alone.
//
// Playouts: from the full board, a seeded sequence of shots is played; after each shot the
// lit objects are removed (endShot), so later board states expose objects the first ones
// shielded. At every board state of every playout an angle sweep fires balls across the
// cannon's whole range, at several launch times spread over the full cycle of the level's
// moving parts (sampled when the movements share no practical common cycle).
//
// Every object a sweep ball lights counts as hit. A ball that comes to rest (its stuck counter
// reaches REST_TICKS) or stays trapped in a small area records a stuck spot: the objects it
// touches. The rules layer would free it by removing a lit peg; the check does the same so the
// shot can go on.
//
// The work is split into jobs, one per (playout, board state); jobs are independent, so a tool
// can run them on worker threads and merge the results in job order. The merged result is the
// same whatever ran where.

import { Rng } from '../core/rng';
import type { Level, LevelElement } from '../level/schema';
import { aimDirection } from '../sim/aim';
import { compileLevel, type CompiledLevel } from '../sim/compile';
import { MAX_AIM_ANGLE } from '../sim/tuning';
import { World, type BallView } from '../sim/world';
import { mixSeed } from './recipe';
import { elementShape, pointGap } from './shapes';
import { CYCLE_CAP, levelCycle } from './validate';

export interface CheckConfig {
  /** Independent shot sequences. */
  readonly playouts: number;
  /** Board states per playout: the full board, then one more after each advancing shot. */
  readonly depth: number;
  /** Shots per sweep, evenly spread over the cannon's range. */
  readonly angles: number;
  /** Launch times per sweep on levels with moving parts. */
  readonly phases: number;
  readonly seed: number;
  /** A shot that runs longer than this is stopped and recorded as stuck. */
  readonly maxShotTicks: number;
}

export const DEFAULT_CHECK: CheckConfig = {
  playouts: 14,
  depth: 7,
  angles: 120,
  phases: 6,
  seed: 1,
  maxShotTicks: 4000,
};

/** Stuck counter at which a resting ball records a stuck spot (the rules act at 500). */
export const REST_TICKS = 150;
/** A ball that stays inside a box this size over TRAP_WINDOW ticks is trapped. */
export const TRAP_SIZE = 40;
export const TRAP_WINDOW = 600;
const TRAP_SAMPLE = 50;
/** Objects closer than this to the ball's center (beyond its radius) touch it. */
const TOUCH = 2;
/** Launch times on levels whose full cycle is longer are sampled within this horizon. */
export const SAMPLE_HORIZON = 24_000;

export interface CheckPlan {
  readonly config: CheckConfig;
  /** Full cycle of the level's movements in ticks (1 when nothing moves). */
  readonly period: number;
  /** False when the period is a sampling horizon rather than an exact common cycle. */
  readonly exact: boolean;
  /** Scoring element ids in file order; results index by this order. */
  readonly scoring: readonly number[];
  readonly jobs: readonly CheckJob[];
}

export interface CheckJob {
  readonly playout: number;
  /** Board state index: 0 is the full board, k is after k advancing shots. */
  readonly step: number;
}

export interface StuckSpot {
  readonly x: number;
  readonly y: number;
  /** Scoring elements the ball touched while stuck. */
  readonly scoring: readonly number[];
  /** Non-scoring solids it touched. */
  readonly solids: readonly number[];
  readonly kind: 'rest' | 'trapped' | 'timeout';
}

export interface JobResult {
  readonly job: number;
  /** Hits per scoring element, in plan.scoring order. */
  readonly hits: readonly number[];
  readonly spots: readonly StuckSpot[];
  readonly shots: number;
  readonly ticks: number;
}

export interface CheckResult {
  /** Times each scoring element was lit, by id. */
  readonly hits: ReadonlyMap<number, number>;
  /** Distinct stuck spots (by the set of scoring elements involved), with how often. */
  readonly spots: readonly (StuckSpot & { readonly count: number })[];
  readonly shots: number;
  readonly ticks: number;
}

function isScoring(e: LevelElement): boolean {
  return e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick';
}

function moves(e: LevelElement): boolean {
  return e.movement !== undefined || e.parent !== undefined;
}

export function planCheck(level: Level, config: Partial<CheckConfig> = {}): CheckPlan {
  const c: CheckConfig = { ...DEFAULT_CHECK, ...config };
  const moving = level.elements.some(moves);
  const cycle = moving ? levelCycle(level) : { ticks: 1, exact: true };
  const exact = cycle.exact && cycle.ticks <= SAMPLE_HORIZON;
  const period = exact ? cycle.ticks : Math.min(cycle.ticks, SAMPLE_HORIZON);
  const jobs: CheckJob[] = [{ playout: 0, step: 0 }];
  for (let p = 0; p < c.playouts; p++) {
    for (let k = 1; k < c.depth; k++) jobs.push({ playout: p, step: k });
  }
  return {
    config: { ...c, phases: moving ? c.phases : 1 },
    period,
    exact: cycle.exact && cycle.ticks <= CYCLE_CAP,
    scoring: level.elements.filter(isScoring).map((e) => e.id),
    jobs,
  };
}

/** Shared per-job simulation state. */
class Runner {
  readonly world: World;
  readonly shot: World;
  readonly hits: number[];
  readonly spots: StuckSpot[] = [];
  readonly indexOf: Map<number, number>;
  shots = 0;
  ticks = 0;
  private readonly trail = new Float64Array(2 * (TRAP_WINDOW / TRAP_SAMPLE));

  constructor(
    readonly level: CompiledLevel,
    readonly plan: CheckPlan,
  ) {
    this.world = new World(level);
    this.shot = new World(level);
    this.hits = plan.scoring.map(() => 0);
    this.indexOf = new Map(plan.scoring.map((id, i) => [id, i]));
  }

  /** Steps a world with no ball in play until its clock reaches `tick`. */
  advance(w: World, tick: number): void {
    while (w.tick < tick) w.step();
  }

  /**
   * Plays one shot on `w` (already at its launch tick) and ends it. Counts hits when `count`
   * is set; records stuck spots always. Returns the number of objects lit.
   */
  play(w: World, angle: number, count: boolean): number {
    w.launch(aimDirection(angle));
    let lit = 0;
    let t = 0;
    let samples = 0;
    for (; t < this.plan.config.maxShotTicks && w.ballsInPlay > 0; t++) {
      w.step();
      for (const e of w.events) {
        if (e.type !== 'pegLit') continue;
        lit++;
        if (count) {
          const i = this.indexOf.get(e.element);
          if (i !== undefined) this.hits[i] = (this.hits[i] ?? 0) + 1;
        }
      }
      const ball = w.balls[0];
      if (ball === undefined) continue;
      if (ball.age % TRAP_SAMPLE === 0) {
        const slot = samples % (TRAP_WINDOW / TRAP_SAMPLE);
        this.trail[2 * slot] = ball.x;
        this.trail[2 * slot + 1] = ball.y;
        samples++;
      }
      if (ball.stuckTicks >= REST_TICKS) {
        this.unstick(w, ball, 'rest', samples);
        samples = 0;
      } else if (samples >= TRAP_WINDOW / TRAP_SAMPLE && this.confined()) {
        this.unstick(w, ball, 'trapped', samples);
        samples = 0;
      }
    }
    if (w.ballsInPlay > 0) {
      const ball = w.balls[0];
      if (ball !== undefined) this.record(w, ball, 'timeout', samples);
      for (const b of [...w.balls]) w.removeBall(b.id);
    }
    w.endShot();
    this.shots++;
    this.ticks += t;
    return lit;
  }

  private confined(): boolean {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.trail.length; i += 2) {
      const x = this.trail[i] ?? 0;
      const y = this.trail[i + 1] ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return maxX - minX < TRAP_SIZE && maxY - minY < TRAP_SIZE;
  }

  /** Elements touching the ball now or at its recent trail positions. */
  private touching(
    w: World,
    ball: BallView,
    samples: number,
  ): { scoring: number[]; solids: number[] } {
    const points: [number, number][] = [[ball.x, ball.y]];
    const n = Math.min(samples, TRAP_WINDOW / TRAP_SAMPLE);
    for (let i = 0; i < n; i++) points.push([this.trail[2 * i] ?? 0, this.trail[2 * i + 1] ?? 0]);
    const scoring: number[] = [];
    const solids: number[] = [];
    for (const body of w.bodies) {
      const e = body.def.element;
      if (e === null || !body.active || !body.def.collides) continue;
      // Nothing in Teggle's levels is larger than this around its position.
      if (Math.abs(body.x - ball.x) > 260 || Math.abs(body.y - ball.y) > 260) continue;
      const s = elementShape(e, { x: body.x, y: body.y, rotation: body.rotation });
      if (s === null) continue;
      if (points.some(([x, y]) => pointGap(s, x, y) <= ball.radius + TOUCH)) {
        (isScoring(e) ? scoring : solids).push(e.id);
      }
    }
    return { scoring, solids };
  }

  private record(w: World, ball: BallView, kind: StuckSpot['kind'], samples: number): StuckSpot {
    const t = this.touching(w, ball, samples);
    const spot: StuckSpot = { x: ball.x, y: ball.y, scoring: t.scoring, solids: t.solids, kind };
    this.spots.push(spot);
    return spot;
  }

  /** Records the spot, then frees the ball as the rules would: a touching lit peg goes. */
  private unstick(w: World, ball: BallView, kind: StuckSpot['kind'], samples: number): void {
    const spot = this.record(w, ball, kind, samples);
    const lit = spot.scoring.filter((id) => w.isActive(id) && w.isLit(id));
    const target = lit[0] ?? spot.scoring.find((id) => w.isActive(id));
    if (target !== undefined) w.removePeg(target, 'stuck');
    else w.removeBall(ball.id);
  }
}

/** Angle of shot i of a sweep, with the sweep's jitter u in [0, 1). */
function sweepAngle(i: number, n: number, u: number): number {
  return -MAX_AIM_ANGLE + ((i + u) * 2 * MAX_AIM_ANGLE) / n;
}

/** The board state of a playout after `step` advancing shots, at its clock. */
function boardState(r: Runner, playout: number, step: number): void {
  const w = r.world;
  const plan = r.plan;
  const rng = Rng.fromSeed(mixSeed(plan.config.seed, 1000 + playout));
  for (let k = 0; k < step; k++) {
    // An advancing shot: a random angle at a random point of the movement cycle; shots that
    // light nothing are retried, so every step changes the board.
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = sweepAngle(0, 1, rng.nextFloat());
      const delay = plan.period > 1 ? rng.nextInt(plan.period) : 0;
      r.shot.copyFrom(w);
      r.advance(r.shot, w.tick + delay);
      if (r.play(r.shot, angle, false) > 0 || attempt === 11) {
        w.copyFrom(r.shot);
        break;
      }
    }
  }
}

/** Runs one job: rebuilds its board state and sweeps it. Deterministic. */
export function runCheckJob(level: CompiledLevel, plan: CheckPlan, jobIndex: number): JobResult {
  const job = plan.jobs[jobIndex];
  if (job === undefined) throw new Error(`no job ${jobIndex}`);
  const r = new Runner(level, plan);
  boardState(r, job.playout, job.step);
  const c = plan.config;
  const rng = Rng.fromSeed(mixSeed(c.seed, 5000 + jobIndex));
  const u = rng.nextFloat();
  const shift = rng.nextFloat();
  // Launch times spread over the full cycle, shifted per job so the jobs together cover it
  // more finely than one sweep does.
  const base = r.world.tick;
  const offsets: number[] = [];
  for (let j = 0; j < c.phases; j++) {
    offsets.push(Math.floor(((j + shift) * plan.period) / c.phases));
  }
  const start = new World(level);
  start.copyFrom(r.world);
  for (const offset of offsets) {
    r.advance(start, base + offset);
    for (let i = 0; i < c.angles; i++) {
      r.shot.copyFrom(start);
      r.play(r.shot, sweepAngle(i, c.angles, u), true);
    }
  }
  return { job: jobIndex, hits: r.hits, spots: r.spots, shots: r.shots, ticks: r.ticks };
}

export function mergeResults(plan: CheckPlan, results: readonly JobResult[]): CheckResult {
  const totals = plan.scoring.map(() => 0);
  const spots = new Map<string, StuckSpot & { count: number }>();
  let shots = 0;
  let ticks = 0;
  const ordered = [...results].sort((a, b) => a.job - b.job);
  for (const res of ordered) {
    res.hits.forEach((h, i) => {
      totals[i] = (totals[i] ?? 0) + h;
    });
    for (const s of res.spots) {
      const key =
        [...s.scoring].sort((a, b) => a - b).join(',') +
        '|' +
        [...s.solids].sort((a, b) => a - b).join(',');
      const prev = spots.get(key);
      if (prev === undefined) spots.set(key, { ...s, count: 1 });
      else prev.count++;
    }
    shots += res.shots;
    ticks += res.ticks;
  }
  return {
    hits: new Map(plan.scoring.map((id, i) => [id, totals[i] ?? 0])),
    spots: [...spots.values()],
    shots,
    ticks,
  };
}

/** Runs every job in this thread (tests, small levels). */
export function runCheck(level: Level, config: Partial<CheckConfig> = {}): CheckResult {
  const plan = planCheck(level, config);
  const compiled = compileLevel(level);
  const results = plan.jobs.map((_, i) => runCheckJob(compiled, plan, i));
  return mergeResults(plan, results);
}
