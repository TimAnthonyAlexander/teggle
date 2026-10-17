// Round pegs and bricks (guide 4): hard-candy pegs with a metal rim, beveled bricks with a
// recessed pill, the lit state with its additive halo, the hit flash, the removal pop and the
// object shadows. Brick outlines come from the same vertex functions the physics uses
// (src/level/geometry.ts), so what you see is what the ball hits.

import { curvedBrickVertices, straightBrickVertices, type Vec2 } from '../../level/geometry';
import { lighten, rgba } from '../ui/color';
import {
  brickPalette,
  pegGlow,
  pegPalette,
  shape as shapeTokens,
  type BrickPalette,
  type PegColor,
  type PegPalette,
} from '../ui/tokens';
import { LayerCache, drawLayer, layers, type Layer } from './cache';
import { circlePath, linear, radial, type Ctx, type Stops } from './paint';

// ---------------------------------------------------------------------------------------------
// Round pegs

function paintPeg(ctx: Ctx, x: number, y: number, r: number, p: PegPalette, lit: boolean): void {
  // Layers by radius as in the original sprite (4.2): outline 0.9..1, metal rim 0.7..0.9, and a
  // glossy sphere inside whose edge darkens into the inner ring.
  circlePath(ctx, x, y, r);
  ctx.fillStyle = p.outline;
  ctx.fill();
  circlePath(ctx, x, y, r * 0.9);
  ctx.fillStyle = linear(ctx, x - r * 0.55, y - r * 0.75, x + r * 0.45, y + r * 0.8, [
    [0, lighten(p.rimHi, 0.12)],
    [0.4, p.rimHi],
    [1, p.rimLo],
  ]);
  ctx.fill();
  // A fine dark line between rim and sphere.
  const sr = r * 0.71;
  circlePath(ctx, x, y, sr + r * 0.05);
  ctx.fillStyle = rgba(p.outline, 0.75);
  ctx.fill();
  circlePath(ctx, x, y, sr);
  if (lit) {
    // A soft white-hot core that fills most of the sphere, falling off to the saturated ring.
    ctx.fillStyle = radial(ctx, x - sr * 0.05, y - sr * 0.08, 0, x, y, sr, [
      [0, '#ffffff'],
      [0.3, p.bodyTop],
      [0.66, p.bodyBottom],
      [0.85, p.ringHi],
      [1, p.ringLo],
    ]);
    ctx.fill();
    return;
  }
  ctx.fillStyle = radial(ctx, x - sr * 0.22, y - sr * 0.4, sr * 0.05, x, y, sr, [
    [0, lighten(p.bodyTop, 0.22)],
    [0.35, p.bodyTop],
    [0.72, p.bodyBottom],
    [0.86, p.ringHi],
    [1, p.ringLo],
  ]);
  ctx.fill();
  // Reflected light low on the sphere.
  ctx.save();
  circlePath(ctx, x, y, sr);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(x + sr * 0.05, y + sr * 0.62, sr * 0.55, sr * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(lighten(p.bodyTop, 0.3), 0.3);
  ctx.fill();
  ctx.restore();
  // Specular dot, up and left of center (unlit only: a lit peg is the light).
  const hx = x - sr * 0.34;
  const hy = y - sr * 0.4;
  const hr = sr * 0.32;
  circlePath(ctx, hx, hy, hr);
  ctx.fillStyle = radial(ctx, hx, hy, 0, hx, hy, hr, [
    [0, p.specular],
    [0.4, rgba(p.specular, 0.85)],
    [1, rgba(p.specular, 0)],
  ]);
  ctx.fill();
}

/** Round peg sprite centered on the origin, cached per color, state, radius and resolution. */
export function pegSprite(k: number, color: PegColor, lit: boolean, r = 10): Layer {
  const pad = 1;
  return layers.get(
    `peg:${color}:${lit ? 1 : 0}:${r}`,
    k,
    -r - pad,
    -r - pad,
    2 * (r + pad),
    2 * (r + pad),
    (c) => {
      paintPeg(c, 0, 0, r, pegPalette[color][lit ? 'lit' : 'normal'], lit);
    },
  );
}

/** Draws a round peg (sprite cached per color, state, radius and resolution). */
export function drawPeg(
  ctx: Ctx,
  k: number,
  x: number,
  y: number,
  color: PegColor,
  lit: boolean,
  r = 10,
): void {
  drawLayer(ctx, pegSprite(k, color, lit, r), x, y);
}

/** Additive halo sprite of a lit peg in its color, centered on the origin (glow.peg). */
export function pegGlowSprite(
  k: number,
  color: PegColor,
  radius: number = shapeTokens.pegGlowRadius,
): Layer {
  return glowSprite(k, pegGlow[color], radius);
}

/** Soft white glow disc centered on the origin, for flashes. */
export function whiteGlowSprite(k: number, radius: number): Layer {
  return glowSprite(k, '#ffffff', radius);
}

function glowSprite(k: number, tint: string, radius: number): Layer {
  return layers.get(`glow:${tint}:${radius}`, k, -radius, -radius, 2 * radius, 2 * radius, (c) => {
    // Flat bright center falling off to nothing, like the original's glow sprite (4.2).
    c.fillStyle = radial(c, 0, 0, 0, 0, 0, radius, [
      [0, rgba(tint, 0.75)],
      [0.3, rgba(tint, 0.62)],
      [0.55, rgba(tint, 0.3)],
      [0.8, rgba(tint, 0.09)],
      [1, rgba(tint, 0)],
    ]);
    circlePath(c, 0, 0, radius);
    c.fill();
  });
}

/** Additive halo of a lit peg (glow.peg, radius 24). */
export function drawPegGlow(
  ctx: Ctx,
  k: number,
  x: number,
  y: number,
  color: PegColor,
  intensity = 1,
  radius: number = shapeTokens.pegGlowRadius,
): void {
  if (intensity <= 0) return;
  const layer = glowSprite(k, pegGlow[color], radius);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, intensity);
  drawLayer(ctx, layer, x, y);
  ctx.restore();
}

