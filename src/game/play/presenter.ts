// The play screen's presentation state, driven by the attempt's events and the simulation
// clock. The rules have already decided everything (scores, free balls, removed pegs); this
// decides when and how it shows: lit pegs and their values, pops one at a time after the shot
// while the simulation has already removed them, the shot tally, callouts, the coin, the purple
// peg's move, warnings, HUD values and the Fever finish. It runs in game time (one call to tick()
// per simulation tick), so slow motion and fast forward slow down or speed up everything here,
// as in the original, where all of it ran in the board's update loop.

import type { Attempt } from '../../rules/attempt';
import type { RulesEvent } from '../../rules/events';
import { styleShotName } from '../../rules/style';
import type { CompiledLevel } from '../../sim/compile';
import type { SimEvent } from '../../sim/events';
import type { AudioBus } from '../audio/bus';
import { formatNumber } from '../ui/text';
import type { PegColor } from '../ui/tokens';
import { BLUE, GOLD, GREEN, Particles, PINK, SPARK, STAR, WHITE } from './particles';
import { lowBallWarning, popGapTicks, TALLY_HOLD_TICKS, TALLY_LEAD_TICKS, TICK_MS } from './timing';

export const PEG_COLOR_LIST: readonly PegColor[] = ['blue', 'orange', 'purple', 'green'];
const COLOR_INDEX: Readonly<Record<PegColor, number>> = {
  blue: 0,
  orange: 1,
  purple: 2,
  green: 3,
};

/** A peg's place in the presentation. */
export const ON_BOARD = 0;
export const LIT = 1;
export const GONE = 2;

/** Coin flip timing in game ms (guide 12.3: the spin sound lasts 1.3 s). */
export const COIN = { spin: 1300, show: 1100, fade: 300 } as const;
export const PURPLE_MOVE_MS = 450;
export const CATCH_MS = 700;
const SCORE_COUNT_MS = 450;
const TUBE_DRAIN_MS = 600;

export type CalloutKind = 'style' | 'bonus' | 'notice';

export class Callout {
  active = false;
  kind: CalloutKind = 'style';
  x = 0;
  y = 0;
  t0 = 0;
  line1 = '';
  line2 = '';
  /** Hold before the fade, ms. */
  hold = 600;
}

const MAX_CALLOUTS = 24;
/** A style shot this close to a green peg lit in the same tick happened at that peg, board px. */
const GREEN_NEAR = 40;

export interface Tally {
  visible: boolean;
  t0: number;
  /** Game time the tally starts fading out (after its hold), Infinity while it shows. */
  out: number;
  sum: number;
  count: number;
  popped: number;
  style: number;
}

export interface FeverFinish {
  active: boolean;
  t0: number;
  bucket: number;
  bucketX: number;
  bucketPoints: number;
  shotScore: number;
  unusedBalls: number;
  unusedPoints: number;
  clearBonus: number;
  fullClear: boolean;
  /** Times from t0, ms. */
  archStart: number;
  countStart: number;
  countMs: number;
  bucketAt: number;
  ballsAt: number;
  bonusAt: number;
  fadeStart: number;
  dialogAt: number;
}

type Settle = 'none' | 'lead' | 'popping' | 'hold' | 'coin' | 'purple' | 'done';

export class Presenter {
  /** Game time in ms: 10 per simulation tick. */
  gameMs = 0;
  readonly state: Uint8Array;
  /** Shown color per body (COLOR_INDEX); lags the rules where the show is behind them. */
  readonly color: Uint8Array;
  readonly litMs: Float64Array;
  readonly popMs: Float64Array;
  readonly valueText: (string | null)[];
  /** The whole static picture needs redrawing (a new attempt). */
  staticDirty = true;
  /** Bodies whose patch of the static picture needs redrawing (left the board, changed color). */
  readonly dirty: Int32Array;
  dirtyCount = 0;

  readonly callouts: Callout[] = [];
  readonly tally: Tally = {
    visible: false,
    t0: 0,
    out: Infinity,
    sum: 0,
    count: 0,
    popped: 0,
    style: 0,
  };
  readonly particles = new Particles();

