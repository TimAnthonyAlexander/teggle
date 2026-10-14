// Main loop: requestAnimationFrame drives a fixed-step accumulator at 100 ticks per second
// (spec 4, CLAUDE.md determinism). Rendering speed, slow motion and frame drops never change
// what a tick does; they only change how many ticks run per frame.

import { TICKS_PER_SECOND } from '../../sim/tuning';
import { motion } from '../ui/tokens';

export interface ClockOptions {
  readonly ticksPerSecond?: number;
  /** Ticks run at most per frame; surplus time is dropped so a slow device never spirals. */
  readonly maxTicksPerFrame?: number;
  /** Longer frames (tab switches, debugger pauses) count as this long. */
  readonly maxFrameMs?: number;
}

export class FixedStepClock {
  readonly ticksPerSecond: number;
  readonly maxTicksPerFrame: number;
  readonly maxFrameMs: number;
  /** Slow motion factor; 1 is normal speed (Fever uses 0.25). */
  timeScale = 1;
  /** Held fast forward (right button or the on-screen hold control). */
  fastForward = false;
  fastForwardFactor: number = motion.fastForward;
  paused = false;
  private accumulator = 0;
  private dropped = 0;

  constructor(options: ClockOptions = {}) {
    this.ticksPerSecond = options.ticksPerSecond ?? TICKS_PER_SECOND;
    this.maxTicksPerFrame = options.maxTicksPerFrame ?? 40;
    this.maxFrameMs = options.maxFrameMs ?? 250;
  }

  /** Current simulation speed in ticks per real second. */
  get rate(): number {
    if (this.paused) return 0;
    return this.ticksPerSecond * this.timeScale * (this.fastForward ? this.fastForwardFactor : 1);
  }

  /** Fraction of the next tick already elapsed, for interpolating the render. */
  get alpha(): number {
    return this.accumulator;
  }

  /** Ticks dropped so far because a frame needed more than maxTicksPerFrame. */
  get droppedTicks(): number {
    return this.dropped;
  }

  /** Adds a frame's real time and returns how many ticks to run now. */
  advance(frameMs: number): number {
    if (this.paused) {
      this.accumulator = 0;
      return 0;
    }
    const dt = Math.max(0, Math.min(this.maxFrameMs, frameMs));
    this.accumulator += (dt / 1000) * this.rate;
    let ticks = Math.floor(this.accumulator);
    this.accumulator -= ticks;
    if (ticks > this.maxTicksPerFrame) {
      this.dropped += ticks - this.maxTicksPerFrame;
      ticks = this.maxTicksPerFrame;
    }
    return ticks;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

export interface LoopHooks {
  /** One fixed simulation tick. */
  step(): void;
  /** Draws a frame; alpha is the fraction of the next tick, frameMs the real frame time. */
  render(alpha: number, frameMs: number): void;
}

export class Loop {
  private handle = 0;
  private last = -1;
  private running = false;

  constructor(
    readonly clock: FixedStepClock,
    private readonly hooks: LoopHooks,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.handle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const dt = this.last < 0 ? 0 : now - this.last;
    this.last = now;
    const ticks = this.clock.advance(dt);
    for (let i = 0; i < ticks; i++) this.hooks.step();
    this.hooks.render(this.clock.alpha, dt);
    this.handle = requestAnimationFrame(this.frame);
  };
}
