// One attempt at a level: the single-player rules on top of a World (spec 2 to 6 and 10).
//
//   const attempt = new Attempt(compileLevel(level), { levelId, seed, config });
//   attempt.step();              // aiming: the world keeps stepping, moving parts move
//   attempt.launch(direction);   // takes a ball; the shot is recorded as tick + vector + inputs
//   attempt.step();              // in play: scoring, free balls, style shots, Fever, stuck balls
//   ...                          // the shot ends inside step() once every ball has left play
//
// Rules events queue up until takeEvents() hands them over, so a frame that runs several steps
// (or none) loses nothing. Colors, the purple peg, the coin flip and the powers draw from one Rng seeded per attempt,
// so `record()` replays to the identical events and score (record.ts). Do not call the world's
// control methods directly; powers get them through their context.

import { Digest } from '../core/digest';
import { Rng } from '../core/rng';
import type { Vec2 } from '../level/geometry';
import type { Level } from '../level/schema';
import type { CompiledLevel } from '../sim/compile';
import type { FeverCatchEvent, PegLitEvent, PegRemovedEvent, SimEvent } from '../sim/events';
import { World, type BallView } from '../sim/world';
import { assignColors, AttemptSetupError, movePurple } from './colors';
import { attemptConfigSchema, type AttemptConfig } from './config';
import type { FreeBallReason, PowerAction, RulesEvent } from './events';
import {
  BASE_AIM_GUIDE,
  NO_POWERS,
  type AimGuide,
  type EffectStart,
  type EffectView,
  type GreenHit,
  type LaunchPlan,
  type Power,
  type PowerContext,
  type PowerRegistry,
} from './power';
import type { AttemptRecord, InputRecord } from './record';
import {
  clearBonus,
  feverBucketPoints,
  meterLevel,
  multiplierFor,
  orangeRushTarget,
  pegValue,
  type PegColor,
} from './scoring';
import { STYLE_POINTS, StyleTracker, type StyleShot, type StyleSink } from './style';
import {
  BIG_BUCKET_STREAK_SHOTS,
  BUCKET_STREAK_SHOTS,
  FREE_BALL_THRESHOLDS,
  SHOT_TICK_LIMIT,
  STUCK_CONTACT_TICKS,
  STUCK_KILL_TICKS,
  STUCK_REMOVE_TICKS,
  UNUSED_BALL_POINTS,
} from './tuning';

export type AttemptPhase = 'aim' | 'shot' | 'over';
export type AttemptResult = 'won' | 'lost';

export interface AttemptInit {
  /** Stable id of the level (campaign slot or file name), stored in records. */
  readonly levelId: string;
  /** 32-bit unsigned seed of this attempt's Rng. A retry is a new attempt with a new seed. */
  readonly seed: number;
  readonly config: AttemptConfig;
}

export interface AttemptOptions {
  /** Powers the config and Lucky Spin may name. Default: none. */
  readonly powers?: PowerRegistry;
  /** Collect rules events (default true). Headless runs turn them off to skip the objects. */
  readonly events?: boolean;
}

/** Read-only view of an attempt, for powers, the renderer and agents. */
export interface AttemptView {
  readonly level: CompiledLevel;
  readonly world: World;
  readonly levelId: string;
  readonly seed: number;
  readonly config: AttemptConfig;
  readonly phase: AttemptPhase;
  /** 'won' from the moment the last orange peg lights (spec 10), 'lost' when out of balls. */
  readonly result: AttemptResult | null;
  /** Balls in stock, not counting balls in play. */
  readonly ballsLeft: number;
  /** Shots launched so far. */
  readonly shotsTaken: number;
  /** Total of finished shots, style points and bonuses. */
  readonly score: number;
  /** Current shot: sum of lit values, pegs lit, sum x count, style points so far. */
  readonly shotSum: number;
  readonly shotCount: number;
  readonly shotScore: number;
  readonly shotStyle: number;
  /** A ball of the current (or last finished) shot landed in the free ball bucket. */
  readonly shotCaught: boolean;
  readonly orangeLeft: number;
  /** Fever meter multiplier now (1, 2, 3, 5 or 10). */
  readonly multiplier: number;
  /** Lit fever meter segments, 0 to 25. */
  readonly meterLevel: number;
  readonly fever: boolean;
  /** Every peg was cleared in the winning shot. */
  readonly fullClear: boolean;
  /** Shots in a row that ended in the bucket. */
  readonly bucketStreak: number;
  /** Element id of the purple peg, or -1. */
  readonly purple: number;
  readonly effects: readonly EffectView[];
  /** Rules events not taken yet, oldest first. */
  readonly events: readonly RulesEvent[];
  /** Color of a peg or brick by element id; null for other elements. */
  color(element: number): PegColor | null;
  /** Element ids of the pegs and bricks of one color still on the board. */
  pegIds(color: PegColor): number[];
  /** Aim guide for the next shot, after the active effects changed it. */
  aimGuide(): AimGuide;
  /** An independent copy to try shots on (Zen Ball, self-play); this attempt is not touched. */
  clone(): Attempt;
  /** A copy made by trialClone: it tries shots for a search, and searching powers skip it. */
  readonly trial: boolean;
  /** A copy for trying shots: no rules events, marked as a trial (Zen Ball's search). */
  trialClone(): Attempt;
}

