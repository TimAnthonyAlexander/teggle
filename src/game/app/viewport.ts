// Fits the 16:9 world into the browser viewport (guide 16.1): s = min(vw / W, vh / H), centered,
// with the backing store sized in device pixels so lines stay crisp on high-DPI screens. On a
// phone with a notch or a home indicator the world fits inside the safe area instead (the page
// uses viewport-fit=cover); the canvas still covers the whole screen and the letterbox color
// fills the unsafe edges, so nothing is cropped and nothing sits under the notch.

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

/** Safe-area insets in CSS pixels (env(safe-area-inset-*)). */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Caps the backing store; beyond this, extra resolution costs more than it shows. */
export const MAX_DPR = 3;

function inset(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function fitWorld(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  insets: Insets = NO_INSETS,
): Fit {
  const dpr = Math.max(1, Math.min(MAX_DPR, devicePixelRatio || 1));
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const left = inset(insets.left);
  const right = inset(insets.right);
  const top = inset(insets.top);
  const bottom = inset(insets.bottom);
  // Insets that leave less than half the screen are not believed.
  const safe = left + right < w / 2 && top + bottom < h / 2;
  const sl = safe ? left : 0;
  const sr = safe ? right : 0;
  const st = safe ? top : 0;
  const sb = safe ? bottom : 0;
  const scale = Math.min((w - sl - sr) / WORLD_W, (h - st - sb) / WORLD_H);
  const pixelWidth = Math.round(w * dpr);
  const pixelHeight = Math.round(h * dpr);
  const k = scale * dpr;
  // Snap the origin to whole device pixels so cached layers land on the pixel grid.
  const originX = Math.round((pixelWidth - (sl + sr) * dpr - WORLD_W * k) / 2 + sl * dpr);
  const originY = Math.round((pixelHeight - (st + sb) * dpr - WORLD_H * k) / 2 + st * dpr);
  return { scale, k, originX, originY, pixelWidth, pixelHeight, cssWidth: w, cssHeight: h, dpr };
}

/** CSS client coordinates (relative to the canvas) to world coordinates. */
export function clientToWorld(fit: Fit, cssX: number, cssY: number): { x: number; y: number } {
  return {
    x: (cssX * fit.dpr - fit.originX) / fit.k,
    y: (cssY * fit.dpr - fit.originY) / fit.k,
  };
}

/** Parses a computed CSS length such as "47px"; anything else is 0. */
export function cssPixels(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
