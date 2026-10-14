// DEV ONLY. A plain procedural dusk scene that stands in for a level picture on the dev review
// routes, so glows, shadows and the frame shadow can be judged against a painted-like
// background. It is never shown to players.

import { WORLD_H, WORLD_W, layout } from '../layout';
import { drawLayer, layers } from '../render/cache';
import { linear, radial, type Ctx } from '../render/paint';

function paintBackdrop(ctx: Ctx): void {
  const o = layout.opening;
  const x0 = o.x - 4;
  const w = o.w + 8;
  ctx.fillStyle = linear(ctx, 0, o.y, 0, WORLD_H, [
    [0, '#1d1f5c'],
    [0.35, '#4a3f8f'],
    [0.6, '#b0678c'],
    [0.75, '#f0a46a'],
    [1, '#f6c27a'],
  ]);
  ctx.fillRect(x0, o.y - 4, w, WORLD_H - o.y + 4);
  for (const [cx, cy, rx, ry, a] of [
    [260, 170, 140, 26, 0.18],
    [700, 130, 190, 30, 0.14],
    [520, 260, 220, 22, 0.12],
    [880, 300, 120, 18, 0.16],
  ] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, rx, [
      [0, `rgba(255,220,240,${a})`],
      [1, 'rgba(255,220,240,0)'],
    ]);
    ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    ctx.restore();
  }
  // Two rows of hills.
  for (const [base, amp, col] of [
    [470, 40, '#3b2a5c'],
    [530, 30, '#1f1838'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, WORLD_H);
    for (let x = x0; x <= x0 + w; x += 8) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x / 97 + base)) - 12 * Math.sin(x / 31 + base);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(x0 + w, WORLD_H);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
}

export function drawDevBackdrop(ctx: Ctx, k: number): void {
  drawLayer(ctx, layers.get('dev:backdrop', k, 0, 0, WORLD_W, WORLD_H, paintBackdrop));
}