/** Bit-exact hash of a level's content, so a replay can refuse a level that changed. */
export function levelHash(level: Level): string {
  return new Digest().string(JSON.stringify(level)).hex();
}

const hashes = new WeakMap<Level, string>();

function cachedLevelHash(level: Level): string {
  let h = hashes.get(level);
  if (h === undefined) {
    h = levelHash(level);
    hashes.set(level, h);
  }
  return h;
}

interface EffectState {
  readonly power: string;
  readonly tag: string;
  shotsLeft: number;
  pending: boolean;
}

interface ShotRecording {
  readonly tick: number;
  readonly direction: Vec2;
  readonly inputs: InputRecord[];
}

/** Every scalar of the attempt's state, so copies are a single Object.assign. */
class Counters {
  phase: AttemptPhase = 'aim';
  result: AttemptResult | null = null;
  ballsLeft = 0;
  shots = 0;
  score = 0;
  orangeLeft = 0;
  /** Pegs and bricks neither lit nor removed. */
  unlit = 0;
  fever = false;
  fullClear = false;
  bucketStreak = 0;
  /** Body index of the purple peg, or -1. */
  purple = -1;
  flipper = false;
  // The shot in play.
  shotTicks = 0;
  shotSum = 0;
  shotCount = 0;
  shotStyle = 0;
  shotOrange = 0;
  shotGreens = 0;
  shotThresholds = 0;
  shotCaught = false;
  orangeAtLaunch = 0;
  cleanFinishArmed = false;
  feverPoints = 0;
  litCount = 0;
}

class Context implements PowerContext {
  constructor(
    private readonly owner: Attempt,
    readonly power: Power,
    private readonly hooks: AttemptHooks,
  ) {}

  get world(): World {
    return this.owner.world;
  }

  get attempt(): AttemptView {
    return this.owner;
  }

  get rng(): Rng {
    return this.hooks.rng();
  }

  grant(tag: string, shots: number, start: EffectStart): EffectView {
    return this.hooks.grant(this.power, tag, shots, start);
  }

  revoke(tag: string): void {
    this.hooks.revoke(this.power, tag);
  }

  effect(tag: string): EffectView | null {
    return this.hooks.find(this.power.id, tag);
  }

  freeBall(): void {
    this.hooks.freeBall();
  }

  style(shot: `power:${string}`, points: number, x: number, y: number): void {
    this.hooks.style(shot, points, x, y);
  }

  trigger(power: string, green: GreenHit): void {
    this.hooks.trigger(power, green);
  }

  announce(action: PowerAction): void {
    this.hooks.announce(this.power, action);
  }
}

/** What a power context may do to its attempt; kept off the Attempt's public surface. */
interface AttemptHooks {
  rng(): Rng;
  grant(power: Power, tag: string, shots: number, start: EffectStart): EffectView;
  revoke(power: Power, tag: string): void;
  find(power: string, tag: string): EffectView | null;
  freeBall(): void;
  style(shot: StyleShot, points: number, x: number, y: number): void;
  trigger(power: string, green: GreenHit): void;
  announce(power: Power, action: PowerAction): void;
}

export class Attempt implements AttemptView {
  readonly level: CompiledLevel;
  readonly world: World;
  private init: AttemptInit;
  private powers: PowerRegistry;
  private master: Power | null;
  private collect: boolean;
  private hash: string;
  private rand: Rng;
  private readonly c = new Counters();
  private readonly colors: (PegColor | null)[];
  private readonly contactTick: Int32Array;
  private readonly contactBall: Int32Array;
  private readonly litBodies: Int32Array;
  private readonly style: StyleTracker;
  private effectList: EffectState[] = [];
  private readonly contexts = new Map<string, Context>();
  private shotList: ShotRecording[] = [];
  private pendingInputs: InputRecord[] = [];
  private out: RulesEvent[] = [];
  private cursor = 0;
  private scratch: World | null = null;
  private isTrial = false;

