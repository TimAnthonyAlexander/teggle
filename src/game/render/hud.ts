// HUD columns and score windows (guide 7). These stay the same in every theme: brass frames,
// teal glass tubes, an amber meter, glossy blue score windows.

import { layout } from '../layout';
import { darken, lighten, rgba } from '../ui/color';
import { drawText, formatNumber, textStyle } from '../ui/text';
import { color } from '../ui/tokens';
import { drawLayer, layers } from './cache';
import { drawBall } from './ball';
import {
  brass,
  capsule,
  circlePath,
  glassHighlight,
  glassOrb,
  innerBevel,
  knob,
  linear,
  radial,
  rivet,
  roundRect,
  withClip,
  type Ctx,
  type PathFn,
} from './paint';

// ---------------------------------------------------------------------------------------------
// Shared column parts

/** Arched band around (cx, cy) between two radii, spanning ±a from straight up. */
function archPath(cx: number, cy: number, ro: number, ri: number, a: number): PathFn {
  return (ctx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, ro, -Math.PI / 2 - a, -Math.PI / 2 + a);
    ctx.arc(cx, cy, ri, -Math.PI / 2 + a, -Math.PI / 2 - a, true);
    ctx.closePath();
  };
}

/** Arched brass plaque over a column orb, with a recessed face that carries an icon. */
function drawPlaque(
  ctx: Ctx,
  cx: number,
  cy: number,
  icon: (ctx: Ctx, x: number, y: number) => void,
) {
  const outer = archPath(cx, cy, 61, 40, (52 * Math.PI) / 180);
  ctx.save();
  ctx.translate(0.5, 2);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();
  brass(ctx, outer, cy - 61, cy - 36, 2.2);
  const face = archPath(cx, cy, 57.5, 44, (45 * Math.PI) / 180);
  face(ctx);
  ctx.fillStyle = linear(ctx, 0, cy - 58, 0, cy - 40, [
    [0, color.brassMid],
    [0.6, color.brass],
    [1, color.brassLight],
  ]);
  ctx.fill();
  innerBevel(ctx, face, {
    light: color.brassLo,
    dark: color.brassHi,
    width: 1.5,
    lightAlpha: 0.7,
    darkAlpha: 0.6,
  });
  icon(ctx, cx, cy - 51);
  rivet(ctx, cx - 39, cy - 32, 1.9);
  rivet(ctx, cx + 39, cy - 32, 1.9);
}

