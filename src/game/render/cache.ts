// Offscreen layers for static drawings. A layer is rendered once at the current device
// resolution (device pixels per world unit) and redrawn with drawImage until the resolution
// or its key changes.

import type { Ctx } from './paint';

export interface Layer {
  readonly canvas: HTMLCanvasElement;
  /** World-unit box the layer covers, relative to the draw origin. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(width));
  c.height = Math.max(1, Math.ceil(height));
  return c;
}

export function context2d(canvas: HTMLCanvasElement): Ctx {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D is not available.');
  return ctx;
}

export class LayerCache {
  private readonly layers = new Map<string, Layer>();

  constructor(private readonly maxEntries = 160) {}

  /**
   * Returns the layer for `key` at `k` device pixels per world unit, drawing it on a miss.
   * `draw` receives a context whose origin is the box's (x, y) in world units.
   */
  get(
    key: string,
    k: number,
    x: number,
    y: number,
    w: number,
    h: number,
    draw: (ctx: Ctx) => void,
  ): Layer {
    const kk = Math.round(k * 100) / 100;
    const full = `${key}@${kk}`;
    const hit = this.layers.get(full);
    if (hit !== undefined) {
      // Refresh insertion order so the map acts as an LRU.
      this.layers.delete(full);
      this.layers.set(full, hit);
      return hit;
    }
    const canvas = createCanvas(w * kk, h * kk);
    const ctx = context2d(canvas);
    ctx.scale(canvas.width / w, canvas.height / h);
    ctx.translate(-x, -y);
    draw(ctx);
    const layer: Layer = { canvas, x, y, w, h };
    this.layers.set(full, layer);
    while (this.layers.size > this.maxEntries) {
      const oldest = this.layers.keys().next();
      if (oldest.done === true) break;
      this.layers.delete(oldest.value);
    }
    return layer;
  }

  clear(): void {
    this.layers.clear();
  }
}

/** Draws a cached layer at its own world box, optionally shifted by (dx, dy). */
export function drawLayer(ctx: Ctx, layer: Layer, dx = 0, dy = 0): void {
  ctx.drawImage(layer.canvas, layer.x + dx, layer.y + dy, layer.w, layer.h);
}

/** Shared cache for the whole renderer. */
export const layers = new LayerCache();