/** Object shadow (shadow.object): black disc offset (-4, +3) at 45%. */
export function drawPegShadow(ctx: Ctx, x: number, y: number, r = 10): void {
  const s = shapeTokens.shadowObject;
  circlePath(ctx, x + s.dx, y + s.dy, r);
  ctx.fillStyle = `rgba(0,0,0,${s.alpha})`;
  ctx.fill();
}

/** Length of the hit flash, ms (Teggle). */
export const HIT_FLASH_MS = 220;

/** White-hot burst for the first frames after a hit, drawn over the lit peg. */
export function drawHitFlash(
  ctx: Ctx,
  k: number,
  x: number,
  y: number,
  color: PegColor,
  tMs: number,
  r = 10,
): void {
  if (tMs < 0 || tMs >= HIT_FLASH_MS) return;
  const t = tMs / HIT_FLASH_MS;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 1 - t;
  const layer = glowSprite(k, '#ffffff', 2 * r);
  const s = 0.7 + 0.7 * t;
  ctx.drawImage(layer.canvas, x - 2 * r * s, y - 2 * r * s, 4 * r * s, 4 * r * s);
  ctx.restore();
  drawPegGlow(ctx, k, x, y, color, 1 - t, shapeTokens.pegGlowRadius * (1 + 0.4 * t));
}

/** Removal pop length (guide 4.4): the orange ring lasts twice as long as the others. */
export function popDurationMs(color: PegColor): number {
  return color === 'orange' ? 520 : 260;
}

