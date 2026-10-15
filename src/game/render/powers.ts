// Power effects on the playfield (visual guide 4.4, 6.1, 12.4): the green starburst at a green
// peg, Space Blast's bubble, Flower Power's blooms, Spooky Ball's poofs and aura, the Pyramid's
// light, Zen Ball's calm glow, and the Lucky Spin wheel. Teggle's own drawings: the original's
// sprites are only described in the guide, never copied. Shapes are cached as layers and drawn
// with a transform and alpha, so a frame allocates nothing but a few paths.

import { ease } from '../ui/motion';
import { darken, lighten, rgba } from '../ui/color';
import { drawText, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';
import { drawLayer, layers, type Layer } from './cache';
import { circlePath, linear, radial, type Ctx } from './paint';

/** Length of the green starburst (pulse_powerup: 19 frames, about 0.57 s; guide 4.4). */
export const GREEN_BURST_MS = 570;
export const SPACE_BLAST_MS = 900;
export const FLOWER_MS = 1400;
export const POOF_MS = 650;
export const PYRAMID_RAYS_MS = 1100;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Soft additive glow disc of one tint, centered on the origin. */
export function fxGlow(k: number, tint: string, radius: number): Layer {
  return layers.get(
    `fx:glow:${tint}:${radius}`,
    k,
    -radius,
    -radius,
    2 * radius,
    2 * radius,
    (c) => {
      c.fillStyle = radial(c, 0, 0, 0, 0, 0, radius, [
        [0, rgba(tint, 0.9)],
        [0.25, rgba(tint, 0.6)],
        [0.6, rgba(tint, 0.2)],
        [1, rgba(tint, 0)],
      ]);
      circlePath(c, 0, 0, radius);
      c.fill();
    },
  );
}

/** Draws a layer centered on (x, y), scaled and rotated, with an alpha; additive when `add`. */
function blit(
  ctx: Ctx,
  layer: Layer,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  alpha: number,
  add: boolean,
): void {
  if (alpha <= 0 || scale <= 0) return;
  const prevAlpha = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.globalAlpha = prevAlpha * Math.min(1, alpha);
  if (add) ctx.globalCompositeOperation = 'lighter';
  drawLayer(ctx, layer);
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
}

// ---------------------------------------------------------------------------------------------
// Green hit: a starburst of rays (pulse_powerup, 174 x 174)

function paintRays(ctx: Ctx, rays: number, inner: string, outer: string, r: number): void {
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const len = i % 2 === 0 ? r : r * 0.62;
    const w = i % 2 === 0 ? 0.1 : 0.07;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - w) * 6, Math.sin(a - w) * 6);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + w) * 6, Math.sin(a + w) * 6);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 0, 0, 4, 0, 0, len, [
      [0, inner],
      [0.45, rgba(outer, 0.75)],
      [1, rgba(outer, 0)],
    ]);
    ctx.fill();
  }
}

function burstLayer(k: number): Layer {
  return layers.get('fx:green-burst', k, -88, -88, 176, 176, (c) => {
    paintRays(c, 16, 'rgba(210,255,180,0.8)', '#48e030', 87);
  });
}

