// The masters' powers on the play screen (spec 7, visual guide 7.4, 9.4, 12.4): the power banner
// and turns counter, the green label and starburst at a green peg, each power's effect on the
// board, the Lucky Spin wheel and Zen Ball's search and cannon swing, and the power sounds on the
// audio bus. The rules have decided everything already; this only shows it.
//
// Two powers hold the simulation for a moment, as the original does: the wheel spins while the
// board waits, and Zen Ball searches before its shot leaves (the search runs in slices over
// several frames; the rules' launch hook then finds it finished). Holding only means the play
// screen does not step the attempt, so ticks and determinism are untouched. While the wheel
// turns, nothing the rules did after the spin shows: the play screen keeps those rules events
// back, and this hides the world changes they stand for (a Multiball's ball, a Spooky return,
// the Pyramid, the dome, the flippers) until they are let through.

import type { Attempt, AttemptView } from '../../rules/attempt';
import { legibleScale } from '../app/display';
import type { RulesEvent } from '../../rules/events';
import { masterOfPower, masterOfStage } from '../../rules/masters';
import {
  isPowerId,
  LUCKY_SPIN_OUTCOMES,
  LUCKY_SPIN_POWERS,
  powerById,
  zenSearchFor,
  type PowerId,
  type ZenSearch,
} from '../../rules/powers';
import {
  BIG_BALL_RADIUS,
  FIREBALL_SHOTS,
  FLIPPER_SHOTS,
  GUIDE_SHOTS,
  LUCKY_SPIN_SHOTS,
  PYRAMID_SHOTS,
  ZEN_SHOTS,
  ZEN_STEP,
  ZEN_STEPS,
} from '../../rules/tuning';
import type { SimEvent } from '../../sim/events';
import type { BallView, World } from '../../sim/world';
import type { Vec2 } from '../../level/geometry';
import type { AudioBus, PowerMoment } from '../audio/bus';
import { CANNON_PIVOT, CENTER_X, layout } from '../layout';
import { ballSprite, drawFireball } from '../render/ball';
import { prebuildBucketLayers } from '../render/buckets';
import {
  drawFlower,
  drawGreenBurst,
  drawLuckyWheel,
  drawPoof,
  drawPyramidRays,
  drawReturnGlow,
  drawSpaceBlast,
  drawSpookyAura,
  drawZenFan,
  drawZenGlow,
  FLOWER_MS,
  GREEN_BURST_MS,
  POOF_MS,
  prebuildPowerLayers,
  PYRAMID_RAYS_MS,
  SPACE_BLAST_MS,
} from '../render/powers';
import type { Ctx } from '../render/paint';
import { ease, popIn } from '../ui/motion';
import { textStyle, type TextStyle } from '../ui/text';
import { FLAME, GOLD, GREEN, type Particles, PINK, SPARK, STAR, VIOLET, WHITE } from './particles';
import { drawTextSprite, type TextSprites } from './text-sprites';
import { TICK_MS } from './timing';

/** Lucky Spin wheel timing, real ms: grow in, spin, show the result, shrink away. */
export const WHEEL = { grow: 220, spin: 1750, hold: 850, shrink: 240 } as const;
/** Zen Ball: the cannon swings to the shot found over this long, real ms. */
export const ZEN_SWING_MS = 420;
/** Real ms of each frame Zen Ball's search may use. */
export const ZEN_FRAME_BUDGET_MS = 6;
/** Simulation ticks per slice of the search, between clock checks. */
const ZEN_SLICE_TICKS = 300;
/**
 * A Spooky Ball that comes back in at the top is drawn over the launcher housing until its top
 * edge clears the housing's lowest point, for at most this long (game ms).
 */
export const RETURN_OVER_MS = 1500;
/** The housing's lowest point: the bottom of the portrait arc (launcher.ts), world units. */
const HOUSING_BOTTOM = layout.portrait.y + 53;
/** Ball ids the show tracks per shot (Multiball adds one per green hit). */
const TRACKED_BALLS = 32;

/** Shots each lasting effect adds per green hit, for the "+3 TURNS" line. */
const ADDED: Readonly<Record<string, number>> = {
  guide: GUIDE_SHOTS,
  pyramid: PYRAMID_SHOTS,
  flippers: FLIPPER_SHOTS,
  fireball: FIREBALL_SHOTS,
  zenBall: ZEN_SHOTS,
  tripleScore: LUCKY_SPIN_SHOTS,
  bigBall: LUCKY_SPIN_SHOTS,
};
/** Effects that start with the next shot. */
const NEXT_SHOT_TAGS = new Set(['guide', 'fireball', 'zenBall', 'bigBall']);

