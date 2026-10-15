// The deterministic physics world: fixed 100 Hz ticks, a world clock that drives every moving
// part (also between shots), balls, contacts, triggers and the typed event stream.
//
// Order of one tick (research 3.1, 4.1, 4.4; objects update before balls, as in the original):
//   1. tick += 1; level movements (parents first), bucket, flippers and Fever parts take their
//      pose for the new tick; each body's velocity is the pose change of this tick.
//   2. Quick-disappear pegs count down and vanish.
//   3. Each ball, in spawn order: stuck bookkeeping, teleport / catch triggers, gravity and the
//      speed cap, penetration recovery, then the swept move with up to 20 contacts, then the
//      bottom exit.
//   4. Ball vs ball.
//
// The hot path mutates in place: no allocation per tick once the pools have warmed up.

import { sincos, wrapAngle } from '../core/dmath';
import type { Level } from '../level/schema';
import { createSweepHit, sweepCircle, sweepFace, type SweepHit } from './collide';
import { compileLevel, type BodyDef, type CompiledLevel, type PoseTable } from './compile';
import {
  EventLog,
  type BallOutReason,
  type PegLitCause,
  type PegRemovedReason,
  type SimEvent,
} from './events';
import { movementPose, type Pose } from './movement';
import {
  createContactResult,
  createSurface,
  respondCircle,
  respondLine,
  type Surface,
} from './response';
import {
  BALL_BALL_RESTITUTION,
  BALL_OUT_DEPTH,
  BALL_RADIUS,
  BARREL_LENGTH,
  BUCKET_TRAVEL_STEP_TICKS,
  CANNON_PIVOT_Y,
  CEILING_BOTTOM,
  CONTACT_SKIN,
  CRUMBLE_END,
  CRUMBLE_START,
  FEVER_RISE_TICKS,
  FLIPPER_SWING_TICKS,
  GRAVITY,
  LAUNCH_SPEED,
  MAX_CONTACT_ITERATIONS,
  MAX_SPEED,
  RETURN_CLEARANCE,
  SEPARATING_SKIP,
  STUCK_EASE_DISTANCE,
  STUCK_EASE_TICKS,
  STUCK_HISTORY,
  STUCK_RESET_DISTANCE,
  STUCK_SAMPLE_TICKS,
} from './tuning';

/** A polygon or segment edge in board coordinates. */
class Edge {
  ax = 0;
  ay = 0;
  bx = 0;
  by = 0;
  ux = 0;
  uy = 0;
  len = 0;
  nx = 0;
  ny = 0;

  copyFrom(o: Edge): void {
    this.ax = o.ax;
    this.ay = o.ay;
    this.bx = o.bx;
    this.by = o.by;
    this.ux = o.ux;
    this.uy = o.uy;
    this.len = o.len;
    this.nx = o.nx;
    this.ny = o.ny;
  }
}

/** Read-only view of a body's state for the rules layer and the renderer. */
export interface BodyView {
  readonly def: BodyDef;
  /** Position (the element's anchor after movement). */
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  /** Pose change during the last tick (px/tick and rad/tick). */
  readonly vx: number;
  readonly vy: number;
  readonly angularVelocity: number;
  /** Still on the board. Scoring elements become inactive when removed. */
  readonly active: boolean;
  /** Collides right now (or, for a trigger, is armed). */
  readonly solid: boolean;
  /** Lit during the current shot. */
  readonly lit: boolean;
}

class BodyState implements BodyView {
  x = 0;
  y = 0;
  rotation = 0;
  vx = 0;
  vy = 0;
  angularVelocity = 0;
  cos = 1;
  sin = 0;
  trigRotation = 0;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;
  active = true;
  solid = false;
  lit = false;
  crumble = -1;
  stamp = 0;
  /** Edges and box lag behind the pose because the body does not collide right now. */
  geometryStale = false;
  readonly edges: Edge[];

  constructor(readonly def: BodyDef) {
    this.edges = def.localEdges.map(() => new Edge());
  }

  copyFrom(o: BodyState): void {
    this.x = o.x;
    this.y = o.y;
    this.rotation = o.rotation;
    this.vx = o.vx;
    this.vy = o.vy;
    this.angularVelocity = o.angularVelocity;
    this.cos = o.cos;
    this.sin = o.sin;
    this.trigRotation = o.trigRotation;
    this.minX = o.minX;
    this.minY = o.minY;
    this.maxX = o.maxX;
    this.maxY = o.maxY;
    this.active = o.active;
    this.solid = o.solid;
    this.lit = o.lit;
    this.crumble = o.crumble;
    this.geometryStale = o.geometryStale;
    for (let k = 0; k < this.edges.length; k++) {
      const e = this.edges[k];
      const src = o.edges[k];
      if (e !== undefined && src !== undefined) e.copyFrom(src);
    }
  }
}

/** Read-only view of a ball. */
export interface BallView {
  /** Id within the current shot: 0 for the launched ball, then 1, 2, ... in spawn order. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  /** Fireball: passes through pegs and bricks, lighting them. */
  readonly passThroughScoring: boolean;
  /** Times the ball will come back in at the top after falling out (Spooky Ball). */
  readonly topReturns: number;
  /** Ticks left inside a teleport; the ball is not drawn and does not move meanwhile. */
  readonly hiddenTicks: number;
  /** Ticks since spawn. */
  readonly age: number;
  /**
   * Stuck counter (research 4.4): +1 per tick; reset by real progress, by contact with a
   * ballStopReset object and whenever a peg is removed. The rules layer decides when it is
   * too high and calls removePeg(..., 'stuck').
   */
  readonly stuckTicks: number;
}

class Ball implements BallView {
  id = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = BALL_RADIUS;
  passThroughScoring = false;
  topReturns = 0;
  hiddenTicks = 0;
  /** Teleport body the ball is traveling through, or -1. */
  teleportBody = -1;
  /** Trigger body the ball's center was inside after its last update, or -1. */
  insideTrigger = -1;
  age = 0;
  stuckTicks = 0;
  readonly history = new Float64Array(STUCK_HISTORY * 2);
  historyCount = 0;
  historyNext = 0;
  alive = true;