  private readonly sink: StyleSink = {
    awardStyle: (shot, ball, x, y) => {
      this.addStyle(shot, STYLE_POINTS[shot], ball, x, y);
    },
  };

  private readonly nonBlue = (element: number): boolean => {
    const color = this.colors[this.bodyIndex(element)];
    return color === 'orange' || color === 'green' || color === 'purple';
  };

  private readonly hooks: AttemptHooks = {
    rng: () => this.rand,
    grant: (power, tag, shots, start) => this.grantEffect(power, tag, shots, start),
    revoke: (power, tag) => {
      this.revokeEffect(power, tag);
    },
    find: (power, tag) => this.findEffect(power, tag),
    freeBall: () => {
      this.addBall('power', 0);
    },
    style: (shot, points, x, y) => {
      this.addStyle(shot, points, -1, x, y);
    },
    trigger: (power, green) => {
      const p = this.powerById(power);
      p.onGreen(this.context(p), green);
    },
    announce: (power, a) => {
      if (!this.collect) return;
      this.out.push({
        type: 'powerAction',
        tick: this.world.tick,
        power: power.id,
        action: a.action,
        x: a.x,
        y: a.y,
        value: a.value,
        elements: a.elements.slice(),
        detail: a.detail,
        dx: a.dx,
        dy: a.dy,
      });
    },
  };

  constructor(level: CompiledLevel, init: AttemptInit, options: AttemptOptions = {}) {
    if (!Number.isInteger(init.seed) || init.seed < 0 || init.seed > 0xffffffff) {
      throw new AttemptSetupError(`seed must be a 32-bit unsigned integer, got ${init.seed}`);
    }
    const config = attemptConfigSchema.parse(init.config);
    this.level = level;
    this.init = { levelId: init.levelId, seed: init.seed, config };
    this.powers = options.powers ?? NO_POWERS;
    this.master = config.power === null ? null : this.powerById(config.power);
    this.collect = options.events ?? true;
    this.hash = cachedLevelHash(level.level);
    this.rand = Rng.fromSeed(init.seed);
    this.world = new World(level);
    const n = level.bodies.length;
    this.contactTick = new Int32Array(n).fill(-1);
    this.contactBall = new Int32Array(n).fill(-1);
    this.litBodies = new Int32Array(n);
    this.style = new StyleTracker(level.width, level.height);

    const { colors, purple } = assignColors(level, config, this.rand);
    this.colors = colors;
    const c = this.c;
    c.purple = purple;
    c.orangeLeft = config.orangeCount;
    c.ballsLeft = config.balls;
    c.unlit = level.scoringBodies.length;
  }

  // ---------------------------------------------------------------------------------------
  // View

  get levelId(): string {
    return this.init.levelId;
  }

  get seed(): number {
    return this.init.seed;
  }

  get config(): AttemptConfig {
    return this.init.config;
  }

  /** Hash of the level this attempt runs on (levelHash). */
  get levelHash(): string {
    return this.hash;
  }

  get phase(): AttemptPhase {
    return this.c.phase;
  }

  get result(): AttemptResult | null {
    return this.c.result;
  }

  get ballsLeft(): number {
    return this.c.ballsLeft;
  }

  get shotsTaken(): number {
    return this.c.shots;
  }

  get score(): number {
    return this.c.score;
  }

  get shotSum(): number {
    return this.c.shotSum;
  }

  get shotCount(): number {
    return this.c.shotCount;
  }

  get shotScore(): number {
    return this.c.shotSum * this.c.shotCount;
  }

  get shotStyle(): number {
    return this.c.shotStyle;
  }

  get shotCaught(): boolean {
    return this.c.shotCaught;
  }

  get orangeLeft(): number {
    return this.c.orangeLeft;
  }

  get multiplier(): number {
    return multiplierFor(this.c.orangeLeft);
  }

  get meterLevel(): number {
    return meterLevel(this.c.orangeLeft);
  }

  get fever(): boolean {
    return this.c.fever;
  }

  get fullClear(): boolean {
    return this.c.fullClear;
  }

  get bucketStreak(): number {
    return this.c.bucketStreak;
  }

  get purple(): number {
    return this.c.purple < 0 ? -1 : (this.level.bodies[this.c.purple]?.id ?? -1);
  }