/** Embossed ball icon for the ball counter plaque (the original's plaque text is not used). */
function ballIcon(ctx: Ctx, x: number, y: number): void {
  for (const dx of [-10, 0, 10]) {
    const r = dx === 0 ? 4.6 : 3.6;
    const bx = x + dx;
    const by = y + (dx === 0 ? -0.5 : 0.8);
    circlePath(ctx, bx + 0.6, by + 0.9, r + 0.6);
    ctx.fillStyle = rgba(color.brassLo, 0.75);
    ctx.fill();
    circlePath(ctx, bx, by, r);
    ctx.fillStyle = linear(ctx, 0, by - r, 0, by + r, [
      [0, color.ballSkyDeep],
      [0.45, color.ballSkyLight],
      [0.52, color.ballHorizon],
      [1, '#c49a3a'],
    ]);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#3a2410';
    ctx.stroke();
    circlePath(ctx, bx + r * 0.3, by - r * 0.4, r * 0.32);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
}

/** Embossed multiplier sign for the Fever meter plaque. */
function multiplierIcon(ctx: Ctx, x: number, y: number): void {
  const draw = (dx: number, dy: number, fill: string) => {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(-6, -1.8, 12, 3.6, 1.6);
    ctx.roundRect(-1.8, -6, 3.6, 12, 1.6);
    ctx.fill();
    ctx.restore();
  };
  draw(0.6, 0.9, rgba(color.brassLo, 0.75));
  draw(0, 0, color.brassHi);
}

/** Big brass bezel ring around a column orb. */
function drawOrbBezel(ctx: Ctx, cx: number, cy: number): void {
  circlePath(ctx, cx + 0.5, cy + 2, 37);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  brass(
    ctx,
    (c) => {
      circlePath(c, cx, cy, 36);
    },
    cy - 36,
    cy + 36,
    2.6,
  );
  circlePath(ctx, cx, cy, 31.5);
  ctx.fillStyle = linear(ctx, 0, cy - 31, 0, cy + 31, [
    [0, color.tealDeep],
    [0.5, color.tealLipDark],
    [1, color.tealLip],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#0d272c';
  ctx.stroke();
}

/** Lower button holder with a round socket (MENU on the left, the hold control on the right). */
function drawButtonHolder(ctx: Ctx, cx: number, cy: number, left: boolean): void {
  const path: PathFn = (c) => {
    c.beginPath();
    if (left) {
      // Squared holder with two raised ears.
      c.moveTo(cx - 33, 602);
      c.lineTo(cx - 33, cy - 30);
      c.quadraticCurveTo(cx - 33, cy - 44, cx - 22, cy - 46);
      c.quadraticCurveTo(cx, cy - 38, cx + 22, cy - 46);
      c.quadraticCurveTo(cx + 35, cy - 44, cx + 35, cy - 30);
      c.lineTo(cx + 35, 602);
    } else {
      // Dome holder.
      c.moveTo(cx - 33, 602);
      c.lineTo(cx - 33, cy - 14);
      c.bezierCurveTo(cx - 33, cy - 44, cx + 33, cy - 44, cx + 33, cy - 14);
      c.lineTo(cx + 33, 602);
    }
    c.closePath();
  };
  ctx.save();
  ctx.translate(1, 2);
  path(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  ctx.restore();
  brass(ctx, path, cy - 46, 600, 2.4);
  // Socket ring.
  circlePath(ctx, cx, cy, 28);
  ctx.fillStyle = linear(ctx, 0, cy - 28, 0, cy + 28, [
    [0, color.tealDeep],
    [0.55, color.tealLipDark],
    [1, color.tealLip],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#0b2226';
  ctx.stroke();
  rivet(ctx, cx - 26, cy - 34, 1.9);
  rivet(ctx, cx + 26, cy - 34, 1.9);
}

/** Vertical glass tube interior (empty), x/y box. */
function tubePath(x: number, y: number, w: number, h: number): PathFn {
  return (ctx) => {
    capsule(ctx, x, y, w, h);
  };
}

function drawTubeSocket(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  // Brass collar around the tube.
  roundRect(ctx, x - 2.5, y - 2.5, w + 5, h + 5, (w + 5) / 2);
  ctx.fillStyle = linear(ctx, x - 2.5, 0, x + w + 2.5, 0, [
    [0, color.brassLo],
    [0.3, color.brassLight],
    [0.7, color.brassMid],
    [1, color.brassLo],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  const p = tubePath(x, y, w, h);
  p(ctx);
  ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
    [0, color.counterEmptyDeep],
    [0.3, color.counterEmpty],
    [0.55, '#0a6b5a'],
    [1, '#002a26'],
  ]);
  ctx.fill();
}

function drawTubeGlass(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const p = tubePath(x, y, w, h);
  withClip(ctx, p, () => {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + w * 0.22, y + 4, w * 0.16, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + w * 0.62, y + 6, w * 0.08, h - 12);
  });
  p(ctx);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(0,20,18,0.9)';
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Ball counter (7.1)

export interface BallCounterState {
  /** Number shown in the orb. */
  readonly balls: number;
  /** Balls stacked in the column, usually balls - 1 (one is in the cannon). */
  readonly columnBalls: number;
  /** Score of the current shot; the tubes are full at 25,000. */
  readonly shotScore: number;
  /** Free ball celebration in the orb, if one is showing. */
  readonly freeBall?: {
    readonly stage: 1 | 2 | 3;
    readonly tMs: number;
    readonly showPoints: boolean;
  };
  /** Real time, ms, for pulsing states. */
  readonly timeMs: number;
}

const BC = {
  cx: 40,
  orbY: 120,
  tubeL: { x: 5.5, w: 11.5 },
  tubeR: { x: 61, w: 11.5 },
  tubeTop: 162,
  tubeBottom: 512,
  fillTop: 166,
  fillBottom: 508,
  window: { x: 25.5, y: 172, w: 27, h: 334 },
} as const;

export const FREE_BALL_THRESHOLDS = [25_000, 75_000, 125_000] as const;

const STAGE_COLORS = [
  { edge: color.tubeGreenEdge, mid: color.tubeGreen, orb: '#2fe07a' },
  { edge: color.tubePurpleEdge, mid: color.tubePurple, orb: '#c246f0' },
  { edge: color.tubeYellowEdge, mid: color.tubeYellow, orb: '#ffd52a' },
] as const;

/** Fill level per stage (0..1) for a shot score (7.1: the next stage rises over the previous). */
export function tubeLevels(shotScore: number): [number, number, number] {
  const s = Math.max(0, shotScore);
  const g = Math.min(1, s / 25_000);
  const p = Math.min(1, Math.max(0, (s - 25_000) / 50_000));
  const y = Math.min(1, Math.max(0, (s - 75_000) / 50_000));
  return [g, p, y];
}

function paintBallCounterBase(ctx: Ctx): void {
  const { cx, orbY, window: w } = BC;
  // Column body.
  const body: PathFn = (c) => {
    roundRect(c, 0.5, 146, 79, 386, [10, 10, 18, 18]);
  };
  ctx.save();
  ctx.translate(1.5, 2);
  body(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  brass(ctx, body, 146, 532, 2.6);
  // Neck joining the orb bezel to the body.
  brass(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(cx - 24, 140);
      c.quadraticCurveTo(cx, 160, cx + 24, 140);
      c.lineTo(cx + 30, 158);
      c.lineTo(cx - 30, 158);
      c.closePath();
    },
    140,
    158,
    1.5,
  );
  drawTubeSocket(ctx, BC.tubeL.x, BC.tubeTop, BC.tubeL.w, BC.tubeBottom - BC.tubeTop);
  drawTubeSocket(ctx, BC.tubeR.x, BC.tubeTop, BC.tubeR.w, BC.tubeBottom - BC.tubeTop);
  // Ball window: brass lip, teal rim, dark backing.
  roundRect(ctx, w.x - 3, w.y - 3, w.w + 6, w.h + 6, (w.w + 6) / 2);
  ctx.fillStyle = color.tealDeep;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  roundRect(ctx, w.x, w.y, w.w, w.h, w.w / 2);
  ctx.fillStyle = linear(ctx, w.x, 0, w.x + w.w, 0, [
    [0, '#120d1c'],
    [0.35, '#2a2238'],
    [0.7, '#1d1729'],
    [1, '#0b0812'],
  ]);
  ctx.fill();
  innerBevel(
    ctx,
    (c) => {
      roundRect(c, w.x, w.y, w.w, w.h, w.w / 2);
    },
    {
      light: '#000000',
      dark: '#6b5d86',
      width: 2,
      lightAlpha: 0.6,
      darkAlpha: 0.35,
    },
  );
  rivet(ctx, 22, 150, 1.8);
  rivet(ctx, 58, 150, 1.8);
  rivet(ctx, 22, 524, 1.8);
  rivet(ctx, 58, 524, 1.8);
  // Orb bezel and plaque.
  drawOrbBezel(ctx, cx, orbY);
  drawPlaque(ctx, cx, orbY, ballIcon);
  drawButtonHolder(ctx, layout.menuButton.x, layout.menuButton.y, true);
}

function paintBallCounterGlass(ctx: Ctx): void {
  drawTubeGlass(ctx, BC.tubeL.x, BC.tubeTop, BC.tubeL.w, BC.tubeBottom - BC.tubeTop);
  drawTubeGlass(ctx, BC.tubeR.x, BC.tubeTop, BC.tubeR.w, BC.tubeBottom - BC.tubeTop);
  const w = BC.window;
  withClip(
    ctx,
    (c) => {
      roundRect(c, w.x, w.y, w.w, w.h, w.w / 2);
    },
    () => {
      ctx.fillStyle = linear(ctx, w.x, 0, w.x + w.w, 0, [
        [0, 'rgba(255,255,255,0)'],
        [0.12, 'rgba(255,255,255,0.32)'],
        [0.22, 'rgba(255,255,255,0.05)'],
        [0.8, 'rgba(255,255,255,0)'],
        [0.9, 'rgba(255,255,255,0.12)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.fillRect(w.x, w.y, w.w, w.h);
    },
  );
}

function drawTubeFill(ctx: Ctx, x: number, w: number, levels: readonly number[]): void {
  const top = BC.fillTop;
  const bottom = BC.fillBottom;
  const h = bottom - top;
  levels.forEach((lv, i) => {
    if (lv <= 0) return;
    const c = STAGE_COLORS[i];
    if (c === undefined) return;
    const fh = Math.max(w, h * lv);
    const y = bottom - fh;
    withClip(
      ctx,
      (cc) => {
        capsule(cc, x + 1, top, w - 2, h);
      },
      () => {
        capsule(ctx, x + 1, y, w - 2, fh);
        ctx.fillStyle = linear(ctx, x, 0, x + w, 0, [
          [0, darken(c.edge, 0.25)],
          [0.3, c.edge],
          [0.5, c.mid],
          [0.75, c.edge],
          [1, darken(c.edge, 0.35)],
        ]);
        ctx.fill();
        // Bright meniscus at the top of the fill.
        ctx.fillStyle = rgba(lighten(c.mid, 0.5), 0.85);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + 2.5, (w - 3) / 2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    );
  });
}

const CUP_H = 16;

function drawPlunger(ctx: Ctx, cupTop: number): void {
  const cx = BC.window.x + BC.window.w / 2;
  const bottom = BC.window.y + BC.window.h - 3;
  const springTop = cupTop + CUP_H - 2;
  // Steel coil spring, drawn as front and back strands.
  const turns = 4;
  const span = bottom - springTop;
  const coil = (front: boolean) => {
    ctx.beginPath();
    for (let i = 0; i < turns; i++) {
      const y0 = springTop + (span * i) / turns;
      const y1 = springTop + (span * (i + 0.5)) / turns;
      const y2 = springTop + (span * (i + 1)) / turns;
      if (front) {
        ctx.moveTo(cx - 7, y0);
        ctx.lineTo(cx + 7, y1);
      } else {
        ctx.moveTo(cx + 7, y1);
        ctx.lineTo(cx - 7, y2);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1d2230';
    ctx.stroke();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = front ? '#c3cbe0' : '#6d7894';
    ctx.stroke();
  };
  coil(false);
  coil(true);
  // Red bell cup.
  ctx.beginPath();
  ctx.moveTo(cx - 10.5, cupTop);
  ctx.lineTo(cx + 10.5, cupTop);
  ctx.bezierCurveTo(cx + 11, cupTop + 8, cx + 8, cupTop + 12.5, cx + 3, cupTop + 13);
  ctx.lineTo(cx + 2.5, cupTop + CUP_H);
  ctx.lineTo(cx - 2.5, cupTop + CUP_H);
  ctx.lineTo(cx - 3, cupTop + 13);
  ctx.bezierCurveTo(cx - 8, cupTop + 12.5, cx - 11, cupTop + 8, cx - 10.5, cupTop);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, cx - 10.5, 0, cx + 10.5, 0, [
    [0, '#6a0d1c'],
    [0.22, '#e05a6e'],
    [0.34, '#ffb0bb'],
    [0.5, '#d63a50'],
    [1, '#5a0a18'],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#2e040c';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cupTop, 10.5, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, cupTop - 2.6, 0, cupTop + 2.6, [
    [0, '#5a0a18'],
    [1, '#b8324a'],
  ]);
  ctx.fill();
  ctx.stroke();
}

function drawCountOrb(ctx: Ctx, s: BallCounterState): void {
  const { cx, orbY } = BC;
  const low = s.balls <= 3;
  const pulse = low && s.balls > 0 ? 0.5 + 0.5 * Math.sin(s.timeMs / 160) : 0;
  const fb = s.freeBall;
  const stage = fb !== undefined ? STAGE_COLORS[fb.stage - 1] : undefined;
  const lit = stage !== undefined && fb !== undefined ? Math.max(0, 1 - fb.tMs / 2400) : 0;
  glassOrb(ctx, cx, orbY, 28, {
    hi: '#2fae6e',
    mid: '#0b6a43',
    lo: '#03331f',
    rim: '#021a10',
  });
  if (stage !== undefined && lit > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circlePath(ctx, cx, orbY, 28);
    ctx.fillStyle = radial(ctx, cx, orbY, 0, cx, orbY, 28, [
      [0, rgba(lighten(stage.orb, 0.5), 0.95 * lit)],
      [0.6, rgba(stage.orb, 0.8 * lit)],
      [1, rgba(stage.orb, 0.3 * lit)],
    ]);
    ctx.fill();
    ctx.restore();
  }
  if (pulse > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circlePath(ctx, cx, orbY, 28);
    ctx.fillStyle = radial(ctx, cx, orbY, 4, cx, orbY, 28, [
      [0, rgba('#ff9a1c', 0.45 * pulse)],
      [1, rgba('#ff3c00', 0)],
    ]);
    ctx.fill();
    ctx.restore();
  }
  if (fb !== undefined && lit > 0) {
    const label = fb.showPoints ? formatNumber(FREE_BALL_THRESHOLDS[fb.stage - 1] ?? 0) : 'FREE';
    const style = { ...textStyle.ballCount(), cap: fb.showPoints ? 11 : 14 };
    drawText(ctx, label, cx, orbY - (fb.showPoints ? 0 : 7), style, { maxWidth: 50 });
    if (!fb.showPoints) drawText(ctx, 'BALL', cx, orbY + 10, style, { maxWidth: 50 });
  } else {
    const style = low
      ? {
          ...textStyle.ballCount(),
          fill: [
            [0, '#fffbb0'],
            [0.4, color.textWarnTop],
            [1, color.textWarnLow],
          ] as const,
          outline: { color: '#3a1600', width: 2 },
          glow: { color: 'rgba(90, 30, 0, 0.9)', blur: 4 },
        }
      : textStyle.ballCount();
    drawText(ctx, String(Math.max(0, s.balls)), cx, orbY + 1, style, { maxWidth: 48 });
  }
  glassHighlight(ctx, cx, orbY, 28, 0.6);
}

export function drawBallCounter(ctx: Ctx, k: number, s: BallCounterState): void {
  const b = layout.ballCounter;
  const base = layers.get(
    'hud:ballCounter',
    k,
    b.x,
    b.y - 4,
    b.w + 2,
    b.h + 6,
    paintBallCounterBase,
  );
  drawLayer(ctx, base);
  const levels = tubeLevels(s.shotScore);
  drawTubeFill(ctx, BC.tubeL.x, BC.tubeL.w, levels);
  drawTubeFill(ctx, BC.tubeR.x, BC.tubeR.w, levels);
  // Balls stand on the plunger cup; the spring relaxes as the column empties.
  const w = BC.window;
  const n = Math.max(0, Math.min(15, s.columnBalls));
  const cupTop = w.y + w.h - 46 - (15 - n) * 0.9 - (n === 0 ? 18 : 0);
  drawPlunger(ctx, cupTop);
  for (let i = 0; i < n; i++) drawBall(ctx, k, w.x + w.w / 2, cupTop - 6 - i * 20, 8.5);
  const glass = layers.get('hud:ballCounterGlass', k, 0, 150, 80, 370, paintBallCounterGlass);
  drawLayer(ctx, glass);
  drawCountOrb(ctx, s);
}

// ---------------------------------------------------------------------------------------------
// Fever meter (7.2)

export interface FeverMeterState {
  /** Orange pegs hit so far, 0..25. */
  readonly orangeHit: number;
  /** Time since the latest segment lit, ms, for its flash. */
  readonly sinceHitMs?: number;
  readonly timeMs: number;
}

export const FEVER_SEGMENTS = 25;
/** Orange hits at which the multiplier steps up (spec 5), and the multiplier reached. */
export const FEVER_STEPS: readonly (readonly [number, number])[] = [
  [10, 2],
  [15, 3],
  [19, 5],
  [22, 10],
];

export function multiplierFor(orangeHit: number): number {
  let m = 1;
  for (const [at, mult] of FEVER_STEPS) if (orangeHit >= at) m = mult;
  return m;
}

function fm() {
  const x0 = layout.feverMeter.x;
  return {
    x0,
    cx: x0 + 46,
    orbY: 122,
    stack: { x: x0 + 23, y: 164, w: 46, h: 355 },
    pitch: 355 / FEVER_SEGMENTS,
  };
}

function paintFeverMeterBase(ctx: Ctx): void {
  const m = fm();
  const body: PathFn = (c) => {
    roundRect(c, m.x0 + 8, 146, 77, 386, [10, 10, 18, 18]);
  };
  ctx.save();
  ctx.translate(1.5, 2);
  body(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  brass(ctx, body, 146, 532, 2.6);
  brass(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(m.cx - 24, 142);
      c.quadraticCurveTo(m.cx, 162, m.cx + 24, 142);
      c.lineTo(m.cx + 30, 158);
      c.lineTo(m.cx - 30, 158);
      c.closePath();
    },
    142,
    158,
    1.5,
  );
  // Teal inner frame around the segment stack.
  const s = m.stack;
  roundRect(ctx, s.x - 6, s.y - 6, s.w + 12, s.h + 12, 21);
  ctx.fillStyle = linear(ctx, s.x - 6, 0, s.x + s.w + 6, 0, [
    [0, color.tealLip],
    [0.2, color.tealLipDark],
    [0.8, color.tealDeep],
    [1, '#0e2f35'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#0a1f22';
  ctx.stroke();
  roundRect(ctx, s.x - 1, s.y - 1, s.w + 2, s.h + 2, 17);
  ctx.fillStyle = '#12040a';
  ctx.fill();
  rivet(ctx, m.x0 + 28, 152, 1.8);
  rivet(ctx, m.x0 + 64, 152, 1.8);
  rivet(ctx, m.x0 + 28, 526, 1.8);
  rivet(ctx, m.x0 + 64, 526, 1.8);
  drawOrbBezel(ctx, m.cx, m.orbY);
  drawPlaque(ctx, m.cx, m.orbY, multiplierIcon);
  drawButtonHolder(ctx, layout.holdButton.x, layout.holdButton.y, false);
}

function tubePathFor(s: { x: number; y: number; w: number; h: number }): PathFn {
  return (ctx) => {
    roundRect(ctx, s.x, s.y, s.w, s.h, 16);
  };
}

/**
 * The meter is one ribbed glass tube: 25 rings, each catching light along its top edge, with a
 * dark groove between rings and cylinder shading across. Lit rings glow orange to yellow.
 */
function paintFeverStack(ctx: Ctx, on: boolean): void {
  const m = fm();
  const s = m.stack;
  const tube = tubePathFor(s);
  withClip(ctx, tube, () => {
    ctx.fillStyle = color.meterGroove;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    const stops: readonly (readonly [number, string])[] = on
      ? [
          [0, '#ffe7a8'],
          [0.22, '#ffb45a'],
          [0.55, color.meterOnEdge],
          [0.82, '#b8320a'],
          [1, '#56100a'],
        ]
      : [
          [0, color.meterOffEdge],
          [0.2, '#7a2a18'],
          [0.55, '#55121a'],
          [0.82, color.meterOff],
          [1, '#1e0408'],
        ];
    for (let i = 0; i < FEVER_SEGMENTS; i++) {
      const y = s.y + s.h - (i + 1) * m.pitch;
      const top = y + 0.7;
      const h = m.pitch - 1.4;
      roundRect(ctx, s.x - 2, top, s.w + 4, h, h / 2);
      ctx.fillStyle = linear(ctx, 0, top, 0, top + h, stops);
      ctx.fill();
    }
    // Cylinder shading across the tube.
    ctx.fillStyle = linear(ctx, s.x, 0, s.x + s.w, 0, [
      [0, 'rgba(0,0,0,0.7)'],
      [0.14, 'rgba(0,0,0,0.18)'],
      [0.3, on ? 'rgba(255,255,220,0.28)' : 'rgba(255,200,180,0.12)'],
      [0.42, 'rgba(255,255,255,0)'],
      [0.75, 'rgba(0,0,0,0.12)'],
      [1, 'rgba(0,0,0,0.7)'],
    ]);
    ctx.fillRect(s.x, s.y, s.w, s.h);
  });
}

function paintFeverGlass(ctx: Ctx): void {
  const s = fm().stack;
  const tube = tubePathFor(s);
  withClip(ctx, tube, () => {
    ctx.fillStyle = linear(ctx, s.x, 0, s.x + s.w, 0, [
      [0, 'rgba(255,255,255,0)'],
      [0.2, 'rgba(255,255,255,0.18)'],
      [0.27, 'rgba(255,255,255,0.03)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(s.x, s.y, s.w, s.h);
  });
  tube(ctx);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#140308';
  ctx.stroke();
}

function drawStepPlate(ctx: Ctx, x: number, y: number, mult: number, reached: boolean): void {
  // Teal clamp across the tube at the step, with a tag on the left carrying the multiplier.
  const s = fm().stack;
  roundRect(ctx, s.x - 9, y - 2.8, s.w + 13, 5.6, 2.8);
  ctx.fillStyle = linear(ctx, 0, y - 2.8, 0, y + 2.8, [
    [0, '#b4e0e6'],
    [0.45, color.tealLip],
    [1, color.tealDeep],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#0b2226';
  ctx.stroke();
  const label = `x${mult}`;
  const tagW = mult >= 10 ? 31 : 25;
  roundRect(ctx, x, y - 9.5, tagW, 19, 7);
  ctx.fillStyle = linear(ctx, 0, y - 9.5, 0, y + 9.5, [
    [0, '#a8d6dd'],
    [0.4, color.tealLip],
    [1, '#1d5560'],
  ]);
  ctx.fill();
  ctx.stroke();
  drawText(
    ctx,
    label,
    x + tagW / 2,
    y + 0.5,
    reached
      ? {
          cap: 13,
          fill: [
            [0, '#fff6b0'],
            [0.5, '#ffd040'],
            [1, '#ff8a10'],
          ],
          outline: { color: '#5a0d00', width: 1.6 },
          glow: { color: 'rgba(255,150,30,0.8)', blur: 5 },
          align: 'center',
          anchor: 'middle',
        }
      : {
          cap: 13,
          fill: [
            [0, '#b8402a'],
            [1, '#5c0f08'],
          ],
          outline: { color: 'rgba(190,235,240,0.6)', width: 0.9 },
          align: 'center',
          anchor: 'middle',
        },
  );
}

export function drawFeverMeter(ctx: Ctx, k: number, s: FeverMeterState): void {
  const m = fm();
  const b = layout.feverMeter;
  drawLayer(
    ctx,
    layers.get('hud:feverMeter', k, b.x - 2, b.y - 4, b.w + 4, b.h + 6, paintFeverMeterBase),
  );
  const st = m.stack;
  const off = layers.get('hud:feverOff', k, st.x, st.y, st.w, st.h, (c) => {
    paintFeverStack(c, false);
  });
  const on = layers.get('hud:feverOn', k, st.x, st.y, st.w, st.h, (c) => {
    paintFeverStack(c, true);
  });
  drawLayer(ctx, off);
  const n = Math.max(0, Math.min(FEVER_SEGMENTS, Math.floor(s.orangeHit)));
  if (n > 0) {
    const h = n * m.pitch;
    const srcY = (st.h - h) / st.h;
    const c = on.canvas;
    ctx.drawImage(
      c,
      0,
      srcY * c.height,
      c.width,
      c.height * (h / st.h),
      st.x,
      st.y + st.h - h,
      st.w,
      h,
    );
    // Flash on the newest segment.
    const since = s.sinceHitMs ?? Infinity;
    if (since < 400) {
      const y = st.y + st.h - n * m.pitch;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - since / 400;
      ctx.fillStyle = radial(
        ctx,
        st.x + st.w / 2,
        y + m.pitch / 2,
        0,
        st.x + st.w / 2,
        y + m.pitch / 2,
        34,
        [
          [0, 'rgba(255,240,180,0.9)'],
          [1, 'rgba(255,120,0,0)'],
        ],
      );
      ctx.fillRect(st.x - 20, y - 20, st.w + 40, m.pitch + 40);
      ctx.restore();
    }
  }
  drawLayer(ctx, layers.get('hud:feverGlass', k, st.x, st.y, st.w, st.h, paintFeverGlass));
  for (const [at, mult] of FEVER_STEPS) {
    const y = st.y + st.h - at * m.pitch;
    drawStepPlate(ctx, st.x - 6, y, mult, n >= at);
  }
  // Orb: red-amber glass with a warm core that brightens with the multiplier.
  const mult = multiplierFor(n);
  const heat = mult === 1 ? 0 : mult === 2 ? 0.3 : mult === 3 ? 0.5 : mult === 5 ? 0.75 : 1;
  glassOrb(ctx, m.cx, m.orbY, 28, {
    hi: '#f5a623',
    mid: '#c43a00',
    lo: '#761400',
    rim: '#2a0600',
  });
  if (heat > 0) {
    const flicker = 0.85 + 0.15 * Math.sin(s.timeMs / 110);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 24 + 22 * heat;
    ctx.fillStyle = radial(ctx, m.cx, m.orbY, 0, m.cx, m.orbY, r, [
      [0, rgba('#fff2a0', 0.75 * heat * flicker)],
      [0.45, rgba('#ffb020', 0.45 * heat * flicker)],
      [1, 'rgba(255,90,0,0)'],
    ]);
    circlePath(ctx, m.cx, m.orbY, r);
    ctx.fill();
    ctx.restore();
  }
  glassHighlight(ctx, m.cx, m.orbY, 28, 0.55);
}

// ---------------------------------------------------------------------------------------------
// Score windows (7.3)

export interface ScoreWindowContent {
  readonly line1: string;
  readonly line2: string;
  readonly value: number;
}

function paintScoreWindow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  // Teal rim.
  const outer: PathFn = (c) => {
    roundRect(c, x + 1, y + 1, w - 2, h - 2, 17);
  };
  ctx.save();
  ctx.translate(1, 2);
  outer(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  outer(ctx);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [
    [0, '#5ec7d6'],
    [0.3, color.scoreWindowRim],
    [0.8, '#155f6e'],
    [1, '#0d3b46'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06222a';
  ctx.stroke();
  // Glass.
  const gx = x + 5.5;
  const gy = y + 5.5;
  const gw = w - 11;
  const gh = h - 11;
  const glass: PathFn = (c) => {
    roundRect(c, gx, gy, gw, gh, 12);
  };
  glass(ctx);
  ctx.fillStyle = linear(ctx, 0, gy, 0, gy + gh, [
    [0, color.scoreWindowTop],
    [0.3, '#1626d6'],
    [0.62, color.scoreWindowMid],
    [1, color.scoreWindowBottom],
  ]);
  ctx.fill();
  withClip(ctx, glass, () => {
    // Gloss band across the top half.
    roundRect(ctx, gx + 6, gy + 2, gw - 12, gh * 0.42, 9);
    ctx.fillStyle = linear(ctx, 0, gy + 2, 0, gy + 2 + gh * 0.42, [
      [0, 'rgba(255,255,255,0.42)'],
      [1, 'rgba(255,255,255,0.04)'],
    ]);
    ctx.fill();
    // Glow along the bottom.
    ctx.fillStyle = linear(ctx, 0, gy + gh * 0.6, 0, gy + gh, [
      [0, 'rgba(40,140,255,0)'],
      [1, 'rgba(60,170,255,0.5)'],
    ]);
    ctx.fillRect(gx, gy + gh * 0.6, gw, gh * 0.4);
  });
  innerBevel(ctx, glass, {
    light: '#000000',
    dark: '#8fd0ff',
    width: 1.6,
    lightAlpha: 0.45,
    darkAlpha: 0.3,
  });
  glass(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#020a4a';
  ctx.stroke();
}

export function drawScoreWindow(
  ctx: Ctx,
  k: number,
  which: 'left' | 'right',
  content: ScoreWindowContent,
): void {
  const b = which === 'left' ? layout.scoreLeft : layout.scoreRight;
  const layer = layers.get(`hud:score:${which}`, k, b.x - 1, b.y, b.w + 4, b.h + 4, (c) => {
    paintScoreWindow(c, b.x, b.y, b.w, b.h);
  });
  drawLayer(ctx, layer);
  const label = textStyle.label();
  drawText(ctx, content.line1.toUpperCase(), b.x + 17, b.y + 19, label, { maxWidth: 80 });
  drawText(ctx, content.line2.toUpperCase(), b.x + 17, b.y + 34, label, { maxWidth: 80 });
  drawText(
    ctx,
    formatNumber(content.value),
    b.x + b.w - 17,
    b.y + b.h / 2 + 0.5,
    textStyle.score(),
    {
      maxWidth: b.w - 120,
    },
  );
}

/** Brass knob at the outer end of a score window. */
export function drawWindowKnob(ctx: Ctx, x: number, y: number): void {
  knob(ctx, x, y, 8.5);
}
