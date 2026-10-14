// The Fever show in real time (spec 6, guide 12.5): slow motion and the zoom toward the ball as
// it closes in on the last orange peg, the flying-letter title, and the rainbow trail behind the
// ball until it lands. Slow motion is a speed for the app's fixed-step clock; the simulation
// keeps its fixed step and only runs fewer ticks per second. A click ends slow motion (research
// 4.7). The bucket fireworks, arch and tally run in game time in the presenter.

import type { AudioBus } from '../audio/bus';
import {
  feverZoom,
  rampSpeed,
  SLOW_MOTION_HOLD_MS,
  SLOW_MOTION_SCALE,
  type ZoomTimes,
} from './timing';

export type FeverTitle = 'fever' | 'fullClear';

/** How long slow motion may wait for a predicted hit that does not come (stuck ball). */
const GIVE_UP_MS = 4000;
/** Trail length in ticks. */
export const TRAIL_TICKS = 36;

export class FeverShow {
  /** Slow motion is running or ramping back. */
  active = false;
  /** Clock speed for the simulation (1 normal, 0.25 slow). */
  speed = 1;
  private ramping = false;
  private readonly zoomTimes: { start: number; hit: number | null; end: number | null } = {
    start: 0,
    hit: null,
    end: null,
  };
  private zooming = false;

  title: FeverTitle | null = null;
  titleIn = 0;
  titleOut = Infinity;
  private titleEmitted = 0;

  /** Camera focus in world units, smoothed. */
  focusX = 0;
  focusY = 0;
  private focusSet = false;

  /** Rainbow trail: world positions per tick, oldest first in ring order. */
  readonly trail = new Float32Array(TRAIL_TICKS * 2);
  trailHead = 0;
  trailCount = 0;
  trailOn = false;

  constructor(private readonly audio: AudioBus) {}

  reset(): void {
    this.active = false;
    this.speed = 1;
    this.ramping = false;
    this.zooming = false;
    this.zoomTimes.start = 0;
    this.zoomTimes.hit = null;
    this.zoomTimes.end = null;
    this.title = null;
    this.titleOut = Infinity;
    this.focusSet = false;
    this.trailCount = 0;
    this.trailOn = false;
  }

  get zoomTimesView(): ZoomTimes {
    return this.zoomTimes;
  }

  /** The ball will light the last orange peg soon: slow down and zoom in. */
  approach(now: number): void {
    if (this.active) return;
    this.active = true;
    this.zooming = true;
    this.speed = SLOW_MOTION_SCALE;
    this.zoomTimes.start = now;
    this.zoomTimes.hit = null;
    this.zoomTimes.end = null;
    this.audio.emit({ type: 'slowMotion' });
  }

  /** The last orange peg lit. Without an approach (the prediction missed it) the show starts here. */
  hit(now: number, fullClear: boolean): void {
    if (!this.active) {
      this.active = true;
      this.zooming = true;
      this.speed = SLOW_MOTION_SCALE;
      this.zoomTimes.start = now;
      this.zoomTimes.end = null;
    }
    if (this.zoomTimes.end === null) this.zoomTimes.hit = now;
    this.showTitle(now, fullClear ? 'fullClear' : 'fever');
    this.trailOn = true;
    this.trailCount = 0;
    this.audio.emit({ type: 'feverStart', fullClear });
  }

  /** Every peg was cleared after the title went up: the Full Clear title replaces it. */
  fullClear(now: number): void {
    if (this.title !== 'fullClear') this.showTitle(now, 'fullClear');
  }

  private showTitle(now: number, title: FeverTitle): void {
    this.title = title;
    this.titleIn = now;
    this.titleOut = Infinity;
    this.titleEmitted = 0;
  }

  /** A click during slow motion ends it at once (research 4.7). */
  cancel(now: number): void {
    if (!this.active || this.zoomTimes.end !== null) return;
    this.zoomTimes.end = now;
    this.speed = 1;
    this.ramping = false;
    if (this.title !== null && this.titleOut === Infinity) this.titleOut = now;
  }

  /** True while a click would end slow motion. */
  get cancellable(): boolean {
    return this.active && this.zoomTimes.end === null;
  }

  /** Per frame, in real time: ends the hold and fires title whooshes. */
  frame(now: number, ballInPlay: boolean): void {
    const z = this.zoomTimes;
    if (this.active && z.end === null) {
      const expired =
        z.hit === null ? now - z.start > GIVE_UP_MS : now - z.hit >= SLOW_MOTION_HOLD_MS;
      if (expired || (!ballInPlay && z.hit !== null)) {
        z.end = now;
        this.ramping = true;
        if (this.title !== null && this.titleOut === Infinity) this.titleOut = now;
      }
    }
    if (this.title !== null) {
      const letters = this.title === 'fever' ? 5 : 13;
      const due = Math.min(letters, Math.floor((now - this.titleIn) / 70) + 1);
      while (this.titleEmitted < due) {
        this.titleEmitted++;
        this.audio.emit({ type: 'feverLetter' });
      }
    }
    if (!this.ramping && this.speed >= 1 && z.end !== null && now - z.end > 400) {
      this.active = false;
    }
  }

  /** Per tick: ramps the speed back to normal after the hold. */
  tick(): void {
    if (!this.ramping) return;
    this.speed = rampSpeed(this.speed);
    if (this.speed >= 1) this.ramping = false;
  }

  zoom(now: number): number {
    if (!this.zooming) return 1;
    const z = feverZoom(now, this.zoomTimes);
    if (z === 1 && this.zoomTimes.end !== null && now > this.zoomTimes.end) this.zooming = false;
    return z;
  }

  /** Moves the camera focus toward (x, y) over about 120 ms of real time. */
  follow(x: number, y: number, frameMs: number): void {
    if (!this.focusSet) {
      this.focusX = x;
      this.focusY = y;
      this.focusSet = true;
      return;
    }
    const a = 1 - Math.exp(-Math.max(0, frameMs) / 120);
    this.focusX += (x - this.focusX) * a;
    this.focusY += (y - this.focusY) * a;
  }

  /** Records the ball's world position for the trail (once per tick). */
  record(x: number, y: number): void {
    if (!this.trailOn) return;
    this.trail[2 * this.trailHead] = x;
    this.trail[2 * this.trailHead + 1] = y;
    this.trailHead = (this.trailHead + 1) % TRAIL_TICKS;
    if (this.trailCount < TRAIL_TICKS) this.trailCount++;
  }

  /** The ball landed or left: the trail shrinks away. */
  shrinkTrail(): void {
    if (this.trailCount > 0) this.trailCount = Math.max(0, this.trailCount - 2);
  }
}
