// Draws master portraits in the game's frames: the round launcher window (visual guide 7.4), the
// stage intro card portrait in a teal bevel and the 66-unit progress thumbnail, plain, current
// (gold) or locked as a dark silhouette made from the image's alpha (10.5). A portrait is
// resampled once per crop, size and device scale, by repeated halving so small sizes stay clean
// in every browser, and kept in a layer cache of its own so it never evicts the machine's layers.

import { LayerCache, context2d, createCanvas, drawLayer } from '../render/cache';
import {
  brass,
  circlePath,
  glassHighlight,
  innerBevel,
  insetShadow,
  linear,
  radial,
  rivet,
  roundRect,
  type Ctx,
  type PathFn,
} from '../render/paint';
import { darken, lighten, mix, rgba } from '../ui/color';
import { color, type Theme } from '../ui/tokens';
import type { PortraitImage } from './masters';

/** The part of the square portrait to show: center and side, as fractions of the image side. */
export interface Crop {
  readonly cx: number;
  readonly cy: number;
  readonly side: number;
}

/** The whole square. The intro card shows the full portrait. */
export const CROP_FULL: Crop = { cx: 0.5, cy: 0.5, side: 1 };
/** Head and shoulders for the round launcher window. */
export const CROP_WINDOW: Crop = { cx: 0.5, cy: 0.45, side: 0.76 };
/** Closer on the head for the small thumbnails. */
export const CROP_THUMB: Crop = { cx: 0.5, cy: 0.43, side: 0.7 };

/** Launcher portrait window radius (7.4). */
export const WINDOW_R = 42;
/** Stage intro card portrait (10.5). */
export const INTRO_SIZE = 190;
/** Master thumbnail on the stage intro card (10.5). */
export const THUMB_SIZE = 66;

const SILHOUETTE = '#07060f';

/**
 * At most 128 portraits, together no larger than two full-screen layers (spec 14.2). Every
 * portrait is drawn from here each frame and kept nowhere else, so evicted ones are freed at once.
 */
const portraitLayers = new LayerCache(128, 2, 0);
const imageIds = new WeakMap<object, number>();
let nextImageId = 1;

function imageId(img: PortraitImage): number {
  let id = imageIds.get(img);
  if (id === undefined) {
    id = nextImageId++;
    imageIds.set(img, id);
  }
  return id;
}

/** Crops `img` and scales it to w x h device pixels, halving in steps while it is over 2x. */
function resample(img: PortraitImage, crop: Crop, w: number, h: number, fill?: string) {
  const side = crop.side * Math.min(img.width, img.height);
  let src: CanvasImageSource = img;
  let sx = crop.cx * img.width - side / 2;
  let sy = crop.cy * img.height - side / 2;
  let sw = side;
  let sh = side;
  while (sw > w * 2 && sh > h * 2) {
    const nw = Math.ceil(sw / 2);
    const nh = Math.ceil(sh / 2);
    const step = createCanvas(nw, nh);
    const g = context2d(step);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, sw, sh, 0, 0, nw, nh);
    src = step;
    sx = 0;
    sy = 0;
    sw = nw;
    sh = nh;
  }
  const out = createCanvas(w, h);
  const g = context2d(out);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  if (fill !== undefined) {
    // Keep the alpha, replace the color: a flat silhouette.
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  return out;
}

/**
 * Draws the cropped portrait into the size x size world-unit box at (x, y). With `silhouette`,
 * draws only its shape in that color.
 */
export function drawPortraitImage(
  ctx: Ctx,
  k: number,
  img: PortraitImage,
  x: number,
  y: number,
  size: number,
  crop: Crop = CROP_FULL,
  silhouette?: string,
): void {
  const key = `portrait:${imageId(img)}:${crop.cx}:${crop.cy}:${crop.side}:${size}:${silhouette ?? ''}`;
  const layer = portraitLayers.get(key, k, 0, 0, size, size, (c) => {
    c.drawImage(resample(img, crop, c.canvas.width, c.canvas.height, silhouette), 0, 0, size, size);
  });
  drawLayer(ctx, layer, x, y);
}

/** Dark, slightly theme-tinted glass behind a portrait, lit from the top left. */
function glassBackdrop(ctx: Ctx, theme: Theme, x: number, y: number, w: number, h: number): void {
  const tint = mix(theme.dark, '#1c2a48', 0.45);
  ctx.fillStyle = radial(ctx, x + w * 0.38, y + h * 0.34, 0, x + w * 0.5, y + h * 0.5, w * 0.75, [
    [0, lighten(tint, 0.18)],
    [0.55, darken(tint, 0.25)],
    [1, darken(tint, 0.7)],
  ]);
  ctx.fillRect(x, y, w, h);
}