/** Expanding, fading ring in the peg's color when a lit peg disappears (4.4). */
export function drawRemovalPop(
  ctx: Ctx,
  x: number,
  y: number,
  color: PegColor,
  tMs: number,
  r = 10,
): void {
  const total = popDurationMs(color);
  if (tMs < 0 || tMs >= total) return;
  const t = tMs / total;
  const goal = color === 'orange';
  const tint = pegGlow[color];
  // The ring starts at the peg's edge and grows a little: about 1.9x (2.6x for orange).
  const grow = goal ? 1.6 : 0.9;
  const rr = r * (1 + grow * (1 - (1 - t) * (1 - t)));
  const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
  const ringColor = goal
    ? t < 0.3
      ? '#ffe36a'
      : t < 0.6
        ? '#ff9a3a'
        : '#ff5a3a'
    : lighten(tint, 0.35);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Dim filled center.
  circlePath(ctx, x, y, rr);
  ctx.fillStyle = radial(ctx, x, y, 0, x, y, rr, [
    [0, rgba(goal ? '#ff3a10' : tint, 0.45 * fade)],
    [1, rgba(goal ? '#ff3a10' : tint, 0.12 * fade)],
  ]);
  ctx.fill();
  // Soft glow, then the bright ring.
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.9;
  ctx.strokeStyle = rgba(tint, 0.18 * fade);
  ctx.stroke();
  ctx.lineWidth = r * (goal ? 0.42 : 0.3) * (1 - 0.4 * t);
  ctx.strokeStyle = rgba(ringColor, 0.95 * fade);
  ctx.stroke();
  if (goal && t > 0.35) {
    // Embers scattered inside the orange pulse.
    const a = fade * 0.9;
    for (let i = 0; i < 14; i++) {
      const ang = i * 2.39996;
      const d = rr * (0.25 + ((i * 37) % 70) / 100);
      circlePath(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d, 0.9);
      ctx.fillStyle = rgba('#ff6a4a', a);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Bricks

export interface StraightBrick {
  readonly kind: 'brick';
  readonly x: number;
  readonly y: number;
  /** Facing direction, radians, counterclockwise on screen (0 faces +x). */
  readonly rotation: number;
  readonly length: number;
  readonly width: number;
}

export interface CurvedBrick {
  readonly kind: 'curvedBrick';
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly innerRadius: number;
  readonly width: number;
  /** Arc span, radians. */
  readonly sector: number;
  /** Points per arc, as in the level file. */
  readonly points: number;
}

export type BrickShape = StraightBrick | CurvedBrick;

/** Local outline (rotation 0, relative to the position), exactly as the physics builds it. */
export function brickLocalVertices(b: BrickShape): Vec2[] {
  return b.kind === 'brick'
    ? straightBrickVertices(b.length, b.width)
    : curvedBrickVertices(b.innerRadius, b.width, b.sector, b.points);
}

/** World-space outline: local vertices rotated counterclockwise by the brick's rotation. */
export function brickWorldVertices(b: BrickShape): Vec2[] {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  return brickLocalVertices(b).map((v) => ({
    x: b.x + v.x * c + v.y * s,
    y: b.y - v.x * s + v.y * c,
  }));
}

function polyPath(ctx: Ctx, pts: readonly Vec2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function bounds(pts: readonly Vec2[], pad: number) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** Converts profile stops (0 = facing side) into radial stops (0 = inner radius). */
function radialProfile(stops: Stops): Stops {
  return [...stops].map(([o, c]) => [1 - o, c] as const).reverse();
}

/** Paints a brick in its local frame (rotation already applied, position at the origin). */
function paintBrickLocal(ctx: Ctx, b: BrickShape, p: BrickPalette): void {
  const W = b.width;
  const u = W / 20;
  const inset = 4 * u;
  if (b.kind === 'brick') {
    // Texture frame: u along the length, v across with the facing side at the top.
    ctx.rotate(Math.PI / 2);
    const L = b.length;
    const x0 = -L / 2;
    const y0 = -W / 2;
    ctx.beginPath();
    ctx.rect(x0, y0, L, W);
    ctx.fillStyle = linear(ctx, 0, y0, 0, y0 + W, p.bevel);
    ctx.fill();
    // End bevels.
    ctx.fillStyle = rgba(p.endBevel, 0.75);
    ctx.fillRect(x0, y0 + u, inset, W - 2 * u);
    ctx.fillRect(x0 + L - inset, y0 + u, inset, W - 2 * u);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.outline;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, L - 1, W - 1);
    // Recessed pill.
    const px = x0 + inset;
    const py = y0 + inset;
    const pw = Math.max(1, L - 2 * inset);
    const ph = Math.max(1, W - 2 * inset);
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, Math.min(3 * u, ph / 2));
    ctx.fillStyle = linear(ctx, 0, py, 0, py + ph, p.pill);
    ctx.fill();
    ctx.lineWidth = u;
    ctx.strokeStyle = p.line;
    ctx.stroke();
    // Gloss streak along the top of the pill.
    ctx.beginPath();
    ctx.moveTo(px + 2.5 * u, py + ph * 0.28);
    ctx.lineTo(px + pw - 2.5 * u, py + ph * 0.28);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, u * 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.stroke();
    return;
  }
  const R = b.innerRadius;
  const rm = R + W / 2;
  const cx = -rm;
  const outer = curvedBrickVertices(R, W, b.sector, b.points);
  polyPath(ctx, outer);
  ctx.fillStyle = radial(ctx, cx, 0, R, cx, 0, R + W, radialProfile(p.bevel));
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  // End bevels: the first and last quads' short edges.
  const n = b.points;
  const endTint = rgba(p.endBevel, 0.6);
  for (const i of [0, n - 1]) {
    const o = outer[i];
    const inn = outer[2 * n - 1 - i];
    const next = outer[i === 0 ? 1 : n - 2];
    const innNext = outer[i === 0 ? 2 * n - 2 : n + 1];
    if (o === undefined || inn === undefined || next === undefined || innNext === undefined)
      continue;
    const f = Math.min(0.9, inset / Math.max(1, Math.hypot(next.x - o.x, next.y - o.y)));
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + (next.x - o.x) * f, o.y + (next.y - o.y) * f);
    ctx.lineTo(inn.x + (innNext.x - inn.x) * f, inn.y + (innNext.y - inn.y) * f);
    ctx.lineTo(inn.x, inn.y);
    ctx.closePath();
    ctx.fillStyle = endTint;
    ctx.fill();
  }
  const trim = (2 * inset) / rm;
  const pill = curvedBrickVertices(
    R + inset,
    Math.max(1, W - 2 * inset),
    Math.max(0.01, b.sector - trim),
    n,
  );
  polyPath(ctx, pill);
  ctx.fillStyle = radial(ctx, cx, 0, R + inset, cx, 0, R + W - inset, radialProfile(p.pill));
  ctx.fill();
  ctx.lineWidth = u;
  ctx.strokeStyle = p.line;
  ctx.stroke();
  // Gloss streak along the outer part of the pill.
  const gr = R + W - inset - (W - 2 * inset) * 0.28;
  const half = (b.sector - trim) / 2 - 2.5 / rm;
  if (half > 0) {
    ctx.beginPath();
    ctx.arc(cx, 0, gr, -half, half);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, u * 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.stroke();
  }
}

/**
 * Bricks need their own, larger cache: a level holds up to about 190 of them, each baked at its
 * rotation, with a glow per lit color. At most two full-screen layers' worth of pixels, so
 * earlier levels' bricks go (spec 14.2, mobile pass); the board keeps the sprites it drew with.
 */
const brickLayers = new LayerCache(900, 2);

/** DEV: what the brick cache holds (app.ts, window.__teggleLayers). */
export function brickLayerStats(): ReturnType<LayerCache['stats']> {
  return brickLayers.stats();
}

function brickKey(b: BrickShape): string {
  return b.kind === 'brick'
    ? `b:${b.rotation.toFixed(4)}:${b.length}:${b.width}`
    : `c:${b.rotation.toFixed(4)}:${b.innerRadius}:${b.width}:${b.sector.toFixed(4)}:${b.points}`;
}

/**
 * Brick sprite with the brick's rotation baked in, positioned relative to the brick's position
 * (draw it with drawLayer at b.x, b.y). Cached per shape, rotation, color, state and resolution.
 */
export function brickSprite(k: number, b: BrickShape, color: PegColor, lit: boolean): Layer {
  const local = brickWorldVertices({ ...b, x: 0, y: 0 });
  const bb = bounds(local, 1.5);
  return brickLayers.get(
    `${brickKey(b)}:${color}:${lit ? 1 : 0}`,
    k,
    bb.x,
    bb.y,
    bb.w,
    bb.h,
    (c) => {
      c.rotate(-b.rotation);
      paintBrickLocal(c, b, brickPalette[color][lit ? 'lit' : 'normal']);
    },
  );
}

/** Draws a straight or curved brick in its color and state. */
export function drawBrick(ctx: Ctx, k: number, b: BrickShape, color: PegColor, lit: boolean): void {
  drawLayer(ctx, brickSprite(k, b, color, lit), b.x, b.y);
}

/** Additive glow sprite of a lit brick, relative to the brick's position like brickSprite. */
export function brickGlowSprite(k: number, b: BrickShape, color: PegColor): Layer {
  const local = brickWorldVertices({ ...b, x: 0, y: 0 });
  const pad = 16;
  const bb = bounds(local, pad);
  const tint = pegGlow[color];
  return brickLayers.get(`glow:${brickKey(b)}:${tint}`, k, bb.x, bb.y, bb.w, bb.h, (c) => {
    c.save();
    c.shadowColor = rgba(tint, 0.95);
    c.shadowBlur = 11 * k;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 0;
    polyPath(c, local);
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = rgba(tint, 0.55);
    c.stroke();
    c.fillStyle = rgba(tint, 0.55);
    c.fill();
    c.restore();
  });
}

/** Additive glow around a lit brick (the original uses a 62x54 glow on a 35x20 brick). */
export function drawBrickGlow(
  ctx: Ctx,
  k: number,
  b: BrickShape,
  color: PegColor,
  intensity = 1,
): void {
  if (intensity <= 0) return;
  const layer = brickGlowSprite(k, b, color);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, intensity);
  drawLayer(ctx, layer, b.x, b.y);
  ctx.restore();
}

