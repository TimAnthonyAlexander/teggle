// The play screen (#/play/<level path>): one level, start to finish. The attempt and its world
// step at the fixed 100 ticks per second; the renderer reads them every frame and interpolates.
// Nothing flows back into the simulation except the recorded inputs: the launch direction and
// the tick it leaves at. Slow motion and fast forward only change how many ticks run per second.
//
// Controls (spec 4, 14.1): the cannon follows the mouse; a click fires; the wheel and arrow keys
// fine-tune; holding the right button or the green button runs the game 8x between shots. On
// touch, the cannon points at the finger while it is down and follows it as it moves, a quick
// tap fires there, and a tap on the cannon fires without re-aiming; a pen press fires where it
// lands as a tap does. Escape or the menu button pauses. While the Flippers stand
// (spec 7), holding the left button, Space, Shift, Z or X, or a finger anywhere on the board
// raises them; during a shot a touch only works the flippers.

import { Attempt } from '../../rules/attempt';
import type { RulesEvent } from '../../rules/events';
import { BASE_POWERS } from '../../rules/powers';
import { meterLevelSteps, meterSegments } from '../../rules/scoring';
import { aimDirection } from '../../sim/aim';
import { TrajectoryPreview } from '../../sim/preview';
import { CANNON_PIVOT_Y } from '../../sim/tuning';
import { masterPortraits, type PortraitImage } from '../art/masters';
import { audioBus } from '../audio/bus';
import { hoverCue, setGamePaused } from '../audio/cues';
import { minTarget } from '../app/display';
import type { Input, PointerEventInfo } from '../app/input';
import { levelBusy } from '../app/offline';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { OptionsDialog } from '../menus/options';
import { WORLD_H, WORLD_W, boardFrame, layout, machineLayout, type MachineLayout } from '../layout';
import {
  drawBucket,
  drawCatchGlow,
  drawFeverBuckets,
  drawFeverLandingGlow,
  drawFlippers,
} from '../render/buckets';
import { drawFrameShadow } from '../render/frame';
import { drawMachine } from '../render/machine';
import type { Ctx } from '../render/paint';
import { hitCircle, type ButtonState } from '../ui/controls';
import { themeAt, type Theme } from '../ui/tokens';
import { AimController, ARROW_STEP, WHEEL_STEP } from '../play/aim';
import type { BackdropPainter } from '../play/backdrop';
import { BoardRenderer } from '../play/board';
import { autoFlipper, installDebug, FrameStats, type AimGoal } from '../play/debug';
import { Dialog, type DialogAction, type DialogLabels } from '../play/dialogs';
import { MasterFace } from '../play/face';
import { FeverShow } from '../play/fever';
import type { PlayHost } from '../play/host';
import type { LoadedLevel } from '../play/load';
import { Overlay } from '../play/overlay';
import { PowerShow, type BannerState } from '../play/powers';
import { CATCH_MS, GONE, Presenter } from '../play/presenter';
import { ScoreLedger } from '../play/summary';
import { lastOrangeClose, SLOW_MOTION_LEAD_TICKS } from '../play/timing';
import { SPARK, WHITE } from '../play/particles';
import type { CompiledLevel } from '../../sim/compile';
import type { BallView } from '../../sim/world';

/** Keys that raise the flippers while held. */
const FLIPPER_KEYS = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyZ', 'KeyX'] as const;
/** With the Guide, the wheel and arrow keys aim this much finer (research 4.5). */
const GUIDE_FINE_AIM = 0.25;

/** A touch that moved less than this (world units) and was short counts as a tap. */
const TAP_SLOP = 7;
const TAP_MS = 350;
/** Taps this close to the portrait center fire without re-aiming (the cannon itself). */
const LAUNCHER_TAP_RADIUS = 58;
/** Machine fade while the camera zooms: gone by this much zoom. */
const MACHINE_FADE_ZOOM = 0.14;
const GUIDE_MAX_TICKS = 80;
const GUIDE_DOT_STEP = 5;

interface MutableMachine {
  theme: Theme;
  ballCounter: {
    balls: number;
    columnBalls: number;
    shotScore: number;
    freeBall?: { stage: 1 | 2 | 3; tMs: number; showPoints: boolean };
    timeMs: number;
  };
  fever: {
    orangeHit: number;
    segments: number;
    steps: readonly (readonly [number, number])[];
    sinceHitMs?: number;
    timeMs: number;
  };
  scoreLeft: { line1: string; line2: string; value: number };
  scoreRight: { line1: string; line2: string; value: number };
  power: BannerState;
  cannonAngle: number;
  cannonLoaded: boolean;
  menuButton: ButtonState;
  holdButton: ButtonState;
  timeMs: number;
  portrait: PortraitImage | null;
  machine: MachineLayout;
}

