// The playfield behind the pegs. Level pictures do not exist yet (spec 12: they will be
// generated), so a level whose background has no picture gets a plain, quiet night-blue field:
// no scenery pretending to be its art. The whole world is filled so the Fever zoom never shows
// an edge.

import { WORLD_H, WORLD_W, layout } from '../layout';
import { drawLayer, layers } from '../render/cache';
import { linear, radial, type Ctx } from '../render/paint';

export type BackdropPainter = (ctx: Ctx, k: number) => void;

function paintPlain(ctx: Ctx): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, '#0e1638'],
    [0.55, '#1a2350'],
    [1, '#241c46'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const o = layout.opening;
  const cx = o.x + o.w / 2;
  ctx.fillStyle = radial(ctx, cx, 330, 40, cx, 330, 520, [
    [0, 'rgba(70, 96, 170, 0.35)'],
    [1, 'rgba(70, 96, 170, 0)'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

export const plainBackdrop: BackdropPainter = (ctx, k) => {
  drawLayer(ctx, layers.get('play:backdrop', k, 0, 0, WORLD_W, WORLD_H, paintPlain));
};