  reset(id: number, x: number, y: number, vx: number, vy: number, radius: number): void {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.passThroughScoring = false;
    this.topReturns = 0;
    this.hiddenTicks = 0;
    this.teleportBody = -1;
    this.insideTrigger = -1;
    this.age = 0;
    this.stuckTicks = 0;
    this.historyCount = 0;
    this.historyNext = 0;
    this.alive = true;
  }

  copyFrom(o: Ball): void {
    this.reset(o.id, o.x, o.y, o.vx, o.vy, o.radius);
    this.passThroughScoring = o.passThroughScoring;
    this.topReturns = o.topReturns;
    this.hiddenTicks = o.hiddenTicks;
    this.teleportBody = o.teleportBody;
    this.insideTrigger = o.insideTrigger;
    this.age = o.age;
    this.stuckTicks = o.stuckTicks;
    this.history.set(o.history);
    this.historyCount = o.historyCount;
    this.historyNext = o.historyNext;
    this.alive = o.alive;
  }
}

export interface LaunchOptions {
  /** Ball radius; default 6. Fireball uses 10. */
  readonly radius?: number;
  readonly passThroughScoring?: boolean;
  readonly topReturns?: number;
}

export interface SpawnSpec extends LaunchOptions {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface BallOptions {
  readonly radius?: number;
  readonly passThroughScoring?: boolean;
  readonly topReturns?: number;
}

interface MotionEntry {
  readonly body: BodyState;
  readonly parent: BodyState | null;
  readonly table: PoseTable | null;
}

const HIT_CENTER = 0;
const HIT_FACE = 1;
const QUERY_MARGIN = 1;

export class World {
  readonly level: CompiledLevel;

  private clock = 0;
  private readonly state: BodyState[];
  /** Bodies moved by level movements, parents first. */
  private readonly motion: readonly MotionEntry[];
  /** Colliding bodies that move; few enough to scan instead of binning every tick. */
  private readonly dynamic: BodyState[];
  /** Per body: how far its edges reach from its position in any rotation, with a margin. */
  private readonly reach: Float64Array;
  private readonly log = new EventLog();
  private readonly ballList: Ball[] = [];
  private readonly ballPool: Ball[] = [];
  private nextBallId = 0;
  private shotActive = false;
  private readonly litOrder: BodyState[] = [];

  private bucketOn = true;
  private pyramidOn = false;
  private coverOn = false;
  private flippersOn = false;
  private flipperPressed = false;
  private flipperClock = 0;
  private feverOn = false;
  private feverClock = 0;
  private travel: number;
  private travelTarget: number;
  private bucketCenter = 0;

  private readonly cand: BodyState[] = [];
  private candCount = 0;
  private queryStamp = 0;

  // The contact code passes numbers between its methods in these fields, not as arguments: V8
  // allocates a box for every double argument of a call it does not inline, and these calls
  // run several times per ball per tick. Fields of a double are updated in place.
  /** Broadphase query box (gather). */
  private queryX0 = 0;
  private queryY0 = 0;
  private queryX1 = 0;
  private queryY1 = 0;
  /** The ball's move over the rest of this tick (findContact, testEdges, testPoint). */
  private moveX = 0;
  private moveY = 0;
  /** The circle testPoint tests: its center and the touching distance. */
  private pointX = 0;
  private pointY = 0;
  private pointReach = 0;
  /** The contact being resolved: ball center before the push-out, normal, impact speed. */
  private contactX = 0;
  private contactY = 0;
  private contactNx = 0;
  private contactNy = 0;
  private contactImpact = 0;
  private readonly surface: Surface = createSurface();
  private readonly excluded: BodyState[] = [];
  private excludedCount = 0;
  private readonly pose: Pose = { x: 0, y: 0, rotation: 0 };
  private readonly sweep: SweepHit = createSweepHit();
  private readonly contact = createContactResult();

  private hitT = 0;
  private hitBody: BodyState | null = null;
  private hitKind = HIT_CENTER;
  private hitNx = 0;
  private hitNy = 0;
  private hitRefX = 0;
  private hitRefY = 0;
  private hitReach = 0;

  constructor(level: CompiledLevel) {
    this.level = level;
    this.state = level.bodies.map((def) => new BodyState(def));
    this.dynamic = level.dynamicBodies.flatMap((index) => this.state[index] ?? []);
    this.reach = edgeReach(level);
    this.motion = level.elementMotionOrder.flatMap((index) => {
      const body = this.state[index];
      if (body === undefined) return [];
      return [
        {
          body,
          parent: this.state[body.def.parent] ?? null,
          table: level.poseTables[index] ?? null,
        },
      ];
    });
    this.travel = level.bucketTravel;
    this.travelTarget = level.bucketTravel;
    for (const s of this.state) {
      const pose = level.initialPoses[s.def.index];
      if (pose !== undefined) this.place(s, pose.x, pose.y, pose.rotation, true);
      if (s.def.shape === 'trigger') {
        s.solid = s.def.element === null || s.def.element.collision;
      } else {
        s.solid = s.def.collides;
      }
    }
    this.refreshBaseSolids();
    this.updateMotion(true);
  }

  static fromLevel(level: Level): World {
    return new World(compileLevel(level));
  }

  /** World clock in ticks. Every moving part is a function of it. */
  get tick(): number {
    return this.clock;
  }

  /** Events since the last step() began, in order. Pooled: read them before the next step. */
  get events(): readonly SimEvent[] {
    return this.log.list;
  }

  /** Balls in play, in spawn order. */
  get balls(): readonly BallView[] {
    return this.ballList;
  }

  get ballsInPlay(): number {
    return this.ballList.length;
  }

  /** True from launch (or a spawn) until endShot(). */
  get inShot(): boolean {
    return this.shotActive;
  }

  /** Every body: level elements first (in file order), then the base geometry. */
  get bodies(): readonly BodyView[] {
    return this.state;
  }

  /** Free ball bucket center x. */
  get bucketX(): number {
    return this.bucketCenter;
  }

  /** Current bucket travel: the center moves this far either side of the board's middle. */
  get bucketTravel(): number {
    return this.travel;
  }

  get fever(): boolean {
    return this.feverOn;
  }

  get flippers(): boolean {
    return this.flippersOn;
  }