export class PlayScreen implements Screen {
  private app: AppServices | null = null;
  private readonly level: CompiledLevel;
  private attempt: Attempt;
  private tries = 1;
  private readonly aim = new AimController();
  private readonly pres: Presenter;
  private readonly fever = new FeverShow(audioBus);
  private readonly board: BoardRenderer;
  private readonly overlay = new Overlay();
  private ledger = new ScoreLedger();
  private readonly preview: TrajectoryPreview;
  private guideCount = 0;
  private guideBounce = false;
  private readonly powers: PowerShow;
  private readonly flipperPrev = new Float64Array(2);
  /** Rules events waiting while the Lucky Spin wheel turns. */
  private held: RulesEvent[] = [];
  private flipperHeld = false;
  private dialog: Dialog | null = null;
  /** The options dialog, opened from the pause dialog. */
  private options: OptionsDialog | null = null;
  private readonly face = new MasterFace();
  /** The attempt's first shot was reported to the host; its end was. */
  private attemptCounted = false;
  private endReported = false;
  /** A shot has left the cannon on this screen (any attempt). */
  private shotTaken = false;
  private readonly theme: Theme;
  private readonly pivotX: number;
  private readonly pivotY: number;
  /** The board area the Fever buckets and flippers span (layout.boardFrame). */
  private readonly frame: { readonly x: number; readonly w: number };
  /** The machine around the board: Teggle's, or a narrower one for a narrower board. */
  private readonly frameLayout: MachineLayout;
  /** Real time of the show (stops while paused) and of the UI (always runs), ms. */
  private showMs = 0;
  private uiMs = 0;
  private fireRequest: 'mouse' | 'touch' | null = null;
  private tapFire = false;
  /** The aiming finger's pointer id, or null. Any number is a valid id: iOS Safari's are negative. */
  private touchId: number | null = null;
  private touchStart = 0;
  private touchMoved = 0;
  private touchOnLauncher = false;
  /** Where the aiming finger is now, world units. */
  private fingerX = 0;
  private fingerY = 0;
  private lastPointerX = Number.NaN;
  private lastPointerY = Number.NaN;
  private bestScore = 0;
  private fullClearShown = false;
  private tipIndex = Math.floor(Math.random() * 1000);
  private readonly stats = new FrameStats();
  private lastFrameAt = -1;
  /** Resolution the effect sprites were last built at. */
  private prebuiltK = 0;
  private removeDebug: () => void = () => undefined;
  // DEV checks: a shot to fire at an exact tick, the automatic flipper button, and a hold on
  // the whole screen so a screenshot catches one exact frame.
  private scheduledFire: { angle: number; tick: number } | null = null;
  private autoFlip = false;
  private frozen = false;
  private readonly bucketState = { x: 0, pyramid: false, covered: false };
  private readonly feverBucketState: { fullClear: boolean; litIndex?: number; rise: number } = {
    fullClear: false,
    rise: 1,
  };
  private readonly feverRiseFrom: number;
  private readonly freeBallState: { stage: 1 | 2 | 3; tMs: number; showPoints: boolean } = {
    stage: 1,
    tMs: 0,
    showPoints: false,
  };
  private readonly machine: MutableMachine;
  /** Paints what lies under the pegs: the level's picture and the frame's inner shadow. */
  private readonly under = (ctx: Ctx, k: number): void => {
    this.backdrop(ctx, k);
    drawFrameShadow(ctx, k, this.frameLayout);
  };

  constructor(
    private readonly loaded: LoadedLevel,
    private readonly backdrop: BackdropPainter,
    private readonly host: PlayHost,
    first: Attempt,
  ) {
    this.level = loaded.compiled;
    this.attempt = first;
    this.board = new BoardRenderer(this.level);
    this.frameLayout = machineLayout(this.level.width);
    this.pres = new Presenter(
      this.level,
      audioBus,
      this.board.offX,
      this.board.offY,
      this.frameLayout.inset,
    );
    this.powers = new PowerShow(
      audioBus,
      host.power,
      this.board.offX,
      this.board.offY,
      this.pres.particles,
    );
    this.preview = new TrajectoryPreview(this.level, GUIDE_MAX_TICKS);
    this.theme = themeAt(host.theme);
    this.pivotX = this.board.offX + this.level.width / 2;
    this.pivotY = this.board.offY + CANNON_PIVOT_Y;
    this.frame = boardFrame(this.level.width);
    const divider = this.level.feverBodies.find(
      (i) => this.level.bodies[i]?.role === 'feverDivider',
    );
    // Where the Fever parts wait below the board before they rise (a fresh world's pose).
    this.feverRiseFrom = divider === undefined ? 0 : (first.world.bodies[divider]?.y ?? 0);
    this.machine = {
      theme: this.theme,
      ballCounter: { balls: 0, columnBalls: 0, shotScore: 0, timeMs: 0 },
      fever: {
        orangeHit: 0,
        segments: meterSegments(first.config.orangeCount),
        steps: meterLevelSteps(first.config.orangeCount),
        timeMs: 0,
      },
      scoreLeft: { ...host.left, value: 0 },
      scoreRight: { ...host.right, value: 0 },
      power: { name: '', active: false },
      cannonAngle: 0,
      cannonLoaded: true,
      menuButton: 'normal',
      holdButton: 'normal',
      timeMs: 0,
      portrait: null,
      machine: this.frameLayout,
    };
    this.startAttempt(first);
  }

  /** Makes the attempt a screen starts with, as the host plans it. */
  static firstAttempt(loaded: LoadedLevel, host: PlayHost): Attempt {
    return PlayScreen.makeAttempt(loaded, host, 1);
  }

  private static makeAttempt(loaded: LoadedLevel, host: PlayHost, screenTry: number): Attempt {
    const { seed, config } = host.plan(screenTry);
    return new Attempt(
      loaded.compiled,
      { levelId: loaded.path, seed, config },
      { powers: BASE_POWERS },
    );
  }

  // -------------------------------------------------------------------------------------------
  // Screen

  enter(app: AppServices): void {
    this.app = app;
    if (this.host.power !== null) void masterPortraits.preload(this.host.power);
    const h = this.frameLayout.holdButton;
    app.input.setHoldControl('fastForward', (x, y, kind) =>
      hitCircle(h.x, h.y, roundTarget(h.r, kind === 'touch'), x, y),
    );
    this.removeDebug = installDebug({
      snapshot: () => this.snapshot(),
      setAim: (a) => {
        if (!Number.isFinite(a)) return;
        this.aim.set(a);
        this.lastPointerX = app.input.pointer.x;
        this.lastPointerY = app.input.pointer.y;
      },
      pickAim: (goal) => this.pickAim(goal ?? 'best'),
      searchAim: (goal, maxWait, fire) => {
        const tick = this.attempt.world.tick;
        const found = this.searchAim(goal, maxWait ?? 0);
        if (found !== null && fire === true) {
          this.scheduledFire = { angle: found.angle, tick: tick + found.wait };
        }
        return found;
      },
      fire: (angle, wait) => {
        if (!Number.isFinite(angle) || this.attempt.phase !== 'aim') return false;
        this.scheduledFire = { angle, tick: this.attempt.world.tick + Math.max(0, wait ?? 0) };
        return true;
      },
      setAutoFlip: (on) => {
        this.autoFlip = on;
      },
      setFrozen: (on) => {
        this.frozen = on;
      },
      perf: (reset) => {
        const summary = this.stats.summary();
        if (reset === true) this.stats.reset();
        return summary;
      },
    });
  }

