// Drawing primitives for the machine look: paths, gradients, bevels, rivets, knobs, glass and
// enamel tubes. Everything draws in the current transform, in world units.

import { color } from '../ui/tokens';
import { darken, lighten, rgba } from '../ui/color';

export type Ctx = CanvasRenderingContext2D;
export type Stops = readonly (readonly [number, string])[];
export type PathFn = (ctx: Ctx) => void;

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

export function radial(
  ctx: Ctx,
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
  stops: Stops,
) {
  const g = ctx.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.001, r1));
  for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

/** Rounded rectangle path. `r` may give each corner: [top left, top right, bottom right, bottom left]. */
export function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | readonly [number, number, number, number],
): void {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  const lim = Math.min(w, h) / 2;
  const a = Math.min(tl, lim);
  const b = Math.min(tr, lim);
  const c = Math.min(br, lim);
  const d = Math.min(bl, lim);
  ctx.beginPath();
  ctx.moveTo(x + a, y);
  ctx.lineTo(x + w - b, y);
  ctx.arcTo(x + w, y, x + w, y + b, b);
  ctx.lineTo(x + w, y + h - c);
  ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
  ctx.lineTo(x + d, y + h);
  ctx.arcTo(x, y + h, x, y + h - d, d);
  ctx.lineTo(x, y + a);
  ctx.arcTo(x, y, x + a, y, a);
  ctx.closePath();
}

/** True capsule: radius is half the short side. */
export function capsule(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
}

export function circlePath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

export function withClip(ctx: Ctx, path: PathFn, draw: () => void): void {
  ctx.save();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

/**
 * Soft inner bevel: a light band along the top-left inner edge and a dark band along the
 * bottom-right inner edge, both clipped to the shape.
 */
export function innerBevel(
  ctx: Ctx,
  path: PathFn,
  opts: { light: string; dark: string; width: number; lightAlpha?: number; darkAlpha?: number },
): void {
  const w = opts.width;
  withClip(ctx, path, () => {
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(w * 0.6, w * 0.7);
    path(ctx);
    ctx.lineWidth = w * 2;
    ctx.strokeStyle = rgba(opts.light, opts.lightAlpha ?? 0.85);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(-w * 0.6, -w * 0.7);
    path(ctx);
    ctx.lineWidth = w * 2;
    ctx.strokeStyle = rgba(opts.dark, opts.darkAlpha ?? 0.75);
    ctx.stroke();
    ctx.restore();
  });
}

/** Strokes a path as a round enamel tube lit from the top left. */
export function tubeStroke(
  ctx: Ctx,
  path: PathFn,
  width: number,
  base: string,
  opts: { outline?: string; highlight?: string; shadow?: string } = {},
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(ctx);
  ctx.lineWidth = width + 1.6;
  ctx.strokeStyle = opts.outline ?? darken(base, 0.7);
  ctx.stroke();
  path(ctx);
  ctx.lineWidth = width;
  ctx.strokeStyle = opts.shadow ?? darken(base, 0.35);
  ctx.stroke();
  ctx.save();
  ctx.translate(-width * 0.12, -width * 0.12);
  path(ctx);
  ctx.lineWidth = width * 0.72;
  ctx.strokeStyle = base;
  ctx.stroke();
  ctx.translate(-width * 0.1, -width * 0.12);
  path(ctx);
  ctx.lineWidth = width * 0.26;
  ctx.strokeStyle = opts.highlight ?? lighten(base, 0.55);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Brass fill with highlight and shadow, outlined. */
export function brass(ctx: Ctx, path: PathFn, top: number, bottom: number, bevel = 2.2): void {
  path(ctx);
  ctx.fillStyle = linear(ctx, 0, top, 0, bottom, [
    [0, color.brassLight],
    [0.25, color.brass],
    [0.6, color.brassMid],
    [1, color.brassDeep],
  ]);
  ctx.fill();
  innerBevel(ctx, path, { light: color.brassHi, dark: color.brassLo, width: bevel });
  path(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
}

/** Small teal rivet. */
export function rivet(ctx: Ctx, x: number, y: number, r = 2.4): void {
  circlePath(ctx, x, y, r + 0.7);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  circlePath(ctx, x, y, r);
  ctx.fillStyle = radial(ctx, x - r * 0.35, y - r * 0.4, 0, x, y, r, [
    [0, '#b9e3ea'],
    [0.35, color.tealLip],
    [1, '#123c44'],
  ]);
  ctx.fill();
}

/** Round metal knob, copper by default. */
export function knob(ctx: Ctx, x: number, y: number, r: number, base: string = color.copper): void {
  circlePath(ctx, x + r * 0.08, y + r * 0.14, r + 1);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  circlePath(ctx, x, y, r);
  ctx.fillStyle = radial(ctx, x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r, [
    [0, lighten(base, 0.75)],
    [0.3, lighten(base, 0.2)],
    [0.75, base],
    [1, darken(base, 0.5)],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = darken(base, 0.7);
  ctx.stroke();
}

/** Specular highlight of a glass dome: a soft white ellipse at the top left. */
export function glassHighlight(ctx: Ctx, cx: number, cy: number, r: number, alpha = 0.85): void {
  ctx.save();
  ctx.translate(cx - r * 0.32, cy - r * 0.42);
  ctx.rotate(-0.55);
  ctx.scale(1, 0.62);
  circlePath(ctx, 0, 0, r * 0.42);
  ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, r * 0.42, [
    [0, `rgba(255,255,255,${alpha})`],
    [0.55, `rgba(255,255,255,${alpha * 0.45})`],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill();
  ctx.restore();
}

/** Glass orb with a colored body, inner shading, a rim reflection and a specular spot. */
export function glassOrb(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  body: { hi: string; mid: string; lo: string; rim: string },
): void {
  circlePath(ctx, cx, cy, r);
  ctx.fillStyle = radial(ctx, cx, cy + r * 0.35, 0, cx, cy, r, [
    [0, body.hi],
    [0.55, body.mid],
    [0.92, body.lo],
    [1, body.rim],
  ]);
  ctx.fill();
  // Light caught in the lower rim.
  ctx.save();
  circlePath(ctx, cx, cy, r);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, Math.PI * 0.15, Math.PI * 0.85);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = rgba(lighten(body.hi, 0.3), 0.35);
  ctx.stroke();
  ctx.restore();
  glassHighlight(ctx, cx, cy, r);
}

/** Inner shadow that a frame casts on whatever is inside `path`. */
export function insetShadow(ctx: Ctx, path: PathFn, size: number, alpha: number): void {
  withClip(ctx, path, () => {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowBlur = size;
    ctx.lineWidth = size;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    path(ctx);
    ctx.stroke();
    ctx.restore();
  });
}

/** Black drop shadow under a shape, offset like the object shadow token. */
export function dropShadow(ctx: Ctx, path: PathFn, dx: number, dy: number, alpha: number): void {
  ctx.save();
  ctx.translate(dx, dy);
  path(ctx);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill();
  ctx.restore();
}