const OUTCOME_TEXT: Readonly<Record<string, string>> = {
  bigBall: 'BIG BALL!',
  tripleScore: 'TRIPLE SCORE!',
  extraBall: 'EXTRA BALL!',
};

/** Every second line a power label can show (onEffect, onAction), for prebuilding. */
function labelLines(): string[] {
  const lines = new Set(['THIS TURN', 'NEXT TURN', 'SECOND BALL', '+1 TURN', '1 PEG', '1 ORANGE']);
  for (const n of Object.values(ADDED)) {
    lines.add(`${n} TURNS`);
    lines.add(`NEXT ${n} TURNS`);
    lines.add(`+${n} TURNS`);
  }
  return [...lines];
}

const LABEL: TextStyle = textStyle.powerLabel();
const LABEL_SMALL: TextStyle = { ...textStyle.powerLabel(), cap: 8 };
const WHEEL_RESULT: TextStyle = {
  cap: 17,
  fill: [
    [0, '#ffffff'],
    [0.45, '#fff07a'],
    [1, '#ff9a12'],
  ],
  outline: { color: '#2a0c00', width: 2.4 },
  shadow: { color: 'rgba(0,0,0,0.5)', dx: 1, dy: 2 },
  align: 'center',
  anchor: 'middle',
};

export function powerName(id: PowerId): string {
  return powerById(id).name;
}

class Label {
  active = false;
  x = 0;
  y = 0;
  t0 = 0;
  line1 = '';
  line2 = '';
}

type FxKind = 'burst' | 'blast' | 'flower' | 'poof' | 'rays';

class Fx {
  active = false;
  kind: FxKind = 'burst';
  x = 0;
  y = 0;
  t0 = 0;
  value = 0;
}

const FX_MS: Readonly<Record<FxKind, number>> = {
  burst: GREEN_BURST_MS,
  blast: SPACE_BLAST_MS,
  flower: FLOWER_MS,
  poof: POOF_MS,
  rays: PYRAMID_RAYS_MS,
};

export interface BannerState {
  name: string;
  active: boolean;
  turns?: number;
}

type ZenPhase = 'idle' | 'search' | 'swing' | 'fire';

export class PowerShow {
  /** Game time, ms: 10 per tick, like the presenter's. */
  private gameMs = 0;
  /** Real time of the show, ms (stops while paused). */
  private nowMs = 0;
  private readonly labels: Label[] = [];
  private readonly fx: Fx[] = [];
  private lastLabel: Label | null = null;
  private greenThisShot = false;
  private shotInPlay = false;
  private lastPyramid = false;
  private lastCover = false;
  private lastFlippers = false;
  /** When the flippers appeared, game ms. */
  private flippersMs = -Infinity;
  private readonly banner: BannerState = { name: '', active: false };
  /** For dev checks: green hits shown and the power actions seen, newest last. */
  greenHits = 0;
  readonly actions: string[] = [];
  // What the wheel keeps back (noteHeld): balls from this id on are not drawn yet, and returns a
  // Spooky Ball got after the spin do not show their aura yet.
  private hiddenFrom = Infinity;
  private readonly heldReturns = new Int16Array(TRACKED_BALLS);
  private heldReturnsAll = 0;
  // Spooky Balls that just came back in at the top, drawn over the housing: ball id or -1.
  private readonly returnBall = new Int32Array(4).fill(-1);
  private readonly returnMs = new Float64Array(4);
  /** Resolution the effect sprites were last built at. */
  private prebuiltK = 0;

  // Lucky Spin wheel.
  private wheelOn = false;
  private wheelT0 = 0;
  private wheelSegment = 0;
  private wheelText = '';
  private wheelTarget = 0;
  private wheelLastQuarter = 0;
  private wheelResultShown = false;

  // Zen Ball.
  private zenPhase: ZenPhase = 'idle';
  private zenSearch: ZenSearch | null = null;
  private zenDirection: Vec2 = { x: 0, y: 1 };
  private zenCenter = 0;
  private zenBest = 0;
  private zenFrom = 0;
  private zenAngle = 0;
  private zenTo = 0;
  private zenT0 = 0;
  private zenFrames = 0;
  private zenWorkMs = 0;
  /** For dev checks: the cost of the last search on this screen. */
  private lastZen: { frames: number; workMs: number; ticks: number; candidates: number } | null =
    null;

