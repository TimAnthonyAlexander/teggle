// Offscreen layers for static drawings. A layer is rendered once at the current device
// resolution (device pixels per world unit) and redrawn with drawImage until the resolution
// or its key changes.

import { WORLD_H, WORLD_W } from '../layout';
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

/**
 * Frees a canvas's backing store now. Safari counts every canvas against a fixed budget (about
 * 224 MB on many iPhones) until the garbage collector takes it, and new canvases beyond the
 * budget fail; a dropped canvas only gives its memory back at once when shrunk to nothing.
 * Only for a canvas nothing draws from any more (drawing a 0 x 0 canvas throws).
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Device pixels per world unit of the screen, for the caches' budgets; 0 until the app sets it. */
let screenK = 0;

/** The app's resolution changed (app.ts): the caches' pixel budgets follow it. */
export function setScreenScale(k: number): void {
  screenK = Math.round(k * 100) / 100;
}

/** The screen's device pixels per world unit, or 0 before the app has measured it. */
export function screenScale(): number {
  return screenK;
}

export function context2d(canvas: HTMLCanvasElement): Ctx {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D is not available.');
  return ctx;
}

/** Backing store pixels of one layer covering the whole world at `k` device pixels per unit. */
function worldPixels(k: number): number {
  return Math.ceil(WORLD_W * k) * Math.ceil(WORLD_H * k);
}

export class LayerCache {
  private readonly layers = new Map<string, Layer>();
  private pixels = 0;
  private topK = 0;

  /**
   * Holds at most `maxEntries` layers, and at most `maxWorlds` times the pixels of a layer that
   * covers the whole world at the screen's resolution: full-screen layers (the frame of each
   * theme, each level's picture, the menu plates) would otherwise pile up level after level,
   * hundreds of megabytes on a phone (spec 14.2, mobile pass). The oldest layers go first. An
   * evicted layer covering at least `releaseArea` square world units has its canvas freed at
   * once (releaseCanvas), so such layers must be drawn when fetched and never kept.
   */
  constructor(
    private readonly maxEntries = 160,
    private readonly maxWorlds = Infinity,
    private readonly releaseArea = Infinity,
  ) {}

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
    this.pixels += canvas.width * canvas.height;
    // The budget follows the screen's resolution: copies drawn at a lower one (the pegs of a
    // thumbnail) must not shrink it, nor copies drawn finer (the Lucky Spin wheel) grow it.
    // Before the app has measured the screen, the highest resolution in the cache stands in.
    this.topK = Math.max(this.topK, kk);
    const budget = this.maxWorlds * worldPixels(screenK > 0 ? screenK : this.topK);
    while (this.layers.size > 1 && (this.layers.size > this.maxEntries || this.pixels > budget)) {
      const oldest = this.layers.entries().next();
      if (oldest.done === true) break;
      const [oldKey, old] = oldest.value;
      this.layers.delete(oldKey);
      this.pixels -= old.canvas.width * old.canvas.height;
      if (old.w * old.h >= this.releaseArea) releaseCanvas(old.canvas);
    }
    return layer;
  }

  /**
   * Drops every layer and frees its canvas at once. The app clears the shared cache only when
   * the resolution changes, and everything that keeps a layer between frames (the board's
   * sprites, the coin, the wheel, the particles) keys it by the resolution and fetches it again.
   */
  clear(): void {
    for (const l of this.layers.values()) releaseCanvas(l.canvas);
    this.layers.clear();
    this.pixels = 0;
    this.topK = 0;
  }

  /** How many layers are held, their backing stores' total size in pixels, the largest ones. */
  stats(): { count: number; pixels: number; largest: string[] } {
    let pixels = 0;
    const sizes: [string, number][] = [];
    for (const [key, l] of this.layers) {
      const p = l.canvas.width * l.canvas.height;
      pixels += p;
      sizes.push([key, p]);
    }
    sizes.sort((a, b) => b[1] - a[1]);
    const largest = sizes.slice(0, 8).map(([key, p]) => `${key} ${(p / 1e6).toFixed(2)}`);
    return { count: this.layers.size, pixels, largest };
  }
}

/** Draws a cached layer at its own world box, optionally shifted by (dx, dy). */
export function drawLayer(ctx: Ctx, layer: Layer, dx = 0, dy = 0): void {
  ctx.drawImage(layer.canvas, layer.x + dx, layer.y + dy, layer.w, layer.h);
}

/**
 * Shared cache for the whole renderer. A level keeps about 3.3 full-world layers in use (its
 * frame, the frame's shadow, its picture, the HUD and sprites), the menus about 2.6 (the chrome,
 * the Quick Play plate, the main menu's field); 6 holds a level and the menus, so nothing in use
 * is evicted, and the pictures and frames of earlier levels go first. Those big layers are
 * always drawn when fetched, so an evicted layer of a quarter of the world or more is freed at
 * once; the small sprites the board, the coin, the wheel and the particles keep are not.
 */
export const layers = new LayerCache(160, 6, (WORLD_W * WORLD_H) / 4);
