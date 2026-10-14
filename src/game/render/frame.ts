// The machine frame around the playfield (guide 2, 13, 16.2): a themed enamel plate with a
// rounded opening, an enamel rim pipe around the opening and over the HUD columns, a bottom rim
// tube, embossed corner emblems, rivets and brass knobs, plus the soft inner shadow the frame
// casts on the background picture. The ball counter, Fever meter, score windows and launcher
// are drawn by their own modules and never change with the theme.

import { CENTER_X, WORLD_H, WORLD_W, layout } from '../layout';
import { darken, lighten, mix, rgba } from '../ui/color';
import type { Theme } from '../ui/tokens';
import { drawLayer, layers } from './cache';
import { drawEmblem } from './emblems';
import { knob, linear, radial, rivet, tubeStroke, type Ctx } from './paint';

const OPEN = layout.opening;
const TOP_R = 38;
const BOTTOM_R = 23;
const OPEN_BOTTOM = 591;

/**
 * Playfield opening: rounded top corners, smaller rounded bottom corners. With `append` it adds
 * a subpath to the current path instead of starting a new one.
 */
export function openingPath(ctx: Ctx, append = false): void {
  const x0 = OPEN.x;
  const x1 = OPEN.x + OPEN.w;
  const y0 = OPEN.y;
  const y1 = OPEN_BOTTOM;
  if (!append) ctx.beginPath();
  ctx.moveTo(x0 + TOP_R, y0);
  ctx.lineTo(x1 - TOP_R, y0);
  ctx.arcTo(x1, y0, x1, y0 + TOP_R, TOP_R);
  ctx.lineTo(x1, y1 - BOTTOM_R);
  ctx.arcTo(x1, y1, x1 - BOTTOM_R, y1, BOTTOM_R);
  ctx.lineTo(x0 + BOTTOM_R, y1);
  ctx.arcTo(x0, y1, x0, y1 - BOTTOM_R, BOTTOM_R);
  ctx.lineTo(x0, y0 + TOP_R);
  ctx.arcTo(x0, y0, x0 + TOP_R, y0, TOP_R);
  ctx.closePath();
}

/** The rim pipe's path: up the sides and across the top, open at the bottom. */
function rimPath(inset: number): (ctx: Ctx) => void {
  return (ctx) => {
    const x0 = OPEN.x - inset;
    const x1 = OPEN.x + OPEN.w + inset;
    const y0 = OPEN.y - inset;
    const r = TOP_R + inset;
    ctx.beginPath();
    ctx.moveTo(x0, OPEN_BOTTOM - BOTTOM_R);
    ctx.lineTo(x0, y0 + r);
    ctx.arcTo(x0, y0, x0 + r, y0, r);
    ctx.lineTo(x1 - r, y0);
    ctx.arcTo(x1, y0, x1, y0 + r, r);
    ctx.lineTo(x1, OPEN_BOTTOM - BOTTOM_R);
  };
}

function plateRegion(ctx: Ctx): void {
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  openingPath(ctx, true);
}