  constructor(
    private readonly audio: AudioBus,
    /** The master's power, or null for none. */
    readonly master: PowerId | null,
    readonly offX: number,
    readonly offY: number,
    private readonly particles: Particles,
  ) {
    for (let i = 0; i < 8; i++) this.labels.push(new Label());
    for (let i = 0; i < 64; i++) this.fx.push(new Fx());
    this.banner.name = master === null ? '' : powerName(master);
  }

  /**
   * For dev checks: the wheel is up, Zen Ball's state, the Spooky Balls drawn over the housing,
   * and the first ball id kept out of sight while the wheel turns.
   */
  get debugState(): {
    wheel: boolean;
    zen: string;
    lastZen: unknown;
    returning: number[];
    hiddenFrom: number | null;
  } {
    return {
      wheel: this.wheelOn,
      zen: this.zenPhase,
      lastZen: this.lastZen,
      returning: [...this.returnBall].filter((id) => id >= 0),
      hiddenFrom: Number.isFinite(this.hiddenFrom) ? this.hiddenFrom : null,
    };
  }

  reset(world: World): void {
    this.greenHits = 0;
    this.actions.length = 0;
    for (const l of this.labels) l.active = false;
    for (const f of this.fx) f.active = false;
    this.lastLabel = null;
    this.greenThisShot = false;
    this.shotInPlay = false;
    this.lastPyramid = world.pyramid;
    this.lastCover = world.bucketCovered;
    this.lastFlippers = world.flippers;
    this.flippersMs = -Infinity;
    this.wheelOn = false;
    this.zenPhase = 'idle';
    this.zenSearch = null;
    this.noteHeld([]);
    this.returnBall.fill(-1);
  }

  /**
   * Builds every sprite the power effects draw, at `k` device pixels per world unit, so no
   * effect's first frame waits for them: called when the level loads and when the resolution
   * changes. Lucky Spin can run any power, so a master's level builds them all.
   */
  prebuild(k: number, sprites: TextSprites): void {
    if (this.master === null || k === this.prebuiltK) return;
    this.prebuiltK = k;
    prebuildPowerLayers(k);
    prebuildBucketLayers(k);
    ballSprite(k, BIG_BALL_RADIUS);
    for (const id of LUCKY_SPIN_POWERS) {
      sprites.get(k, 'powerLabel', LABEL, powerName(id).toUpperCase());
      sprites.get(k, 'wheelResult', WHEEL_RESULT, `${powerName(id).toUpperCase()}!`);
    }
    sprites.get(k, 'powerLabel', LABEL, powerName('luckySpin').toUpperCase());
    for (const text of Object.values(OUTCOME_TEXT)) {
      sprites.get(k, 'wheelResult', WHEEL_RESULT, text);
    }
    for (const line of labelLines()) sprites.get(k, 'powerLabel2', LABEL_SMALL, line);
  }

  /**
   * The rules events the play screen keeps back while the wheel turns. The world already shows
   * what they did; this notes which balls and Spooky returns to keep out of sight meanwhile.
   */
  noteHeld(held: readonly RulesEvent[]): void {
    this.hiddenFrom = Infinity;
    this.heldReturns.fill(0);
    this.heldReturnsAll = 0;
    for (const e of held) {
      if (e.type !== 'powerAction') continue;
      if (e.action === 'multiball') {
        this.hiddenFrom = Math.min(this.hiddenFrom, e.value);
      } else if (e.action === 'spookyBall') {
        if (e.value < 0) this.heldReturnsAll++;
        else if (e.value < TRACKED_BALLS)
          this.heldReturns[e.value] = (this.heldReturns[e.value] ?? 0) + 1;
      }
    }
  }

  /** Balls with this id or more are not shown yet (a Multiball's ball while the wheel turns). */
  get hiddenBallsFrom(): number {
    return this.hiddenFrom;
  }

  /** The Pyramid as shown: it appears once the wheel that drew it has stopped. */
  get pyramidShown(): boolean {
    return this.lastPyramid;
  }

  /** The bucket's dome as shown. */
  get coverShown(): boolean {
    return this.lastCover;
  }

  /** The flippers as shown. */
  get flippersShown(): boolean {
    return this.lastFlippers;
  }

  /** How far the flippers have faded in since they appeared, 0 to 1. */
  get flippersAppear(): number {
    const t = this.gameMs - this.flippersMs;
    return t < 0 || t >= 200 ? 1 : 0.25 + 0.75 * (t / 200);
  }

  /** The board waits: the wheel spins or Zen Ball searches. */
  get holding(): boolean {
    return this.wheelHolds || this.zenPhase !== 'idle';
  }

  private get wheelHolds(): boolean {
    return this.wheelOn && this.nowMs - this.wheelT0 < WHEEL.grow + WHEEL.spin + WHEEL.hold;
  }