/** The green starburst where a green peg lit; `t` in ms since the hit. */
export function drawGreenBurst(ctx: Ctx, k: number, x: number, y: number, t: number): void {
  if (t < 0 || t >= GREEN_BURST_MS) return;
  const f = t / GREEN_BURST_MS;
  const grow = ease.outCubic(clamp01(f / 0.35));
  const fade = f < 0.4 ? 1 : 1 - (f - 0.4) / 0.6;
  blit(ctx, fxGlow(k, '#5cff3a', 34), x, y, 0.6 + 0.7 * grow, 0, fade * 0.55, true);
  blit(ctx, burstLayer(k), x, y, 0.25 + 0.75 * grow, f * 0.9, fade * 0.85, true);
  // A thin ring running out past the rays.
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * fade * 0.8;
  circlePath(ctx, x, y, 12 + 78 * ease.outQuad(f));
  ctx.lineWidth = 2.5 * (1 - f) + 0.5;
  ctx.strokeStyle = '#c8ffb0';
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

// ---------------------------------------------------------------------------------------------
// Space Blast: a bubble that swells to the blast radius, a halo ring and a flash

function bubbleLayer(k: number): Layer {
  return layers.get('fx:space-bubble', k, -101, -101, 202, 202, (c) => {
    c.fillStyle = radial(c, -18, -24, 6, 0, 0, 100, [
      [0, 'rgba(230,220,255,0.35)'],
      [0.55, 'rgba(150,90,255,0.18)'],
      [0.86, 'rgba(120,200,255,0.32)'],
      [0.97, 'rgba(225,245,255,0.75)'],
      [1, 'rgba(225,245,255,0)'],
    ]);
    circlePath(c, 0, 0, 100);
    c.fill();
    // Light caught on the upper left of the bubble.
    c.beginPath();
    c.ellipse(-38, -46, 30, 12, -0.7, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fill();
  });
}

/** Space Blast at (x, y) reaching `radius`; `t` in ms since the blast. */
export function drawSpaceBlast(
  ctx: Ctx,
  k: number,
  x: number,
  y: number,
  radius: number,
  t: number,
): void {
  if (t < 0 || t >= SPACE_BLAST_MS) return;
  const f = t / SPACE_BLAST_MS;
  const swell = ease.outBack(1.2)(clamp01(t / 260));
  const fade = t < 380 ? 1 : 1 - (t - 380) / (SPACE_BLAST_MS - 380);
  blit(ctx, bubbleLayer(k), x, y, (radius / 100) * swell, 0, fade, false);
  blit(ctx, fxGlow(k, '#c79bff', 60), x, y, 0.6 + 1.6 * f, 0, (1 - f) * (1 - f), true);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * fade * 0.9;
  circlePath(ctx, x, y, radius * (0.9 + 0.35 * ease.outQuad(f)));
  ctx.lineWidth = 3 * (1 - f) + 1;
  ctx.strokeStyle = '#8fe8ff';
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

// ---------------------------------------------------------------------------------------------
// Flower Power: a flower opening on every peg it lit

function flowerLayer(k: number): Layer {
  return layers.get('fx:flower', k, -24, -24, 48, 48, (c) => {
    const petals = 7;
    for (let i = 0; i < petals; i++) {
      c.save();
      c.rotate((i / petals) * Math.PI * 2);
      c.beginPath();
      c.ellipse(0, -13, 6.2, 11, 0, 0, Math.PI * 2);
      c.fillStyle = linear(c, 0, -24, 0, -2, [
        [0, '#ffd8f4'],
        [0.5, '#ff7ad6'],
        [1, '#d23ea8'],
      ]);
      c.fill();
      c.lineWidth = 0.9;
      c.strokeStyle = '#7a1258';
      c.stroke();
      c.restore();
    }
    circlePath(c, 0, 0, 7.5);
    c.fillStyle = radial(c, -2, -2, 0, 0, 0, 7.5, [
      [0, '#fff6b0'],
      [0.6, '#ffc21a'],
      [1, '#c97a00'],
    ]);
    c.fill();
    c.lineWidth = 0.9;
    c.strokeStyle = '#6a3a00';
    c.stroke();
  });
}

/** A flower opening at (x, y); `t` in ms since it was lit, `spin` a fixed turn per flower. */
export function drawFlower(ctx: Ctx, k: number, x: number, y: number, t: number, spin: number) {
  if (t < 0 || t >= FLOWER_MS) return;
  const open =
    t < 220
      ? ease.outBack(1.6)(t / 220) * 1.15
      : t < 380
        ? 1.15 - 0.15 * ease.inOutSine((t - 220) / 160)
        : 1;
  const fade = t < 950 ? 1 : 1 - (t - 950) / (FLOWER_MS - 950);
  blit(ctx, fxGlow(k, '#ff62fd', 30), x, y, 0.8 + 0.4 * open, 0, fade * 0.55, true);
  blit(ctx, flowerLayer(k), x, y, open, spin + t * 0.0012, fade, false);
}

// ---------------------------------------------------------------------------------------------
// Spooky Ball: puffs of ghostly smoke where it leaves and comes back, and a pale aura

/** A puff of ghostly smoke at (x, y); `t` in ms since it started. */
export function drawPoof(ctx: Ctx, k: number, x: number, y: number, t: number): void {
  if (t < 0 || t >= POOF_MS) return;
  const f = t / POOF_MS;
  const spread = 6 + 30 * ease.outCubic(f);
  const glow = fxGlow(k, '#d9d2ff', 18);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    blit(
      ctx,
      glow,
      x + Math.cos(a) * spread,
      y + Math.sin(a) * spread * 0.7 - 12 * f,
      0.7 + 0.8 * f,
      0,
      (1 - f) * 0.85,
      true,
    );
  }
  blit(ctx, fxGlow(k, '#ffffff', 22), x, y, 1, 0, (1 - f) * (1 - f), true);
}

/**
 * The pale aura of a ball that will come back from the bottom, with a ghostly wake behind it
 * along (vx, vy), its velocity in units per tick.
 */
export function drawSpookyAura(
  ctx: Ctx,
  k: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: number,
  tMs: number,
): void {
  const pulse = 0.75 + 0.25 * Math.sin(tMs / 140);
  const glow = fxGlow(k, '#b9a8ff', 22);
  for (let i = 3; i >= 1; i--) {
    const back = i * 2.2;
    const wobble = Math.sin(tMs / 90 + i * 1.7) * 1.5 * i;
    blit(
      ctx,
      glow,
      x - vx * back + wobble,
      y - vy * back,
      (r / 6) * (1 - 0.18 * i),
      0,
      0.5 / i,
      true,
    );
  }
  blit(ctx, glow, x, y, (r / 6) * (1.15 + 0.15 * pulse), 0, 0.95 * pulse, true);
}

// ---------------------------------------------------------------------------------------------
// Pyramid: light rising from the bucket's new edges

function raysUpLayer(k: number): Layer {
  return layers.get('fx:pyramid-rays', k, -190, -150, 380, 152, (c) => {
    for (let i = -5; i <= 5; i++) {
      const top = -146 + Math.abs(i) * 9;
      const x0 = i * 30;
      c.beginPath();
      c.moveTo(x0 - 9, 0);
      c.lineTo(x0 * 1.25 - 3, top);
      c.lineTo(x0 * 1.25 + 3, top);
      c.lineTo(x0 + 9, 0);
      c.closePath();
      c.fillStyle = linear(c, 0, 0, 0, top, [
        [0, 'rgba(255,230,140,0.7)'],
        [1, 'rgba(255,200,80,0)'],
      ]);
      c.fill();
    }
  });
}

/** Golden rays over the bucket when the Pyramid appears; `t` in ms since then. */
export function drawPyramidRays(ctx: Ctx, k: number, x: number, y: number, t: number): void {
  if (t < 0 || t >= PYRAMID_RAYS_MS) return;
  const f = t / PYRAMID_RAYS_MS;
  const a = f < 0.2 ? f / 0.2 : 1 - (f - 0.2) / 0.8;
  const prevAlpha = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalAlpha = prevAlpha * a;
  ctx.globalCompositeOperation = 'lighter';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.6 + 0.4 * ease.outCubic(clamp01(f / 0.4)));
  drawLayer(ctx, raysUpLayer(k));
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
}

// ---------------------------------------------------------------------------------------------
// Zen Ball: a calm silver light

/** A slow silver glow around (x, y) of radius about `r`, breathing with `tMs`. */
export function drawZenGlow(ctx: Ctx, k: number, x: number, y: number, r: number, tMs: number) {
  const breath = 0.5 + 0.5 * Math.sin(tMs / 380);
  blit(
    ctx,
    fxGlow(k, '#dff0ff', 40),
    x,
    y,
    (r / 40) * (0.92 + 0.12 * breath),
    0,
    0.5 + 0.3 * breath,
    true,
  );
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (0.35 + 0.35 * (1 - breath));
  circlePath(ctx, x, y, r * (0.85 + 0.3 * breath));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#eaf6ff';
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
}

/**
 * Zen Ball's search seen from the cannon: faint silver lines over the angles it tries, from
 * `from` to `to` (radians from straight down, as the cannon's), the best one so far brighter.
 * `progress` (0 to 1) is how far the search has got.
 */
export function drawZenFan(
  ctx: Ctx,
  pivotX: number,
  pivotY: number,
  from: number,
  to: number,
  best: number,
  progress: number,
  tMs: number,
): void {
  const prevAlpha = ctx.globalAlpha;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const lines = 9;
  for (let i = 0; i < lines; i++) {
    const a = from + ((to - from) * i) / (lines - 1);
    const shimmer = 0.5 + 0.5 * Math.sin(tMs / 120 + i * 0.9);
    ctx.globalAlpha = prevAlpha * (0.08 + 0.1 * shimmer);
    ctx.beginPath();
    ctx.moveTo(pivotX + Math.sin(a) * 96, pivotY + Math.cos(a) * 96);
    ctx.lineTo(pivotX + Math.sin(a) * 300, pivotY + Math.cos(a) * 300);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#cfe6ff';
    ctx.stroke();
  }
  ctx.globalAlpha = prevAlpha * (0.35 + 0.4 * progress);
  ctx.beginPath();
  ctx.moveTo(pivotX + Math.sin(best) * 96, pivotY + Math.cos(best) * 96);
  ctx.lineTo(pivotX + Math.sin(best) * 330, pivotY + Math.cos(best) * 330);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
}

// ---------------------------------------------------------------------------------------------
// Lucky Spin wheel: four enamel segments in a brass rim with chasing bulbs, a pointer on top

export const WHEEL_RADIUS = 92;
const SEGMENT_COLORS = ['#e8a21a', '#d8261a', '#1caa3a', '#2a5ad8'] as const;
const SEGMENT_LABELS: readonly (readonly [string, string])[] = [
  ['BIG', 'BALL'],
  ['TRIPLE', 'SCORE'],
  ['EXTRA', 'BALL'],
  ['RANDOM', 'POWER'],
];

const WHEEL_INK: TextStyle = {
  cap: 10.5,
  fill: [
    [0, '#ffffff'],
    [1, '#ffe9b0'],
  ],
  outline: { color: '#1a0c00', width: 1.6 },
  align: 'center',
  anchor: 'middle',
};

function paintWheelFace(ctx: Ctx): void {
  const r = WHEEL_RADIUS - 8;
  for (let i = 0; i < 4; i++) {
    // Segment i is centered on the angle i quarter turns clockwise from the top.
    const mid = -Math.PI / 2 + (i * Math.PI) / 2;
    const base = SEGMENT_COLORS[i] ?? '#888888';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mid - Math.PI / 4, mid + Math.PI / 4);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, Math.cos(mid) * r * 0.35, Math.sin(mid) * r * 0.35, 4, 0, 0, r, [
      [0, lighten(base, 0.45)],
      [0.55, base],
      [1, darken(base, 0.45)],
    ]);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#2a1404';
    ctx.stroke();
    ctx.save();
    ctx.rotate(mid + Math.PI / 2);
    const [a, b] = SEGMENT_LABELS[i] ?? ['', ''];
    drawText(ctx, a, 0, -r * 0.66, WHEEL_INK);
    drawText(ctx, b, 0, -r * 0.66 + 13, WHEEL_INK);
    ctx.restore();
  }
  // Gloss over the upper half.
  ctx.beginPath();
  ctx.ellipse(-10, -30, r * 0.8, r * 0.45, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
}