  get effects(): readonly EffectView[] {
    return this.effectList;
  }

  get events(): readonly RulesEvent[] {
    return this.out;
  }

  /** Hands over the queued rules events and starts a new queue. */
  takeEvents(): RulesEvent[] {
    const events = this.out;
    this.out = [];
    return events;
  }

  color(element: number): PegColor | null {
    return this.colors[this.bodyIndex(element)] ?? null;
  }

  pegIds(color: PegColor): number[] {
    const out: number[] = [];
    for (const i of this.level.scoringBodies) {
      const body = this.world.bodies[i];
      if (this.colors[i] === color && body?.active === true) out.push(body.def.id);
    }
    return out;
  }

  aimGuide(): AimGuide {
    let guide = BASE_AIM_GUIDE;
    for (const fx of this.effectList) {
      if (fx.pending) continue;
      const p = this.powerById(fx.power);
      if (p.aimGuide !== undefined) guide = p.aimGuide(fx, guide);
    }
    return guide;
  }

  /**
   * Ticks until a ball in play lights the last orange peg, or -1 if none does within
   * `maxTicks` (for the Fever slow motion, spec 6). Runs the shot ahead on a private world copy,
   * so it is exact apart from powers and stuck handling that would act meanwhile. -1 unless
   * exactly one orange peg is left and a shot is running.
   */
  ticksToLastOrange(maxTicks: number): number {
    const c = this.c;
    if (c.phase !== 'shot' || c.fever || c.orangeLeft !== 1) return -1;
    let target = -1;
    for (const i of this.level.scoringBodies) {
      const body = this.world.bodies[i];
      if (this.colors[i] === 'orange' && body !== undefined && body.active && !body.lit) {
        target = body.def.id;
        break;
      }
    }
    if (target < 0) return -1;
    this.scratch ??= new World(this.level);
    const w = this.scratch;
    w.copyFrom(this.world);
    for (let t = 1; t <= maxTicks; t++) {
      w.step();
      for (const e of w.events) if (e.type === 'pegLit' && e.element === target) return t;
      if (w.ballsInPlay === 0) return -1;
    }
    return -1;
  }

