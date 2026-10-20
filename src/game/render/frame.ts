// The machine frame around the playfield (guide 2, 13, 16.2): a themed enamel plate with a
// rounded opening, an enamel rim pipe around the opening and over the HUD columns, a bottom rim
// tube, embossed corner emblems, rivets and brass knobs, plus the soft inner shadow the frame
// casts on the background picture. The ball counter, Fever meter, score windows and launcher
// are drawn by their own modules and never change with the theme.
//
// A narrower board brings the frame in with it (layout.machineLayout): the plate, its opening and
// everything along its sides stand in by the layout's inset, and plain bars in the theme's dark
// color fill the screen beside it.

import {
  CENTER_X,
  TEGGLE_BOARD_W,
  WORLD_H,
  WORLD_W,
  machineLayout,
  type Box,
  type MachineLayout,
} from '../layout';
import { darken, lighten, mix, rgba } from '../ui/color';
import type { Theme } from '../ui/tokens';
import { drawLayer, layers } from './cache';
import { drawEmblem } from './emblems';
import { knob, linear, radial, rivet, tubeStroke, type Ctx } from './paint';

/** Teggle's own machine, the default everywhere. */
const TEGGLE = machineLayout(TEGGLE_BOARD_W);
const TOP_R = 38;
const BOTTOM_R = 23;
const OPEN_BOTTOM = 591;

/**
 * Playfield opening: rounded top corners, smaller rounded bottom corners. With `append` it adds
 * a subpath to the current path instead of starting a new one.
 */