  // -------------------------------------------------------------------------------------------
  // Events

  /**
   * One rules event, in order. Returns false when the events after it must wait: the wheel has
   * started and its outcome (a free ball, lit pegs) should not show before it stops.
   */
  handle(e: RulesEvent, attempt: AttemptView): boolean {
    switch (e.type) {
      case 'shotStart': {
        this.shotInPlay = true;
        this.greenThisShot = false;
        // Ball ids start over with every shot.
        this.returnBall.fill(-1);
        const ball = attempt.world.balls[0];
        if (ball?.passThroughScoring === true) this.moment('fireball', 'fireballLaunch');
        return true;
      }
      case 'shotTally':
        this.shotInPlay = false;
        return true;
      case 'greenHit': {
        this.greenThisShot = true;
        this.greenHits++;
        const power = e.power !== null && isPowerId(e.power) ? e.power : null;
        const x = e.x + this.offX;
        const y = e.y + this.offY;
        this.addFx('burst', x, y, 0);
        this.particles.burst(x, y, 14, 2.2, [GREEN, WHITE, GREEN], rand, STAR);
        this.lastLabel = power === null ? null : this.addLabel(x, y, powerName(power));
        if (power !== null) this.audio.emit({ type: 'powerGranted', power });
        return true;
      }
      case 'effect':
        this.onEffect(e.power, e.tag, e.change, attempt);
        return true;
      case 'powerAction':
        return this.onAction(e, attempt);
      case 'pegScored': {
        if (e.cause !== 'contact') return true;
        const ball = ballOf(attempt.world, e.ball);
        if (ball?.passThroughScoring === true) {
          this.moment('fireball', 'fireballBurn');
          this.particles.burst(e.x + this.offX, e.y + this.offY, 8, 1.6, [FLAME, GOLD], rand);
        }
        return true;
      }
      default:
        return true;
    }
  }

  private onEffect(power: string, tag: string, change: string, attempt: AttemptView): void {
    if (change === 'ended') {
      if (isPowerId(power)) this.moment(power, 'powerEnd');
      return;
    }
    const label = this.lastLabel;
    if (label === null || this.gameMs - label.t0 > 20) return;
    if (change === 'granted') {
      const fx = attempt.effects.find((x) => x.power === power && x.tag === tag);
      const n = fx?.shotsLeft ?? 1;
      if (tag === 'tripleScore' || tag === 'bigBall') return;
      label.line2 = NEXT_SHOT_TAGS.has(tag)
        ? n === 1
          ? 'NEXT TURN'
          : `NEXT ${n} TURNS`
        : n === 1
          ? 'THIS TURN'
          : `${n} TURNS`;
    } else if (change === 'extended') {
      const n = ADDED[tag] ?? 1;
      label.line2 = n === 1 ? '+1 TURN' : `+${n} TURNS`;
    }
  }

  private onAction(e: Extract<RulesEvent, { type: 'powerAction' }>, attempt: AttemptView): boolean {
    const x = e.x + this.offX;
    const y = e.y + this.offY;
    const label =
      this.lastLabel !== null && this.gameMs - this.lastLabel.t0 <= 20 ? this.lastLabel : null;
    this.actions.push(e.detail === '' ? e.action : `${e.action}:${e.detail}`);
    if (this.actions.length > 12) this.actions.shift();
    switch (e.action) {
      case 'multiball':
        this.moment('multiball', 'multiballSpawn');
        this.particles.burst(x, y, 18, 2.4, [GREEN, WHITE, GOLD], rand, STAR);
        if (label !== null) label.line2 = 'SECOND BALL';
        return true;
      case 'spaceBlast':
        this.moment('spaceBlast', 'spaceBlast');
        this.addFx('blast', x, y, e.value);
        this.particles.burst(x, y, 26, 3.4, [VIOLET, WHITE, 4], rand, STAR);
        if (label !== null && e.elements.length > 0) {
          label.line2 = e.elements.length === 1 ? '1 PEG' : `${e.elements.length} PEGS`;
        }
        return true;
      case 'flowerPower': {
        this.moment('flowerPower', 'flowerPower');
        for (const id of e.elements) {
          const b = attempt.world.element(id);
          const fx = b.x + this.offX;
          const fy = b.y + this.offY;
          this.addFx('flower', fx, fy, (id * 0.77) % 6.28);
          this.particles.burst(fx, fy, 8, 1.6, [PINK, GOLD, WHITE], rand);
        }
        if (label !== null)
          label.line2 = e.elements.length === 1 ? '1 ORANGE' : `${e.elements.length} ORANGE`;
        return true;
      }
      case 'luckySpin':
        this.startWheel(e.value, e.detail);
        return false;
      case 'coverBurned':
        this.moment('fireball', 'bucketChange');
        this.particles.burst(x, y, 22, 2.6, [FLAME, GOLD, WHITE], rand);
        this.lastCover = false;
        return true;
      case 'spookyBall':
      case 'zenShot':
        return true;
    }
  }

