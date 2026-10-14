// The cannon's aim (spec 4, research 4.5). The pointer sets a target angle; the barrel turns
// toward it at up to 0.2 rad per tick. The mouse wheel nudges by 0.1 degree per notch and held
// arrow keys by 0.5 degree per tick, and after a nudge the mouse is ignored for 30 ticks so it
// does not snap the fine aim back. A mouse click within 10 ticks of the barrel leaving a settled
// aim (30 still ticks) by less than a degree fires at the settled angle, so the hand's twitch on
// the click does not move the shot. Touch aims at the finger and fine-tunes by dragging at a
// reduced rate (spec 14.1). Angles are radians from straight down, positive toward +x, as in
// src/sim/aim.ts; only the launch direction derived from the final angle reaches the simulation.

import { clampAim } from '../../sim/aim';

const DEG = Math.PI / 180;

/** Barrel turn rate, rad per tick (research 4.5). */
export const TURN_RATE = 0.2;
/** Mouse wheel step per notch (research 4.5). */
export const WHEEL_STEP = 0.1 * DEG;
/** Arrow keys: a wheel of 5 notches every tick while held (research 4.5). */
export const ARROW_STEP = 0.5 * DEG;
/** Ticks the mouse is ignored after a wheel or arrow nudge (research 4.5). */
export const MOUSE_IGNORE_TICKS = 30;
/** Ticks the barrel must stand still before its angle counts as settled (research 4.5). */
export const SETTLE_TICKS = 30;
/** A click this soon after the barrel left the settled angle fires at the settled angle. */
export const JITTER_TICKS = 10;
/** ...if the barrel moved less than this from it (Teggle: the rule is for hand jitter). */
export const JITTER_ANGLE = 1 * DEG;
/** Touch drag fine aim: radians per world unit of drag across the aim line (spec 14.1). */
export const TOUCH_FINE = 0.001;

export class AimController {
  /** Barrel angle now and one tick ago (for interpolation). */
  angle = 0;
  prev = 0;
  target = 0;
  private still = 0;
  private settled = 0;
  private hasSettled = false;
  private sinceSettled = Infinity;
  private mouseIgnore = 0;

  /** Points the barrel at once, without turning (new attempt, tools). */
  set(angle: number): void {
    const a = clampAim(angle);
    this.angle = a;
    this.prev = a;
    this.target = a;
    this.still = 0;
    this.hasSettled = false;
    this.sinceSettled = Infinity;
  }

  /** Aims at a point; mouse moves are ignored right after a nudge. */
  pointAt(x: number, y: number, pivotX: number, pivotY: number, mouse: boolean): void {
    if (mouse && this.mouseIgnore > 0) return;
    const dx = x - pivotX;
    const dy = y - pivotY;
    if (dx === 0 && dy === 0) return;
    this.target = clampAim(Math.atan2(dx, dy));
  }

  /** Fine aim by `radians` (wheel, arrows, touch drag). */
  nudge(radians: number): void {
    if (radians === 0) return;
    this.target = clampAim(this.target + radians);
    this.mouseIgnore = MOUSE_IGNORE_TICKS;
  }

  /** Touch fine aim: a drag of (dx, dy) world units turns the aim by its part across the aim line. */
  drag(dx: number, dy: number): void {
    const across = dx * Math.cos(this.target) - dy * Math.sin(this.target);
    this.nudge(across * TOUCH_FINE);
  }

  /** One tick: the barrel turns toward the target. */
  tick(): void {
    this.prev = this.angle;
    const d = this.target - this.angle;
    this.angle += d > TURN_RATE ? TURN_RATE : d < -TURN_RATE ? -TURN_RATE : d;
    if (this.mouseIgnore > 0) this.mouseIgnore--;
    this.still = this.angle === this.prev ? this.still + 1 : 0;
    if (this.still >= SETTLE_TICKS) {
      this.settled = this.angle;
      this.hasSettled = true;
      this.sinceSettled = 0;
    } else {
      this.sinceSettled++;
    }
  }

  /** The barrel points at its target. */
  get arrived(): boolean {
    return this.angle === this.target;
  }

  /** The angle a shot fired now leaves at; `mouse` applies the click jitter rule. */
  shotAngle(mouse: boolean): number {
    if (
      mouse &&
      this.hasSettled &&
      this.sinceSettled <= JITTER_TICKS &&
      Math.abs(this.angle - this.settled) < JITTER_ANGLE
    ) {
      return this.settled;
    }
    return this.angle;
  }
}