/** Brick shadow: the outline filled black at 45%, offset (-4, +3). */
export function drawBrickShadow(ctx: Ctx, b: BrickShape): void {
  const s = shapeTokens.shadowObject;
  polyPath(
    ctx,
    brickWorldVertices(b).map((v) => ({ x: v.x + s.dx, y: v.y + s.dy })),
  );
  ctx.fillStyle = `rgba(0,0,0,${s.alpha})`;
  ctx.fill();
}

/** Hit flash for a brick: a short white-hot glow over the lit brick. */
export function drawBrickHitFlash(
  ctx: Ctx,
  k: number,
  b: BrickShape,
  color: PegColor,
  tMs: number,
): void {
  if (tMs < 0 || tMs >= HIT_FLASH_MS) return;
  const t = tMs / HIT_FLASH_MS;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.8 * (1 - t);
  polyPath(ctx, brickWorldVertices(b));
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  drawBrickGlow(ctx, k, b, color, 1.6 * (1 - t));
}

/** Removal pop for a brick: the color ring from its center, sized to the brick. */
export function drawBrickPop(ctx: Ctx, b: BrickShape, color: PegColor, tMs: number): void {
  const pts = brickWorldVertices(b);
  const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), {
    x: 0,
    y: 0,
  });
  drawRemovalPop(ctx, c.x, c.y, color, tMs, 14);
}