  get pyramid(): boolean {
    return this.pyramidOn;
  }

  get bucketCovered(): boolean {
    return this.coverOn;
  }

  /** The body of a level element. Throws for an unknown id. */
  element(id: number): BodyView {
    return this.stateOf(id);
  }

  isActive(id: number): boolean {
    return this.stateOf(id).active;
  }

  isLit(id: number): boolean {
    return this.stateOf(id).lit;
  }

  /** Ids of the elements lit this shot, in the order they lit up. */
  litElementIds(): number[] {
    return this.litOrder.map((s) => s.def.id);
  }

  // ---------------------------------------------------------------------------------------
  // Control API

  /**
   * Starts a shot: a ball leaves the barrel tip toward `direction` (any non-zero vector; it is
   * normalized) at 4 px/tick. Returns the ball id (0). Throws if a shot is still running.
   */
  launch(
    direction: { readonly x: number; readonly y: number },
    options: LaunchOptions = {},
  ): number {
    if (this.shotActive) throw new Error('a shot is still running; call endShot() first');
    const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (!(len > 0) || !Number.isFinite(len)) throw new Error('launch direction must be non-zero');
    const dx = direction.x / len;
    const dy = direction.y / len;
    const radius = options.radius ?? BALL_RADIUS;
    const reach = BARREL_LENGTH + radius;
    return this.addBall(
      {
        ...options,
        x: this.level.width / 2 + reach * dx,
        y: CANNON_PIVOT_Y + reach * dy,
        vx: LAUNCH_SPEED * dx,
        vy: LAUNCH_SPEED * dy,
      },
      'launch',
    );
  }

  /** Adds a ball anywhere (Multiball, tests, tools). Starts a shot if none is running. */
  spawnBall(spec: SpawnSpec): number {
    return this.addBall(spec, 'spawn');
  }

  configureBall(id: number, options: BallOptions): void {
    const b = this.ballById(id);
    if (options.radius !== undefined) b.radius = options.radius;
    if (options.passThroughScoring !== undefined) b.passThroughScoring = options.passThroughScoring;
    if (options.topReturns !== undefined) b.topReturns = options.topReturns;
  }

  /** Takes a ball out of play (event reason 'removed'). */
  removeBall(id: number): void {
    const b = this.ballById(id);
    this.killBall(b, 'removed');
    this.compactBalls();
  }

  /** Lights scoring elements without contact (Space Blast, Flower Power). Skips lit ones. */
  lightPegs(ids: readonly number[]): void {
    for (const id of ids) this.light(this.stateOf(id), -1, 'power');
  }

  /** Removes a scoring element now (stuck ball, powers). */
  removePeg(id: number, reason: Extract<PegRemovedReason, 'stuck' | 'power'>): void {
    const s = this.stateOf(id);
    if (!s.def.scoring) throw new Error(`element ${id} is not a peg or brick`);
    if (s.active) this.removeBody(s, reason);
  }

  /**
   * Ends the shot: every lit element still on the board is removed (event reason 'shotEnd',
   * in the order they lit). The pop animation is the renderer's business. Throws while balls
   * are in play.
   */
  endShot(): void {
    if (this.ballList.length > 0) throw new Error('balls are still in play');
    for (const s of this.litOrder) {
      if (s.active) this.removeBody(s, 'shotEnd');
      s.lit = false;
      s.crumble = -1;
    }
    truncate(this.litOrder, 0);
    this.shotActive = false;
    this.nextBallId = 0;
  }

  /**
   * Drops every ball without events and leaves the shot, keeping lit elements on the board.
   * For simulating "what if" shots from a copied state (aim guide, Zen Ball, self-play).
   */
  discardBalls(): void {
    for (const b of this.ballList) this.ballPool.push(b);
    truncate(this.ballList, 0);
    this.shotActive = false;
    this.nextBallId = 0;
  }

  /** Pyramid: the sloped edges on the bucket become solid. */
  setPyramid(on: boolean): void {
    this.pyramidOn = on;
    this.refreshBaseSolids();
  }

  /** Fireball: the cover over the bucket becomes solid. */
  setBucketCover(on: boolean): void {
    this.coverOn = on;
    this.refreshBaseSolids();
  }

  /** Bucket travel (center to either end). It moves there by 1 px every 2 ticks. */
  setBucketTravel(travel: number): void {
    this.travelTarget = Math.max(0, travel);
  }

  setFlippers(on: boolean): void {
    this.flippersOn = on;
    this.refreshBaseSolids();
  }

  /** Flipper button state; it is read every tick, so replays record it per tick. */
  setFlipperInput(pressed: boolean): void {
    this.flipperPressed = pressed;
  }

  /** Fever: the free ball bucket goes away, the Fever buckets and dividers rise. */
  setFever(on: boolean): void {
    this.feverOn = on;
    if (!on) this.feverClock = 0;
    this.refreshBaseSolids();
  }

  // ---------------------------------------------------------------------------------------
  // Snapshots

  /** An independent copy with identical state. */
  clone(): World {
    const w = new World(this.level);
    w.copyFrom(this);
    return w;
  }

  /** Overwrites this world with another of the same compiled level, without allocating. */
  copyFrom(o: World): void {
    if (o.level !== this.level)
      throw new Error('copyFrom needs a world of the same compiled level');
    this.clock = o.clock;
    this.nextBallId = o.nextBallId;
    this.shotActive = o.shotActive;
    this.bucketOn = o.bucketOn;
    this.pyramidOn = o.pyramidOn;
    this.coverOn = o.coverOn;
    this.flippersOn = o.flippersOn;
    this.flipperPressed = o.flipperPressed;
    this.flipperClock = o.flipperClock;
    this.feverOn = o.feverOn;
    this.feverClock = o.feverClock;
    this.travel = o.travel;
    this.travelTarget = o.travelTarget;
    this.bucketCenter = o.bucketCenter;
    for (let i = 0; i < this.state.length; i++) {
      const s = this.state[i];
      const src = o.state[i];
      if (s !== undefined && src !== undefined) s.copyFrom(src);
    }
    truncate(this.litOrder, 0);
    for (const s of o.litOrder) {
      const mine = this.state[s.def.index];
      if (mine !== undefined) this.litOrder.push(mine);
    }
    for (const b of this.ballList) this.ballPool.push(b);
    truncate(this.ballList, 0);
    for (const src of o.ballList) {
      const b = this.ballPool.pop() ?? new Ball();
      b.copyFrom(src);
      this.ballList.push(b);
    }
    this.log.clear();
  }

