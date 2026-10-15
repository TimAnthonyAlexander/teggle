// Aim guide: the path a ball would take from the current world state. It runs the real
// simulation on a private copy of the world, so the preview and the shot agree to the bit for
// the ticks it covers. Reuse one instance per level; run() does not allocate.

import type { Vec2 } from '../level/geometry';
import type { CompiledLevel } from './compile';
import { World, type LaunchOptions } from './world';

export interface PreviewOptions extends LaunchOptions {
  /** Ticks to simulate at most. */
  readonly ticks: number;
  /** Keep going through the first contact and stop at the second (Guide power). */
  readonly throughFirstBounce?: boolean;
}

export type PreviewEnd = 'ticks' | 'contact' | 'gone';

export class TrajectoryPreview {
  /** x0, y0, x1, y1, ...: the launch point, then the ball center after every tick. */
  readonly points: Float64Array;
  /** Number of points in `points`. */
  count = 0;
  /** Why the path stopped: tick limit, a (second) contact, or the ball left play. */
  end: PreviewEnd = 'ticks';
  /**
   * With throughFirstBounce: the index of the first point after the first contact, or -1, and
   * the ball center at that contact (the Guide's bounce marker).
   */
  bounceIndex = -1;
  bounceX = 0;
  bounceY = 0;
  private readonly world: World;

  constructor(level: CompiledLevel, maxTicks: number) {
    this.world = new World(level);
    this.points = new Float64Array((maxTicks + 2) * 2);
  }

  /** Simulates a shot from `source` without changing it. Returns the point count. */
  run(source: World, direction: Vec2, options: PreviewOptions): number {
    const w = this.world;
    w.copyFrom(source);
    w.discardBalls();
    const maxTicks = Math.min(options.ticks, this.points.length / 2 - 2);
    const allowed = options.throughFirstBounce === true ? 1 : 0;
    w.launch(direction, options);
    const first = w.balls[0];
    this.count = 0;
    this.end = 'ticks';
    this.bounceIndex = -1;
    if (first === undefined) return 0;
    this.push(first.x, first.y);
    let contacts = 0;
    for (let t = 0; t < maxTicks; t++) {
      w.step();
      for (const e of w.events) {
        switch (e.type) {
          case 'pegContact':
          case 'solidContact':
          case 'wallContact':
          case 'bucketContact':
          case 'flipperContact':
            contacts++;
            if (contacts > allowed) {
              this.push(e.x, e.y);
              this.end = 'contact';
              return this.count;
            }
            if (this.bounceIndex < 0) {
              this.bounceIndex = this.count;
              this.bounceX = e.x;
              this.bounceY = e.y;
            }
            break;
          case 'bucketCatch':
          case 'feverCatch':
          case 'ballOut':
          case 'ballReturned':
          case 'teleport':
            this.push(e.x, e.y);
            this.end = 'gone';
            return this.count;
          case 'ballSpawned':
          case 'ballContact':
          case 'pegLit':
          case 'pegRemoved':
            break;
        }
      }
      const ball = w.balls[0];
      if (ball === undefined) {
        this.end = 'gone';
        return this.count;
      }
      this.push(ball.x, ball.y);
    }
    return this.count;
  }

  private push(x: number, y: number): void {
    this.points[2 * this.count] = x;
    this.points[2 * this.count + 1] = y;
    this.count++;
  }
}