  // HUD values.
  shownBalls = 0;
  shownScore = 0;
  private scoreFrom = 0;
  private scoreTarget = 0;
  private scoreT0 = 0;
  /** Shot score the ball counter tubes show. */
  tubeScore = 0;
  private tubeHold = false;
  private tubeFrom = 0;
  private tubeT0 = -1;
  freeBallStage = 0;
  freeBallMs = -Infinity;
  freeBallPoints = false;
  meterLevel = 0;
  meterMs = -Infinity;

  // Board effects.
  catchX = 0;
  catchMs = -Infinity;
  /** Body of the purple peg that just appeared, and when. */
  purpleTo = -1;
  purpleMs = -Infinity;
  warningBalls = 0;
  warningMs = -Infinity;
  private lastWarned = 0;

  // Coin flip.
  coinActive = false;
  coinWon = false;
  coinT0 = 0;

  readonly fever: FeverFinish = {
    active: false,
    t0: 0,
    bucket: -1,
    bucketX: 0,
    bucketPoints: 0,
    shotScore: 0,
    unusedBalls: 0,
    unusedPoints: 0,
    clearBonus: 0,
    fullClear: false,
    archStart: 0,
    countStart: 0,
    countMs: 0,
    bucketAt: 0,
    ballsAt: -1,
    bonusAt: -1,
    fadeStart: 0,
    dialogAt: 0,
  };

  /** The show has caught up and the next ball may be fired. */
  ready = true;
  /** The end dialog the show asks for, once it has finished. */
  endRequest: 'won' | 'lost' | null = null;

  private settle: Settle = 'none';
  private settleUntil = 0;
  private popWait = 0;
  private readonly litOrder: Int32Array;
  private litCount = 0;
  private popCursor = 0;
  private popIndex = 0;
  private shotHits = 0;
  private coinPending = false;
  private coinFreeBall = 0;
  private purplePending = false;
  private purpleFrom = -1;
  private purpleNext = -1;
  private won = false;
  private lost = false;
  private lastShotScore = 0;
  private lastScore = 0;
  private fountainUntil = 0;
  private fountainTint = GOLD;
  private readonly fireworkTimes: number[] = [];
  private lastCountTick = 0;
  private readonly numberText = new Map<number, string>();
  /** The green peg that lit last: tick and board position. */
  private readonly green = { tick: -1, x: 0, y: 0 };

  constructor(
    readonly level: CompiledLevel,
    private readonly audio: AudioBus,
    /** Screen offset of the board (board px to world units). */
    readonly offX: number,
    readonly offY: number,
    /** How far the frame's sides stand in for a narrower board (layout.frameInset). */
    readonly inset = 0,
  ) {
    const n = level.bodies.length;
    this.state = new Uint8Array(n);
    this.color = new Uint8Array(n);
    this.litMs = new Float64Array(n).fill(-Infinity);
    this.popMs = new Float64Array(n).fill(-Infinity);
    this.valueText = new Array<string | null>(n).fill(null);
    this.litOrder = new Int32Array(n);
    this.dirty = new Int32Array(64);
    for (let i = 0; i < MAX_CALLOUTS; i++) this.callouts.push(new Callout());
  }