function paintWheelRim(ctx: Ctx): void {
  const r = WHEEL_RADIUS;
  circlePath(ctx, 2, 3, r + 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.arc(0, 0, r - 9, 0, Math.PI * 2, true);
  ctx.fillStyle = linear(ctx, 0, -r, 0, r, [
    [0, color.brassHi],
    [0.3, color.brass],
    [0.7, color.brassMid],
    [1, color.brassDeep],
  ]);
  ctx.fill('evenodd');
  circlePath(ctx, 0, 0, r);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  circlePath(ctx, 0, 0, r - 9);
  ctx.stroke();
}

function paintWheelHub(ctx: Ctx): void {
  circlePath(ctx, 0, 0, 15);
  ctx.fillStyle = radial(ctx, -4, -5, 1, 0, 0, 15, [
    [0, color.brassHi],
    [0.45, color.brass],
    [1, color.brassLo],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  circlePath(ctx, 0, 0, 6);
  ctx.fillStyle = '#d8261a';
  ctx.fill();
  ctx.stroke();
}

function paintPointer(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(-11, -6);
  ctx.quadraticCurveTo(0, -12, 11, -6);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, -12, 0, 14, [
    [0, '#ffe9a8'],
    [0.5, '#e8b030'],
    [1, '#9a5a08'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#2a1404';
  ctx.stroke();
}

/**
 * The Lucky Spin wheel at (cx, cy), turned by `rotation` (radians, clockwise on screen; segment
 * i sits under the pointer at -i quarter turns). `lit` lights the bulbs in a chase; `win` marks
 * the winning segment (-1 for none) with a pulsing glow.
 */
export function drawLuckyWheel(
  ctx: Ctx,
  k: number,
  cx: number,
  cy: number,
  rotation: number,
  scale: number,
  alpha: number,
  tMs: number,
  win: number,
): void {
  if (alpha <= 0 || scale <= 0) return;
  const r = WHEEL_RADIUS;
  const prevAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = prevAlpha * alpha;
  drawLayer(
    ctx,
    layers.get('fx:wheel-rim', k * scale, -r - 4, -r - 4, 2 * r + 10, 2 * r + 10, paintWheelRim),
  );
  ctx.save();
  ctx.rotate(rotation);
  drawLayer(ctx, layers.get('fx:wheel-face', k * scale, -r, -r, 2 * r, 2 * r, paintWheelFace));
  if (win >= 0) {
    const mid = -Math.PI / 2 + (win * Math.PI) / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = prevAlpha * alpha * (0.35 + 0.25 * Math.sin(tMs / 90));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r - 9, mid - Math.PI / 4, mid + Math.PI / 4);
    ctx.closePath();
    ctx.fillStyle = '#fff6c8';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = prevAlpha * alpha;
  }
  ctx.restore();
  // Bulbs around the rim: a chase while it turns.
  const chase = Math.floor(tMs / 70);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const on = (i + chase) % 2 === 0;
    circlePath(ctx, Math.cos(a) * (r - 4.5), Math.sin(a) * (r - 4.5), 2.6);
    ctx.fillStyle = on ? '#fff6c0' : '#8a5a10';
    ctx.fill();
  }
  drawLayer(ctx, layers.get('fx:wheel-hub', k * scale, -16, -16, 32, 32, paintWheelHub));
  ctx.translate(0, -r - 4);
  drawLayer(ctx, layers.get('fx:wheel-pointer', k * scale, -13, -14, 26, 30, paintPointer));
  ctx.restore();
  ctx.globalAlpha = prevAlpha;
}