  exit(): void {
    const app = this.app;
    if (app !== null) {
      app.input.removeHoldControl('fastForward');
      app.clock.timeScale = 1;
      app.clock.fastForward = false;
    }
    this.removeDebug();
    this.app = null;
    setGamePaused(false);
    // Safari counts a dropped canvas against its budget until it is collected (render/cache.ts).
    this.board.release();
    this.overlay.release();
  }

  letterbox(): string {
    return this.theme.dark;
  }

  /** A newer build waits until this level is left once it has taken a shot (app/offline.ts). */
  busy(): boolean {
    return levelBusy(this.shotTaken, this.host.challenge?.laterLevel === true);
  }

  /**
   * The page was hidden or the phone turned upright: a level in progress waits behind the pause
   * dialog, and its music and long sounds stop at once (spec 14.2, mobile pass). A level that
   * is over keeps its end dialog.
   */
  interrupt(): void {
    if (this.app === null || this.dialog !== null || this.pres.endRequest !== null) return;
    this.openPause();
    setGamePaused(true);
  }

  // -------------------------------------------------------------------------------------------
  // Attempts

  private startAttempt(attempt: Attempt): void {
    this.attempt = attempt;
    this.machine.fever.segments = meterSegments(attempt.config.orangeCount);
    this.machine.fever.steps = meterLevelSteps(attempt.config.orangeCount);
    this.ledger = new ScoreLedger();
    this.pres.reset(attempt);
    this.powers.reset(attempt.world);
    this.held = [];
    this.flipperHeld = false;
    this.fever.reset();
    this.overlay.resetAttempt();
    this.dialog = null;
    this.options = null;
    this.face.reset();
    this.attemptCounted = false;
    this.endReported = false;
    this.fireRequest = null;
    this.tapFire = false;
    this.fullClearShown = false;
    this.guideCount = 0;
    this.board.capture(attempt.world);
    this.updateGuide();
    if (this.app !== null) this.app.clock.timeScale = 1;
  }

  private retry(): void {
    this.bestScore = Math.max(this.bestScore, this.attempt.score);
    this.tries++;
    this.tipIndex++;
    this.startAttempt(PlayScreen.makeAttempt(this.loaded, this.host, this.tries));
  }

  private canFire(): boolean {
    return (
      this.attempt.phase === 'aim' &&
      this.pres.ready &&
      this.dialog === null &&
      !this.fever.active &&
      !this.powers.holding &&
      this.attempt.ballsLeft > 0
    );
  }

  private launch(mouse: boolean): void {
    const angle = this.aim.shotAngle(mouse);
    const direction = aimDirection(angle);
    this.guideCount = 0;
    if (this.powers.zenReady(this.attempt)) {
      // Zen Ball searches first; the shot leaves once the cannon has swung (step).
      this.powers.startZen(this.attempt, direction, angle);
      return;
    }
    this.attempt.launch(direction);
    this.consumeRules();
  }

  /** Zen Ball's search is done: the player's shot leaves along the direction it found. */
  private launchZen(direction: { x: number; y: number }, angle: number): void {
    if (this.attempt.phase !== 'aim') return;
    this.attempt.launch(direction);
    this.aim.angle = angle;
    this.aim.prev = angle;
    this.consumeRules();
  }

  private consumeRules(): void {
    const events = this.attempt.takeEvents();
    if (events.length === 0) return;
    for (const e of events) this.held.push(e);
    this.drainHeld();
  }

  /** Hands the waiting rules events to the show, until the Lucky Spin wheel holds the rest. */
  private drainHeld(): void {
    let n = 0;
    while (n < this.held.length && !this.powers.holding) {
      const e = this.held[n++];
      if (e === undefined) break;
      this.ledger.add(e);
      if (e.type === 'fever') this.onFever(e);
      this.report(e);
      this.face.handle(e, this.showMs);
      this.powers.handle(e, this.attempt);
      this.pres.handle(e, this.attempt);
    }
    if (n > 0) this.held.splice(0, n);
    this.powers.noteHeld(this.held);
  }

  /** Tells the host about the attempt's first shot and its result, once each. */
  private report(e: RulesEvent): void {
    if (e.type === 'shotStart' && !this.attemptCounted) {
      this.attemptCounted = true;
      this.shotTaken = true;
      this.host.attemptStarted(this.attempt);
    } else if ((e.type === 'levelWon' || e.type === 'levelLost') && !this.endReported) {
      this.endReported = true;
      this.host.attemptEnded(this.attempt, this.ledger.breakdown(this.attempt));
    }
  }

  /** The flipper button: held while the flippers stand and a shot is in play (spec 7). */
  private updateFlippers(app: AppServices): void {
    const attempt = this.attempt;
    let held = false;
    if (this.dialog === null && attempt.phase === 'shot' && attempt.world.flippers) {
      held = app.input.pointer.down;
      for (const key of FLIPPER_KEYS) held ||= app.input.isKeyDown(key);
      if (this.autoFlip) held = autoFlipper(attempt.world);
    }
    if (held === this.flipperHeld) return;
    this.flipperHeld = held;
    attempt.setFlipperInput(held);
    if (attempt.world.flippers) {
      audioBus.emit({
        type: 'powerMoment',
        power: 'flippers',
        moment: held ? 'flipperUp' : 'flipperDown',
      });
    }
  }

  private onFever(e: Extract<RulesEvent, { type: 'fever' }>): void {
    const full = this.boardCleared();
    this.fullClearShown = full;
    this.fever.hit(this.showMs, full);
    this.pres.feverHit(e.x, e.y);
  }

