// Materials the menu screens share (visual guide 10.1, 10.3, 10.4): the steel-blue enamel plate
// and pipes with brass joints, the glossy blue title pill, black thumbnail windows in teal metal,
// and the cream speech bubble.

import { legible } from '../app/display';
import type { Box } from '../layout';
import {
  brass,
  capsule,
  innerBevel,
  knob,
  linear,
  radial,
  rivet,
  roundRect,
  tubeStroke,
  withClip,
  type Ctx,
  type PathFn,
} from '../render/paint';
import { darken, lighten, rgba } from '../ui/color';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';

/** The menus' steel-blue enamel (10.3: the frame of the main menu). Teggle's own values. */
export const STEEL = {
  base: '#4a7cb8',
  light: '#a9cdf0',
  dark: '#1b3765',
  deep: '#0e1f40',
  pipe: '#7fb2e2',
} as const;

/** Adds a rounded rectangle to the current path as a new subpath (no beginPath). */
function addRoundRect(ctx: Ctx, b: Box, r: number): void {
  const rr = Math.min(r, b.w / 2, b.h / 2);
  ctx.moveTo(b.x + rr, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + rr, rr);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x + b.w - rr, b.y + b.h, rr);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y + b.h - rr, rr);
  ctx.arcTo(b.x, b.y, b.x + rr, b.y, rr);
  ctx.closePath();
}

/**
 * Enamel plate over `area`, airbrushed light from the top, with an optional rounded opening cut
 * out of it (even-odd).
 */
