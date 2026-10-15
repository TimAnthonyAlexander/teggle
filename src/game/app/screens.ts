// Screen manager. A screen owns the canvas between enter() and exit(); the app calls step() at
// the fixed tick rate and render() once per animation frame. Overlays (dialogs, the pause
// panel) are screens pushed on top: only the top screen steps and gets input, every screen in
// the stack renders bottom to top.

import type { Ctx } from '../render/paint';
import type { FixedStepClock } from './loop';
import type { Input } from './input';
import type { Route } from './router';

export interface FrameInfo {
  readonly ctx: Ctx;
  /** Device pixels per world unit. */
  readonly k: number;
  /** Real time since app start, ms. */
  readonly timeMs: number;
  /** Real time since the last frame, ms. */
  readonly frameMs: number;
  /** Fraction of the next tick, for interpolation. */
  readonly alpha: number;
}

export interface AppServices {
  readonly input: Input;
  readonly clock: FixedStepClock;
  /** Navigates by setting the location hash. */
  navigate(hash: string): void;
}

export interface Screen {
  enter?(app: AppServices, route: Route): void;
  exit?(): void;
  /** One fixed simulation tick at 100 per second. */
  step?(): void;
  render(frame: FrameInfo): void;
  /** Fill color for the letterbox bars around the 16:9 world. */
  letterbox?(): string;
  /** The page was hidden or the phone turned upright: pause whatever is running. */
  interrupt?(): void;
}

export class ScreenManager {
  private readonly stack: Screen[] = [];
  private route: Route = { segments: [], params: new Map() };

  constructor(private readonly app: AppServices) {}

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** Replaces the whole stack with one screen. */
  replace(screen: Screen, route: Route): void {
    while (this.stack.length > 0) this.stack.pop()?.exit?.();
    this.route = route;
    this.app.input.clearQueues();
    this.stack.push(screen);
    screen.enter?.(this.app, route);
  }

  push(screen: Screen): void {
    this.app.input.clearQueues();
    this.stack.push(screen);
    screen.enter?.(this.app, this.route);
  }

  pop(): void {
    this.stack.pop()?.exit?.();
    this.app.input.clearQueues();
  }

  step(): void {
    this.top?.step?.();
  }

  render(frame: FrameInfo): void {
    for (const s of this.stack) s.render(frame);
  }

  interrupt(): void {
    for (const s of this.stack) s.interrupt?.();
  }

  letterbox(): string | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const c = this.stack[i]?.letterbox?.();
      if (c !== undefined) return c;
    }
    return undefined;
  }
}