function paintFrame(ctx: Ctx, theme: Theme): void {
  // Enamel plate.
  plateRegion(ctx);
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, lighten(theme.base, 0.12)],
    [0.12, theme.base],
    [0.6, mix(theme.base, theme.dark, 0.25)],
    [1, mix(theme.base, theme.dark, 0.45)],
  ]);
  ctx.fill('evenodd');
  ctx.save();
  plateRegion(ctx);
  ctx.clip('evenodd');
  // Airbrushed highlights on the corner plates and along the top rail.
  for (const [x, y, r] of [
    [30, 12, 70],
    [WORLD_W - 30, 12, 70],
    [CENTER_X - 200, 6, 120],
    [CENTER_X + 200, 6, 120],
    [20, 560, 60],
    [WORLD_W - 20, 560, 60],
  ] as const) {
    ctx.fillStyle = radial(ctx, x, y, 0, x, y, r, [
      [0, rgba(lighten(theme.light, 0.55), 0.7)],
      [0.5, rgba(lighten(theme.light, 0.3), 0.25)],
      [1, rgba(theme.light, 0)],
    ]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Sculpted shade low on the corner plates, toward the playfield.
  for (const [x, y] of [
    [100, 64],
    [WORLD_W - 100, 64],
  ] as const) {
    ctx.fillStyle = radial(ctx, x, y, 4, x, y, 46, [
      [0, rgba(darken(theme.dark, 0.3), 0.55)],
      [1, rgba(theme.dark, 0)],
    ]);
    ctx.fillRect(x - 46, y - 46, 92, 92);
  }
  // Enamel gloss along the very top edge.
  ctx.fillStyle = linear(ctx, 0, 0, 0, 8, [
    [0, rgba('#ffffff', 0.3)],
    [1, rgba('#ffffff', 0)],
  ]);
  ctx.fillRect(0, 0, WORLD_W, 8);
  // Shade where the plate meets the screen edges.
  ctx.fillStyle = linear(ctx, 0, 0, 10, 0, [
    [0, rgba(theme.dark, 0.6)],
    [1, rgba(theme.dark, 0)],
  ]);
  ctx.fillRect(0, 0, 10, WORLD_H);
  ctx.fillStyle = linear(ctx, WORLD_W, 0, WORLD_W - 10, 0, [
    [0, rgba(theme.dark, 0.6)],
    [1, rgba(theme.dark, 0)],
  ]);
  ctx.fillRect(WORLD_W - 10, 0, 10, WORLD_H);
  // Light lip right at the opening, then a dark seam.
  openingPath(ctx);
  ctx.lineWidth = 9;
  ctx.strokeStyle = rgba(darken(theme.dark, 0.3), 0.85);
  ctx.stroke();
  ctx.restore();

  // Pipe rings over the HUD columns: from the screen edge over the plaque, ending where they
  // meet the rim pipe's rounded corner (a T joint), mirrored on the right.
  const deg = Math.PI / 180;
  for (const [cx, a0, a1] of [
    [40, 200 * deg, 308 * deg],
    [WORLD_W - 40, 232 * deg, 340 * deg],
  ] as const) {
    tubeStroke(
      ctx,
      (c) => {
        c.beginPath();
        c.arc(cx, 120, 66, a0, a1);
      },
      7,
      theme.pipe,
      {
        outline: darken(theme.dark, 0.55),
        highlight: lighten(theme.pipe, 0.65),
        shadow: darken(theme.pipe, 0.3),
      },
    );
  }
  // Rim pipe around the opening, in the theme's pipe color, over the ring ends.
  tubeStroke(ctx, rimPath(3.5), 7.5, theme.pipe, {
    outline: darken(theme.dark, 0.55),
    highlight: lighten(theme.pipe, 0.65),
    shadow: darken(theme.pipe, 0.3),
  });
  // Bottom rim tube.
  tubeStroke(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(-10, 596);
      c.lineTo(WORLD_W + 10, 596);
    },
    9,
    theme.base,
    { outline: darken(theme.dark, 0.6), highlight: lighten(theme.base, 0.6) },
  );
  // Emblems on the top corner plates.
  drawEmblem(ctx, theme, 45, 27, 1.45);
  drawEmblem(ctx, theme, WORLD_W - 45, 27, 1.45);
  // Rivets.
  for (const [x, y] of [
    [8, 50],
    [74, 8],
    [WORLD_W - 8, 50],
    [WORLD_W - 74, 8],
    [CENTER_X - 100, 49],
    [CENTER_X + 100, 49],
    [70, 587],
    [WORLD_W - 70, 587],
  ] as const) {
    rivet(ctx, x, y, 2.2);
  }
}

/** Themed frame plate, pipes and emblems (cached per theme and resolution). */
export function drawFrame(ctx: Ctx, k: number, theme: Theme): void {
  const layer = layers.get(`frame:${theme.index}`, k, 0, 0, WORLD_W, WORLD_H, (c) => {
    paintFrame(c, theme);
  });
  drawLayer(ctx, layer);
}

/** Brass knobs at the outer ends of the score windows; draw after the windows. */
export function drawFrameKnobs(ctx: Ctx): void {
  knob(ctx, 98, 21, 9);
  knob(ctx, WORLD_W - 98, 21, 9);
}

function paintFrameShadow(ctx: Ctx): void {
  // Black overlay over the picture, after the frame's measured shadow mask (guide 3).
  ctx.save();
  openingPath(ctx);
  ctx.clip();
  const x0 = OPEN.x;
  const x1 = OPEN.x + OPEN.w;
  const side = (from: number, to: number) =>
    linear(ctx, from, 0, to, 0, [
      [0, 'rgba(0,0,0,0.95)'],
      [0.25, 'rgba(0,0,0,0.54)'],
      [0.5, 'rgba(0,0,0,0.26)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  ctx.fillStyle = side(x0, x0 + 20);
  ctx.fillRect(x0, OPEN.y, 20, OPEN_BOTTOM - OPEN.y);
  ctx.fillStyle = side(x1, x1 - 20);
  ctx.fillRect(x1 - 20, OPEN.y, 20, OPEN_BOTTOM - OPEN.y);
  ctx.fillStyle = linear(ctx, 0, OPEN.y, 0, OPEN.y + 40, [
    [0, 'rgba(0,0,0,0.85)'],
    [0.12, 'rgba(0,0,0,0.62)'],
    [0.25, 'rgba(0,0,0,0.32)'],
    [0.5, 'rgba(0,0,0,0.04)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(x0, OPEN.y, OPEN.w, 40);
  ctx.fillStyle = linear(ctx, 0, OPEN_BOTTOM - 13, 0, OPEN_BOTTOM, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.19)'],
  ]);
  ctx.fillRect(x0, OPEN_BOTTOM - 13, OPEN.w, 13);
  // Soft disc under the launcher housing.
  ctx.fillStyle = radial(ctx, CENTER_X, 70, 30, CENTER_X, 70, 92, [
    [0, 'rgba(0,0,0,0.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(CENTER_X - 92, OPEN.y, 184, 120);
  ctx.restore();
}

/** Inner shadow over the background picture; draw right after the background. */
export function drawFrameShadow(ctx: Ctx, k: number): void {
  drawLayer(
    ctx,
    layers.get('frame:shadow', k, OPEN.x, OPEN.y, OPEN.w, OPEN_BOTTOM - OPEN.y, paintFrameShadow),
  );
}