export function paintPlate(ctx: Ctx, area: Box, opening?: { box: Box; r: number }): void {
  const hole: PathFn | undefined =
    opening === undefined
      ? undefined
      : (c) => {
          roundRect(c, opening.box.x, opening.box.y, opening.box.w, opening.box.h, opening.r);
        };
  const region = (c: Ctx): void => {
    c.beginPath();
    c.rect(area.x, area.y, area.w, area.h);
    if (opening !== undefined) addRoundRect(c, opening.box, opening.r);
  };
  region(ctx);
  ctx.fillStyle = linear(ctx, 0, area.y, 0, area.y + area.h, [
    [0, lighten(STEEL.base, 0.12)],
    [0.15, STEEL.base],
    [0.7, darken(STEEL.base, 0.12)],
    [1, darken(STEEL.base, 0.3)],
  ]);
  ctx.fill('evenodd');
  ctx.save();
  region(ctx);
  ctx.clip('evenodd');
  for (const [fx, fy, r] of [
    [0.1, 0.02, 160],
    [0.55, 0.0, 220],
    [0.92, 0.03, 160],
    [0.05, 0.95, 120],
    [0.95, 0.95, 140],
  ] as const) {
    const x = area.x + fx * area.w;
    const y = area.y + fy * area.h;
    ctx.fillStyle = radial(ctx, x, y, 0, x, y, r, [
      [0, rgba(lighten(STEEL.light, 0.4), 0.55)],
      [0.5, rgba(STEEL.light, 0.18)],
      [1, rgba(STEEL.light, 0)],
    ]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Gloss along the top edge, shade at the sides.
  ctx.fillStyle = linear(ctx, 0, area.y, 0, area.y + 9, [
    [0, rgba('#ffffff', 0.32)],
    [1, rgba('#ffffff', 0)],
  ]);
  ctx.fillRect(area.x, area.y, area.w, 9);
  for (const [x0, x1] of [
    [area.x, area.x + 12],
    [area.x + area.w, area.x + area.w - 12],
  ] as const) {
    ctx.fillStyle = linear(ctx, x0, 0, x1, 0, [
      [0, rgba(STEEL.dark, 0.6)],
      [1, rgba(STEEL.dark, 0)],
    ]);
    ctx.fillRect(Math.min(x0, x1), area.y, 12, area.h);
  }
  if (hole !== undefined) {
    // A dark seam where the plate meets the opening.
    hole(ctx);
    ctx.lineWidth = 8;
    ctx.strokeStyle = rgba(darken(STEEL.dark, 0.35), 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** A steel-blue enamel pipe along `path`. */
export function steelPipe(ctx: Ctx, path: PathFn, width = 8): void {
  tubeStroke(ctx, path, width, STEEL.pipe, {
    outline: darken(STEEL.dark, 0.5),
    highlight: lighten(STEEL.pipe, 0.7),
    shadow: darken(STEEL.pipe, 0.3),
  });
}

/** A round brass joint where pipes meet. */
export function brassJoint(ctx: Ctx, x: number, y: number, r: number): void {
  knob(ctx, x, y, r, color.brass);
  circleRing(ctx, x, y, r * 0.55, rgba(color.brassLo, 0.7));
}

function circleRing(ctx: Ctx, x: number, y: number, r: number, stroke: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** A brass rail under a row of buttons: a rounded bar with rivets at its ends. */
export function brassRail(ctx: Ctx, b: Box): void {
  const path: PathFn = (c) => {
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
  };
  ctx.save();
  ctx.translate(1.5, 2.5);
  path(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  ctx.restore();
  brass(ctx, path, b.y, b.y + b.h, 2.2);
  rivet(ctx, b.x + b.h / 2, b.y + b.h / 2, 2.4);
  rivet(ctx, b.x + b.w - b.h / 2, b.y + b.h / 2, 2.4);
}

/** Glossy blue title pill in a teal rim (10.1, 10.4), with the title in the cool title face. */
export function drawTitlePill(ctx: Ctx, b: Box, title: string, cap = 17): void {
  capsule(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.fillStyle = linear(ctx, 0, b.y - 4, 0, b.y + b.h + 4, [
    [0, '#8fdce6'],
    [0.5, color.tealLipDark],
    [1, '#123c44'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  const pill: PathFn = (c) => {
    capsule(c, b.x, b.y, b.w, b.h);
  };
  pill(ctx);
  ctx.fillStyle = linear(ctx, 0, b.y, 0, b.y + b.h, [
    [0, color.titlePillTop],
    [0.5, color.titlePillMid],
    [1, color.titlePillBottom],
  ]);
  ctx.fill();
  withClip(ctx, pill, () => {
    roundRect(ctx, b.x + 14, b.y + 2.5, b.w - 28, b.h * 0.45, b.h * 0.22);
    ctx.fillStyle = linear(ctx, 0, b.y + 2, 0, b.y + 2 + b.h * 0.45, [
      [0, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0.05)'],
    ]);
    ctx.fill();
  });
  pill(ctx);
  ctx.strokeStyle = '#000830';
  ctx.stroke();
  drawText(ctx, title.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 0.5, textStyle.title(cap), {
    maxWidth: b.w - 40,
  });
}

/**
 * A black rounded opening in teal metal (10.1 thumbnail window). Returns the opening's path,
 * for clipping what is drawn inside.
 */
export function drawTealWindow(ctx: Ctx, b: Box, r = 12, bezel = 7): PathFn {
  const outer: PathFn = (c) => {
    roundRect(c, b.x - bezel, b.y - bezel, b.w + 2 * bezel, b.h + 2 * bezel, r + bezel);
  };
  const inner: PathFn = (c) => {
    roundRect(c, b.x, b.y, b.w, b.h, r);
  };
  ctx.save();
  ctx.translate(2, 3);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  outer(ctx);
  ctx.fillStyle = linear(ctx, 0, b.y - bezel, 0, b.y + b.h + bezel, [
    [0, '#9fd2da'],
    [0.18, color.tealLip],
    [0.6, color.tealLipDark],
    [1, color.tealDeep],
  ]);
  ctx.fill();
  innerBevel(ctx, outer, { light: '#e2f7fa', dark: '#0b2a30', width: 2 });
  outer(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  inner(ctx);
  ctx.fillStyle = '#04070c';
  ctx.fill();
  return inner;
}

/** Inner rim and shadow drawn over a teal window's contents. */
export function finishTealWindow(ctx: Ctx, inner: PathFn): void {
  withClip(ctx, inner, () => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 10;
    inner(ctx);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();
    ctx.restore();
  });
  inner(ctx);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#020608';
  ctx.stroke();
}

const BUBBLE_TEXT: TextStyle = {
  face: 'body',
  cap: 11.2,
  weight: 600,
  fill: '#2a1f6e',
  align: 'center',
  anchor: 'baseline',
};

const BUBBLE_PAD = 24;

/** The speech bubble's text style: the design size, larger where that would be hard to read. */
export function bubbleText(): TextStyle {
  return legible(BUBBLE_TEXT);
}

/** Height of a speech bubble holding `lines` lines. */
export function bubbleHeight(lines: number): number {
  const cap = bubbleText().cap;
  const line = cap * 1.75;
  return Math.max(1, lines) * line - (line - cap) + 2 * BUBBLE_PAD;
}

/**
 * Cream speech bubble with an indigo outline (10.3), its tail pointing at `tail`, or no tail for
 * null. Lines are centered.
 */
export function drawSpeechBubble(
  ctx: Ctx,
  b: Box,
  tail: { x: number; y: number } | null,
  lines: readonly string[],
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const r = Math.min(26, b.h / 2);
  const path: PathFn = (c) => {
    roundRect(c, b.x, b.y, b.w, b.h, r);
    if (tail !== null) {
      // A curved wedge from the bubble's lower left toward the speaker.
      const x0 = b.x + r + 6;
      const x1 = x0 + 40;
      const by = b.y + b.h - 3;
      c.moveTo(x0, by);
      c.quadraticCurveTo(x0 - 4, by + (tail.y - by) * 0.55, tail.x, tail.y);
      c.quadraticCurveTo(x0 + 18, by + (tail.y - by) * 0.35, x1, by);
      c.closePath();
    }
  };
  ctx.save();
  ctx.translate(2, 3);
  path(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill('nonzero');
  ctx.restore();
  path(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2b2272';
  ctx.stroke();
  ctx.fillStyle = linear(ctx, 0, b.y, 0, b.y + b.h, [
    [0, '#fffdf6'],
    [1, '#f4ecd6'],
  ]);
  ctx.fill('nonzero');
  const text = bubbleText();
  const pitch = text.cap * 1.75;
  let y = b.y + b.h / 2 - ((lines.length - 1) * pitch) / 2 + text.cap / 2;
  for (const line of lines) {
    drawText(ctx, line, b.x + b.w / 2, y, text);
    y += pitch;
  }
  ctx.restore();
}

/** A small lock, for locked menu items. */
export function drawLock(ctx: Ctx, x: number, y: number, s: number, ink = '#e8eef8'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.arc(0, -4, 5, Math.PI, 0);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = ink;
  ctx.stroke();
  roundRect(ctx, -7.5, -4, 15, 11, 2.5);
  ctx.fillStyle = '#000000';
  ctx.fill();
  roundRect(ctx, -6.5, -3, 13, 9, 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0.5, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#1b2433';
  ctx.fill();
  ctx.restore();
}