  // ---------------------------------------------------------------------------------------
  // Stepping

  /** Advances the world by one tick. */
  step(): void {
    this.log.clear();
    this.clock++;
    this.updateMotion(false);
    this.updateCrumble();
    const count = this.ballList.length;
    for (let i = 0; i < count; i++) {
      const b = this.ballList[i];
      if (b !== undefined && b.alive) this.updateBall(b);
    }
    this.collideBalls();
    this.compactBalls();
  }

  // ---------------------------------------------------------------------------------------
  // Motion

  private updateMotion(initial: boolean): void {
    const level = this.level;
    const tick = this.clock;
    const pose = this.pose;
    for (const entry of this.motion) {
      const s = entry.body;
      const def = s.def;
      let ax = def.baseX;
      let ay = def.baseY;
      const p = entry.parent;
      if (p !== null) {
        ax += p.x - def.parentRefX;
        ay += p.y - def.parentRefY;
      }
      const table = entry.table;
      if (table !== null) {
        const k = 5 * (tick % table.cycle);
        const d = table.data;
        const rotation = d[k + 2] ?? 0;
        if (rotation !== s.trigRotation) {
          s.cos = d[k + 3] ?? 1;
          s.sin = d[k + 4] ?? 0;
          s.trigRotation = rotation;
        }
        this.place(s, ax + (d[k] ?? 0), ay + (d[k + 1] ?? 0), rotation, initial);
      } else if (def.movement !== null) {
        movementPose(def.movement, ax, ay, def.baseRotation, tick, pose, 0, def.track);
        this.place(s, pose.x, pose.y, pose.rotation, initial);
      } else {
        this.place(s, ax, ay, def.baseRotation, initial);
      }
    }

    // Free ball bucket: a HorizontalCycle mover whose radius the powers can change.
    if (!initial && tick % BUCKET_TRAVEL_STEP_TICKS === 0 && this.travel !== this.travelTarget) {
      const diff = this.travelTarget - this.travel;
      this.travel += diff > 1 ? 1 : diff < -1 ? -1 : diff;
    }
    this.bucketCenter =
      level.bucketCenterX + (level.bucketWave[tick % level.bucketCycle] ?? 0) * this.travel;
    for (const index of level.bucketBodies) {
      const s = this.state[index];
      if (s !== undefined) {
        this.place(s, this.bucketCenter + s.def.baseX, s.def.baseY, s.def.baseRotation, initial);
      }
    }

    // Flippers and Fever parts run on clocks that only move on input or during Fever; a part
    // whose clock stands still keeps its pose and has zero velocity.
    const flipperClock = this.flipperClock;
    if (!initial) {
      if (this.flippersOn && this.flipperPressed) {
        this.flipperClock = Math.min(flipperClock + 1, FLIPPER_SWING_TICKS);
      } else {
        this.flipperClock = Math.max(flipperClock - 1, 0);
      }
    }
    const flippersMove = initial || this.flipperClock !== flipperClock;
    for (const index of level.flipperBodies) {
      const s = this.state[index];
      if (s === undefined) continue;
      if (!flippersMove) {
        hold(s);
        continue;
      }
      const m = s.def.side === 'right' ? level.movers.rightFlipper : level.movers.leftFlipper;
      movementPose(m, s.def.baseX, s.def.baseY, s.def.baseRotation, this.flipperClock, pose);
      this.place(s, pose.x, pose.y, pose.rotation, initial);
    }

    const feverClock = this.feverClock;
    if (!initial && this.feverOn) this.feverClock = Math.min(feverClock + 1, FEVER_RISE_TICKS);
    const feverMoves = initial || this.feverClock !== feverClock;
    for (const index of level.feverBodies) {
      const s = this.state[index];
      if (s === undefined) continue;
      if (!feverMoves) {
        hold(s);
        continue;
      }
      movementPose(level.movers.fever, s.def.baseX, s.def.baseY, 0, this.feverClock, pose);
      this.place(s, pose.x, pose.y, 0, initial);
    }
  }

  /**
   * Moves a body to its pose for this tick; its velocity is the change since the last tick.
   * Circles and triggers update their box at once. Polygon and segment edges are computed only
   * when a ball comes near (gather): until then the body keeps a box of its farthest corner's
   * reach around its position, which holds every rotation. The edges come out the same whenever
   * they are computed, since the pose does not change within a tick.
   */
  private place(s: BodyState, x: number, y: number, rotation: number, initial: boolean): void {
    if (initial) {
      s.vx = 0;
      s.vy = 0;
      s.angularVelocity = 0;
    } else {
      s.vx = x - s.x;
      s.vy = y - s.y;
      s.angularVelocity = wrapAngle(rotation - s.rotation);
    }
    s.x = x;
    s.y = y;
    s.rotation = rotation;
    if (initial || (s.solid && s.def.localEdges.length === 0)) {
      this.updateGeometry(s);
    } else {
      s.geometryStale = true;
      if (s.solid) {
        const r = this.reach[s.def.index] ?? 0;
        s.minX = x - r;
        s.minY = y - r;
        s.maxX = x + r;
        s.maxY = y + r;
      }
    }
  }