  /** The attempt so far: replaying it gives the same events and score (record.ts). */
  record(): AttemptRecord {
    const shots: AttemptRecord['shots'] = this.shotList.map((s) => ({
      tick: s.tick,
      direction: { x: s.direction.x, y: s.direction.y },
      inputs: s.inputs.map((i) => ({ tick: i.tick, flipper: i.flipper })),
    }));
    return {
      format: 1,
      levelId: this.init.levelId,
      levelHash: this.hash,
      seed: this.init.seed,
      config: this.init.config,
      shots,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Control

  /** Advances one tick. While aiming only the world moves; after the end nothing scores. */
  step(): void {
    const world = this.world;
    world.step();
    if (this.c.phase !== 'shot') {
      this.cursor = world.events.length;
      return;
    }
    this.cursor = 0;
    this.c.shotTicks++;
    this.processEvents();
    this.style.sample(world.balls);
    if (world.ballsInPlay > 0) this.checkStuck();
    if (world.ballsInPlay > 0 && this.c.shotTicks >= SHOT_TICK_LIMIT) {
      while (world.ballsInPlay > 0) world.removeBall(world.balls[0]?.id ?? 0);
      this.processEvents();
    }
    if (world.ballsInPlay === 0) this.finishShot();
  }

  /**
   * Fires the next ball toward `direction` (any non-zero vector; the world normalizes it) at
   * the current tick. Only while aiming.
   */
  launch(direction: Vec2): void {
    const c = this.c;
    if (c.phase !== 'aim') {
      throw new Error(`cannot launch while the attempt is in phase ${c.phase}`);
    }
    if (
      !Number.isFinite(direction.x) ||
      !Number.isFinite(direction.y) ||
      (direction.x === 0 && direction.y === 0)
    ) {
      throw new Error('launch direction must be a finite non-zero vector');
    }
    const world = this.world;
    const shot: ShotRecording = {
      tick: world.tick,
      direction: { x: direction.x, y: direction.y },
      inputs: this.pendingInputs,
    };
    this.pendingInputs = [];
    const plan: LaunchPlan = { direction: shot.direction, options: {} };
    this.forActive((p, fx) => p.launch?.(this.context(p), fx, plan));

    c.ballsLeft--;
    c.shots++;
    c.shotTicks = 0;
    c.shotSum = 0;
    c.shotCount = 0;
    c.shotStyle = 0;
    c.shotOrange = 0;
    c.shotGreens = 0;
    c.shotThresholds = 0;
    c.shotCaught = false;
    c.orangeAtLaunch = c.orangeLeft;
    c.cleanFinishArmed = false;
    c.litCount = 0;
    c.phase = 'shot';
    this.shotList.push(shot);
    this.style.startShot();

    this.cursor = world.events.length;
    world.launch(plan.direction, plan.options);
    if (this.collect) {
      this.out.push({
        type: 'shotStart',
        tick: world.tick,
        shot: c.shots - 1,
        ballsLeft: c.ballsLeft,
        orangeLeft: c.orangeLeft,
      });
    }
    this.processEvents();
    this.forActive((p, fx) => p.shotStart?.(this.context(p), fx));
    this.processEvents();
  }

  /** Flipper button state; recorded as an input when it changes. */
  setFlipperInput(pressed: boolean): void {
    const c = this.c;
    if (c.phase === 'over' || pressed === c.flipper) return;
    c.flipper = pressed;
    this.world.setFlipperInput(pressed);
    const input: InputRecord = { tick: this.world.tick, flipper: pressed };
    const current = this.shotList[this.shotList.length - 1];
    if (c.phase === 'shot' && current !== undefined) current.inputs.push(input);
    else this.pendingInputs.push(input);
  }

  /** An independent copy in the same state (self-play search, Zen Ball). Events start empty. */
  clone(): Attempt {
    const a = new Attempt(this.level, this.init, { powers: this.powers, events: this.collect });
    a.copyFrom(this);
    return a;
  }

  trialClone(): Attempt {
    const a = new Attempt(this.level, this.init, { powers: this.powers, events: false });
    a.isTrial = true;
    a.copyFrom(this);
    return a;
  }

  get trial(): boolean {
    return this.isTrial;
  }

  /**
   * Overwrites this attempt with another on the same compiled level. This attempt keeps its own
   * choice of collecting events and whether it is a trial copy.
   */
  copyFrom(o: Attempt): void {
    if (o.level !== this.level) throw new Error('copyFrom needs an attempt on the same level');
    this.init = o.init;
    if (this.powers !== o.powers) this.contexts.clear();
    this.powers = o.powers;
    this.master = o.master;
    this.hash = o.hash;
    this.rand = new Rng(o.rand.state());
    this.world.copyFrom(o.world);
    Object.assign(this.c, o.c);
    for (let i = 0; i < this.colors.length; i++) this.colors[i] = o.colors[i] ?? null;
    this.contactTick.set(o.contactTick);
    this.contactBall.set(o.contactBall);
    this.litBodies.set(o.litBodies);
    this.style.copyFrom(o.style);
    this.effectList = o.effectList.map((fx) => ({ ...fx }));
    this.shotList = o.shotList.map((s) => ({ ...s, inputs: s.inputs.slice() }));
    this.pendingInputs = o.pendingInputs.slice();
    this.out = [];
    // World.copyFrom starts an empty event list.
    this.cursor = 0;
  }

  // ---------------------------------------------------------------------------------------
  // Events

  private processEvents(): void {
    const events = this.world.events;
    while (this.cursor < events.length) {
      const e = events[this.cursor++];
      if (e === undefined) break;
      this.style.handle(e, this.nonBlue, this.sink);
      switch (e.type) {
        case 'pegContact': {
          const i = this.bodyIndex(e.element);
          this.contactTick[i] = e.tick;
          this.contactBall[i] = e.ball;
          break;
        }
        case 'pegLit':
          this.pegLit(e);
          break;
        case 'bucketCatch':
          this.c.shotCaught = true;
          this.addBall('bucket', 0);
          break;
        case 'feverCatch':
          this.feverCatch(e);
          break;
        case 'pegRemoved':
          this.pegRemoved(e);
          break;
        default:
          break;
      }
      if (this.effectList.length > 0) this.effectEvent(e);
    }
  }

  private effectEvent(e: SimEvent): void {
    const list = this.effectList;
    for (let k = 0; k < list.length; k++) {
      const fx = list[k];
      if (fx === undefined || fx.pending) continue;
      const p = this.powerById(fx.power);
      p.event?.(this.context(p), fx, e);
    }
  }

  private pegLit(e: PegLitEvent): void {
    const c = this.c;
    const index = this.bodyIndex(e.element);
    const color = this.colors[index] ?? 'blue';
    c.unlit--;
    const finishing = c.cleanFinishArmed;
    c.cleanFinishArmed = false;

    let value = pegValue(color, c.orangeLeft, c.fever);
    const list = this.effectList;
    for (let k = 0; k < list.length; k++) {
      const fx = list[k];
      if (fx === undefined || fx.pending) continue;
      const p = this.powerById(fx.power);
      if (p.pegValue !== undefined) value = p.pegValue(fx, value, color);
    }
    c.shotSum += value;
    c.shotCount++;
    this.litBodies[c.litCount++] = index;
    if (color === 'orange') {
      c.orangeLeft--;
      c.shotOrange++;
    }
    const score = c.shotSum * c.shotCount;
    if (this.collect) {
      this.out.push({
        type: 'pegScored',
        tick: e.tick,
        element: e.element,
        color,
        value,
        ball: e.ball,
        cause: e.cause,
        x: e.x,
        y: e.y,
        shotSum: c.shotSum,
        shotCount: c.shotCount,
        shotScore: score,
        orangeLeft: c.orangeLeft,
      });
    }
    while (c.shotThresholds < FREE_BALL_THRESHOLDS.length) {
      const threshold = FREE_BALL_THRESHOLDS[c.shotThresholds] ?? Infinity;
      if (score < threshold) break;
      c.shotThresholds++;
      this.addBall('threshold', threshold);
    }

    if (color === 'orange') this.orangeLit(e);
    else if (color === 'green') this.greenLit(e);
    if (finishing && c.unlit === 0) {
      this.addStyle('cleanFinish', STYLE_POINTS.cleanFinish, e.ball, e.x, e.y);
    }
  }

  private orangeLit(e: PegLitEvent): void {
    const c = this.c;
    if (c.orangeLeft > 0 && multiplierFor(c.orangeLeft) !== multiplierFor(c.orangeLeft + 1)) {
      if (this.collect) {
        this.out.push({
          type: 'meterStep',
          tick: e.tick,
          multiplier: multiplierFor(c.orangeLeft),
          orangeLeft: c.orangeLeft,
          meterLevel: meterLevel(c.orangeLeft),
        });
      }
    }
    if (c.shotOrange === orangeRushTarget(c.orangeAtLaunch)) {
      this.addStyle('orangeRush', STYLE_POINTS.orangeRush, e.ball, e.x, e.y);
    }
    if (c.orangeLeft === 0) this.startFever(e);
  }

  private startFever(e: PegLitEvent): void {
    const c = this.c;
    c.fever = true;
    c.result = 'won';
    this.world.setFever(true);
    if (this.collect) {
      this.out.push({ type: 'fever', tick: e.tick, element: e.element, x: e.x, y: e.y });
    }
    if (e.ball >= 0 && e.cause === 'contact' && this.style.litFromBucket(e.ball)) {
      this.addStyle('bucketKick', STYLE_POINTS.bucketKick, e.ball, e.x, e.y);
    }
    // Clean Finish: a peg, then the last orange, then the one peg left on the board.
    if (c.shotCount >= 2 && c.unlit === 1) c.cleanFinishArmed = true;
  }

  private greenLit(e: PegLitEvent): void {
    const c = this.c;
    c.shotGreens++;
    if (c.shotGreens === 2) {
      this.addStyle('doublePower', STYLE_POINTS.doublePower, e.ball, e.x, e.y);
    }
    const master = this.master;
    if (this.collect) {
      this.out.push({
        type: 'greenHit',
        tick: e.tick,
        element: e.element,
        ball: e.ball,
        x: e.x,
        y: e.y,
        power: master === null ? null : master.id,
      });
    }
    if (master !== null) {
      master.onGreen(this.context(master), {
        tick: e.tick,
        element: e.element,
        ball: e.ball,
        cause: e.cause,
        x: e.x,
        y: e.y,
      });
    }
  }

  private feverCatch(e: FeverCatchEvent): void {
    const c = this.c;
    const fullClear = c.unlit === 0;
    const points = feverBucketPoints(e.bucket, fullClear);
    c.feverPoints += points;
    if (this.collect) {
      this.out.push({
        type: 'feverBucket',
        tick: e.tick,
        ball: e.ball,
        bucket: e.bucket,
        points,
        fullClear,
      });
    }
  }

  private pegRemoved(e: PegRemovedEvent): void {
    if (e.reason === 'shotEnd') return;
    const index = this.bodyIndex(e.element);
    if (this.world.bodies[index]?.lit === true) return;
    if (this.colors[index] === 'orange') {
      throw new Error(
        `orange peg ${e.element} was removed without lighting; powers must light pegs`,
      );
    }
    this.c.unlit--;
  }

  private addBall(reason: FreeBallReason, threshold: number): void {
    const c = this.c;
    c.ballsLeft++;
    if (this.collect) {
      this.out.push({
        type: 'freeBall',
        tick: this.world.tick,
        reason,
        threshold,
        ballsLeft: c.ballsLeft,
      });
    }
  }

  private addStyle(shot: StyleShot, points: number, ball: number, x: number, y: number): void {
    this.c.shotStyle += points;
    if (this.collect) {
      this.out.push({ type: 'styleShot', tick: this.world.tick, shot, points, ball, x, y });
    }
  }

  // ---------------------------------------------------------------------------------------
  // Stuck ball (spec 10, 14.2)

  private checkStuck(): void {
    const world = this.world;
    const balls = world.balls;
    for (let k = 0; k < balls.length; k++) {
      const b = balls[k];
      if (b === undefined || b.stuckTicks < STUCK_REMOVE_TICKS) continue;
      const peg = this.stuckPeg(b);
      const id = peg < 0 ? -1 : (this.level.bodies[peg]?.id ?? -1);
      if (id >= 0) {
        world.removePeg(id, 'stuck');
      } else if (b.stuckTicks >= STUCK_KILL_TICKS) {
        world.removeBall(b.id);
      } else {
        continue;
      }
      if (this.collect) {
        this.out.push({ type: 'stuck', tick: world.tick, ball: b.id, element: id });
      }
      this.processEvents();
      return;
    }
  }

  /** The lit peg this ball touched most recently (ties: nearest), or -1. */
  private stuckPeg(b: BallView): number {
    const tick = this.world.tick;
    const bodies = this.world.bodies;
    let best = -1;
    let bestTick = -1;
    let bestD2 = Infinity;
    for (let k = 0; k < this.c.litCount; k++) {
      const i = this.litBodies[k] ?? -1;
      const body = bodies[i];
      if (body === undefined || !body.active || this.contactBall[i] !== b.id) continue;
      const t = this.contactTick[i] ?? -1;
      if (t < 0 || tick - t > STUCK_CONTACT_TICKS) continue;
      const dx = body.x - b.x;
      const dy = body.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (t > bestTick || (t === bestTick && d2 < bestD2)) {
        best = i;
        bestTick = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------
  // Shot end

  private finishShot(): void {
    const c = this.c;
    const world = this.world;
    world.endShot();
    this.processEvents();
    const tick = world.tick;

    if (c.shotCount === 0 && !c.shotCaught && !c.fever && this.init.config.coinFlip) {
      const won = this.rand.nextBool();
      if (this.collect) this.out.push({ type: 'coinFlip', tick, won });
      if (won) this.addBall('coinFlip', 0);
    }

    this.forActive((p, fx) => p.shotEnd?.(this.context(p), fx));

    if (c.shotCaught) {
      c.bucketStreak++;
      const x = world.bucketX;
      const y = this.level.height;
      if (c.bucketStreak === BUCKET_STREAK_SHOTS) {
        this.addStyle('bucketStreak', STYLE_POINTS.bucketStreak, -1, x, y);
      } else if (c.bucketStreak === BIG_BUCKET_STREAK_SHOTS) {
        this.addStyle('bigBucketStreak', STYLE_POINTS.bigBucketStreak, -1, x, y);
        c.bucketStreak = 0;
      }
    } else {
      c.bucketStreak = 0;
    }

    const shotScore = c.shotSum * c.shotCount;
    c.score += shotScore + c.shotStyle;
    if (this.collect) {
      this.out.push({
        type: 'shotTally',
        tick,
        shot: c.shots - 1,
        sum: c.shotSum,
        count: c.shotCount,
        shotScore,
        styleScore: c.shotStyle,
        score: c.score,
      });
    }

    if (c.fever) {
      this.finishWon();
    } else if (c.ballsLeft === 0) {
      c.phase = 'over';
      c.result = 'lost';
      if (this.collect) {
        this.out.push({
          type: 'levelLost',
          tick,
          score: c.score,
          orangeLeft: c.orangeLeft,
          shots: c.shots,
        });
      }
    } else {
      this.advanceEffects();
      if (this.init.config.purple) {
        const from = this.purple;
        c.purple = movePurple(this.level, this.colors, c.purple, world.bodies, this.rand);
        if (this.collect && this.purple !== from) {
          this.out.push({ type: 'purpleMoved', tick, from, to: this.purple });
        }
      }
      c.phase = 'aim';
    }
    this.cursor = world.events.length;
  }

  private finishWon(): void {
    const c = this.c;
    const tick = this.world.tick;
    c.fullClear = c.unlit === 0;
    c.score += c.feverPoints;
    const unused = c.ballsLeft * UNUSED_BALL_POINTS;
    c.score += unused;
    if (this.collect) {
      this.out.push({
        type: 'unusedBalls',
        tick,
        balls: c.ballsLeft,
        points: unused,
        score: c.score,
      });
    }
    const campaignTry = this.init.config.campaignTry;
    if (campaignTry !== null) {
      const bonus = clearBonus(campaignTry);
      c.score += bonus;
      if (this.collect) {
        this.out.push({
          type: 'clearBonus',
          tick,
          try: campaignTry,
          points: bonus,
          score: c.score,
        });
      }
    }
    c.phase = 'over';
    c.result = 'won';
    if (this.collect) {
      this.out.push({
        type: 'levelWon',
        tick,
        score: c.score,
        fullClear: c.fullClear,
        feverPoints: c.feverPoints,
        shots: c.shots,
      });
    }
  }

  // ---------------------------------------------------------------------------------------
  // Powers and effects

  private powerById(id: string): Power {
    const p = this.powers.get(id);
    if (p === undefined) throw new AttemptSetupError(`unknown power "${id}"`);
    return p;
  }

  private context(power: Power): Context {
    let ctx = this.contexts.get(power.id);
    if (ctx === undefined) {
      ctx = new Context(this, power, this.hooks);
      this.contexts.set(power.id, ctx);
    }
    return ctx;
  }

  /** Runs `f` for every active effect, over a snapshot so hooks may grant or revoke. */
  private forActive(f: (power: Power, effect: EffectView) => void): void {
    if (this.effectList.length === 0) return;
    for (const fx of this.effectList.slice()) {
      if (!fx.pending && this.effectList.includes(fx)) f(this.powerById(fx.power), fx);
    }
  }

  private findEffect(power: string, tag: string): EffectState | null {
    for (const fx of this.effectList) if (fx.power === power && fx.tag === tag) return fx;
    return null;
  }

  private grantEffect(power: Power, tag: string, shots: number, start: EffectStart): EffectView {
    if (!Number.isInteger(shots) || shots < 1) {
      throw new RangeError(`an effect lasts a whole number of shots, got ${shots}`);
    }
    const existing = this.findEffect(power.id, tag);
    if (existing !== null) {
      existing.shotsLeft += shots;
      this.emitEffect(existing, 'extended');
      return existing;
    }
    const fx: EffectState = {
      power: power.id,
      tag,
      shotsLeft: shots,
      pending: start === 'next' && this.c.phase === 'shot',
    };
    this.effectList.push(fx);
    this.emitEffect(fx, 'granted');
    if (!fx.pending) power.begin?.(this.context(power), fx);
    return fx;
  }

  private revokeEffect(power: Power, tag: string): void {
    const fx = this.findEffect(power.id, tag);
    if (fx === null) return;
    this.effectList.splice(this.effectList.indexOf(fx), 1);
    if (!fx.pending) power.end?.(this.context(power), fx);
    this.emitEffect(fx, 'ended');
  }

  /** At the end of a shot: active effects count it, run out at 0; pending ones start. */
  private advanceEffects(): void {
    for (const fx of this.effectList.slice()) {
      if (fx.pending || !this.effectList.includes(fx)) continue;
      fx.shotsLeft--;
      if (fx.shotsLeft > 0) continue;
      this.effectList.splice(this.effectList.indexOf(fx), 1);
      const p = this.powerById(fx.power);
      p.end?.(this.context(p), fx);
      this.emitEffect(fx, 'ended');
    }
    for (const fx of this.effectList.slice()) {
      if (!fx.pending) continue;
      fx.pending = false;
      const p = this.powerById(fx.power);
      p.begin?.(this.context(p), fx);
      this.emitEffect(fx, 'started');
    }
  }

  private emitEffect(fx: EffectState, change: 'granted' | 'extended' | 'started' | 'ended'): void {
    if (!this.collect) return;
    this.out.push({
      type: 'effect',
      tick: this.world.tick,
      power: fx.power,
      tag: fx.tag,
      change,
      shotsLeft: fx.shotsLeft,
    });
  }

  private bodyIndex(element: number): number {
    return this.level.bodyIndexById.get(element) ?? -1;
  }
}
