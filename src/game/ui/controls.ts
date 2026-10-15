// Buttons, dialog panel and list rows (guide 10). All buttons share a black outer outline and a
// pale teal rim; gel faces carry a top gloss. States: normal, hover, down (or selected) and
// disabled.

import type { Box } from '../layout';
import {
  brass,
  capsule,
  circlePath,
  innerBevel,
  knob,
  linear,
  radial,
  rivet,
  roundRect,
  withClip,
  type Ctx,
  type PathFn,
} from '../render/paint';
import { darken, lighten, mix, rgba } from './color';
import { drawText, textStyle, type TextStyle } from './text';
import { color } from './tokens';

export type ButtonState = 'normal' | 'hover' | 'down' | 'disabled';

export function hitBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function hitCircle(cx: number, cy: number, r: number, x: number, y: number): boolean {
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function glossyFace(
  ctx: Ctx,
  path: PathFn,
  x: number,
  y: number,
  w: number,
  h: number,
  top: string,
  bottom: string,
) {
  path(ctx);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [
    [0, top],
    [0.55, mix(top, bottom, 0.55)],
    [1, bottom],
  ]);
  ctx.fill();
  withClip(ctx, path, () => {
    // Gloss over the top half, with a bright spark at the left.
    roundRect(ctx, x + h * 0.25, y + h * 0.08, w - h * 0.5, h * 0.42, h * 0.21);
    ctx.fillStyle = linear(ctx, 0, y + h * 0.08, 0, y + h * 0.5, [
      [0, 'rgba(255,255,255,0.62)'],
      [1, 'rgba(255,255,255,0.06)'],
    ]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.42, y + h * 0.24, h * 0.09, h * 0.05, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  innerBevel(ctx, path, {
    light: '#ffffff',
    dark: '#000000',
    width: 1.4,
    lightAlpha: 0.25,
    darkAlpha: 0.3,
  });
}

function rimmed(ctx: Ctx, x: number, y: number, w: number, h: number, rim = 3): PathFn {
  // Black outline, pale teal rim; returns the face path inside the rim.
  capsule(ctx, x - rim - 1, y - rim - 1, w + 2 * rim + 2, h + 2 * rim + 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  capsule(ctx, x - rim, y - rim, w + 2 * rim, h + 2 * rim);
  ctx.fillStyle = linear(ctx, 0, y - rim, 0, y + h + rim, [
    [0, lighten(color.btnRim, 0.35)],
    [0.5, color.btnRim],
    [1, color.btnRimDark],
  ]);
  ctx.fill();
  capsule(ctx, x - 0.6, y - 0.6, w + 1.2, h + 1.2);
  ctx.fillStyle = '#0a1418';
  ctx.fill();
  return (c) => {
    capsule(c, x, y, w, h);
  };
}

export type PillVariant = 'orange' | 'blue' | 'brown' | 'green';

const PILL_FACES: Record<PillVariant, Record<ButtonState, [string, string]>> = {
  orange: {
    normal: [color.btnOrange, color.btnOrangeLo],
    hover: [color.btnOrangeHover, color.btnOrangeHoverLo],
    down: [color.btnOrangeDown, color.btnOrangeDownLo],
    disabled: [color.disabled, darken(color.disabled, 0.3)],
  },
  blue: {
    normal: [lighten(color.btnBlue, 0.25), darken(color.btnBlue, 0.15)],
    hover: [lighten(color.btnBlueHover, 0.3), color.btnBlueHover],
    down: [lighten(color.btnSelected, 0.35), color.btnSelected],
    disabled: [color.disabled, darken(color.disabled, 0.3)],
  },
  brown: {
    normal: [color.btnBrown, color.btnBrownLo],
    hover: [darken(color.btnBrownHover, 0.15), color.btnBrownHover],
    down: [darken(color.btnBrownDown, 0.1), lighten(color.btnBrownDown, 0.2)],
    disabled: [color.disabled, darken(color.disabled, 0.3)],
  },
  green: {
    normal: [lighten(color.btnSelected, 0.3), darken(color.btnSelected, 0.25)],
    hover: [lighten(color.btnSelected, 0.55), color.btnSelected],
    down: [lighten(color.gelGreenHover, 0.3), color.gelGreenHover],
    disabled: [color.disabled, darken(color.disabled, 0.3)],
  },
};

/** Label ink per face: pale on the gel with a thin dark outline so it reads in every state. */
function pillInk(variant: PillVariant, state: ButtonState): TextStyle {
  if (state === 'disabled') {
    return { ...textStyle.button('#d3d8df'), outline: { color: '#2a3038', width: 0.9 } };
  }
  if (variant === 'blue' || variant === 'green') {
    return {
      ...textStyle.button(color.textButtonBlue),
      outline: { color: variant === 'blue' ? '#02084a' : '#06380f', width: 1 },
      shadow: { color: 'rgba(0,0,40,0.55)', dx: 0.8, dy: 1.1 },
    };
  }
  if (state === 'down') {
    return {
      ...textStyle.button('#7a2a00'),
      shadow: { color: 'rgba(255,255,200,0.5)', dx: 0.6, dy: 0.8 },
    };
  }
  return {
    ...textStyle.button(color.textButton),
    outline: { color: '#4a1400', width: 1 },
    shadow: { color: 'rgba(70,20,0,0.6)', dx: 0.8, dy: 1.1 },
  };
}

/**
 * Pill button: wide orange (primary), small blue (choices; down = selected green), brown (bottom
 * bars) or green. `lugs` adds the round side mounts of the wide primary pill.
 */
export function drawPillButton(
  ctx: Ctx,
  b: Box,
  variant: PillVariant,
  state: ButtonState,
  label: string,
  opts: { lugs?: boolean; cap?: number } = {},
): void {
  const lugs = opts.lugs ?? false;
  if (lugs) {
    for (const lx of [b.x - 6, b.x + b.w + 6]) {
      circlePath(ctx, lx, b.y + b.h / 2, 6);
      ctx.fillStyle = '#000000';
      ctx.fill();
      circlePath(ctx, lx, b.y + b.h / 2, 5);
      ctx.fillStyle = radial(ctx, lx - 1.5, b.y + b.h / 2 - 1.5, 0, lx, b.y + b.h / 2, 5, [
        [0, lighten(color.btnRim, 0.5)],
        [1, color.btnRimDark],
      ]);
      ctx.fill();
      circlePath(ctx, lx, b.y + b.h / 2, 2);
      ctx.fillStyle = '#0f2a30';
      ctx.fill();
    }
  }
  const press = state === 'down' ? 0.6 : 0;
  const face = rimmed(ctx, b.x, b.y, b.w, b.h, b.h > 30 ? 3.2 : 2.6);
  const [top, bottom] = PILL_FACES[variant][state];
  ctx.save();
  ctx.translate(0, press);
  glossyFace(ctx, face, b.x, b.y, b.w, b.h, top, bottom);
  if (state === 'hover' || state === 'down') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    withClip(ctx, face, () => {
      ctx.fillStyle = radial(
        ctx,
        b.x + b.w / 2,
        b.y + b.h,
        2,
        b.x + b.w / 2,
        b.y + b.h,
        b.w * 0.5,
        [
          [0, 'rgba(255,240,180,0.35)'],
          [1, 'rgba(255,240,180,0)'],
        ],
      );
      ctx.fillRect(b.x, b.y, b.w, b.h);
    });
    ctx.restore();
  }
  const ink = { ...pillInk(variant, state), cap: opts.cap ?? (b.h > 30 ? 11 : 9.5) };
  drawText(ctx, label.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 0.4, ink, {
    maxWidth: b.w - b.h,
  });
  ctx.restore();
}

export type RoundVariant = 'purple' | 'green';

/** Round button in a brass bezel (MENU, the hold control). `icon` draws inside instead of a label. */
export function drawRoundButton(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  variant: RoundVariant,
  state: ButtonState,
  label: string,
  icon?: (ctx: Ctx, cx: number, cy: number, r: number, ink: string) => void,
): void {
  // Bezel.
  circlePath(ctx, cx, cy, r + 1);
  ctx.fillStyle = '#000000';
  ctx.fill();
  circlePath(ctx, cx, cy, r);
  ctx.fillStyle = linear(ctx, 0, cy - r, 0, cy + r, [
    [0, lighten(color.btnRim, 0.3)],
    [0.5, color.btnRim],
    [1, color.btnRimDark],
  ]);
  ctx.fill();
  const fr = r - 3.5;
  const base =
    variant === 'purple'
      ? state === 'hover' || state === 'down'
        ? color.roundPurpleHover
        : color.roundPurple
      : state === 'hover' || state === 'down'
        ? color.roundGreenHover
        : color.roundGreen;
  const faceColor = state === 'disabled' ? color.disabled : base;
  circlePath(ctx, cx, cy, fr);
  ctx.fillStyle = radial(ctx, cx, cy + fr * 0.45, 0, cx, cy, fr, [
    [0, lighten(faceColor, state === 'down' ? 0.5 : 0.3)],
    [0.6, faceColor],
    [0.92, darken(faceColor, 0.45)],
    [1, darken(faceColor, 0.7)],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  // Dome gloss.
  ctx.save();
  circlePath(ctx, cx, cy, fr);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx, cy - fr * 0.45, fr * 0.72, fr * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, cy - fr * 0.87, 0, cy - fr * 0.05, [
    [0, 'rgba(255,255,255,0.6)'],
    [1, 'rgba(255,255,255,0.03)'],
  ]);
  ctx.fill();
  ctx.restore();
  const ink = variant === 'purple' ? '#ff8cf2' : '#c8ff6a';
  if (icon !== undefined) {
    icon(ctx, cx, cy + (state === 'down' ? 0.6 : 0), fr, ink);
  } else {
    drawText(
      ctx,
      label.toUpperCase(),
      cx,
      cy + 0.5,
      {
        cap: Math.max(6, r * 0.3),
        fill: [
          [0, lighten(ink, 0.4)],
          [1, ink],
        ],
        outline: { color: darken(faceColor, 0.75), width: 1.1 },
        align: 'center',
        anchor: 'middle',
      },
      { maxWidth: fr * 1.7 },
    );
  }
}

/** Double chevron for the fast forward hold control. */
export function fastForwardIcon(ctx: Ctx, cx: number, cy: number, r: number, ink: string): void {
  const s = r / 18;
  for (const dx of [-6, 5]) {
    ctx.beginPath();
    ctx.moveTo(cx + (dx - 5) * s, cy - 8 * s);
    ctx.lineTo(cx + (dx + 6) * s, cy);
    ctx.lineTo(cx + (dx - 5) * s, cy + 8 * s);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4 * s;
    ctx.strokeStyle = '#08300c';
    ctx.stroke();
    ctx.fillStyle = linear(ctx, 0, cy - 8 * s, 0, cy + 8 * s, [
      [0, lighten(ink, 0.5)],
      [1, ink],
    ]);
    ctx.fill();
  }
}

/**
 * Main menu gel slab: a dark green gel panel in a brass ring that lights lime on hover. Disabled
 * slabs turn to dull slate gel. `sub` adds a small second line under the label.
 */
export function drawGelSlab(
  ctx: Ctx,
  b: Box,
  state: ButtonState,
  label: string,
  opts: { cap?: number; sub?: string } = {},
): void {
  const r = 18;
  const ring: PathFn = (c) => {
    roundRect(c, b.x - 7, b.y - 7, b.w + 14, b.h + 14, r + 7);
  };
  ctx.save();
  ctx.translate(1.5, 2.5);
  ring(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  brass(ctx, ring, b.y - 7, b.y + b.h + 7, 2.4);
  const face: PathFn = (c) => {
    roundRect(c, b.x, b.y, b.w, b.h, r);
  };
  face(ctx);
  ctx.fillStyle = '#000000';
  ctx.fill();
  const lit = state === 'hover' || state === 'down';
  const off = state === 'disabled';
  const inner: PathFn = (c) => {
    roundRect(c, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, r - 1.5);
  };
  inner(ctx);
  ctx.fillStyle = radial(
    ctx,
    b.x + b.w / 2,
    b.y + b.h * 0.85,
    4,
    b.x + b.w / 2,
    b.y + b.h / 2,
    b.w * 0.6,
    off
      ? [
          [0, '#4f6670'],
          [0.5, '#34474f'],
          [1, '#1d2a30'],
        ]
      : [
          [0, lit ? color.gelGreenHi : '#2c9a3c'],
          [0.5, lit ? color.gelGreenHover : '#127a3c'],
          [1, lit ? '#4f9a10' : color.gelGreen],
        ],
  );
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = off ? '#7c929b' : color.gelGreenRim;
  ctx.stroke();
  withClip(ctx, inner, () => {
    roundRect(ctx, b.x + 10, b.y + 5, b.w - 20, b.h * 0.38, 12);
    ctx.fillStyle = linear(ctx, 0, b.y + 5, 0, b.y + 5 + b.h * 0.38, [
      [0, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0.03)'],
    ]);
    ctx.fill();
  });
  const cap = opts.cap ?? 15;
  const sub = opts.sub ?? '';
  const labelY = b.y + b.h / 2 + 2 - (sub === '' ? 0 : cap * 0.55);
  drawText(
    ctx,
    label.toUpperCase(),
    b.x + b.w / 2,
    labelY,
    {
      cap,
      fill: off
        ? [
            [0, '#c9d6db'],
            [1, '#8fa3ab'],
          ]
        : lit
          ? [
              [0, '#ffffff'],
              [1, '#f6ffc8'],
            ]
          : [
              [0, '#f3ff9a'],
              [1, '#b9e728'],
            ],
      outline: { color: off ? '#0d171b' : '#06260f', width: Math.max(2, cap * 0.1) },
      align: 'center',
      anchor: 'middle',
    },
    { maxWidth: b.w - 24 },
  );
  if (sub !== '') {
    drawText(
      ctx,
      sub.toUpperCase(),
      b.x + b.w / 2,
      labelY + cap * 1.25,
      {
        face: 'caps',
        cap: Math.max(7, cap * 0.36),
        fill: off ? '#d6e2e6' : '#e6ffb0',
        outline: { color: off ? '#0d171b' : '#06260f', width: 1.4 },
        align: 'center',
        anchor: 'middle',
      },
      { maxWidth: b.w - 28 },
    );
  }
}

/** Paging arrow pill (level select). */
export function drawArrowButton(ctx: Ctx, b: Box, dir: 'left' | 'right', state: ButtonState): void {
  const face = rimmed(ctx, b.x, b.y, b.w, b.h, 2.8);
  const lit = state === 'hover' || state === 'down';
  const base =
    state === 'disabled' ? color.disabled : lit ? color.arrowGreenHover : color.arrowGreen;
  glossyFace(ctx, face, b.x, b.y, b.w, b.h, lighten(base, 0.25), darken(base, 0.25));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const s = dir === 'left' ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(cx + s * 16, cy);
  ctx.lineTo(cx - s * 4, cy - 10);
  ctx.lineTo(cx - s * 4, cy - 4.5);
  ctx.lineTo(cx - s * 18, cy - 4.5);
  ctx.lineTo(cx - s * 18, cy + 4.5);
  ctx.lineTo(cx - s * 4, cy + 4.5);
  ctx.lineTo(cx - s * 4, cy + 10);
  ctx.closePath();
  ctx.fillStyle = lit ? color.arrowInkHover : color.arrowInk;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#06300a';
  ctx.stroke();
}

/** Toggle: blue pill with a round check socket; checked shows a red check. */
export function drawToggle(
  ctx: Ctx,
  b: Box,
  checked: boolean,
  state: ButtonState,
  label: string,
): void {
  const face = rimmed(ctx, b.x, b.y, b.w, b.h, 2.8);
  const [top, bottom] = PILL_FACES.blue[state === 'down' ? 'hover' : state];
  glossyFace(ctx, face, b.x, b.y, b.w, b.h, top, bottom);
  const sx = b.x + b.h / 2 + 2;
  const sy = b.y + b.h / 2;
  const sr = b.h / 2 - 3;
  circlePath(ctx, sx, sy, sr + 1);
  ctx.fillStyle = '#000000';
  ctx.fill();
  circlePath(ctx, sx, sy, sr);
  ctx.fillStyle = radial(ctx, sx, sy + sr * 0.3, 0, sx, sy, sr, [
    [0, '#c35ad0'],
    [0.7, '#6d1a86'],
    [1, '#2c0638'],
  ]);
  ctx.fill();
  if (checked) {
    ctx.beginPath();
    ctx.moveTo(sx - sr * 0.6, sy - sr * 0.05);
    ctx.lineTo(sx - sr * 0.12, sy + sr * 0.5);
    ctx.lineTo(sx + sr * 0.8, sy - sr * 0.75);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2a0000';
    ctx.stroke();
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#ff2a1a';
    ctx.stroke();
  }
  drawText(
    ctx,
    label.toUpperCase(),
    b.x + b.h + 8,
    b.y + b.h / 2 + 0.4,
    {
      ...pillInk('blue', state),
      cap: 9.5,
      align: 'left',
    },
    { maxWidth: b.w - b.h - 14 },
  );
}

/** Slider: blue track with a teal-green fill and a blue orb knob; value in 0..1. */
export function drawSlider(ctx: Ctx, b: Box, value: number, state: ButtonState): void {
  const v = Math.max(0, Math.min(1, value));
  const th = 14;
  const ty = b.y + (b.h - th) / 2;
  const face = rimmed(ctx, b.x, ty, b.w, th, 2.6);
  face(ctx);
  ctx.fillStyle = linear(ctx, 0, ty, 0, ty + th, [
    [0, '#020a6a'],
    [1, '#1a3ad8'],
  ]);
  ctx.fill();
  const fw = Math.max(th, b.w * v);
  withClip(ctx, face, () => {
    capsule(ctx, b.x, ty, fw, th);
    ctx.fillStyle = linear(ctx, 0, ty, 0, ty + th, [
      [0, '#9cf7c8'],
      [0.45, '#2fcf8e'],
      [1, '#0b7a52'],
    ]);
    ctx.fill();
  });
  const kx = b.x + b.w * v;
  const ky = b.y + b.h / 2;
  const kr = b.h / 2 - 2;
  if (state === 'hover' || state === 'down') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circlePath(ctx, kx, ky, kr + 6);
    ctx.fillStyle = radial(ctx, kx, ky, kr * 0.5, kx, ky, kr + 6, [
      [0, 'rgba(255,240,90,0.6)'],
      [1, 'rgba(255,220,0,0)'],
    ]);
    ctx.fill();
    ctx.restore();
  }
  circlePath(ctx, kx, ky, kr + 1);
  ctx.fillStyle = '#000000';
  ctx.fill();
  circlePath(ctx, kx, ky, kr);
  ctx.fillStyle = radial(ctx, kx - kr * 0.3, ky - kr * 0.4, 1, kx, ky, kr, [
    [0, '#d8f0ff'],
    [0.35, '#4f8cff'],
    [0.85, '#0d2ea8'],
    [1, '#061660'],
  ]);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Dialog panel

/** Indigo dialog panel in a brass frame with corner knobs and a glossy title pill (10.1). */
export function drawPanel(ctx: Ctx, b: Box, title?: string): void {
  const outer: PathFn = (c) => {
    roundRect(c, b.x, b.y, b.w, b.h, 20);
  };
  ctx.save();
  ctx.translate(2, 3);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();
  brass(ctx, outer, b.y, b.y + b.h, 3);
  const titleH = title === undefined ? 0 : 38;
  const by = b.y + (title === undefined ? 10 : titleH + 8);
  const body: PathFn = (c) => {
    roundRect(c, b.x + 10, by, b.w - 20, b.y + b.h - 10 - by, 11);
  };
  // Teal lip around the body.
  roundRect(ctx, b.x + 7, by - 3, b.w - 14, b.y + b.h - 7 - (by - 3), 13);
  ctx.fillStyle = linear(ctx, 0, by - 3, 0, b.y + b.h - 7, [
    [0, color.tealLip],
    [0.5, color.tealLipDark],
    [1, color.tealLip],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#0b2226';
  ctx.stroke();
  body(ctx);
  ctx.fillStyle = color.panel;
  ctx.fill();
  withClip(ctx, body, () => {
    ctx.fillStyle = rgba(color.panelScanline, 0.9);
    for (let y = by + 2; y < b.y + b.h - 10; y += 3.5) ctx.fillRect(b.x + 10, y, b.w - 20, 1);
    // Soft lighter area from the top left.
    ctx.fillStyle = radial(
      ctx,
      b.x + 40,
      by + 30,
      10,
      b.x + 40,
      by + 30,
      Math.max(b.w, b.h) * 0.7,
      [
        [0, rgba(color.panelBevel, 0.55)],
        [1, rgba(color.panelBevelLo, 0)],
      ],
    );
    ctx.fillRect(b.x, by, b.w, b.h);
  });
  innerBevel(ctx, body, {
    light: '#000000',
    dark: color.panelBevel,
    width: 3,
    lightAlpha: 0.55,
    darkAlpha: 0.5,
  });
  body(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#0a0530';
  ctx.stroke();
  if (title !== undefined) {
    const px = b.x + 36;
    const pw = b.w - 72;
    const py = b.y + 6;
    const ph = titleH - 6;
    capsule(ctx, px - 3, py - 3, pw + 6, ph + 6);
    ctx.fillStyle = linear(ctx, 0, py - 3, 0, py + ph + 3, [
      [0, '#7fd3dd'],
      [0.5, color.tealLipDark],
      [1, '#123c44'],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#06191c';
    ctx.stroke();
    const pill: PathFn = (c) => {
      capsule(c, px, py, pw, ph);
    };
    pill(ctx);
    ctx.fillStyle = linear(ctx, 0, py, 0, py + ph, [
      [0, color.titlePillTop],
      [0.5, color.titlePillMid],
      [1, color.titlePillBottom],
    ]);
    ctx.fill();
    withClip(ctx, pill, () => {
      roundRect(ctx, px + 10, py + 2, pw - 20, ph * 0.45, ph * 0.22);
      ctx.fillStyle = linear(ctx, 0, py + 2, 0, py + 2 + ph * 0.45, [
        [0, 'rgba(255,255,255,0.55)'],
        [1, 'rgba(255,255,255,0.05)'],
      ]);
      ctx.fill();
    });
    pill(ctx);
    ctx.strokeStyle = '#000830';
    ctx.stroke();
    drawText(ctx, title.toUpperCase(), px + pw / 2, py + ph / 2 + 0.5, textStyle.title(16), {
      maxWidth: pw - 30,
    });
  }
  if (title !== undefined) {
    knob(ctx, b.x + 19, b.y + 19, 10);
    knob(ctx, b.x + b.w - 19, b.y + 19, 10);
    rivet(ctx, b.x + 8, b.y + 38, 2);
    rivet(ctx, b.x + b.w - 8, b.y + 38, 2);
  } else {
    for (const [x, y] of [
      [b.x + 5, b.y + 5],
      [b.x + b.w - 5, b.y + 5],
      [b.x + 5, b.y + b.h - 5],
      [b.x + b.w - 5, b.y + b.h - 5],
    ] as const) {
      rivet(ctx, x, y, 2);
    }
  }
}

/** Content box of a panel drawn with drawPanel(b, title). */
export function panelContent(b: Box, titled: boolean): Box {
  const top = b.y + (titled ? 46 : 10);
  return { x: b.x + 22, y: top + 10, w: b.w - 44, h: b.y + b.h - 22 - top };
}

/** Result row: cyan label on the left, yellow value on the right, thin cyan rule below (10.6). */
export function drawRow(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): void {
  drawText(ctx, label.toUpperCase(), x, y, textStyle.rowLabel(), { maxWidth: w * 0.6 });
  drawText(ctx, value, x + w, y, textStyle.rowValue(), { maxWidth: w * 0.38 });
  ctx.fillStyle = rgba(color.textRowLabel, 0.8);
  ctx.fillRect(x, y + 10, w, 1);
}

/** Ranked list row (info panels): orange rank, white name, yellow value. */
export function drawListRow(
  ctx: Ctx,
  b: Box,
  rank: number,
  name: string,
  value: string,
  state: ButtonState,
): void {
  if (state === 'hover' || state === 'down') {
    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = state === 'down' ? 'rgba(120, 220, 255, 0.28)' : 'rgba(120, 220, 255, 0.16)';
    ctx.fill();
  }
  const cy = b.y + b.h / 2;
  drawText(ctx, `${rank}.`, b.x + 22, cy, {
    cap: 10,
    fill: '#ff9a2a',
    outline: { color: '#2a0d00', width: 1 },
    align: 'right',
    anchor: 'middle',
  });
  drawText(
    ctx,
    name,
    b.x + 30,
    cy + 4,
    { ...textStyle.body('#ffffff'), cap: 8.6 },
    { maxWidth: b.w - 120 },
  );
  drawText(ctx, value, b.x + b.w - 8, cy, { ...textStyle.rowValue(), cap: 10 }, { maxWidth: 90 });
}