  /** Simulation events of the tick just stepped. */
  handleSim(events: readonly SimEvent[], world: World): void {
    for (const e of events) {
      if (e.type !== 'ballReturned') continue;
      const x = e.x + this.offX;
      // Where it fell out, at the board's bottom edge, and where it comes back in at the top.
      this.addFx('poof', x, world.level.height + this.offY - 6, 0);
      this.addFx('poof', x, Math.max(e.y + this.offY, layout.opening.y + 8), 0);
      this.particles.burst(x, e.y + this.offY, 12, 1.8, [VIOLET, WHITE], rand);
      this.moment('spookyBall', 'spookyReturn');
      // It comes in at the top edge, often under the housing: draw it over the machine.
      let slot = this.returnBall.indexOf(e.ball);
      if (slot < 0) slot = this.returnBall.indexOf(-1);
      if (slot < 0) slot = 0;
      this.returnBall[slot] = e.ball;
      this.returnMs[slot] = this.gameMs;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Time

  /** One simulation tick of presentation time (also while the board is held). */
  tick(attempt: AttemptView): void {
    this.gameMs += TICK_MS;
    const world = attempt.world;
    this.expireEffects();
    // While the wheel turns, the parts a power just raised stay as they were shown.
    if (this.wheelHolds) return;
    if (world.pyramid !== this.lastPyramid) {
      this.lastPyramid = world.pyramid;
      this.moment('pyramid', 'bucketChange');
      if (world.pyramid) this.addFx('rays', world.bucketX + this.offX, layout.bucketY - 4, 0);
    }
    if (world.bucketCovered !== this.lastCover) {
      this.lastCover = world.bucketCovered;
      const spooky = attempt.effects.some((fx) => fx.power === 'spookyBall' && !fx.pending);
      this.moment(spooky ? 'spookyBall' : 'fireball', 'bucketChange');
    }
    if (world.flippers !== this.lastFlippers) {
      this.lastFlippers = world.flippers;
      if (world.flippers) this.flippersMs = this.gameMs;
    }
    // Embers off every burning ball.
    for (const b of world.balls) {
      if (!b.passThroughScoring || b.hiddenTicks > 0) continue;
      this.particles.spawn(
        b.x + this.offX + (rand() - 0.5) * b.radius,
        b.y + this.offY + (rand() - 0.5) * b.radius,
        -b.vx * 0.15 + (rand() - 0.5) * 0.6,
        -b.vy * 0.15 - rand() * 0.5,
        26 + rand() * 20,
        SPARK,
        rand() < 0.5 ? FLAME : GOLD,
        0.7 + rand() * 0.6,
        0.95,
      );
    }
  }

  /** Ends the board effects and labels that have run their time. */
  private expireEffects(): void {
    for (const f of this.fx) {
      if (f.active && this.gameMs - f.t0 >= FX_MS[f.kind]) f.active = false;
    }
    for (const l of this.labels) {
      if (l.active && this.gameMs - l.t0 > 250 + 900 + 360) l.active = false;
    }
  }

  /**
   * Once per frame, in real time: the wheel's spin and its sounds, and Zen Ball's search slices
   * and swing. `paused` freezes both.
   */
  frame(nowMs: number, paused: boolean): void {
    if (paused) return;
    this.nowMs = nowMs;
    if (this.wheelOn) this.frameWheel();
    if (this.zenPhase !== 'idle') this.frameZen();
  }

  // -------------------------------------------------------------------------------------------
  // Banner

  /**
   * Power banner over the launcher: lit while an effect runs or a green lit this shot. While the
   * wheel turns, the turns counter keeps what it showed before the spin.
   */
  bannerState(attempt: AttemptView): BannerState {
    const b = this.banner;
    if (this.wheelHolds) {
      b.active = this.master !== null;
      return b;
    }
    const effects = attempt.effects;
    let turns = -1;
    for (const fx of effects) {
      if (fx.power === this.master) {
        turns = fx.shotsLeft;
        break;
      }
    }
    if (turns < 0 && effects.length > 0) turns = effects[0]?.shotsLeft ?? -1;
    b.active =
      this.master !== null &&
      (effects.length > 0 || (this.greenThisShot && this.shotInPlay) || this.wheelOn);
    if (turns >= 0) b.turns = turns;
    else delete b.turns;
    return b;
  }

  // -------------------------------------------------------------------------------------------
  // Lucky Spin

  private startWheel(segment: number, detail: string): void {
    this.wheelOn = true;
    this.wheelT0 = this.nowMs;
    this.wheelSegment = segment;
    this.wheelText =
      segment === LUCKY_SPIN_OUTCOMES.indexOf('randomPower') && isPowerId(detail)
        ? `${powerName(detail).toUpperCase()}!`
        : (OUTCOME_TEXT[detail] ?? '');
    // Clockwise turns ending with the segment under the pointer, a little off its middle.
    this.wheelTarget = 4 * 2 * Math.PI - (segment * Math.PI) / 2 + (rand() - 0.5) * 0.9;
    this.wheelLastQuarter = 0;
    this.wheelResultShown = false;
    this.moment('luckySpin', 'spinStart');
  }

  private wheelRotation(): number {
    const t = this.nowMs - this.wheelT0 - WHEEL.grow;
    if (t <= 0) return 0;
    return this.wheelTarget * ease.outCubic(Math.min(1, t / WHEEL.spin));
  }

  private frameWheel(): void {
    const t = this.nowMs - this.wheelT0;
    const quarter = Math.floor((this.wheelRotation() + Math.PI / 4) / (Math.PI / 2));
    if (quarter !== this.wheelLastQuarter) {
      this.wheelLastQuarter = quarter;
      this.moment('luckySpin', 'spinTick');
    }
    if (!this.wheelResultShown && t >= WHEEL.grow + WHEEL.spin) {
      this.wheelResultShown = true;
      this.moment('luckySpin', 'spinResult');
    }
    if (t >= WHEEL.grow + WHEEL.spin + WHEEL.hold + WHEEL.shrink) this.wheelOn = false;
  }

  // -------------------------------------------------------------------------------------------
  // Zen Ball

  /** Zen Ball's shot is next: the next launch searches first. */
  zenReady(attempt: AttemptView): boolean {
    return attempt.effects.some((fx) => fx.tag === 'zenBall' && !fx.pending);
  }

  /** Starts the search for a shot toward `direction` (the player's aim, `angle` radians). */
  startZen(attempt: Attempt, direction: Vec2, angle: number): void {
    this.zenSearch = zenSearchFor(attempt, direction);
    this.zenDirection = direction;
    this.zenCenter = angle;
    this.zenFrom = angle;
    this.zenAngle = angle;
    this.zenTo = angle;
    this.zenT0 = this.nowMs;
    this.zenPhase = 'search';
    this.zenFrames = 0;
    this.zenWorkMs = 0;
  }

  private frameZen(): void {
    const search = this.zenSearch;
    if (this.zenPhase === 'search' && search !== null) {
      const t0 = performance.now();
      while (!search.done && performance.now() - t0 < ZEN_FRAME_BUDGET_MS) {
        search.run(ZEN_SLICE_TICKS);
      }
      this.zenFrames++;
      this.zenWorkMs += performance.now() - t0;
      // The barrel drifts toward the best shot found so far.
      const best = search.best;
      const target = Math.atan2(best.x, best.y);
      this.zenBest = target;
      this.zenAngle += (target - this.zenAngle) * 0.12;
      if (search.done) {
        this.zenPhase = 'swing';
        this.zenFrom = this.zenAngle;
        this.zenTo = target;
        this.zenT0 = this.nowMs;
        this.lastZen = {
          frames: this.zenFrames,
          workMs: this.zenWorkMs,
          ticks: search.ticks,
          candidates: search.total,
        };
        this.moment('zenBall', 'zenShot');
      }
    } else if (this.zenPhase === 'swing') {
      const t = Math.min(1, (this.nowMs - this.zenT0) / ZEN_SWING_MS);
      this.zenAngle = this.zenFrom + (this.zenTo - this.zenFrom) * ease.inOutCubic(t);
      if (t >= 1) this.zenPhase = 'fire';
    }
  }

  /** The cannon's angle while Zen Ball searches and swings, or null. */
  get zenCannonAngle(): number | null {
    return this.zenPhase === 'idle' ? null : this.zenAngle;
  }

  /**
   * The direction to launch now that Zen Ball's search is done and the cannon has swung, or
   * null. The launch must use the player's direction: the rules' hook finds the finished search
   * for it and launches along the shot found.
   */
  takeZenLaunch(): { direction: Vec2; angle: number } | null {
    if (this.zenPhase !== 'fire') return null;
    this.zenPhase = 'idle';
    this.zenSearch = null;
    return { direction: this.zenDirection, angle: this.zenTo };
  }

  /** Search progress 0 to 1 while searching. */
  get zenProgress(): number {
    const s = this.zenSearch;
    return s === null ? 0 : s.tried / Math.max(1, s.total);
  }

  // -------------------------------------------------------------------------------------------
  // Drawing

  /** Effects on the board under the balls: blasts, flowers, the Pyramid's light. */
  drawUnder(ctx: Ctx, k: number): void {
    for (const f of this.fx) {
      if (!f.active) continue;
      const t = this.gameMs - f.t0;
      switch (f.kind) {
        case 'blast':
          drawSpaceBlast(ctx, k, f.x, f.y, f.value, t);
          break;
        case 'flower':
          drawFlower(ctx, k, f.x, f.y, t, f.value);
          break;
        case 'rays':
          drawPyramidRays(ctx, k, f.x, f.y, t);
          break;
        case 'poof':
        case 'burst':
          break;
      }
    }
  }

  /**
   * Spooky Ball's poofs, over the machine: the ball comes back in at the top edge, often under
   * the launcher housing, and the smoke shows over the frame.
   */
  drawOverMachine(ctx: Ctx, k: number): void {
    for (const f of this.fx) {
      if (f.active && f.kind === 'poof') drawPoof(ctx, k, f.x, f.y, this.gameMs - f.t0);
    }
  }

  /** Auras of the balls in play: burning, spooky, zen. Drawn instead of / around the balls. */
  drawBallAuras(
    ctx: Ctx,
    k: number,
    world: World,
    ballX: (id: number, x: number) => number,
    ballY: (id: number, y: number) => number,
    zenShot: boolean,
  ): void {
    for (const b of world.balls) {
      if (b.hiddenTicks > 0 || b.id >= this.hiddenFrom) continue;
      const x = ballX(b.id, b.x) + this.offX;
      const y = ballY(b.id, b.y) + this.offY;
      if (this.returnsShown(b) > 0) {
        drawSpookyAura(ctx, k, x, y, b.vx, b.vy, b.radius, this.nowMs);
      }
      if (zenShot) drawZenGlow(ctx, k, x, y, b.radius * 2.2, this.nowMs);
    }
  }

  /** Spooky returns a ball has, without those granted after a spin that is still turning. */
  private returnsShown(b: BallView): number {
    const held = b.id < TRACKED_BALLS ? (this.heldReturns[b.id] ?? 0) : 0;
    return b.topReturns - held - this.heldReturnsAll;
  }

  /**
   * Spooky Balls that just came back in at the top, over the machine: the ball and a ghostly
   * glow, until the ball has cleared the housing. `drawBall` draws a ball at its interpolated
   * place; `ballY` gives that place's y in board coordinates.
   */
  drawReturning(
    ctx: Ctx,
    k: number,
    world: World,
    ballX: (id: number, x: number) => number,
    ballY: (id: number, y: number) => number,
    drawBall: (ctx: Ctx, b: BallView) => void,
  ): void {
    for (let s = 0; s < this.returnBall.length; s++) {
      const id = this.returnBall[s] ?? -1;
      if (id < 0) continue;
      const t = this.gameMs - (this.returnMs[s] ?? 0);
      let ball: BallView | undefined;
      for (const b of world.balls) if (b.id === id) ball = b;
      const y = ball === undefined ? Infinity : ballY(id, ball.y) + this.offY;
      if (ball === undefined || t > RETURN_OVER_MS || y - ball.radius > HOUSING_BOTTOM) {
        this.returnBall[s] = -1;
        continue;
      }
      const x = ballX(id, ball.x) + this.offX;
      drawReturnGlow(ctx, k, x, y, ball.radius, t);
      drawBall(ctx, ball);
    }
  }

  /** A burning ball, for the board's ball pass. */
  drawFireball(ctx: Ctx, x: number, y: number, vx: number, vy: number, r: number): void {
    drawFireball(ctx, x, y, vx, vy, this.nowMs, r);
  }

  /** Green bursts and power labels at the green pegs (9.4). */
  drawLabels(ctx: Ctx, k: number, sprites: TextSprites): void {
    for (const f of this.fx) {
      if (f.active && f.kind === 'burst') drawGreenBurst(ctx, k, f.x, f.y, this.gameMs - f.t0);
    }
    // On a phone the labels grow to stay legible; the second line keeps its place under the first.
    const grow = legibleScale(LABEL.cap);
    const grow2 = legibleScale(LABEL_SMALL.cap);
    for (const l of this.labels) {
      if (!l.active) continue;
      const p = popIn(this.gameMs - l.t0, 900);
      if (p.done || p.alpha <= 0) continue;
      const s = 1 + (p.scale - 1) * 0.5;
      const y = Math.max(70, l.y - 26 - (grow - 1) * 8);
      drawTextSprite(ctx, sprites.get(k, 'powerLabel', LABEL, l.line1), l.x, y, s * grow, p.alpha);
      if (l.line2.length > 0) {
        drawTextSprite(
          ctx,
          sprites.get(k, 'powerLabel2', LABEL_SMALL, l.line2),
          l.x,
          y + 12 * s * grow,
          s * grow2,
          p.alpha,
        );
      }
    }
  }

  /** The Lucky Spin wheel over the playfield, and Zen Ball's glow on the cannon. */
  drawOver(ctx: Ctx, k: number, sprites: TextSprites): void {
    if (this.zenPhase !== 'idle') {
      const p = layout.portrait;
      drawZenGlow(ctx, k, p.x, p.y, 54 + 6 * this.zenProgress, this.nowMs);
      if (this.zenPhase === 'search') {
        const reach = ZEN_STEPS * ZEN_STEP;
        drawZenFan(
          ctx,
          CANNON_PIVOT.x,
          CANNON_PIVOT.y,
          this.zenCenter - reach,
          this.zenCenter + reach,
          this.zenBest,
          this.zenProgress,
          this.nowMs,
        );
      }
    }
    if (!this.wheelOn) return;
    const t = this.nowMs - this.wheelT0;
    const total = WHEEL.grow + WHEEL.spin + WHEEL.hold;
    const scale =
      t < WHEEL.grow
        ? ease.outBack(1.4)(t / WHEEL.grow)
        : t < total
          ? 1
          : 1 - ease.outQuad(Math.min(1, (t - total) / WHEEL.shrink));
    const cx = CENTER_X;
    const cy = 300;
    drawLuckyWheel(
      ctx,
      k,
      cx,
      cy,
      this.wheelRotation(),
      scale,
      1,
      this.nowMs,
      this.wheelResultShown ? this.wheelSegment : -1,
    );
    if (this.wheelResultShown && this.wheelText !== '') {
      const p = popIn(t - WHEEL.grow - WHEEL.spin, WHEEL.hold);
      drawTextSprite(
        ctx,
        sprites.get(k, 'wheelResult', WHEEL_RESULT, this.wheelText),
        cx,
        cy + 116,
        1 + (p.scale - 1) * 0.5,
        Math.min(p.alpha, scale),
      );
    }
  }

  // -------------------------------------------------------------------------------------------

  private moment(power: PowerId, moment: PowerMoment): void {
    this.audio.emit({ type: 'powerMoment', power, moment });
  }

  private addLabel(x: number, y: number, name: string): Label {
    let slot = this.labels.find((l) => !l.active);
    slot ??= this.labels.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
    // Two labels at the same spot in one shot stack instead of overlapping.
    let yy = y;
    for (const l of this.labels) {
      if (l.active && Math.abs(l.x - x) < 90 && Math.abs(l.y - yy) < 26) yy = l.y + 28;
    }
    slot.active = true;
    slot.x = Math.max(110, Math.min(957, x));
    slot.y = yy;
    slot.t0 = this.gameMs;
    slot.line1 = name.toUpperCase();
    slot.line2 = '';
    return slot;
  }

  private addFx(kind: FxKind, x: number, y: number, value: number): void {
    let slot = this.fx.find((f) => !f.active);
    slot ??= this.fx.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.t0 = this.gameMs;
    slot.value = value;
  }
}

function ballOf(world: World, id: number): World['balls'][number] | undefined {
  for (const b of world.balls) if (b.id === id) return b;
  return undefined;
}

/**
 * The power and frame theme a route asks for: `stage` (1 to 10) picks the master, `power`
 * overrides its power; the theme is the stage master's, else the power's master's.
 */
export function routeMaster(
  stage: number | null,
  power: PowerId | null,
): { power: PowerId | null; theme: number | null } {
  const byStage = stage === null ? null : masterOfStage(stage);
  const chosen = power ?? byStage?.power ?? null;
  const theme = byStage?.theme ?? (chosen === null ? null : masterOfPower(chosen).theme);
  return { power: chosen, theme };
}

/** Presentation randomness only: never feeds the simulation. */
function rand(): number {
  return Math.random();
}