  private updateGeometry(s: BodyState): void {
    s.geometryStale = false;
    const x = s.x;
    const y = s.y;
    const rotation = s.rotation;
    const def = s.def;
    if (def.shape === 'circle') {
      s.minX = x - def.radius;
      s.minY = y - def.radius;
      s.maxX = x + def.radius;
      s.maxY = y + def.radius;
      return;
    }
    if (def.shape === 'trigger') {
      s.minX = x - def.halfWidth;
      s.minY = y - def.halfHeight;
      s.maxX = x + def.halfWidth;
      s.maxY = y + def.halfHeight;
      return;
    }
    if (rotation !== s.trigRotation) {
      sincos(rotation, s);
      s.trigRotation = rotation;
    }
    const c = s.cos;
    const sn = s.sin;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const local = def.localEdges;
    for (let k = 0; k < local.length; k++) {
      const le = local[k];
      const e = s.edges[k];
      if (le === undefined || e === undefined) continue;
      e.ax = x + le.ax * c + le.ay * sn;
      e.ay = y - le.ax * sn + le.ay * c;
      e.bx = x + le.bx * c + le.by * sn;
      e.by = y - le.bx * sn + le.by * c;
      e.ux = le.ux * c + le.uy * sn;
      e.uy = -le.ux * sn + le.uy * c;
      e.nx = le.nx * c + le.ny * sn;
      e.ny = -le.nx * sn + le.ny * c;
      e.len = le.len;
      if (e.ax < minX) minX = e.ax;
      if (e.ax > maxX) maxX = e.ax;
      if (e.ay < minY) minY = e.ay;
      if (e.ay > maxY) maxY = e.ay;
      if (e.bx < minX) minX = e.bx;
      if (e.bx > maxX) maxX = e.bx;
      if (e.by < minY) minY = e.by;
      if (e.by > maxY) maxY = e.by;
    }
    s.minX = minX;
    s.minY = minY;
    s.maxX = maxX;
    s.maxY = maxY;
  }

  private refreshBaseSolids(): void {
    this.bucketOn = !this.feverOn;
    for (const s of this.state) {
      switch (s.def.role) {
        case 'bucketRim':
        case 'bucketCatch':
          s.solid = this.bucketOn;
          break;
        case 'pyramid':
          s.solid = this.bucketOn && this.pyramidOn;
          break;
        case 'cover':
          s.solid = this.bucketOn && this.coverOn;
          break;
        case 'flipper':
          s.solid = this.flippersOn;
          break;
        case 'feverDivider':
        case 'feverHole':
          s.solid = this.feverOn;
          break;
        case 'element':
        case 'wall':
        case 'ceiling':
          break;
      }
      if (s.solid && s.geometryStale) this.updateGeometry(s);
    }
  }

  private updateCrumble(): void {
    for (const s of this.litOrder) {
      if (s.crumble < 0 || !s.active) continue;
      s.crumble++;
      if (s.crumble >= CRUMBLE_END) this.removeBody(s, 'quickDisappear');
    }
  }

  // ---------------------------------------------------------------------------------------
  // Balls

  private addBall(spec: SpawnSpec, cause: 'launch' | 'spawn'): number {
    const b = this.ballPool.pop() ?? new Ball();
    b.reset(this.nextBallId++, spec.x, spec.y, spec.vx, spec.vy, spec.radius ?? BALL_RADIUS);
    b.passThroughScoring = spec.passThroughScoring ?? false;
    b.topReturns = spec.topReturns ?? 0;
    this.ballList.push(b);
    this.shotActive = true;
    const e = this.log.ballSpawned.take();
    e.tick = this.tick;
    e.ball = b.id;
    e.x = b.x;
    e.y = b.y;
    e.vx = b.vx;
    e.vy = b.vy;
    e.cause = cause;
    this.log.push(e);
    return b.id;
  }

  private ballById(id: number): Ball {
    for (const b of this.ballList) if (b.id === id && b.alive) return b;
    throw new Error(`no ball ${id} in play`);
  }

  private stateOf(id: number): BodyState {
    const index = this.level.bodyIndexById.get(id);
    const s = index === undefined ? undefined : this.state[index];
    if (s === undefined) throw new Error(`no element ${id}`);
    return s;
  }

  private killBall(b: Ball, reason: BallOutReason): void {
    b.alive = false;
    const e = this.log.ballOut.take();
    e.tick = this.tick;
    e.ball = b.id;
    e.x = b.x;
    e.y = b.y;
    e.reason = reason;
    this.log.push(e);
  }