  /** Starts over for a new attempt. */
  reset(attempt: Attempt): void {
    this.gameMs = 0;
    this.state.fill(ON_BOARD);
    this.litMs.fill(-Infinity);
    this.popMs.fill(-Infinity);
    this.valueText.fill(null);
    for (const i of this.level.scoringBodies) {
      const def = this.level.bodies[i];
      this.color[i] = COLOR_INDEX[(def && attempt.color(def.id)) ?? 'blue'];
    }
    this.staticDirty = true;
    this.dirtyCount = 0;
    for (const c of this.callouts) c.active = false;
    this.tally.visible = false;
    this.particles.clear();
    this.shownBalls = attempt.ballsLeft;
    this.shownScore = attempt.score;
    this.scoreFrom = attempt.score;
    this.scoreTarget = attempt.score;
    this.tubeScore = 0;
    this.tubeHold = false;
    this.tubeT0 = -1;
    this.freeBallStage = 0;
    this.freeBallMs = -Infinity;
    this.meterLevel = attempt.meterLevel;
    this.meterMs = -Infinity;
    this.catchMs = -Infinity;
    this.purpleTo = -1;
    this.purpleMs = -Infinity;
    this.warningMs = -Infinity;
    this.lastWarned = 0;
    this.coinActive = false;
    this.coinLanding = false;
    this.fever.active = false;
    this.fever.unusedBalls = 0;
    this.fever.unusedPoints = 0;
    this.fever.clearBonus = 0;
    this.fever.bucket = -1;
    this.fever.bucketPoints = 0;
    this.ready = true;
    this.endRequest = null;
    this.settle = 'none';
    this.litCount = 0;
    this.popCursor = 0;
    this.coinPending = false;
    this.purplePending = false;
    this.won = false;
    this.lost = false;
    this.fountainUntil = 0;
    this.fireworkTimes.length = 0;
    this.green.tick = -1;
    // A level that starts with 3 balls or fewer (challenges) warns at once.
    this.warn(attempt.ballsLeft);
  }

  private warn(balls: number): void {
    const w = lowBallWarning(balls, this.lastWarned);
    if (w > 0) {
      this.warningBalls = w;
      this.warningMs = this.gameMs;
      this.audio.emit({ type: 'lowBalls', balls: w });
    }
    this.lastWarned = balls > 3 ? 0 : balls;
  }

  colorOf(index: number): PegColor {
    return PEG_COLOR_LIST[this.color[index] ?? 0] ?? 'blue';
  }

  /** True while a ball is in play or the show of the last shot is still running. */
  get busy(): boolean {
    return !this.ready;
  }

  // -------------------------------------------------------------------------------------------
  // Events