export function openingPath(ctx: Ctx, append = false, open: Box = TEGGLE.opening): void {
  const x0 = open.x;
  const x1 = open.x + open.w;
  const y0 = open.y;
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
function rimPath(inset: number, open: Box): (ctx: Ctx) => void {
  return (ctx) => {
    const x0 = open.x - inset;
    const x1 = open.x + open.w + inset;
    const y0 = open.y - inset;
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

function plateRegion(ctx: Ctx, g: MachineLayout): void {
  ctx.beginPath();
  ctx.rect(g.left, 0, g.right - g.left, WORLD_H);
  openingPath(ctx, true, g.opening);
}

function paintFrame(ctx: Ctx, theme: Theme, g: MachineLayout): void {
  const { left, right } = g;
  if (g.inset > 0) {
    // Plain bars beside a narrow frame; the frame keeps to its own width.
    ctx.fillStyle = theme.dark;
    ctx.fillRect(0, 0, left, WORLD_H);
    ctx.fillRect(right, 0, WORLD_W - right, WORLD_H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, right - left, WORLD_H);
    ctx.clip();
  }
  // Enamel plate.
  plateRegion(ctx, g);
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, lighten(theme.base, 0.12)],
    [0.12, theme.base],
    [0.6, mix(theme.base, theme.dark, 0.25)],
    [1, mix(theme.base, theme.dark, 0.45)],
  ]);
  ctx.fill('evenodd');
  ctx.save();
  plateRegion(ctx, g);
  ctx.clip('evenodd');
  // Airbrushed highlights on the corner plates and along the top rail.
  for (const [x, y, r] of [
    [left + 30, 12, 70],
    [right - 30, 12, 70],
    [CENTER_X - 200, 6, 120],
    [CENTER_X + 200, 6, 120],
    [left + 20, 560, 60],
    [right - 20, 560, 60],
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
    [left + 100, 64],
    [right - 100, 64],
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
  ctx.fillRect(left, 0, right - left, 8);
  // Shade where the plate meets the screen edges.
  ctx.fillStyle = linear(ctx, left, 0, left + 10, 0, [
    [0, rgba(theme.dark, 0.6)],
    [1, rgba(theme.dark, 0)],
  ]);
  ctx.fillRect(left, 0, 10, WORLD_H);
  ctx.fillStyle = linear(ctx, right, 0, right - 10, 0, [
    [0, rgba(theme.dark, 0.6)],
    [1, rgba(theme.dark, 0)],
  ]);
  ctx.fillRect(right - 10, 0, 10, WORLD_H);
  // Light lip right at the opening, then a dark seam.
  openingPath(ctx, false, g.opening);
  ctx.lineWidth = 9;
  ctx.strokeStyle = rgba(darken(theme.dark, 0.3), 0.85);
  ctx.stroke();
  ctx.restore();

  // Pipe rings over the HUD columns: from the screen edge over the plaque, ending where they
  // meet the rim pipe's rounded corner (a T joint), mirrored on the right.
  const deg = Math.PI / 180;
  for (const [cx, a0, a1] of [
    [left + 40, 200 * deg, 308 * deg],
    [right - 40, 232 * deg, 340 * deg],
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
  tubeStroke(ctx, rimPath(3.5, g.opening), 7.5, theme.pipe, {
    outline: darken(theme.dark, 0.55),
    highlight: lighten(theme.pipe, 0.65),
    shadow: darken(theme.pipe, 0.3),
  });
  // Bottom rim tube.
  tubeStroke(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(left - 10, 596);
      c.lineTo(right + 10, 596);
    },
    9,
    theme.base,
    { outline: darken(theme.dark, 0.6), highlight: lighten(theme.base, 0.6) },
  );
  // Emblems on the top corner plates.
  drawEmblem(ctx, theme, left + 45, 27, 1.45);
  drawEmblem(ctx, theme, right - 45, 27, 1.45);
  // Rivets.
  for (const [x, y] of [
    [left + 8, 50],
    [left + 74, 8],
    [right - 8, 50],
    [right - 74, 8],
    [CENTER_X - 100, 49],
    [CENTER_X + 100, 49],
    [left + 70, 587],
    [right - 70, 587],
  ] as const) {
    rivet(ctx, x, y, 2.2);
  }
  if (g.inset > 0) ctx.restore();
}

/**
 * Themed frame plate, pipes and emblems (cached per theme, frame and resolution); `g` is the
 * machine around a narrower board, Teggle's own by default.
 */
export function drawFrame(ctx: Ctx, k: number, theme: Theme, g: MachineLayout = TEGGLE): void {
  const key = g.inset > 0 ? `frame:${theme.index}:${g.inset}` : `frame:${theme.index}`;
  const layer = layers.get(key, k, 0, 0, WORLD_W, WORLD_H, (c) => {
    paintFrame(c, theme, g);
  });
  drawLayer(ctx, layer);
}

/** Brass knobs at the outer ends of the score windows; draw after the windows. */
export function drawFrameKnobs(ctx: Ctx, g: MachineLayout = TEGGLE): void {
  knob(ctx, g.left + 98, 21, 9);
  knob(ctx, g.right - 98, 21, 9);
}

function paintFrameShadow(ctx: Ctx, open: Box): void {
  // Black overlay over the picture, after the frame's measured shadow mask (guide 3).
  ctx.save();
  openingPath(ctx, false, open);
  ctx.clip();
  const x0 = open.x;
  const x1 = open.x + open.w;
  const side = (from: number, to: number) =>
    linear(ctx, from, 0, to, 0, [
      [0, 'rgba(0,0,0,0.95)'],
      [0.25, 'rgba(0,0,0,0.54)'],
      [0.5, 'rgba(0,0,0,0.26)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  ctx.fillStyle = side(x0, x0 + 20);
  ctx.fillRect(x0, open.y, 20, OPEN_BOTTOM - open.y);
  ctx.fillStyle = side(x1, x1 - 20);
  ctx.fillRect(x1 - 20, open.y, 20, OPEN_BOTTOM - open.y);
  ctx.fillStyle = linear(ctx, 0, open.y, 0, open.y + 40, [
    [0, 'rgba(0,0,0,0.85)'],
    [0.12, 'rgba(0,0,0,0.62)'],
    [0.25, 'rgba(0,0,0,0.32)'],
    [0.5, 'rgba(0,0,0,0.04)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(x0, open.y, open.w, 40);
  ctx.fillStyle = linear(ctx, 0, OPEN_BOTTOM - 13, 0, OPEN_BOTTOM, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.19)'],
  ]);
  ctx.fillRect(x0, OPEN_BOTTOM - 13, open.w, 13);
  // Soft disc under the launcher housing.
  ctx.fillStyle = radial(ctx, CENTER_X, 70, 30, CENTER_X, 70, 92, [
    [0, 'rgba(0,0,0,0.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(CENTER_X - 92, open.y, 184, 120);
  ctx.restore();
}

/** Inner shadow over the background picture; draw right after the background. */
export function drawFrameShadow(ctx: Ctx, k: number, g: MachineLayout = TEGGLE): void {
  const o = g.opening;
  const key = g.inset > 0 ? `frame:shadow:${g.inset}` : 'frame:shadow';
  drawLayer(
    ctx,
    layers.get(key, k, o.x, o.y, o.w, OPEN_BOTTOM - o.y, (c) => {
      paintFrameShadow(c, o);
    }),
  );
}