  private compactBalls(): void {
    let j = 0;
    const list = this.ballList;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b === undefined) continue;
      if (b.alive) list[j++] = b;
      else this.ballPool.push(b);
    }
    truncate(list, j);
  }

  private updateBall(b: Ball): void {
    b.age++;
    b.stuckTicks++;
    if (b.age % STUCK_SAMPLE_TICKS === 0) this.sampleStuck(b);

    if (b.hiddenTicks > 0) {
      b.hiddenTicks--;
      if (b.hiddenTicks > 0) return;
      this.exitTeleport(b);
    } else if (!this.checkTriggers(b)) {
      return;
    }

    b.vy += GRAVITY;
    const speed2 = b.vx * b.vx + b.vy * b.vy;
    if (speed2 > MAX_SPEED * MAX_SPEED) {
      const speed = Math.sqrt(speed2);
      b.vx = (b.vx / speed) * MAX_SPEED;
      b.vy = (b.vy / speed) * MAX_SPEED;
    }

    this.excludedCount = 0;
    this.recoverPenetration(b);
    this.moveBall(b);

    if (b.y > this.level.height + BALL_OUT_DEPTH) {
      if (b.topReturns > 0) {
        b.topReturns--;
        b.y = CEILING_BOTTOM + b.radius + RETURN_CLEARANCE;
        b.insideTrigger = -1;
        const e = this.log.ballReturned.take();
        e.tick = this.tick;
        e.ball = b.id;
        e.x = b.x;
        e.y = b.y;
        this.log.push(e);
      } else {
        this.killBall(b, 'bottom');
      }
    }
  }

  private sampleStuck(b: Ball): void {
    const h = b.history;
    let far = false;
    let near = false;
    for (let k = 0; k < b.historyCount; k++) {
      const dx = b.x - (h[2 * k] ?? 0);
      const dy = b.y - (h[2 * k + 1] ?? 0);
      const d2 = dx * dx + dy * dy;
      if (d2 >= STUCK_RESET_DISTANCE * STUCK_RESET_DISTANCE) far = true;
      else if (d2 >= STUCK_EASE_DISTANCE * STUCK_EASE_DISTANCE) near = true;
    }
    if (far) b.stuckTicks = 0;
    else if (near) b.stuckTicks = Math.max(0, b.stuckTicks - STUCK_EASE_TICKS);
    h[2 * b.historyNext] = b.x;
    h[2 * b.historyNext + 1] = b.y;
    b.historyNext = (b.historyNext + 1) % STUCK_HISTORY;
    if (b.historyCount < STUCK_HISTORY) b.historyCount++;
  }

  /** The armed trigger the ball's center is inside, or -1. */
  private triggerAt(b: Ball): number {
    const x = b.x;
    const y = b.y;
    for (const index of this.level.triggers) {
      const s = this.state[index];
      if (s === undefined || !s.solid) continue;
      const dx = x - s.x;
      const dy = y - s.y;
      const hw = s.def.halfWidth;
      const hh = s.def.halfHeight;
      if (s.def.circular) {
        if ((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1) return index;
      } else if (dx >= -hw && dx <= hw && dy >= -hh && dy <= hh) {
        return index;
      }
    }
    return -1;
  }

  /** Teleports and catch boxes (research 2.9). Returns false when the ball stops this tick. */
  private checkTriggers(b: Ball): boolean {
    const index = this.triggerAt(b);
    if (index === b.insideTrigger) return true;
    b.insideTrigger = index;
    if (index < 0) return true;
    const s = this.state[index];
    if (s === undefined) return true;
    const def = s.def;
    if (def.role === 'bucketCatch') {
      b.alive = false;
      const e = this.log.bucketCatch.take();
      e.tick = this.tick;
      e.ball = b.id;
      e.x = b.x;
      e.y = b.y;
      this.log.push(e);
      return false;
    }
    if (def.role === 'feverHole') {
      b.alive = false;
      const e = this.log.feverCatch.take();
      e.tick = this.tick;
      e.ball = b.id;
      e.bucket = def.feverIndex;
      e.x = b.x;
      e.y = b.y;
      this.log.push(e);
      return false;
    }
    const tp = def.teleport;
    if (tp === null) return true;
    this.emitTeleport(b, def.id, 'enter');
    if (tp.exit === 'remove') {
      this.killBall(b, 'teleport');
      return false;
    }
    b.teleportBody = index;
    if (tp.outDelay > 0) {
      b.hiddenTicks = tp.outDelay;
      return false;
    }
    this.exitTeleport(b);
    return true;
  }

  private exitTeleport(b: Ball): void {
    const s = this.state[b.teleportBody];
    const tp = s?.def.teleport ?? null;
    if (s === undefined || tp === null) return;
    if (tp.exit === 'element') {
      const target = this.state[tp.exitBody];
      if (target !== undefined) {
        b.x = target.x;
        b.y = target.y;
      }
    } else {
      b.x = tp.exitX;
      b.y = tp.exitY;
    }
    b.teleportBody = -1;
    b.insideTrigger = this.triggerAt(b);
    this.emitTeleport(b, s.def.id, 'exit');
  }

  private emitTeleport(b: Ball, element: number, stage: 'enter' | 'exit'): void {
    const e = this.log.teleport.take();
    e.tick = this.tick;
    e.ball = b.id;
    e.element = element;
    e.stage = stage;
    e.x = b.x;
    e.y = b.y;
    this.log.push(e);
  }

  // ---------------------------------------------------------------------------------------
  // Contacts

  /** Collects solid bodies whose box overlaps the query box into `cand`. */
  private gather(): void {
    const x0 = this.queryX0;
    const y0 = this.queryY0;
    const x1 = this.queryX1;
    const y1 = this.queryY1;
    const stamp = ++this.queryStamp;
    this.candCount = 0;
    const g = this.level.staticGrid;
    const c0 = g.col(x0);
    const c1 = g.col(x1);
    const r0 = g.row(y0);
    const r1 = g.row(y1);
    const start = g.cellStart;
    const items = g.items;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * g.cols + c;
        const end = start[cell + 1] ?? 0;
        for (let k = start[cell] ?? 0; k < end; k++) {
          const s = this.state[items[k] ?? -1];
          if (s === undefined || s.stamp === stamp) continue;
          s.stamp = stamp;
          if (!s.solid || s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1) continue;
          this.cand[this.candCount++] = s;
        }
      }
    }
    for (const s of this.dynamic) {
      if (!s.solid || s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1) continue;
      if (s.geometryStale) {
        // Its box was only the reach around it (place): now the real edges and box.
        this.updateGeometry(s);
        if (s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1) continue;
      }
      this.cand[this.candCount++] = s;
    }
  }

  private isExcluded(s: BodyState): boolean {
    for (let k = 0; k < this.excludedCount; k++) if (this.excluded[k] === s) return true;
    return false;
  }

  private exclude(s: BodyState): void {
    this.excluded[this.excludedCount++] = s;
  }

  /** Swept move with up to 20 contacts (research 4.1). */
  private moveBall(b: Ball): void {
    let remaining = 1;
    for (let iter = 0; iter < MAX_CONTACT_ITERATIONS; iter++) {
      const dx = b.vx * remaining;
      const dy = b.vy * remaining;
      this.moveX = dx;
      this.moveY = dy;
      if (!this.findContact(b)) {
        b.x += dx;
        b.y += dy;
        return;
      }
      const t = this.hitT;
      b.x += dx * t;
      b.y += dy * t;
      remaining *= 1 - t;
      this.resolve(b);
    }
    // Twenty contacts in one tick: the ball stays at the last contact point.
  }

  /** The earliest contact along the move in moveX, moveY, into the hit fields. */
  private findContact(b: Ball): boolean {
    const dx = this.moveX;
    const dy = this.moveY;
    const r = b.radius;
    const reach = r + QUERY_MARGIN;
    this.queryX0 = Math.min(b.x, b.x + dx) - reach;
    this.queryY0 = Math.min(b.y, b.y + dy) - reach;
    this.queryX1 = Math.max(b.x, b.x + dx) + reach;
    this.queryY1 = Math.max(b.y, b.y + dy) + reach;
    this.gather();
    this.hitT = 2;
    this.hitBody = null;
    for (let k = 0; k < this.candCount; k++) {
      const s = this.cand[k];
      if (s === undefined) break;
      if (this.excludedCount > 0 && this.isExcluded(s)) continue;
      const enterOnly = b.passThroughScoring && s.def.scoring;
      if (s.def.shape === 'circle') {
        this.pointX = s.x;
        this.pointY = s.y;
        this.pointReach = r + s.def.radius;
        this.testPoint(b, s, enterOnly);
      } else {
        this.testEdges(b, s, enterOnly);
      }
    }
    // Every contact time lies in [0, 1]; 2 means none was found.
    return this.hitT <= 1;
  }

  /**
   * Circle of touching distance pointReach around (pointX, pointY): a circle body or an end
   * point.
   */
  private testPoint(b: Ball, s: BodyState, enterOnly: boolean): void {
    const h = this.sweep;
    const cx = this.pointX;
    const cy = this.pointY;
    const reach = this.pointReach;
    if (!sweepCircle(b.x, b.y, this.moveX, this.moveY, cx, cy, reach - CONTACT_SKIN, h)) return;
    if (h.t >= this.hitT) return;
    if (h.overlap && (enterOnly || this.separating(b, s))) return;
    this.hitT = h.t;
    this.hitBody = s;
    this.hitKind = HIT_CENTER;
    this.hitNx = h.nx;
    this.hitNy = h.ny;
    this.hitRefX = cx;
    this.hitRefY = cy;
    this.hitReach = reach;
  }

  private testEdges(b: Ball, s: BodyState, enterOnly: boolean): void {
    const h = this.sweep;
    const dx = this.moveX;
    const dy = this.moveY;
    const r = b.radius;
    const rho = r - CONTACT_SKIN;
    const twoSided = s.def.shape === 'segment';
    for (const e of s.edges) {
      if (
        sweepFace(b.x, b.y, dx, dy, e.ax, e.ay, e.ux, e.uy, e.len, e.nx, e.ny, twoSided, rho, h) &&
        h.t < this.hitT &&
        !(h.overlap && (enterOnly || this.separating(b, s)))
      ) {
        this.hitT = h.t;
        this.hitBody = s;
        this.hitKind = HIT_FACE;
        this.hitNx = h.nx;
        this.hitNy = h.ny;
        this.hitRefX = e.ax;
        this.hitRefY = e.ay;
        this.hitReach = r;
      }
      this.pointX = e.ax;
      this.pointY = e.ay;
      this.pointReach = r;
      this.testPoint(b, s, enterOnly);
      if (twoSided) {
        this.pointX = e.bx;
        this.pointY = e.by;
        this.testPoint(b, s, enterOnly);
      }
    }
  }

  /**
   * The overlap found by the last sweep test is skipped while the ball already moves away from
   * it faster than 0.2 px/tick.
   */
  private separating(b: Ball, s: BodyState): boolean {
    const h = this.sweep;
    return (b.vx - s.vx) * h.nx + (b.vy - s.vy) * h.ny > SEPARATING_SKIP;
  }

  private resolve(b: Ball): void {
    const s = this.hitBody;
    if (s === null) return;
    const nx = this.hitNx;
    const ny = this.hitNy;
    this.contactX = b.x;
    this.contactY = b.y;
    this.contactNx = nx;
    this.contactNy = ny;
    if (b.passThroughScoring && s.def.scoring) {
      this.contactImpact = -((b.vx - s.vx) * nx + (b.vy - s.vy) * ny);
      this.emitContact(b, s, false);
      this.exclude(s);
      return;
    }
    if (this.hitKind === HIT_FACE) {
      const depth = b.radius - ((b.x - this.hitRefX) * nx + (b.y - this.hitRefY) * ny);
      b.x += nx * depth;
      b.y += ny * depth;
    } else {
      b.x = this.hitRefX + nx * this.hitReach;
      b.y = this.hitRefY + ny * this.hitReach;
    }
    this.respond(b, s);
  }

  /** The contact response for the contact in the contact fields; the ball is already out. */
  private respond(b: Ball, s: BodyState): void {
    const def = s.def;
    const res = this.contact;
    const nx = this.contactNx;
    const ny = this.contactNy;
    const f = this.surface;
    f.nx = nx;
    f.ny = ny;
    f.wx = s.vx;
    f.wy = s.vy;
    f.bouncy = def.bouncy;
    f.rolly = def.rolly;
    if (def.shape === 'circle') {
      respondCircle(b, f, res);
    } else {
      // Rotational surface velocity at the contact point (research 4.3: omega x r).
      const px = b.x - nx * b.radius - s.x;
      const py = b.y - ny * b.radius - s.y;
      const w = s.angularVelocity;
      f.wax = w * py;
      f.way = -w * px;
      f.maxBounceVelocity = def.maxBounceVelocity;
      respondLine(b, f, res);
    }
    if (def.ballStopReset) b.stuckTicks = 0;
    if (!res.applied) this.exclude(s);
    this.contactImpact = res.impact;
    this.emitContact(b, s, res.slide);
  }

  /**
   * A ball whose center ended up inside a closed polygon (a moving shape swept over it) is
   * pushed out through the nearest edge and gets that edge's contact response (research 4.3,
   * `Poly.cpp:963`: penetration recovery for closed polygons).
   */
  private recoverPenetration(b: Ball): void {
    this.queryX0 = b.x;
    this.queryY0 = b.y;
    this.queryX1 = b.x;
    this.queryY1 = b.y;
    this.gather();
    for (let k = 0; k < this.candCount; k++) {
      const s = this.cand[k];
      if (s === undefined) break;
      if (s.def.shape !== 'polygon' || (b.passThroughScoring && s.def.scoring)) continue;
      if (!insidePolygon(s.edges, b)) continue;
      let best: Edge | null = null;
      let bestD2 = Infinity;
      for (const e of s.edges) {
        const along = (b.x - e.ax) * e.ux + (b.y - e.ay) * e.uy;
        const k2 = along < 0 ? 0 : along > e.len ? e.len : along;
        const qx = e.ax + e.ux * k2 - b.x;
        const qy = e.ay + e.uy * k2 - b.y;
        const d2 = qx * qx + qy * qy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = e;
        }
      }
      if (best === null) continue;
      this.contactX = b.x;
      this.contactY = b.y;
      this.contactNx = best.nx;
      this.contactNy = best.ny;
      const depth = b.radius - ((b.x - best.ax) * best.nx + (b.y - best.ay) * best.ny);
      b.x += best.nx * depth;
      b.y += best.ny * depth;
      this.respond(b, s);
    }
  }

  /** The event for the contact in the contact fields: ball center, normal and impact speed. */
  private emitContact(b: Ball, s: BodyState, slide: boolean): void {
    const def = s.def;
    const tick = this.tick;
    const x = this.contactX;
    const y = this.contactY;
    const nx = this.contactNx;
    const ny = this.contactNy;
    const impact = this.contactImpact;
    switch (def.role) {
      case 'element': {
        if (def.scoring) {
          const first = !s.lit;
          const e = this.log.pegContact.take();
          e.tick = tick;
          e.ball = b.id;
          e.element = def.id;
          e.x = x;
          e.y = y;
          e.nx = nx;
          e.ny = ny;
          e.impact = impact;
          e.slide = slide;
          e.first = first;
          this.log.push(e);
          if (first) this.light(s, b.id, 'contact');
        } else {
          const e = this.log.solidContact.take();
          e.tick = tick;
          e.ball = b.id;
          e.element = def.id;
          e.x = x;
          e.y = y;
          e.nx = nx;
          e.ny = ny;
          e.impact = impact;
          e.slide = slide;
          this.log.push(e);
        }
        return;
      }
      case 'wall':
      case 'ceiling': {
        const e = this.log.wallContact.take();
        e.tick = tick;
        e.ball = b.id;
        e.side = def.side === 'right' ? 'right' : def.side === 'ceiling' ? 'ceiling' : 'left';
        e.x = x;
        e.y = y;
        e.nx = nx;
        e.ny = ny;
        e.impact = impact;
        e.slide = slide;
        this.log.push(e);
        return;
      }
      case 'flipper': {
        const e = this.log.flipperContact.take();
        e.tick = tick;
        e.ball = b.id;
        e.side = def.side === 'right' ? 'right' : 'left';
        e.x = x;
        e.y = y;
        e.nx = nx;
        e.ny = ny;
        e.impact = impact;
        e.slide = slide;
        this.log.push(e);
        return;
      }
      case 'bucketRim':
      case 'pyramid':
      case 'cover':
      case 'feverDivider': {
        const e = this.log.bucketContact.take();
        e.tick = tick;
        e.ball = b.id;
        e.part = def.role === 'bucketRim' ? 'rim' : def.role;
        e.x = x;
        e.y = y;
        e.nx = nx;
        e.ny = ny;
        e.impact = impact;
        e.slide = slide;
        this.log.push(e);
        return;
      }
      case 'bucketCatch':
      case 'feverHole':
        return;
    }
  }

  private light(s: BodyState, ball: number, cause: PegLitCause): void {
    if (s.lit || !s.active || !s.def.scoring) return;
    s.lit = true;
    this.litOrder.push(s);
    if (s.def.quickDisappear) s.crumble = CRUMBLE_START;
    const e = this.log.pegLit.take();
    e.tick = this.tick;
    e.element = s.def.id;
    e.ball = ball;
    e.x = s.x;
    e.y = s.y;
    e.cause = cause;
    this.log.push(e);
  }

  private removeBody(s: BodyState, reason: PegRemovedReason): void {
    s.active = false;
    s.solid = false;
    s.crumble = -1;
    const e = this.log.pegRemoved.take();
    e.tick = this.tick;
    e.element = s.def.id;
    e.x = s.x;
    e.y = s.y;
    e.reason = reason;
    this.log.push(e);
    // Every popped peg resets the stuck counter (research 4.4).
    for (const b of this.ballList) b.stuckTicks = 0;
  }

  /** Ball vs ball, after every ball has moved: restitution 0.95, equal masses (research 4.3). */
  private collideBalls(): void {
    const list = this.ballList;
    const n = list.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a === undefined || !a.alive || a.hiddenTicks > 0) continue;
      for (let j = i + 1; j < n; j++) {
        const c = list[j];
        if (c === undefined || !c.alive || c.hiddenTicks > 0) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const reach = a.radius + c.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel > 0) {
          const j2 = (rel * (1 + BALL_BALL_RESTITUTION)) / 2;
          a.vx -= j2 * nx;
          a.vy -= j2 * ny;
          c.vx += j2 * nx;
          c.vy += j2 * ny;
          const e = this.log.ballContact.take();
          e.tick = this.tick;
          e.ball = a.id;
          e.other = c.id;
          e.x = (a.x + c.x) / 2;
          e.y = (a.y + c.y) / 2;
          this.log.push(e);
        }
        const push = (reach - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        c.x += nx * push;
        c.y += ny * push;
      }
    }
  }
}

