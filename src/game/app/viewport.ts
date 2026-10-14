// Fits the 16:9 world into the browser viewport (guide 16.1): s = min(vw / W, vh / H), centered,
// with the backing store sized in device pixels so lines stay crisp on high-DPI screens.

import { WORLD_H, WORLD_W } from '../layout';

export interface Fit {
  /** CSS pixels per world unit. */
  readonly scale: number;
  /** Device pixels per world unit. */
  readonly k: number;
  /** World origin in device pixels. */
  readonly originX: number;
  readonly originY: number;
  /** Backing store size in device pixels. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
}

/** Caps the backing store; beyond this, extra resolution costs more than it shows. */
export const MAX_DPR = 3;

export function fitWorld(cssWidth: number, cssHeight: number, devicePixelRatio: number): Fit {
  const dpr = Math.max(1, Math.min(MAX_DPR, devicePixelRatio || 1));
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const scale = Math.min(w / WORLD_W, h / WORLD_H);
  const pixelWidth = Math.round(w * dpr);
  const pixelHeight = Math.round(h * dpr);
  const k = scale * dpr;
  // Snap the origin to whole device pixels so cached layers land on the pixel grid.
  const originX = Math.round((pixelWidth - WORLD_W * k) / 2);
  const originY = Math.round((pixelHeight - WORLD_H * k) / 2);
  return { scale, k, originX, originY, pixelWidth, pixelHeight, cssWidth: w, cssHeight: h, dpr };
}

/** CSS client coordinates (relative to the canvas) to world coordinates. */
export function clientToWorld(fit: Fit, cssX: number, cssY: number): { x: number; y: number } {
  return {
    x: (cssX * fit.dpr - fit.originX) / fit.k,
    y: (cssY * fit.dpr - fit.originY) / fit.k,
  };
}