  /** Simulation events of the tick just stepped (read before the next step). */
  handleSim(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'pegRemoved' && e.reason !== 'shotEnd') {
        const i = this.level.bodyIndexById.get(e.element) ?? -1;
        if (i >= 0 && this.state[i] !== GONE) this.pop(i);
      } else if (e.type === 'bucketCatch') {
        this.catchX = e.x + this.offX;
        this.catchMs = this.gameMs;
        this.audio.emit({ type: 'bucketCatch' });
      }
    }
  }

  handleRules(events: readonly RulesEvent[], attempt: Attempt): void {
    for (const e of events) this.handle(e, attempt);
  }

  /** One rules event (the play screen holds some back while the Lucky Spin wheel turns). */
  handle(e: RulesEvent, attempt: Attempt): void {
    switch (e.type) {
      case 'shotStart':
        this.ready = false;
        this.tally.visible = false;
        this.litCount = 0;
        this.popCursor = 0;
        this.popIndex = 0;
        this.shotHits = 0;
        this.shownBalls = e.ballsLeft;
        this.tubeHold = false;
        this.tubeT0 = -1;
        this.tubeScore = 0;
        this.coinActive = false;
        this.audio.emit({ type: 'cannonFire' });
        break;
      case 'pegScored': {
        const i = this.level.bodyIndexById.get(e.element) ?? -1;
        if (i < 0) break;
        this.state[i] = LIT;
        this.color[i] = COLOR_INDEX[e.color];
        this.litMs[i] = this.gameMs;
        this.valueText[i] = this.number(e.value);
        this.litOrder[this.litCount++] = i;
        this.shotHits++;
        this.tubeScore = e.shotScore;
        this.audio.emit({ type: 'pegHit', index: e.shotCount - 1, color: e.color });
        if (e.color === 'purple') {
          // Below the peg: its value pops up above it.
          this.addCallout('bonus', e.x + this.offX, e.y + this.offY + 24, 'BONUS PEG!', '', 500);
          this.particles.burst(e.x + this.offX, e.y + this.offY, 22, 2.6, [PINK, WHITE], rand);
        } else if (e.color === 'green') {
          this.green.tick = e.tick;
          this.green.x = e.x;
          this.green.y = e.y;
        }
        if (attempt.meterLevel !== this.meterLevel) {
          this.meterLevel = attempt.meterLevel;
          this.meterMs = this.gameMs;
        }
        break;
      }
      case 'meterStep':
        this.audio.emit({ type: 'meterStep', multiplier: e.multiplier });
        break;
      case 'styleShot': {
        const name = styleShotName(e.shot);
        // At a green peg that just lit (Double Power, Fever Multiball) the power's label sits
        // above the peg, so the callout goes below it.
        const g = this.green;
        const atGreen =
          g.tick === e.tick && Math.abs(e.x - g.x) < GREEN_NEAR && Math.abs(e.y - g.y) < GREEN_NEAR;
        this.addCallout(
          'style',
          e.x + this.offX,
          atGreen ? g.y + this.offY + 34 : Math.min(e.y + this.offY - 18, 540),
          `${name.toUpperCase()}!`,
          `+${formatNumber(e.points)}`,
          600,
        );
        this.audio.emit({ type: 'styleShot', shot: e.shot });
        break;
      }
      case 'freeBall':
        if (e.reason === 'coinFlip') {
          this.coinFreeBall = e.ballsLeft;
          break;
        }
        this.shownBalls = e.ballsLeft;
        this.freeBall(e.reason === 'threshold' ? thresholdStage(e.threshold) : 1, e.reason);
        if (e.reason === 'bucket') {
          this.addCallout('notice', this.catchX, 528, 'FREE BALL!', 'BUCKET CATCH', 500);
        } else if (e.reason === 'threshold') {
          const at = 170 + this.inset;
          this.addCallout('notice', at, 150, 'FREE BALL!', thresholdNotice(e.threshold), 700);
        } else {
          this.addCallout('notice', 170 + this.inset, 150, 'FREE BALL!', 'LUCKY SPIN', 700);
        }
        break;
      case 'coinFlip':
        this.coinPending = true;
        this.coinWon = e.won;
        break;
      case 'feverBucket':
        this.startFeverFinish(attempt, e.bucket, e.points, e.fullClear);
        this.audio.emit({ type: 'feverBucket', bucket: e.bucket, points: e.points });
        break;
      case 'shotTally':
        this.lastShotScore = e.shotScore;
        this.lastScore = e.score;
        this.tally.visible = e.count > 0;
        this.tally.t0 = this.gameMs;
        this.tally.out = Infinity;
        this.tally.sum = e.sum;
        this.tally.count = e.count;
        this.tally.style = e.styleScore;
        this.tally.popped = this.popIndex;
        this.tubeScore = e.shotScore;
        this.tubeHold = true;
        this.settle = 'lead';
        this.settleUntil = this.gameMs + TALLY_LEAD_TICKS * TICK_MS;
        this.popWait = 0;
        break;
      case 'purpleMoved':
        this.purplePending = true;
        this.purpleFrom = this.level.bodyIndexById.get(e.from) ?? -1;
        this.purpleNext = this.level.bodyIndexById.get(e.to) ?? -1;
        break;
      case 'unusedBalls':
        this.fever.unusedBalls = e.balls;
        this.fever.unusedPoints = e.points;
        break;
      case 'clearBonus':
        this.fever.clearBonus = e.points;
        break;
      case 'levelWon':
        this.won = true;
        this.lastScore = e.score;
        this.fever.fullClear = e.fullClear;
        if (!this.fever.active) this.startFeverFinish(attempt, -1, 0, e.fullClear);
        this.planFeverFinish();
        break;
      case 'levelLost':
        this.lost = true;
        break;
      case 'greenHit':
      case 'effect':
      case 'powerAction':
      case 'stuck':
      case 'fever':
        // Powers show in PowerShow; Fever in FeverShow.
        break;
    }
  }

  private number(n: number): string {
    let s = this.numberText.get(n);
    if (s === undefined) {
      s = formatNumber(n);
      this.numberText.set(n, s);
    }
    return s;
  }

  private freeBall(stage: number, reason: 'bucket' | 'threshold' | 'coinFlip' | 'power'): void {
    this.freeBallStage = stage;
    this.freeBallMs = this.gameMs;
    this.freeBallPoints = reason === 'threshold';
    this.audio.emit({ type: 'freeBall', reason, stage });
  }

  /** A notice callout from the play screen (a challenge's TARGET REACHED), in world units. */
  notice(x: number, y: number, line1: string, line2: string, hold: number): void {
    this.addCallout('notice', x, y, line1, line2, hold);
  }

  private addCallout(
    kind: CalloutKind,
    x: number,
    y: number,
    line1: string,
    line2: string,
    hold: number,
  ): void {
    let slot = this.callouts.find((c) => !c.active);
    if (slot === undefined) {
      slot = this.callouts.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
    }
    // Keep stacked callouts readable: nudge down from any other callout that just started here.
    let yy = y;
    for (const c of this.callouts) {
      if (c.active && Math.abs(c.x - x) < 120 && Math.abs(c.y - yy) < 34) yy = c.y + 36;
    }
    slot.active = true;
    slot.kind = kind;
    slot.x = Math.max(150 + this.inset, Math.min(917 - this.inset, x));
    slot.y = Math.max(80, Math.min(560, yy));
    slot.t0 = this.gameMs;
    slot.line1 = line1;
    slot.line2 = line2;
    slot.hold = hold;
  }

  private markDirty(i: number): void {
    if (this.dirtyCount < this.dirty.length) this.dirty[this.dirtyCount++] = i;
    else this.staticDirty = true;
  }

  private pop(i: number): void {
    this.state[i] = GONE;
    this.popMs[i] = this.gameMs;
    this.markDirty(i);
    this.audio.emit({ type: 'pegPop', index: this.popIndex, color: this.colorOf(i) });
    this.popIndex++;
    this.tally.popped = this.popIndex;
  }

  // -------------------------------------------------------------------------------------------
  // Time

  /** One simulation tick of presentation time. */
  tick(attempt: Attempt): void {
    this.gameMs += TICK_MS;
    const now = this.gameMs;
    this.particles.tick();
    for (const c of this.callouts) {
      if (c.active && now - c.t0 > 250 + c.hold + 360) c.active = false;
    }
    if (attempt.meterLevel !== this.meterLevel) {
      this.meterLevel = attempt.meterLevel;
      this.meterMs = now;
    }
    this.tickSettle(attempt);
    this.tickFever();
    // HUD count-ups.
    const st = Math.min(1, (now - this.scoreT0) / SCORE_COUNT_MS);
    const shown = Math.round(this.scoreFrom + (this.scoreTarget - this.scoreFrom) * st);
    if (shown !== this.shownScore) {
      this.shownScore = shown;
      this.countTick();
    }
    if (this.tubeT0 >= 0) {
      const t = Math.min(1, (now - this.tubeT0) / TUBE_DRAIN_MS);
      this.tubeScore = this.tubeFrom * (1 - t) * (1 - t);
      if (t >= 1) this.tubeT0 = -1;
    }
  }

  private countTick(): void {
    if (this.gameMs - this.lastCountTick >= 40) {
      this.lastCountTick = this.gameMs;
      this.audio.emit({ type: 'countTick' });
    }
  }

  private setScore(target: number): void {
    this.scoreFrom = this.shownScore;
    this.scoreTarget = target;
    this.scoreT0 = this.gameMs;
  }

  private tickSettle(attempt: Attempt): void {
    const now = this.gameMs;
    switch (this.settle) {
      case 'none':
      case 'done':
        return;
      case 'lead':
        if (now >= this.settleUntil) this.settle = 'popping';
        return;
      case 'popping': {
        if (this.popWait > 0) {
          this.popWait--;
          return;
        }
        while (this.popCursor < this.litCount) {
          const i = this.litOrder[this.popCursor++] ?? -1;
          if (i >= 0 && this.state[i] === LIT) {
            this.pop(i);
            break;
          }
        }
        let remaining = 0;
        for (let k = this.popCursor; k < this.litCount; k++) {
          if (this.state[this.litOrder[k] ?? 0] === LIT) remaining++;
        }
        if (remaining > 0) {
          this.popWait = popGapTicks(remaining) - 1;
          return;
        }
        // The last peg popped (or none was left): the finished tally holds.
        this.settle = 'hold';
        this.settleUntil = now + TALLY_HOLD_TICKS * TICK_MS;
        if (!this.won) this.setScore(this.lastScore);
        return;
      }
      case 'hold':
        if (now < this.settleUntil) return;
        // The tally never stays up while the next shot is aimed (the winning shot's total goes
        // into the Fever score instead).
        if (!this.won && this.tally.out === Infinity) this.tally.out = now;
        if (!this.won && this.tubeHold) {
          this.tubeHold = false;
          this.tubeFrom = this.tubeScore;
          this.tubeT0 = now;
        }
        if (this.coinPending) {
          this.coinPending = false;
          this.coinActive = true;
          this.coinLanding = true;
          this.coinT0 = now;
          this.settle = 'coin';
          this.settleUntil = now + COIN.spin + COIN.show;
          this.audio.emit({ type: 'coinSpin' });
          return;
        }
        this.afterCoin(attempt);
        return;
      case 'coin':
        if (this.coinLanding && now >= this.coinT0 + COIN.spin) {
          this.coinLanding = false;
          this.coinLanded();
        }
        if (now < this.settleUntil) return;
        this.afterCoin(attempt);
        return;
      case 'purple':
        if (now < this.settleUntil) return;
        this.finishSettle(attempt);
        return;
    }
  }

  /** The coin is spinning and has not shown its face yet. */
  private coinLanding = false;

  /** The coin shows its face: the free ball, if won, joins the stock now. */
  private coinLanded(): void {
    this.audio.emit({ type: 'coinResult', won: this.coinWon });
    if (this.coinWon) {
      this.shownBalls = this.coinFreeBall;
      this.freeBall(1, 'coinFlip');
    }
  }

  private afterCoin(attempt: Attempt): void {
    if (this.purplePending) {
      this.purplePending = false;
      if (this.purpleFrom >= 0 && this.state[this.purpleFrom] === ON_BOARD) {
        this.color[this.purpleFrom] = COLOR_INDEX.blue;
        this.markDirty(this.purpleFrom);
      }
      if (this.purpleNext >= 0) {
        this.color[this.purpleNext] = COLOR_INDEX.purple;
        this.markDirty(this.purpleNext);
        this.purpleTo = this.purpleNext;
        this.purpleMs = this.gameMs;
        const def = this.level.bodies[this.purpleNext];
        const body = def === undefined ? undefined : attempt.world.bodies[def.index];
        if (body !== undefined) {
          this.particles.burst(body.x + this.offX, body.y + this.offY, 16, 1.6, [PINK], rand);
        }
        this.audio.emit({ type: 'purpleMove' });
      }
      this.settle = 'purple';
      this.settleUntil = this.gameMs + PURPLE_MOVE_MS;
      return;
    }
    this.finishSettle(attempt);
  }

  private finishSettle(attempt: Attempt): void {
    this.settle = 'done';
    if (this.lost) {
      this.endRequest = 'lost';
      this.audio.emit({ type: 'levelLost' });
      return;
    }
    if (this.won) return;
    this.shownBalls = attempt.ballsLeft;
    this.warn(attempt.ballsLeft);
    this.ready = true;
  }

  // -------------------------------------------------------------------------------------------
  // Fever finish (guide 12.5)

  private startFeverFinish(
    attempt: Attempt,
    bucket: number,
    points: number,
    fullClear: boolean,
  ): void {
    const f = this.fever;
    f.active = true;
    f.t0 = this.gameMs;
    f.bucket = bucket;
    f.bucketPoints = points;
    f.fullClear = fullClear;
    f.bucketX = -1;
    if (bucket >= 0) {
      for (const i of this.level.feverBodies) {
        const def = this.level.bodies[i];
        if (def?.role === 'feverHole' && def.feverIndex === bucket) {
          const body = attempt.world.bodies[i];
          if (body !== undefined) f.bucketX = body.x + this.offX;
        }
      }
      this.fountainUntil = f.t0 + 1100;
      this.fountainTint = fullClear ? -1 : bucketTint(bucket);
      this.fireworkTimes.length = 0;
      for (const t of [350, 800, 1300, 1700]) this.fireworkTimes.push(f.t0 + t);
      this.audio.emit({ type: 'fireworks' });
    }
  }

  /** Lays out the arch tally once the level's last events are in. */
  private planFeverFinish(): void {
    const f = this.fever;
    f.shotScore = this.lastShotScore;
    f.archStart = f.bucket >= 0 ? 1100 : 500;
    f.countStart = f.archStart + 900;
    f.countMs = 1000;
    let t = f.countStart + f.countMs + 250;
    f.bucketAt = f.bucketPoints > 0 ? t : -1;
    if (f.bucketPoints > 0) t += 650;
    f.ballsAt = f.unusedBalls > 0 ? t : -1;
    if (f.unusedBalls > 0) t += 650;
    f.bonusAt = f.clearBonus > 0 ? t : -1;
    if (f.clearBonus > 0) t += 650;
    f.fadeStart = t + 500;
    f.dialogAt = f.fadeStart + 700;
  }

  private tickFever(): void {
    const f = this.fever;
    if (!f.active) return;
    const now = this.gameMs;
    if (now < this.fountainUntil && f.bucketX >= 0) {
      for (let n = 0; n < 3; n++) {
        const tint = this.fountainTint >= 0 ? this.fountainTint : Math.floor(rand() * 7) % 7;
        const kind = rand() < 0.55 ? STAR : SPARK;
        this.particles.spawn(
          f.bucketX + (rand() - 0.5) * 50,
          586,
          (rand() - 0.5) * 2.4,
          -(4.2 + rand() * 3.4),
          90 + rand() * 50,
          kind,
          rand() < 0.2 ? WHITE : tint,
          kind === STAR ? 0.8 + rand() * 0.6 : 1 + rand(),
          0.992,
        );
      }
    }
    while (this.fireworkTimes.length > 0 && (this.fireworkTimes[0] ?? Infinity) <= now) {
      this.fireworkTimes.shift();
      const x = 200 + rand() * 660;
      const y = 120 + rand() * 180;
      const tint = Math.floor(rand() * 7) % 7;
      this.particles.burst(x, y, 34, 3.2, [tint, WHITE, tint], rand, STAR);
      this.particles.burst(x, y, 20, 2.2, [GOLD], rand);
    }
    const t = now - f.t0;
    const archIn = f.archStart > 0 && t >= f.archStart && t - TICK_MS < f.archStart;
    if (archIn) this.audio.emit({ type: 'rainbow' });
    if (t >= f.fadeStart && this.scoreTarget !== this.lastScore) this.setScore(this.lastScore);
    if (t >= f.dialogAt && this.won && this.settle === 'done' && this.endRequest === null) {
      this.endRequest = 'won';
      this.audio.emit({ type: 'levelWon', fullClear: f.fullClear });
    }
  }

  /** Spark burst where the last orange peg lit (board coordinates). */
  feverHit(x: number, y: number): void {
    this.particles.burst(x + this.offX, y + this.offY, 48, 4.2, [0, 1, 2, 3, 4, 5, 6], rand);
    this.particles.burst(x + this.offX, y + this.offY, 18, 2.4, [WHITE, GOLD], rand, STAR);
  }

  /** Game ms at which the coin shows its face, for the coin drawing. */
  get coinLandMs(): number {
    return this.coinT0 + COIN.spin;
  }
}

/** The second line of a threshold free ball notice. */
export function thresholdNotice(threshold: number): string {
  return `${formatNumber(threshold)} POINTS`;
}

function thresholdStage(threshold: number): number {
  return threshold >= 125_000 ? 3 : threshold >= 75_000 ? 2 : 1;
}

/** Bucket fireworks colors: blue at the sides, green, gold in the middle (guide 12.5). */
function bucketTint(bucket: number): number {
  return bucket === 2 ? GOLD : bucket === 1 || bucket === 3 ? GREEN : BLUE;
}

/** Presentation randomness only: never feeds the simulation. */
function rand(): number {
  return Math.random();
}
