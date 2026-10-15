// Launcher housing (guide 7.4): a brass housing over the cannon with a round portrait window, a
// themed ring behind it, an arched power banner in the theme color (dark, or lit while the power
// runs), a turns counter and the portrait glow. The window shows the master's portrait, or empty
// glass where a master has no art yet; nothing stands in for a portrait.

import { drawLauncherPortrait } from '../art/portrait';
import type { PortraitImage } from '../art/masters';
import { layout } from '../layout';
import { darken, lighten, mix, rgba } from '../ui/color';
import { drawText, drawTextOnArc } from '../ui/text';
import { color, type Theme } from '../ui/tokens';
import { drawLayer, layers } from './cache';
import {
  brass,
  circlePath,
  glassHighlight,
  knob,
  linear,
  radial,
  rivet,
  type Ctx,
  type PathFn,
} from './paint';

const CX = layout.portrait.x;
const CY = layout.portrait.y;

/** Brass housing outline around (0, 0) = the portrait center. */
const housingPath: PathFn = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(-88, -90);
  ctx.lineTo(88, -90);
  ctx.lineTo(87, -58);
  ctx.bezierCurveTo(86, -46, 70, -43, 62, -37);
  ctx.bezierCurveTo(72, -33, 84, -31, 89, -24);
  ctx.bezierCurveTo(78, -21, 63, -21, 51, -14);
  ctx.arc(0, 0, 53, -0.27, Math.PI + 0.27, false);
  ctx.bezierCurveTo(-63, -21, -78, -21, -89, -24);
  ctx.bezierCurveTo(-84, -31, -72, -33, -62, -37);
  ctx.bezierCurveTo(-70, -43, -86, -46, -87, -58);
  ctx.closePath();
};