  /** Every peg and brick is lit or gone. */
  private boardCleared(): boolean {
    const bodies = this.attempt.world.bodies;
    for (const i of this.level.scoringBodies) {
      const b = bodies[i];
      if (b !== undefined && b.active && !b.lit) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Tick

  step(): void {
    const app = this.app;
    if (app === null || this.dialog?.kind === 'pause' || this.frozen) return;
    if (this.dialog === null) {
      const axis = app.input.arrowAxis;
      if (axis !== 0) this.aim.nudge(axis * ARROW_STEP * this.aimFineness());
    }
    this.aim.tick();
    if (this.fireRequest !== null) {
      if (this.canFire()) this.launch(this.fireRequest === 'mouse');
      this.fireRequest = null;
    }
    if (this.tapFire && this.aim.arrived) {
      this.tapFire = false;
      if (this.canFire()) this.launch(false);
    }
    const zen = this.powers.takeZenLaunch();
    if (zen !== null) this.launchZen(zen.direction, zen.angle);
    const planned = this.scheduledFire;
    if (planned !== null && this.attempt.world.tick >= planned.tick) {
      this.scheduledFire = null;
      if (this.canFire()) {
        this.aim.set(planned.angle);
        this.launch(false);
      }
    }

    const attempt = this.attempt;
    const world = attempt.world;
    this.board.capture(world);
    // The Lucky Spin wheel and Zen Ball's search hold the board; the show goes on meanwhile.
    if (!this.powers.holding) this.drainHeld();
    const holding = this.powers.holding;
    if (!holding) {
      this.updateFlippers(app);
      this.captureFlippers();
      attempt.step();
      this.pres.handleSim(world.events);
      this.powers.handleSim(world.events, world);
      this.consumeRules();
    }

    // Slow motion as the ball closes in on the last orange peg or will pass it very close (spec
    // 6); once it is on, a ball that is no longer headed for the peg or close to it has missed.
    if (!holding && attempt.phase === 'shot' && attempt.orangeLeft === 1) {
      if (!this.fever.active) {
        const look = attempt.lastOrangeLook(SLOW_MOTION_LEAD_TICKS);
        if (lastOrangeClose(look.hitIn, look.gap)) this.fever.approach(this.showMs);
      } else if (this.fever.closingIn) {
        const look = attempt.lastOrangeLook(SLOW_MOTION_LEAD_TICKS);
        if (!lastOrangeClose(look.hitIn, look.gap)) this.fever.miss(this.showMs);
      }
    }
    if (attempt.fever && !this.fullClearShown && world.ballsInPlay > 0 && this.boardCleared()) {
      this.fullClearShown = true;
      this.fever.fullClear(this.showMs);
    }
    this.fever.tick();
    if (this.fever.trailOn && !holding) {
      const ball = world.balls[0];
      if (ball !== undefined && attempt.phase === 'shot') {
        const x = ball.x + this.board.offX;
        const y = ball.y + this.board.offY;
        this.fever.record(x, y);
        const tint = Math.floor(Math.random() * 7);
        this.pres.particles.spawn(
          x + (Math.random() - 0.5) * 6,
          y + (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          30,
          SPARK,
          Math.random() < 0.25 ? WHITE : tint,
          0.6,
        );
      } else {
        this.fever.shrinkTrail();
      }
    }
    this.pres.tick(attempt);
    this.powers.tick(attempt);
    if (this.pres.endRequest !== null && this.dialog === null) this.openEnd(this.pres.endRequest);
    this.updateGuide();
  }

  /** Fine aim step factor: finer with the Guide's long guide. */
  private aimFineness(): number {
    return this.guideBounce ? GUIDE_FINE_AIM : 1;
  }

  private updateGuide(): void {
    if (!this.canFire()) {
      this.guideCount = 0;
      return;
    }
    const guide = this.attempt.aimGuide();
    this.guideBounce = guide.throughFirstBounce;
    this.guideCount = this.preview.run(this.attempt.world, aimDirection(this.aim.angle), {
      ticks: Math.min(GUIDE_MAX_TICKS, guide.ticks),
      throughFirstBounce: guide.throughFirstBounce,
    });
  }

  private openEnd(kind: 'won' | 'lost'): void {
    const breakdown = this.ledger.breakdown(this.attempt);
    this.bestScore = Math.max(this.bestScore, this.attempt.score);
    // A challenge run that is over has its own end dialog.
    const view = this.host.challenge?.end(this.attempt, breakdown) ?? null;
    if (view !== null) {
      this.dialog = new Dialog(
        'challenge',
        this.uiMs,
        breakdown,
        this.tries,
        this.tipIndex,
        this.dialogLabels(null),
        view,
      );
      audioBus.emit({ type: 'dialogMove' });
      return;
    }
    const d = new Dialog(
      kind === 'won' ? 'complete' : 'failed',
      this.uiMs,
      breakdown,
      this.tries,
      this.tipIndex,
      this.dialogLabels(kind === 'won' ? this.host.totalAfter(this.attempt.score) : null),
    );
    d.orangeLeft = this.attempt.orangeLeft;
    this.dialog = d;
    audioBus.emit({ type: 'dialogMove' });
  }

  private dialogLabels(total: number | null): DialogLabels {
    const restart = this.host.challenge?.restart.label;
    return {
      next: this.host.next.label,
      quit: this.host.quit.label,
      total,
      ...(restart === undefined ? {} : { restart }),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Input (per frame, so it works while slow motion runs no tick in a frame)

  private handleInput(): void {
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const now = this.uiMs;
    if (this.options !== null) {
      // The options dialog over the pause dialog takes every input until it closes.
      if (!this.options.update(input, now)) this.options = null;
      return;
    }
    for (const code of input.consumeKeys()) {
      if (code === 'Escape' || code === 'KeyP') {
        if (this.dialog?.kind === 'pause') this.closePause();
        else if (this.dialog === null) this.openPause();
      } else if ((code === 'Enter' || code === 'Space') && this.dialog !== null) {
        const action = this.dialog.primary();
        if (action !== null) this.act(action);
      }
    }
    // Presses and releases in the order they happened, so two quick taps in one slow frame stay
    // two taps.
    for (const { press, e } of input.consumePointer()) {
      if (press) this.onPress(e, now);
      else this.onRelease(e, now, input);
    }
    this.applyDrag(input);
    const pointer = input.pointer;
    if (pointer.kind !== 'touch' && pointer.inside && this.dialog === null) {
      if (pointer.x !== this.lastPointerX || pointer.y !== this.lastPointerY) {
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        this.aim.pointAt(pointer.x, pointer.y, this.pivotX, this.pivotY, true);
      }
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0 && this.dialog === null) {
      this.aim.nudge(wheel * WHEEL_STEP * this.aimFineness());
    }
  }

  private onPress(p: PointerEventInfo, now: number): void {
    const touch = p.kind === 'touch';
    if (this.dialog !== null) {
      if (p.crowded) this.dialog.cancel();
      else this.dialog.press(p.x, p.y, now, touch);
      return;
    }
    if (this.fever.cancellable) {
      this.fever.cancel(this.showMs);
      return;
    }
    if (p.crowded) {
      // A second finger: the touches are one gesture (a pinch, a two-finger tap), not a tap.
      this.touchId = null;
      return;
    }
    const m = this.frameLayout.menuButton;
    if (hitCircle(m.x, m.y, roundTarget(m.r, touch), p.x, p.y)) {
      audioBus.emit({ type: 'uiClick' });
      this.openPause();
      return;
    }
    if (touch) {
      // During a shot a finger works the flippers; it neither aims nor fires.
      if (this.attempt.phase !== 'aim' || this.powers.holding) return;
      this.touchId = p.id;
      this.touchStart = now;
      this.touchMoved = 0;
      this.fingerX = p.x;
      this.fingerY = p.y;
      const port = layout.portrait;
      this.touchOnLauncher = hitCircle(port.x, port.y, LAUNCHER_TAP_RADIUS, p.x, p.y);
      if (!this.touchOnLauncher) this.aim.pointAt(p.x, p.y, this.pivotX, this.pivotY, false);
    } else if (p.kind === 'pen') {
      // A pen can land without hovering first (an iPad's Pencil), so the barrel may point
      // anywhere: the press aims where it lands and fires once the barrel points there, as a
      // tap does; on the launcher it fires without re-aiming.
      if (this.attempt.phase !== 'aim' || this.powers.holding) return;
      const port = layout.portrait;
      if (hitCircle(port.x, port.y, LAUNCHER_TAP_RADIUS, p.x, p.y)) {
        this.fireRequest = 'touch';
      } else {
        this.aim.pointAt(p.x, p.y, this.pivotX, this.pivotY, false);
        this.tapFire = true;
      }
    } else {
      // A click fires where the barrel points: the pointer already aimed it, and a click
      // must not undo fine aim from the wheel or the arrow keys.
      this.fireRequest = 'mouse';
    }
  }

  private onRelease(r: PointerEventInfo, now: number, input: Input): void {
    if (this.dialog !== null) {
      if (r.crowded) {
        this.dialog.cancel();
        return;
      }
      const action = this.dialog.release(r.x, r.y, now, r.kind === 'touch');
      if (action !== null) this.act(action);
      return;
    }
    if (r.kind === 'touch' && r.id === this.touchId) {
      // The finger's last moves count before deciding whether it was a tap.
      this.applyDrag(input);
      this.touchId = null;
      if (!r.crowded && this.touchMoved <= TAP_SLOP && now - this.touchStart < TAP_MS) {
        if (this.touchOnLauncher) this.fireRequest = 'touch';
        else this.tapFire = true;
      }
    }
  }

  /**
   * The cannon follows the aiming finger: only that finger, not a resting palm or a second one.
   * A finger that started on the launcher aims once it has moved past the tap slop.
   */
  private applyDrag(input: Input): void {
    const id = this.touchId;
    const drag = input.consumeDrag(id ?? undefined);
    if (id === null || (drag.dx === 0 && drag.dy === 0)) return;
    this.fingerX += drag.dx;
    this.fingerY += drag.dy;
    this.touchMoved += Math.abs(drag.dx) + Math.abs(drag.dy);
    if (this.touchOnLauncher && this.touchMoved <= TAP_SLOP) return;
    this.aim.pointAt(this.fingerX, this.fingerY, this.pivotX, this.pivotY, false);
  }

  private act(action: DialogAction): void {
    audioBus.emit({ type: 'uiClick' });
    switch (action) {
      case 'resume':
        this.closePause();
        break;
      case 'restart':
        // A challenge starts its whole run over; the other modes play the level again here.
        if (this.host.challenge !== undefined) this.app?.navigate(this.host.challenge.restart.hash);
        else this.retry();
        break;
      case 'retry':
        this.retry();
        break;
      case 'continue':
        if (this.host.next.hash === null) this.retry();
        else this.app?.navigate(this.host.next.hash);
        break;
      case 'options':
        this.options = new OptionsDialog(this.uiMs);
        break;
      case 'quit':
        this.app?.navigate(this.host.quit.hash);
        break;
      case 'challengePrimary':
      case 'challengeSecondary': {
        const view = this.dialog?.challenge ?? null;
        if (view === null) break;
        const to = action === 'challengePrimary' ? view.primary : view.secondary;
        this.app?.navigate(to.hash);
        break;
      }
    }
  }

  private openPause(): void {
    this.dialog = new Dialog('pause', this.uiMs, null, this.tries, 0, this.dialogLabels(null));
    this.fireRequest = null;
    this.tapFire = false;
    this.touchId = null;
  }

  private closePause(): void {
    if (this.dialog?.kind !== 'pause') return;
    this.dialog = null;
    // A finished level goes back to its end dialog.
    const end = this.pres.endRequest;
    if (end !== null) this.openEnd(end);
  }

  // -------------------------------------------------------------------------------------------
  // Frame

  render(f: FrameInfo): void {
    const app = this.app;
    if (app === null) return;
    const t0 = performance.now();
    const frameMs = Math.min(100, Math.max(0, f.frameMs));
    this.uiMs += frameMs;
    const paused = this.dialog?.kind === 'pause' || this.frozen;
    setGamePaused(paused);
    if (!paused) this.showMs += frameMs;
    this.handleInput();
    const attempt = this.attempt;
    const world = attempt.world;
    this.fever.frame(this.showMs, world.ballsInPlay > 0);
    this.powers.frame(this.showMs, paused);
    app.clock.timeScale = this.fever.speed;
    app.clock.fastForward =
      app.input.fastForwardHeld &&
      this.dialog === null &&
      !this.fever.active &&
      attempt.phase !== 'shot';

    const { ctx, k } = f;
    if (k !== this.prebuiltK) {
      // Effect sprites and callout lettering, built now rather than on an effect's first frame.
      this.prebuiltK = k;
      this.powers.prebuild(k, this.overlay.sprites);
      this.overlay.prebuildCallouts(k);
    }
    const alpha = paused || this.powers.holding ? 1 : f.alpha;
    this.renderAlpha = alpha;
    const zoom = this.fever.zoom(this.showMs);
    const machineAlpha = 1 - Math.min(1, Math.max(0, (zoom - 1) / MACHINE_FADE_ZOOM));
    const zoomed = zoom > 1.0001;
    if (zoomed) {
      const ball = world.balls[0];
      if (ball !== undefined) {
        this.fever.follow(
          this.board.ballX(ball.id, ball.x, alpha) + this.board.offX,
          this.board.ballY(ball.id, ball.y, alpha) + this.board.offY,
          frameMs,
        );
      }
      // Keep the view inside the world, and inside the playfield opening once the machine has
      // faded, so the camera never shows what lies behind the frame.
      const m = 1 - machineAlpha;
      const o = this.frameLayout.opening;
      const cx = clampView(
        this.fever.focusX,
        o.x * m,
        WORLD_W - (WORLD_W - o.x - o.w) * m,
        zoom,
        WORLD_W,
      );
      const cy = clampView(this.fever.focusY, o.y * m, WORLD_H, zoom, WORLD_H);
      ctx.save();
      ctx.translate(WORLD_W / 2, WORLD_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }
    this.drawScene(ctx, k, alpha, machineAlpha);
    if (zoomed) {
      ctx.restore();
      this.overlay.drawZoomFrame(ctx, 1 - machineAlpha);
    }
    const pres = this.pres;
    this.overlay.drawTally(ctx, pres);
    this.overlay.drawWarning(ctx, pres);
    this.overlay.drawCoin(ctx, k, pres);
    this.powers.drawOver(ctx, k, this.overlay.sprites);
    this.overlay.drawFeverFinish(ctx, k, pres);
    this.overlay.drawFeverTitle(ctx, k, this.fever, this.showMs);
    if (this.dialog !== null) {
      const p = app.input.pointer;
      const over = this.options === null && this.dialog.hovering(p.x, p.y, this.uiMs);
      hoverCue(this.dialog, p.kind !== 'touch' && over);
      this.dialog.render(
        ctx,
        k,
        this.uiMs,
        p.x,
        p.y,
        p.down && this.options === null,
        p.kind === 'touch',
      );
    }
    this.options?.render(ctx, k, app.input, this.uiMs);
    const t1 = performance.now();
    const interval = this.lastFrameAt < 0 ? 16.7 : t0 - this.lastFrameAt;
    this.lastFrameAt = t0;
    this.stats.add(t1 - t0, interval);
  }

  private drawScene(ctx: Ctx, k: number, alpha: number, machineAlpha: number): void {
    const attempt = this.attempt;
    const world = attempt.world;
    const pres = this.pres;
    const board = this.board;
    // Playfield: the picture, the frame's shadow on it and the static pegs are one layer.
    board.drawStatic(ctx, k, world, pres, this.under);
    board.drawMoving(ctx, k, world, pres, alpha, this.showMs);
    board.drawLit(ctx, k, world, pres, alpha);
    board.drawPops(ctx, world, pres, alpha);
    const bucketX = board.bucketX(world, alpha);
    if (world.fever) {
      const fs = this.feverBucketState;
      fs.fullClear = pres.fever.active ? pres.fever.fullClear : this.fullClearShown;
      if (pres.fever.active && pres.fever.bucket >= 0) fs.litIndex = pres.fever.bucket;
      else delete fs.litIndex;
      fs.rise = this.feverRise();
      drawFeverBuckets(ctx, k, fs, this.frame);
      if (pres.fever.active && pres.fever.bucket >= 0) {
        drawFeverLandingGlow(ctx, pres.fever.bucket, pres.gameMs - pres.fever.t0, this.frame);
      }
    } else {
      // The bucket's parts as the show has them: a power drawn by the Lucky Spin wheel shows
      // once the wheel stops.
      const bs = this.bucketState;
      bs.x = bucketX;
      bs.pyramid = this.powers.pyramidShown;
      bs.covered = this.powers.coverShown;
      drawBucket(ctx, k, bs);
      const ct = pres.gameMs - pres.catchMs;
      if (ct >= 0 && ct < CATCH_MS) drawCatchGlow(ctx, bucketX, ct);
    }
    if (this.fever.trailCount > 1) {
      const ball = world.balls[0];
      if (ball !== undefined) {
        this.overlay.drawTrail(
          ctx,
          this.fever,
          board.ballX(ball.id, ball.x, alpha) + board.offX,
          board.ballY(ball.id, ball.y, alpha) + board.offY,
        );
      }
    }
    if (this.powers.flippersShown) this.drawFlippers(ctx, k, alpha);
    this.powers.drawUnder(ctx, k);
    board.drawBalls(ctx, world, alpha, this.showMs, this.powers.hiddenBallsFrom);
    this.powers.drawBallAuras(ctx, k, world, this.ballXAt, this.ballYAt, this.zenShotInPlay());
    pres.particles.draw(ctx, k, alpha);
    board.drawValues(ctx, k, world, pres, this.overlay.sprites, alpha);
    this.overlay.drawCallouts(ctx, k, pres);
    this.powers.drawLabels(ctx, k, this.overlay.sprites);
    if (this.guideCount > 1 && this.dialog === null) {
      const p = this.preview;
      if (this.guideBounce) {
        board.drawGuideBounce(
          ctx,
          p.points,
          this.guideCount,
          GUIDE_DOT_STEP,
          p.bounceIndex,
          p.bounceX,
          p.bounceY,
          this.showMs,
        );
      } else {
        board.drawGuide(ctx, p.points, this.guideCount, GUIDE_DOT_STEP);
      }
    }
    if (machineAlpha > 0) {
      ctx.globalAlpha = machineAlpha;
      drawMachine(ctx, k, this.machineState(alpha));
      ctx.globalAlpha = 1;
    }
    this.powers.drawOverMachine(ctx, k);
    this.powers.drawReturning(ctx, k, world, this.ballXAt, this.ballYAt, this.drawBallAt);
  }

  /** Interpolated ball positions for the power auras, in board coordinates. */
  private renderAlpha = 1;
  private readonly ballXAt = (id: number, x: number): number =>
    this.board.ballX(id, x, this.renderAlpha);
  private readonly ballYAt = (id: number, y: number): number =>
    this.board.ballY(id, y, this.renderAlpha);
  private readonly drawBallAt = (ctx: Ctx, b: BallView): void => {
    this.board.drawBall(ctx, b, this.renderAlpha, this.showMs);
  };

  /** The shot in play is a Zen Ball shot. */
  private zenShotInPlay(): boolean {
    const a = this.attempt;
    if (a.phase !== 'shot') return false;
    for (const fx of a.effects) if (fx.tag === 'zenBall' && !fx.pending) return true;
    return false;
  }

  /**
   * The Flippers in the bottom corners, at the world's flipper bodies' rotations (spec 7). The
   * art is the physics outline, so it is drawn at the body's own rotation: about 0 at rest.
   */
  private drawFlippers(ctx: Ctx, k: number, alpha: number): void {
    const bodies = this.attempt.world.bodies;
    let left = 0;
    let right = 0;
    for (const i of this.level.flipperBodies) {
      const b = bodies[i];
      if (b === undefined) continue;
      const prev = this.flipperPrev[b.def.side === 'right' ? 1 : 0] ?? b.rotation;
      const a = prev + (b.rotation - prev) * alpha;
      if (b.def.side === 'right') right = a;
      else left = a;
    }
    // They fade in from the corners when the power starts.
    const appear = this.powers.flippersAppear;
    if (appear < 1) {
      ctx.save();
      ctx.globalAlpha *= appear;
    }
    drawFlippers(ctx, k, left, right, this.frame);
    if (appear < 1) ctx.restore();
  }

  /** Flipper rotations before the tick, for interpolation. */
  private captureFlippers(): void {
    const bodies = this.attempt.world.bodies;
    for (const i of this.level.flipperBodies) {
      const b = bodies[i];
      if (b !== undefined) this.flipperPrev[b.def.side === 'right' ? 1 : 0] = b.rotation;
    }
  }

  private feverRise(): number {
    const world = this.attempt.world;
    for (const i of this.level.feverBodies) {
      const b = world.bodies[i];
      if (b?.def.role === 'feverDivider') {
        return Math.max(0, Math.min(1, (this.feverRiseFrom - b.y) / 30));
      }
    }
    return 1;
  }

  private machineState(alpha: number): MutableMachine {
    const m = this.machine;
    const pres = this.pres;
    const app = this.app;
    const loaded = this.canFire();
    m.timeMs = this.uiMs;
    const bc = m.ballCounter;
    bc.balls = pres.shownBalls;
    bc.columnBalls = Math.max(0, loaded ? pres.shownBalls - 1 : pres.shownBalls);
    bc.shotScore = pres.tubeScore;
    bc.timeMs = this.uiMs;
    const fbT = pres.gameMs - pres.freeBallMs;
    if (pres.freeBallStage > 0 && fbT >= 0 && fbT < 2400) {
      const fb = this.freeBallState;
      fb.stage = pres.freeBallStage >= 3 ? 3 : pres.freeBallStage <= 1 ? 1 : 2;
      fb.tMs = fbT;
      fb.showPoints = pres.freeBallPoints && fbT < 1100;
      bc.freeBall = fb;
    } else {
      delete bc.freeBall;
    }
    m.fever.orangeHit = pres.meterLevel;
    m.fever.sinceHitMs = pres.gameMs - pres.meterMs;
    m.fever.timeMs = this.uiMs;
    m.scoreLeft.value = pres.shownScore;
    m.scoreRight.value = this.host.rightValue(pres.shownScore, this.bestScore);
    const power = this.host.power;
    m.portrait = power === null ? null : masterPortraits.best(power, this.face.at(this.showMs));
    m.cannonAngle =
      this.powers.zenCannonAngle ?? this.aim.prev + (this.aim.angle - this.aim.prev) * alpha;
    m.cannonLoaded = loaded || this.powers.zenCannonAngle !== null;
    m.power = this.powers.bannerState(this.attempt);
    if (app !== null) {
      const p = app.input.pointer;
      const menu = this.frameLayout.menuButton;
      const hold = this.frameLayout.holdButton;
      // A finger shows no hover: where it lifted is not where it rests.
      const mouse = p.kind !== 'touch';
      const overMenu = mouse && p.inside && hitCircle(menu.x, menu.y, menu.r, p.x, p.y);
      const overHold = mouse && p.inside && hitCircle(hold.x, hold.y, hold.r, p.x, p.y);
      hoverCue(menu, overMenu);
      hoverCue(hold, overHold);
      m.menuButton = overMenu ? 'hover' : 'normal';
      m.holdButton = app.input.fastForwardHeld ? 'down' : overHold ? 'hover' : 'normal';
    }
    return m;
  }

  // -------------------------------------------------------------------------------------------
  // Dev checks

  private snapshot(): Record<string, unknown> {
    const a = this.attempt;
    let gone = 0;
    for (const i of this.level.scoringBodies) if (this.pres.state[i] === GONE) gone++;
    return {
      level: this.loaded.path,
      seed: a.seed,
      tries: this.tries,
      phase: a.phase,
      result: a.result,
      ready: this.pres.ready,
      score: a.score,
      shownScore: this.pres.shownScore,
      ballsLeft: a.ballsLeft,
      shownBalls: this.pres.shownBalls,
      shotsTaken: a.shotsTaken,
      orangeLeft: a.orangeLeft,
      fever: a.fever,
      slowMotion: this.fever.active,
      speed: this.fever.speed,
      zoom: this.fever.zoom(this.showMs),
      dialog: this.dialog?.kind ?? null,
      aim: this.aim.angle,
      pegsGone: gone,
      callouts: this.pres.callouts.filter((c) => c.active).map((c) => `${c.kind}:${c.line1}`),
      coin: this.pres.coinActive,
      breakdown: this.ledger.breakdown(a),
      ticks: a.world.tick,
      power: a.config.power,
      effects: a.effects.map((fx) => `${fx.tag}:${fx.shotsLeft}${fx.pending ? ':next' : ''}`),
      holding: this.powers.holding,
      greenHits: this.powers.greenHits,
      actions: this.powers.actions.slice(),
      ...this.powers.debugState,
      balls: a.world.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.radius })),
      flippers: a.world.flippers,
      flipperAngles: this.level.flipperBodies.map((i) => a.world.bodies[i]?.rotation ?? 0),
      flipperHeld: this.flipperHeld,
      pyramid: a.world.pyramid,
      covered: a.world.bucketCovered,
    };
  }

  /**
   * DEV: searches launch angles 0.01 rad apart after waits of 0 to `maxWait` ticks (steps of
   * 15) on a copy of the attempt that keeps its rules events, for a shot that reaches `goal`.
   * The flipper button follows autoFlipper when the automatic flipper is on, as in the real shot.
   */
  private searchAim(goal: AimGoal, maxWait: number): { angle: number; wait: number } | null {
    const base = this.attempt;
    if (base.phase !== 'aim') return null;
    const trial = base.clone();
    for (let wait = 0; wait <= maxWait; wait += 15) {
      for (let a = -1.65; a <= 1.65; a += 0.01) {
        trial.copyFrom(base);
        for (let t = 0; t < wait; t++) trial.step();
        trial.takeEvents();
        trial.launch(aimDirection(a));
        if (this.shotReaches(trial, goal)) return { angle: a, wait };
      }
    }
    return null;
  }

  private shotReaches(trial: Attempt, goal: AimGoal): boolean {
    const seen = { hit: false, loud: false };
    const read = (): void => {
      for (const e of trial.takeEvents()) {
        if ('style' in goal && e.type === 'styleShot' && e.shot === goal.style) seen.hit = true;
        if ('action' in goal && e.type === 'powerAction') {
          const detail = `${e.action}:${e.detail}`;
          if (e.action === goal.action || detail === goal.action) seen.hit = true;
        }
        if (e.type === 'pegScored' && (e.color === 'orange' || e.color === 'green')) {
          seen.loud = true;
        }
      }
      if ('returnNear' in goal) {
        for (const e of trial.world.events) {
          if (e.type === 'ballReturned' && Math.abs(e.x - goal.returnNear) < 40) seen.hit = true;
        }
      }
    };
    read();
    while (trial.phase === 'shot') {
      if (this.autoFlip) trial.setFlipperInput(trial.world.flippers && autoFlipper(trial.world));
      trial.step();
      read();
    }
    return 'quiet' in goal ? !seen.loud && trial.result === null : seen.hit;
  }

  /**
   * Searches launch angles on a trial copy of the attempt (Zen Ball does not search there): the
   * best shot, the best that lights a green peg, or one that hits nothing.
   */
  private pickAim(goal: 'best' | 'coin' | 'green'): number {
    const base = this.attempt;
    const trial = base.trialClone();
    const greens = base.pegIds('green').length;
    let best = Number.NaN;
    let bestScore = -Infinity;
    for (let a = -1.65; a <= 1.65; a += 0.01) {
      trial.copyFrom(base);
      trial.launch(aimDirection(a));
      while (trial.phase === 'shot') trial.step();
      if (goal === 'coin') {
        if (trial.shotCount === 0 && !trial.shotCaught) return a;
        continue;
      }
      if (goal === 'green' && trial.pegIds('green').length === greens) continue;
      const orange = base.orangeLeft - trial.orangeLeft;
      const score =
        (trial.result === 'won' ? 1e12 : 0) +
        orange * 1e7 +
        (trial.ballsLeft - base.ballsLeft) * 1e6 +
        (trial.score - base.score);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }
}

/** A round button's hit radius: its own, or 44 CSS px across for a finger. */
function roundTarget(r: number, touch: boolean): number {
  return touch ? Math.max(r, minTarget() / 2) : r;
}

/**
 * Camera center along one axis: the focus, kept so a view of `size / zoom` stays within
 * [lo, hi]; the middle of that range when the view is wider than it.
 */
function clampView(focus: number, lo: number, hi: number, zoom: number, size: number): number {
  const half = size / (2 * zoom);
  if (hi - lo <= 2 * half) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, focus));
}
