// The play screen (#/play/<level path>): one level, start to finish. The attempt and its world
// step at the fixed 100 ticks per second; the renderer reads them every frame and interpolates.
// Nothing flows back into the simulation except the recorded inputs: the launch direction and
// the tick it leaves at. Slow motion and fast forward only change how many ticks run per second.
//
// Controls (spec 4, 14.1): the cannon follows the mouse; a click fires; the wheel and arrow keys
// fine-tune; holding the right button or the green button runs the game 8x between shots. On
// touch, a finger aims, dragging fine-tunes at a reduced rate, a quick tap fires, and a tap on
// the cannon fires without re-aiming. Escape or the menu button pauses.

import { Attempt } from '../../rules/attempt';
import { attemptConfig } from '../../rules/config';
import type { RulesEvent } from '../../rules/events';
import { aimDirection } from '../../sim/aim';
import { TrajectoryPreview } from '../../sim/preview';
import { CANNON_PIVOT_Y } from '../../sim/tuning';
import { audioBus } from '../audio/bus';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { WORLD_H, WORLD_W, layout } from '../layout';
import {
  drawBucket,
  drawCatchGlow,
  drawFeverBuckets,
  drawFeverLandingGlow,
} from '../render/buckets';
import { drawFrameShadow } from '../render/frame';
import { drawMachine } from '../render/machine';
import type { Ctx } from '../render/paint';
import { hitCircle, type ButtonState } from '../ui/controls';
import { themeAt, type Theme } from '../ui/tokens';
import { AimController, ARROW_STEP, WHEEL_STEP } from '../play/aim';
import type { BackdropPainter } from '../play/backdrop';
import { BoardRenderer } from '../play/board';
import { installDebug, FrameStats } from '../play/debug';
import { Dialog, type DialogAction } from '../play/dialogs';
import { FeverShow } from '../play/fever';
import type { LoadedLevel } from '../play/load';
import { Overlay } from '../play/overlay';
import { CATCH_MS, GONE, Presenter } from '../play/presenter';
import { ScoreLedger } from '../play/summary';
import { slowMotionDue, SLOW_MOTION_LEAD_TICKS } from '../play/timing';
import { SPARK, WHITE } from '../play/particles';
import type { CompiledLevel } from '../../sim/compile';

export interface PlayOptions {
  /** Seed of the first attempt; retries use the next seeds. Random when omitted. */
  readonly seed: number | null;
  readonly theme: number;
  /** Count tries as campaign tries for the clear bonus (spec 5). */
  readonly campaign: boolean;
  /** Balls at the start instead of 10. */
  readonly balls: number | null;
  /** Orange pegs to clear instead of 25 (challenges use 35, 45 or 55; spec 3). */
  readonly orange: number | null;
}

/** A touch that moved less than this (world units) and was short counts as a tap. */
const TAP_SLOP = 7;
const TAP_MS = 350;
/** Taps this close to the portrait center fire without re-aiming (the cannon itself). */
const LAUNCHER_TAP_RADIUS = 58;
/** Machine fade while the camera zooms: gone by this much zoom. */
const MACHINE_FADE_ZOOM = 0.14;
const GUIDE_MAX_TICKS = 80;
const GUIDE_DOT_STEP = 5;

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] ?? 1;
}

