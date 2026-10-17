// Teggle's own medal (visual guide 15: none of the original's emblems or ribbon text): a gold
// disc with a lit orange peg at its heart, over two short ribbon tails. It marks a passed
// challenge on the challenge list, the stage intro card's squares and the end dialog.

import { circlePath, radial, type Ctx } from '../render/paint';

/** The medal centered at (x, y), radius `r`; `ribbons` adds the tails below it. */
export function drawMedal(ctx: Ctx, x: number, y: number, r: number, ribbons = true): void {
  if (r <= 0) return;
  ctx.save();
  if (ribbons) {
    const w = r * 0.62;
    for (const [dx, fill] of [
      [-r * 0.45, '#b8231a'],
      [r * 0.45, '#1c4fb8'],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x + dx - w / 2, y + r * 0.2);
      ctx.lineTo(x + dx + w / 2, y + r * 0.2);
      ctx.lineTo(x + dx + w / 2, y + r * 1.7);
      ctx.lineTo(x + dx, y + r * 1.42);
      ctx.lineTo(x + dx - w / 2, y + r * 1.7);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, r * 0.06);
      ctx.strokeStyle = '#1a0a04';
      ctx.stroke();
    }
  }
  circlePath(ctx, x + r * 0.08, y + r * 0.14, r);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  circlePath(ctx, x, y, r);
  ctx.fillStyle = radial(ctx, x - r * 0.33, y - r * 0.4, r * 0.06, x, y, r, [
    [0, '#fff6c8'],
    [0.38, '#f2c24a'],
    [0.82, '#b8781c'],
    [1, '#6e4210'],
  ]);
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  ctx.strokeStyle = '#3e2410';
  ctx.stroke();
  circlePath(ctx, x, y, r * 0.7);
  ctx.lineWidth = Math.max(0.6, r * 0.06);
  ctx.strokeStyle = 'rgba(110, 66, 16, 0.7)';
  ctx.stroke();
  circlePath(ctx, x, y, r * 0.4);
  ctx.fillStyle = radial(ctx, x - r * 0.1, y - r * 0.14, r * 0.03, x, y, r * 0.4, [
    [0, '#fafabc'],
    [0.55, '#f8a44d'],
    [1, '#a03504'],
  ]);
  ctx.fill();
  ctx.restore();
}