const reaches = new WeakMap<CompiledLevel, Float64Array>();

/**
 * Per body of a level: the distance from its position to its farthest edge end point, plus a
 * margin for rounding in the rotation, so a box of that reach holds the body in every pose.
 */
function edgeReach(level: CompiledLevel): Float64Array {
  let r = reaches.get(level);
  if (r !== undefined) return r;
  r = new Float64Array(level.bodies.length);
  for (const def of level.bodies) {
    let d2 = 0;
    for (const e of def.localEdges) {
      d2 = Math.max(d2, e.ax * e.ax + e.ay * e.ay, e.bx * e.bx + e.by * e.by);
    }
    const d = Math.sqrt(d2);
    r[def.index] = d + 1e-6 * d + 1e-6;
  }
  reaches.set(level, r);
  return r;
}

/** Shortens an array in place, keeping its storage (`length = n` can make V8 reallocate). */
function truncate(list: unknown[], length: number): void {
  while (list.length > length) list.pop();
}

/** Keeps a body where it is for this tick. */
function hold(s: BodyState): void {
  s.vx = 0;
  s.vy = 0;
  s.angularVelocity = 0;
}

/** Even-odd crossing test of the ball's center against a closed outline (research 2.7). */
function insidePolygon(edges: readonly Edge[], b: Ball): boolean {
  const x = b.x;
  const y = b.y;
  let inside = false;
  for (const e of edges) {
    if (e.ay > y !== e.by > y) {
      const cross = e.ax + ((y - e.ay) * (e.bx - e.ax)) / (e.by - e.ay);
      if (x < cross) inside = !inside;
    }
  }
  return inside;
}