function paintThemeRing(ctx: Ctx, theme: Theme): void {
  // Themed enamel ring behind the housing; its lower half shows under the brass.
  circlePath(ctx, 0, 1.5, 67);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  circlePath(ctx, 0, 0, 66);
  ctx.fillStyle = radial(ctx, -18, -26, 6, 0, 0, 66, [
    [0, lighten(theme.base, 0.45)],
    [0.55, theme.base],
    [0.85, darken(theme.base, 0.25)],
    [1, darken(theme.base, 0.55)],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = darken(theme.dark, 0.5);
  ctx.stroke();
  // Light catching the lower rim.
  ctx.beginPath();
  ctx.arc(0, 0, 61, Math.PI * 0.22, Math.PI * 0.78);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(lighten(theme.base, 0.6), 0.55);
  ctx.stroke();
  circlePath(ctx, 0, 0, 50);
  ctx.fillStyle = darken(theme.dark, 0.35);
  ctx.fill();
}

function paintHousing(ctx: Ctx): void {
  ctx.save();
  ctx.translate(1.5, 2.5);
  housingPath(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();
  brass(ctx, housingPath, -78, 55, 3);
  // Dark banner slot.
  ctx.beginPath();
  ctx.arc(0, 0, 62, (-140 * Math.PI) / 180, (-40 * Math.PI) / 180);
  ctx.arc(0, 0, 47, (-40 * Math.PI) / 180, (-140 * Math.PI) / 180, true);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, -62, 0, -30, [
    [0, '#0b2a2f'],
    [1, color.tealDeep],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = color.tealLipDark;
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  // Window rim.
  circlePath(ctx, 0, 0, 45.5);
  ctx.fillStyle = linear(ctx, 0, -45, 0, 45, [
    [0, '#0d2a30'],
    [0.5, color.tealLipDark],
    [1, color.tealLip],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  knob(ctx, -62, -71, 7.5);
  knob(ctx, 62, -71, 7.5);
  rivet(ctx, -57, -27, 2);
  rivet(ctx, 57, -27, 2);
}

function paintWindowGlass(ctx: Ctx): void {
  // Empty portrait window: dark glass with depth and reflections.
  circlePath(ctx, 0, 0, layout.portrait.r);
  ctx.fillStyle = radial(ctx, 0, 8, 4, 0, 0, layout.portrait.r, [
    [0, 'rgba(40,60,90,0.55)'],
    [0.7, 'rgba(10,18,40,0.75)'],
    [1, 'rgba(0,0,0,0.85)'],
  ]);
  ctx.fill();
  glassHighlight(ctx, 0, 0, layout.portrait.r, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, layout.portrait.r - 4, Math.PI * 0.15, Math.PI * 0.55);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(200,235,255,0.22)';
  ctx.stroke();
}

const BANNER_RO = 77;
const BANNER_RI = 56;
const BANNER_SPAN = (47 * Math.PI) / 180;

function bannerPath(ctx: Ctx): void {
  const a0 = -Math.PI / 2 - BANNER_SPAN;
  const a1 = -Math.PI / 2 + BANNER_SPAN;
  const rm = (BANNER_RO + BANNER_RI) / 2;
  const capR = (BANNER_RO - BANNER_RI) / 2;
  ctx.beginPath();
  ctx.arc(0, 0, BANNER_RO, a0, a1);
  ctx.arc(rm * Math.cos(a1), rm * Math.sin(a1), capR, a1, a1 + Math.PI);
  ctx.arc(0, 0, BANNER_RI, a1, a0, true);
  ctx.arc(rm * Math.cos(a0), rm * Math.sin(a0), capR, a0 + Math.PI, a0);
  ctx.closePath();
}

function paintBanner(ctx: Ctx, theme: Theme, power: string, lit: boolean): void {
  ctx.save();
  ctx.translate(1, 2);
  bannerPath(ctx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  ctx.restore();
  bannerPath(ctx);
  const base = lit ? lighten(theme.base, 0.15) : darken(mix(theme.base, theme.dark, 0.6), 0.25);
  ctx.fillStyle = radial(ctx, 0, 0, BANNER_RI, 0, 0, BANNER_RO, [
    [0, darken(base, 0.35)],
    [0.45, base],
    [0.8, lighten(base, lit ? 0.35 : 0.15)],
    [1, darken(base, 0.2)],
  ]);
  ctx.fill();
  // Gloss along the outer curve.
  ctx.save();
  bannerPath(ctx);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(
    0,
    0,
    BANNER_RO - 4.5,
    -Math.PI / 2 - BANNER_SPAN + 0.06,
    -Math.PI / 2 + BANNER_SPAN - 0.06,
  );
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255,255,255,${lit ? 0.55 : 0.22})`;
  ctx.stroke();
  ctx.restore();
  bannerPath(ctx);
  ctx.lineWidth = 1;
  ctx.strokeStyle = darken(theme.dark, 0.6);
  ctx.stroke();
  // Lettering fills the band: bright with a dark outline when lit, engraved when dark.
  const cap = 11.5;
  const ink = lit
    ? {
        cap,
        fill: [
          [0, '#ffffff'],
          [1, lighten(theme.glow, 0.55)],
        ] as const,
        outline: { color: darken(theme.dark, 0.45), width: 1.4 },
      }
    : {
        cap,
        fill: rgba(lighten(mix(theme.base, theme.dark, 0.3), 0.3), 0.85),
        outline: { color: rgba(darken(theme.dark, 0.6), 0.8), width: 1 },
      };
  drawTextOnArc(ctx, power.toUpperCase(), 0, 0, (BANNER_RO + BANNER_RI) / 2 - cap / 2, 0, ink, {
    maxAngle: BANNER_SPAN * 2 - 0.2,
  });
}

export interface LauncherState {
  readonly theme: Theme;
  /** Power name shown on the banner. */
  readonly power: string;
  /** The power is running: lit banner and portrait glow. */
  readonly active: boolean;
  /** Turns left, shown in the counter; omitted when the power has no turn count. */
  readonly turns?: number;
  readonly timeMs: number;
  /** The master's portrait in the window, or null for empty glass. */
  readonly portrait?: PortraitImage | null;
}

/** Theme ring that sits behind the housing; draw it before the housing. */
export function drawLauncherBack(ctx: Ctx, k: number, theme: Theme): void {
  const layer = layers.get(`launcher:ring:${theme.index}`, k, -68, -68, 136, 136, (c) => {
    paintThemeRing(c, theme);
  });
  drawLayer(ctx, layer, CX, CY);
}

export function drawLauncher(ctx: Ctx, k: number, s: LauncherState): void {
  drawLayer(ctx, layers.get('launcher:housing', k, -92, -80, 184, 138, paintHousing), CX, CY);
  const portrait = s.portrait ?? null;
  if (portrait === null) {
    drawLayer(ctx, layers.get('launcher:glass', k, -43, -43, 86, 86, paintWindowGlass), CX, CY);
  } else {
    drawLauncherPortrait(ctx, k, portrait, s.theme, CX, CY, layout.portrait.r);
  }
  if (s.active) {
    const pulse = 0.8 + 0.2 * Math.sin(s.timeMs / 220);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, CX, CY, 20, CX, CY, 48, [
      [0, rgba(s.theme.glow, 0)],
      [0.75, rgba(s.theme.glow, 0.55 * pulse)],
      [1, rgba(s.theme.glow, 0)],
    ]);
    circlePath(ctx, CX, CY, 48);
    ctx.fill();
    ctx.restore();
  }
  const banner = layers.get(
    `launcher:banner:${s.theme.index}:${s.power}:${s.active ? 1 : 0}`,
    k,
    -82,
    -82,
    164,
    50,
    (c) => {
      paintBanner(c, s.theme, s.power, s.active);
    },
  );
  drawLayer(ctx, banner, CX, CY);
  drawTurnsCounter(ctx, s.turns);
}

function drawTurnsCounter(ctx: Ctx, turns: number | undefined): void {
  // A dark oval with a thin teal rim and a white digit (7.4).
  const { x, y } = layout.turnsCounter;
  ctx.beginPath();
  ctx.ellipse(x, y, 10.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = color.tealLipDark;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#06191c';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, 8.8, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, y - 6, 0, y + 6, [
    [0, '#1a2128'],
    [1, '#020304'],
  ]);
  ctx.fill();
  drawText(ctx, turns === undefined ? '' : String(turns), x, y + 0.3, {
    cap: 7.5,
    fill: '#ffffff',
    align: 'center',
    anchor: 'middle',
  });
}