interface MutableMachine {
  theme: Theme;
  ballCounter: {
    balls: number;
    columnBalls: number;
    shotScore: number;
    freeBall?: { stage: 1 | 2 | 3; tMs: number; showPoints: boolean };
    timeMs: number;
  };
  fever: { orangeHit: number; sinceHitMs?: number; timeMs: number };
  scoreLeft: { line1: string; line2: string; value: number };
  scoreRight: { line1: string; line2: string; value: number };
  power: { name: string; active: boolean };
  cannonAngle: number;
  cannonLoaded: boolean;
  menuButton: ButtonState;
  holdButton: ButtonState;
  timeMs: number;
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
  private dialog: Dialog | null = null;
  private readonly theme: Theme;
  private readonly pivotX: number;
  private readonly pivotY: number;
  /** Real time of the show (stops while paused) and of the UI (always runs), ms. */
  private showMs = 0;
  private uiMs = 0;
  private fireRequest: 'mouse' | 'touch' | null = null;
  private tapFire = false;
  private touchId = -1;
  private touchStart = 0;
  private touchMoved = 0;
  private touchOnLauncher = false;
  private lastPointerX = Number.NaN;
  private lastPointerY = Number.NaN;
  private bestScore = 0;
  private fullClearShown = false;
  private tipIndex = Math.floor(Math.random() * 1000);
  private readonly stats = new FrameStats();
  private lastFrameAt = -1;
  private removeDebug: () => void = () => undefined;
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
    drawFrameShadow(ctx, k);
  };

  constructor(
    private readonly loaded: LoadedLevel,
    private readonly backdrop: BackdropPainter,
    private readonly options: PlayOptions,
    first: Attempt,
  ) {
    this.level = loaded.compiled;
    this.attempt = first;
    this.board = new BoardRenderer(this.level);
    this.pres = new Presenter(this.level, audioBus, this.board.offX, this.board.offY);
    this.preview = new TrajectoryPreview(this.level, GUIDE_MAX_TICKS);
    this.theme = themeAt(options.theme);
    this.pivotX = this.board.offX + this.level.width / 2;
    this.pivotY = this.board.offY + CANNON_PIVOT_Y;
    const divider = this.level.feverBodies.find(
      (i) => this.level.bodies[i]?.role === 'feverDivider',
    );
    // Where the Fever parts wait below the board before they rise (a fresh world's pose).
    this.feverRiseFrom = divider === undefined ? 0 : (first.world.bodies[divider]?.y ?? 0);
    this.machine = {
      theme: this.theme,
      ballCounter: { balls: 0, columnBalls: 0, shotScore: 0, timeMs: 0 },
      fever: { orangeHit: 0, timeMs: 0 },
      scoreLeft: { line1: 'Level', line2: 'Score', value: 0 },
      scoreRight: { line1: 'Session', line2: 'Best', value: 0 },
      power: { name: '', active: false },
      cannonAngle: 0,
      cannonLoaded: true,
      menuButton: 'normal',
      holdButton: 'normal',
      timeMs: 0,
    };
    this.startAttempt(first);
  }

  /** Makes the attempt a screen starts with: the first seed, the options' balls and campaign try. */
  static firstAttempt(loaded: LoadedLevel, options: PlayOptions): Attempt {
    return PlayScreen.makeAttempt(loaded, options, 1);
  }

  private static makeAttempt(
    loaded: LoadedLevel,
    options: PlayOptions,
    tryNumber: number,
  ): Attempt {
    const seed = options.seed === null ? randomSeed() : (options.seed + tryNumber - 1) >>> 0;
    const config = attemptConfig({
      ...(options.balls === null ? {} : { balls: options.balls }),
      ...(options.orange === null ? {} : { orangeCount: options.orange }),
      campaignTry: options.campaign ? tryNumber : null,
    });
    return new Attempt(loaded.compiled, { levelId: loaded.path, seed, config });
  }

  // -------------------------------------------------------------------------------------------
  // Screen

  enter(app: AppServices): void {
    this.app = app;
    const h = layout.holdButton;
    app.input.setHoldControl('fastForward', (x, y) => hitCircle(h.x, h.y, h.r, x, y));
    this.removeDebug = installDebug({
      snapshot: () => this.snapshot(),
      setAim: (a) => {
        if (!Number.isFinite(a)) return;
        this.aim.set(a);
        this.lastPointerX = app.input.pointer.x;
        this.lastPointerY = app.input.pointer.y;
      },
      pickAim: (goal) => this.pickAim(goal ?? 'best'),
      perf: () => this.stats.summary(),
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
  }

  letterbox(): string {
    return this.theme.dark;
  }

  // -------------------------------------------------------------------------------------------
  // Attempts

  private startAttempt(attempt: Attempt): void {
    this.attempt = attempt;
    this.ledger = new ScoreLedger();
    this.pres.reset(attempt);
    this.fever.reset();
    this.overlay.resetAttempt();
    this.dialog = null;
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
    this.startAttempt(PlayScreen.makeAttempt(this.loaded, this.options, this.tries));
  }

  private canFire(): boolean {
    return (
      this.attempt.phase === 'aim' &&
      this.pres.ready &&
      this.dialog === null &&
      !this.fever.active &&
      this.attempt.ballsLeft > 0
    );
  }

  private launch(mouse: boolean): void {
    const angle = this.aim.shotAngle(mouse);
    this.attempt.launch(aimDirection(angle));
    this.consumeRules();
    this.guideCount = 0;
  }

  private consumeRules(): void {
    const events = this.attempt.takeEvents();
    if (events.length === 0) return;
    for (const e of events) {
      this.ledger.add(e);
      if (e.type === 'fever') this.onFever(e);
    }
    this.pres.handleRules(events, this.attempt);
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
    if (app === null || this.dialog?.kind === 'pause') return;
    if (this.dialog === null) {
      const axis = app.input.arrowAxis;
      if (axis !== 0) this.aim.nudge(axis * ARROW_STEP);
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

    const attempt = this.attempt;
    const world = attempt.world;
    this.board.capture(world);
    attempt.step();
    this.pres.handleSim(world.events);
    this.consumeRules();

    // Slow motion as the ball closes in on the last orange peg (spec 6).
    if (attempt.phase === 'shot' && !this.fever.active && attempt.orangeLeft === 1) {
      if (slowMotionDue(attempt.ticksToLastOrange(SLOW_MOTION_LEAD_TICKS))) {
        this.fever.approach(this.showMs);
      }
    }
    if (attempt.fever && !this.fullClearShown && world.ballsInPlay > 0 && this.boardCleared()) {
      this.fullClearShown = true;
      this.fever.fullClear(this.showMs);
    }
    this.fever.tick();
    if (this.fever.trailOn) {
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
    if (this.pres.endRequest !== null && this.dialog === null) this.openEnd(this.pres.endRequest);
    this.updateGuide();
  }

  private updateGuide(): void {
    if (!this.canFire()) {
      this.guideCount = 0;
      return;
    }
    const guide = this.attempt.aimGuide();
    this.guideCount = this.preview.run(this.attempt.world, aimDirection(this.aim.angle), {
      ticks: Math.min(GUIDE_MAX_TICKS, guide.ticks),
      throughFirstBounce: guide.throughFirstBounce,
    });
  }

  private openEnd(kind: 'won' | 'lost'): void {
    const breakdown = this.ledger.breakdown(this.attempt);
    this.bestScore = Math.max(this.bestScore, this.attempt.score);
    const d = new Dialog(
      kind === 'won' ? 'complete' : 'failed',
      this.uiMs,
      breakdown,
      this.tries,
      this.tipIndex,
    );
    d.orangeLeft = this.attempt.orangeLeft;
    this.dialog = d;
    audioBus.emit({ type: 'dialogMove' });
  }

  // -------------------------------------------------------------------------------------------
  // Input (per frame, so it works while slow motion runs no tick in a frame)

  private handleInput(): void {
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const now = this.uiMs;
    for (const code of input.consumeKeys()) {
      if (code === 'Escape' || code === 'KeyP') {
        if (this.dialog?.kind === 'pause') this.closePause();
        else if (this.dialog === null) this.openPause();
      } else if ((code === 'Enter' || code === 'Space') && this.dialog !== null) {
        const action = this.dialog.primary();
        if (action !== null) this.act(action);
      }
    }
    for (const p of input.consumePresses()) {
      if (this.dialog !== null) {
        this.dialog.press(p.x, p.y, now);
        continue;
      }
      if (this.fever.cancellable) {
        this.fever.cancel(this.showMs);
        continue;
      }
      const m = layout.menuButton;
      if (hitCircle(m.x, m.y, m.r, p.x, p.y)) {
        audioBus.emit({ type: 'uiClick' });
        this.openPause();
        continue;
      }
      if (p.kind === 'touch') {
        this.touchId = p.id;
        this.touchStart = now;
        this.touchMoved = 0;
        const port = layout.portrait;
        this.touchOnLauncher = hitCircle(port.x, port.y, LAUNCHER_TAP_RADIUS, p.x, p.y);
        if (!this.touchOnLauncher) this.aim.pointAt(p.x, p.y, this.pivotX, this.pivotY, false);
      } else {
        // A click fires where the barrel points: the pointer already aimed it, and a click
        // must not undo fine aim from the wheel or the arrow keys.
        this.fireRequest = 'mouse';
      }
    }
    for (const r of input.consumeReleases()) {
      if (this.dialog !== null) {
        const action = this.dialog.release(r.x, r.y, now);
        if (action !== null) this.act(action);
        continue;
      }
      if (r.kind === 'touch' && r.id === this.touchId) {
        this.touchId = -1;
        if (this.touchMoved <= TAP_SLOP && now - this.touchStart < TAP_MS) {
          if (this.touchOnLauncher) this.fireRequest = 'touch';
          else this.tapFire = true;
        }
      }
    }
    const drag = input.consumeDrag();
    if (this.touchId >= 0 && (drag.dx !== 0 || drag.dy !== 0)) {
      const before = this.touchMoved;
      this.touchMoved += Math.abs(drag.dx) + Math.abs(drag.dy);
      if (before > TAP_SLOP) this.aim.drag(drag.dx, drag.dy);
    }
    const pointer = input.pointer;
    if (pointer.kind !== 'touch' && pointer.inside && this.dialog === null) {
      if (pointer.x !== this.lastPointerX || pointer.y !== this.lastPointerY) {
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        this.aim.pointAt(pointer.x, pointer.y, this.pivotX, this.pivotY, true);
      }
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0 && this.dialog === null) this.aim.nudge(wheel * WHEEL_STEP);
  }

  private act(action: DialogAction): void {
    audioBus.emit({ type: 'uiClick' });
    switch (action) {
      case 'resume':
        this.closePause();
        break;
      case 'restart':
      case 'retry':
        this.retry();
        break;
      case 'quit':
        this.app?.navigate('#/');
        break;
    }
  }

  private openPause(): void {
    this.dialog = new Dialog('pause', this.uiMs, null, this.tries, 0);
    this.fireRequest = null;
    this.tapFire = false;
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
    const paused = this.dialog?.kind === 'pause';
    if (!paused) this.showMs += frameMs;
    this.handleInput();
    const attempt = this.attempt;
    const world = attempt.world;
    this.fever.frame(this.showMs, world.ballsInPlay > 0);
    app.clock.timeScale = this.fever.speed;
    app.clock.fastForward =
      app.input.fastForwardHeld &&
      this.dialog === null &&
      !this.fever.active &&
      attempt.phase !== 'shot';

    const { ctx, k } = f;
    const alpha = paused ? 1 : f.alpha;
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
      const o = layout.opening;
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
    this.overlay.drawFeverFinish(ctx, k, pres);
    this.overlay.drawFeverTitle(ctx, k, this.fever, this.showMs);
    if (this.dialog !== null) {
      const p = app.input.pointer;
      this.dialog.render(ctx, k, this.uiMs, p.x, p.y, p.down);
    }
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
      drawFeverBuckets(ctx, k, fs);
      if (pres.fever.active && pres.fever.bucket >= 0) {
        drawFeverLandingGlow(ctx, pres.fever.bucket, pres.gameMs - pres.fever.t0);
      }
    } else {
      const bs = this.bucketState;
      bs.x = bucketX;
      bs.pyramid = world.pyramid;
      bs.covered = world.bucketCovered;
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
    board.drawBalls(ctx, world, alpha);
    pres.particles.draw(ctx, k, alpha);
    board.drawValues(ctx, k, world, pres, this.overlay.sprites, alpha);
    this.overlay.drawCallouts(ctx, k, pres);
    if (this.guideCount > 1 && this.dialog === null) {
      board.drawGuide(ctx, this.preview.points, this.guideCount, GUIDE_DOT_STEP);
    }
    if (machineAlpha > 0) {
      ctx.globalAlpha = machineAlpha;
      drawMachine(ctx, k, this.machineState(alpha));
      ctx.globalAlpha = 1;
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
    m.scoreRight.value = Math.max(this.bestScore, pres.shownScore);
    m.cannonAngle = this.aim.prev + (this.aim.angle - this.aim.prev) * alpha;
    m.cannonLoaded = loaded;
    if (app !== null) {
      const p = app.input.pointer;
      const menu = layout.menuButton;
      const hold = layout.holdButton;
      const overMenu = p.inside && hitCircle(menu.x, menu.y, menu.r, p.x, p.y);
      const overHold = p.inside && hitCircle(hold.x, hold.y, hold.r, p.x, p.y);
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
    };
  }

  /** Searches launch angles on a copy of the attempt: the best shot, or one that hits nothing. */
  private pickAim(goal: 'best' | 'coin'): number {
    const base = this.attempt;
    const trial = base.clone();
    let best = Number.NaN;
    let bestScore = -Infinity;
    for (let a = -1.65; a <= 1.65; a += 0.01) {
      trial.copyFrom(base);
      trial.launch(aimDirection(a));
      while (trial.phase === 'shot') trial.step();
      const events = trial.takeEvents();
      if (goal === 'coin') {
        if (events.some((e) => e.type === 'coinFlip')) return a;
        continue;
      }
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

/**
 * Camera center along one axis: the focus, kept so a view of `size / zoom` stays within
 * [lo, hi]; the middle of that range when the view is wider than it.
 */
function clampView(focus: number, lo: number, hi: number, zoom: number, size: number): number {
  const half = size / (2 * zoom);
  if (hi - lo <= 2 * half) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, focus));
}