/** Additive theme glow in the window rim while a power runs (7.4), pulsing like the launcher's. */
export function drawWindowGlow(
  ctx: Ctx,
  theme: Theme,
  cx: number,
  cy: number,
  timeMs: number,
  r = WINDOW_R,
): void {
  const pulse = 0.8 + 0.2 * Math.sin(timeMs / 220);
  const outer = r * (48 / 42);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.48, cx, cy, outer, [
    [0, rgba(theme.glow, 0)],
    [0.75, rgba(theme.glow, 0.55 * pulse)],
    [1, rgba(theme.glow, 0)],
  ]);
  circlePath(ctx, cx, cy, outer);
  ctx.fill();
  ctx.restore();
}

export interface WindowOptions {
  /** Draw a compact bezel (theme enamel ring and teal rim); off when a launcher housing is drawn. */
  readonly bezel?: boolean;
  /** Power running: theme glow in the rim. */
  readonly active?: boolean;
  readonly timeMs?: number;
  readonly r?: number;
}

/**
 * The round launcher window with a portrait (7.4), centered at (cx, cy). Without `bezel` it
 * draws only the glass, the portrait and the glow, to sit inside drawLauncher's housing.
 */
export function drawPortraitWindow(
  ctx: Ctx,
  k: number,
  img: PortraitImage | null,
  theme: Theme,
  cx: number,
  cy: number,
  opts: WindowOptions = {},
): void {
  const r = opts.r ?? WINDOW_R;
  if (opts.bezel === true) {
    circlePath(ctx, cx + 1, cy + 2, r + 8.5);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    circlePath(ctx, cx, cy, r + 8);
    ctx.fillStyle = radial(ctx, cx - r * 0.4, cy - r * 0.55, 2, cx, cy, r + 8, [
      [0, lighten(theme.base, 0.45)],
      [0.6, theme.base],
      [0.9, darken(theme.base, 0.3)],
      [1, darken(theme.base, 0.55)],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = darken(theme.dark, 0.5);
    ctx.stroke();
    circlePath(ctx, cx, cy, r + 3.5);
    ctx.fillStyle = linear(ctx, 0, cy - r, 0, cy + r, [
      [0, '#0d2a30'],
      [0.5, color.tealLipDark],
      [1, color.tealLip],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#06191c';
    ctx.stroke();
  }
  paintWindowGlass(ctx, k, img, theme, cx, cy, r);
  if (opts.active === true) drawWindowGlow(ctx, theme, cx, cy, opts.timeMs ?? 0, r);
  circlePath(ctx, cx, cy, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
}

/** The window's glass with the portrait behind it: backdrop, picture, depth and reflections. */
function paintWindowGlass(
  ctx: Ctx,
  k: number,
  img: PortraitImage | null,
  theme: Theme,
  cx: number,
  cy: number,
  r: number,
): void {
  const window: PathFn = (c) => {
    circlePath(c, cx, cy, r);
  };
  ctx.save();
  window(ctx);
  ctx.clip();
  glassBackdrop(ctx, theme, cx - r, cy - r, 2 * r, 2 * r);
  if (img !== null) drawPortraitImage(ctx, k, img, cx - r, cy - r, 2 * r, CROP_WINDOW);
  ctx.restore();
  // Glass depth: a soft dark rim inside the window, then the dome's reflections.
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.72, cx, cy, r, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.42)'],
  ]);
  window(ctx);
  ctx.fill();
  glassHighlight(ctx, cx, cy, r, 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, Math.PI * 0.15, Math.PI * 0.55);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(200,235,255,0.2)';
  ctx.stroke();
}

/**
 * The launcher's portrait window for the play screen (7.4): the same glass and portrait as
 * drawPortraitWindow without the bezel and glow, cached per picture, theme, size and device
 * scale, so a frame costs one image draw. The launcher draws the glow over it.
 */
export function drawLauncherPortrait(
  ctx: Ctx,
  k: number,
  img: PortraitImage,
  theme: Theme,
  cx: number,
  cy: number,
  r = WINDOW_R,
): void {
  const pad = 1;
  const layer = portraitLayers.get(
    `window:${imageId(img)}:${theme.index}:${r}`,
    k,
    -r - pad,
    -r - pad,
    2 * (r + pad),
    2 * (r + pad),
    (c) => {
      paintWindowGlass(c, k, img, theme, 0, 0, r);
    },
  );
  drawLayer(ctx, layer, cx, cy);
}

/** Stage intro card portrait (10.5): the full portrait in a teal metal bevel with rivets. */
export function drawIntroPortrait(
  ctx: Ctx,
  k: number,
  img: PortraitImage | null,
  theme: Theme,
  x: number,
  y: number,
  size = INTRO_SIZE,
): void {
  const outer: PathFn = (c) => {
    roundRect(c, x, y, size, size, 16);
  };
  const inset = 9;
  const iw = size - 2 * inset;
  const inner: PathFn = (c) => {
    roundRect(c, x + inset, y + inset, iw, iw, 9);
  };
  ctx.save();
  ctx.translate(2, 3);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();
  outer(ctx);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + size, [
    [0, '#8fc4cc'],
    [0.2, color.tealLip],
    [0.65, color.tealLipDark],
    [1, color.tealDeep],
  ]);
  ctx.fill();
  innerBevel(ctx, outer, { light: '#d6f2f5', dark: '#0b2a30', width: 2.2 });
  outer(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  ctx.save();
  inner(ctx);
  ctx.clip();
  glassBackdrop(ctx, theme, x + inset, y + inset, iw, iw);
  if (img !== null) drawPortraitImage(ctx, k, img, x + inset, y + inset, iw, CROP_FULL);
  ctx.restore();
  insetShadow(ctx, inner, 8, 0.6);
  inner(ctx);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#04161a';
  ctx.stroke();
  for (const [rx, ry] of [
    [x + 4.6, y + 4.6],
    [x + size - 4.6, y + 4.6],
    [x + 4.6, y + size - 4.6],
    [x + size - 4.6, y + size - 4.6],
  ] as const) {
    rivet(ctx, rx, ry, 1.9);
  }
}

export type ThumbState = 'normal' | 'current' | 'locked';

/**
 * Progress thumbnail (10.5): teal frame, gold for the current master; a locked master shows
 * only its dark silhouette, made from the portrait's alpha.
 */
export function drawThumbnail(
  ctx: Ctx,
  k: number,
  img: PortraitImage | null,
  theme: Theme,
  x: number,
  y: number,
  state: ThumbState,
  size = THUMB_SIZE,
): void {
  const outer: PathFn = (c) => {
    roundRect(c, x, y, size, size, 9);
  };
  const inset = 5;
  const iw = size - 2 * inset;
  const inner: PathFn = (c) => {
    roundRect(c, x + inset, y + inset, iw, iw, 5);
  };
  ctx.save();
  ctx.translate(1.5, 2);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();
  if (state === 'current') {
    brass(ctx, outer, y, y + size, 1.8);
  } else {
    outer(ctx);
    ctx.fillStyle = linear(ctx, 0, y, 0, y + size, [
      [0, '#8fc4cc'],
      [0.3, color.tealLip],
      [1, color.tealDeep],
    ]);
    ctx.fill();
    innerBevel(ctx, outer, { light: '#d6f2f5', dark: '#0b2a30', width: 1.5 });
    outer(ctx);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#06191c';
    ctx.stroke();
  }
  ctx.save();
  inner(ctx);
  ctx.clip();
  if (state === 'locked') {
    ctx.fillStyle = radial(
      ctx,
      x + size * 0.4,
      y + size * 0.35,
      0,
      x + size / 2,
      y + size / 2,
      iw,
      [
        [0, '#3a3f66'],
        [1, '#141633'],
      ],
    );
    ctx.fillRect(x + inset, y + inset, iw, iw);
    if (img !== null) {
      drawPortraitImage(ctx, k, img, x + inset, y + inset, iw, CROP_THUMB, SILHOUETTE);
    }
  } else {
    glassBackdrop(ctx, theme, x + inset, y + inset, iw, iw);
    if (img !== null) drawPortraitImage(ctx, k, img, x + inset, y + inset, iw, CROP_THUMB);
  }
  ctx.restore();
  insetShadow(ctx, inner, 4, 0.55);
  glassHighlight(ctx, x + size * 0.42, y + size * 0.42, iw * 0.45, 0.22);
  inner(ctx);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#04161a';
  ctx.stroke();
}
