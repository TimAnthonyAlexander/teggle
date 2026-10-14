// Teggle's own corner emblems, one per master, drawn as embossed relief on the themed corner
// plates. Each shows the master's power, not the original's emblems (guide 13 and 15): the Guide
// gets an aim arc, Multiball three balls, Pyramid a stepped pyramid, Space Blast a burst,
// Flippers two paddles, Spooky Ball a pumpkin, Flower Power a flower, Lucky Spin a prize wheel,
// Fireball a comet and Zen Ball a stone cairn.

import { darken, lighten, rgba } from '../ui/color';
import type { Theme } from '../ui/tokens';
import type { Ctx } from './paint';

type Shape = (ctx: Ctx) => void;

function star(
  ctx: Ctx,
  x: number,
  y: number,
  points: number,
  ro: number,
  ri: number,
  rot = 0,
): void {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function disc(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

/** Filled shapes, in a box about 56 x 34 around (0, 0). Even-odd fill makes holes. */
const SHAPES: readonly Shape[] = [
  // 0 Guide: a dotted aim arc ending in an arrowhead.
  (ctx) => {
    const pts: [number, number, number][] = [
      [-22, -12, 2.6],
      [-14, -6, 3],
      [-5, -2, 3.4],
      [5, 0, 3.8],
    ];
    for (const [x, y, r] of pts) {
      ctx.moveTo(x - r, y - r);
      ctx.roundRect(x - r, y - r, 2 * r, 2 * r, r * 0.45);
    }
    ctx.moveTo(24, 3);
    ctx.lineTo(12, -6);
    ctx.lineTo(15, 3);
    ctx.lineTo(11, 11);
    ctx.closePath();
  },
  // 1 Multiball: three balls.
  (ctx) => {
    disc(ctx, -12, 6, 8.5);
    disc(ctx, 12, 6, 8.5);
    disc(ctx, 0, -9, 8.5);
  },
  // 2 Pyramid: three stepped courses.
  (ctx) => {
    ctx.rect(-24, 6, 48, 8);
    ctx.rect(-16, -3, 32, 8);
    ctx.rect(-8, -12, 16, 8);
    ctx.moveTo(-3, -13);
    ctx.lineTo(0, -18);
    ctx.lineTo(3, -13);
    ctx.closePath();
  },
  // 3 Space Blast: an eight-point burst with a ring.
  (ctx) => {
    star(ctx, 0, 0, 8, 17, 7, Math.PI / 8);
    disc(ctx, 0, 0, 4.5);
  },
  // 4 Flippers: two paddles in a V.
  (ctx) => {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 17, -6);
      ctx.rotate(side * -0.55);
      ctx.moveTo(0, -6);
      ctx.arc(0, 0, 6, -Math.PI / 2, Math.PI / 2, side > 0);
      ctx.lineTo(-side * 22, 2.5);
      ctx.arc(-side * 22, 0, 2.5, Math.PI / 2, -Math.PI / 2, side > 0);
      ctx.closePath();
      ctx.restore();
    }
  },
  // 5 Spooky Ball: a pumpkin, no face.
  (ctx) => {
    ctx.ellipse(-8, 4, 10, 11, 0, 0, Math.PI * 2);
    ctx.moveTo(18, 4);
    ctx.ellipse(8, 4, 10, 11, 0, 0, Math.PI * 2);
    ctx.moveTo(9, 4);
    ctx.ellipse(0, 4, 9, 12, 0, 0, Math.PI * 2);
    ctx.moveTo(-2, -7);
    ctx.lineTo(-1, -15);
    ctx.lineTo(4, -16);
    ctx.lineTo(2, -7);
    ctx.closePath();
  },
  // 6 Flower Power: eight petals around a center.
  (ctx) => {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 15);
      ctx.ellipse(Math.cos(a) * 11.5, Math.sin(a) * 10, 6.5, 3.6, a, 0, Math.PI * 2);
    }
    disc(ctx, 0, 0, 6.5);
  },
  // 7 Lucky Spin: a prize wheel with spokes and a pointer.
  (ctx) => {
    disc(ctx, 0, 2, 15);
    disc(ctx, 0, 2, 11.5);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * 1.4, 2 + Math.sin(a) * 1.4);
      ctx.save();
      ctx.translate(0, 2);
      ctx.rotate(a);
      ctx.rect(-1.2, 0, 2.4, 11.5);
      ctx.restore();
    }
    ctx.moveTo(-4.5, -17);
    ctx.lineTo(4.5, -17);
    ctx.lineTo(0, -10);
    ctx.closePath();
  },
  // 8 Fireball: a comet with three streaks.
  (ctx) => {
    disc(ctx, 12, 0, 9);
    for (const [y, len, w] of [
      [-6, 26, 2.6],
      [0, 34, 3.4],
      [6, 26, 2.6],
    ] as const) {
      ctx.moveTo(4, y - w / 2);
      ctx.lineTo(4 - len, y - w * 0.15);
      ctx.lineTo(4 - len, y + w * 0.15);
      ctx.lineTo(4, y + w / 2);
      ctx.closePath();
    }
  },
  // 9 Zen Ball: a cairn of three stones.
  (ctx) => {
    ctx.ellipse(0, 9, 19, 6.5, 0, 0, Math.PI * 2);
    ctx.moveTo(13, -1);
    ctx.ellipse(1, -1, 13, 5, -0.05, 0, Math.PI * 2);
    ctx.moveTo(6, -10);
    ctx.ellipse(-1, -10, 7.5, 4, 0.08, 0, Math.PI * 2);
  },
];

/** Emblems whose rings need even-odd holes; the rest overlap their parts and fill nonzero. */
const EVEN_ODD = new Set([3, 7]);

/** Draws the theme's emblem embossed on its plate, centered at (x, y). */
export function drawEmblem(ctx: Ctx, theme: Theme, x: number, y: number, scale = 1): void {
  const index = theme.index % SHAPES.length;
  const shape = SHAPES[index];
  if (shape === undefined) return;
  const rule: CanvasFillRule = EVEN_ODD.has(index) ? 'evenodd' : 'nonzero';
  const path = (dx: number, dy: number) => {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    shape(ctx);
    ctx.restore();
  };
  // Raised relief in the theme's pipe color, as the original's corner emblems are: a cast
  // shadow, a dark outline, the face, and a light edge along its top.
  path(1.4, 1.9);
  ctx.fillStyle = rgba(darken(theme.dark, 0.5), 0.6);
  ctx.fill(rule);
  path(0, 0);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(darken(theme.dark, 0.45), 0.9);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, y - 18 * scale, 0, y + 18 * scale);
  g.addColorStop(0, lighten(theme.pipe, 0.45));
  g.addColorStop(0.45, theme.pipe);
  g.addColorStop(1, darken(theme.pipe, 0.3));
  ctx.fillStyle = g;
  ctx.fill(rule);
  ctx.save();
  path(0, 0);
  ctx.clip(rule);
  path(0.9, 1.1);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(lighten(theme.pipe, 0.75), 0.8);
  ctx.stroke();
  ctx.restore();
}
