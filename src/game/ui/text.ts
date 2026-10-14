// Layered display text (guide 8.2): drop shadow, glow, outline, gradient fill, highlight. Sizes
// are cap heights in world units; the font size comes from each face's measured cap ratio.

import type { Ctx, Stops } from '../render/paint';
import { linear } from '../render/paint';
import {
  color,
  FONT_BODY,
  FONT_BODY_FALLBACK,
  FONT_DISPLAY,
  FONT_DISPLAY_CAPS,
  FONT_DISPLAY_FALLBACK,
  type,
} from './tokens';

/**
 * `display` is Overload with its rounded cap-height A and E, which most of the original's text
 * shows ("LaST BaLL!"); `caps` swaps in the squared A and E that the small HUD labels use
 * ("STAGE"); `body` is the sentence face.
 */
export type Face = 'display' | 'caps' | 'body';

export interface TextStyle {
  readonly face?: Face;
  /** Cap height in world units. */
  readonly cap: number;
  /** Body face weight. */
  readonly weight?: number;
  /** Flat color, or vertical stops over the cap height (0 = cap top, 1 = baseline). */
  readonly fill: string | Stops;
  /** Outline thickness outside the glyph, world units. */
  readonly outline?: { readonly color: string; readonly width: number };
  /** A second, wider outline behind the first. */
  readonly outerOutline?: { readonly color: string; readonly width: number };
  readonly glow?: { readonly color: string; readonly blur: number };
  readonly shadow?: { readonly color: string; readonly dx: number; readonly dy: number };
  /** Thin light sheen over the top part of the glyphs. */
  readonly sheen?: number;
  readonly align?: 'left' | 'center' | 'right';
  /** Where y sits: the baseline, or the vertical middle of the caps. */
  readonly anchor?: 'baseline' | 'middle' | 'top';
}

interface FaceMetrics {
  capRatio: number;
  loaded: boolean;
}

const metrics: Record<Face, FaceMetrics> = {
  display: { capRatio: 0.7, loaded: false },
  caps: { capRatio: 0.7, loaded: false },
  body: { capRatio: 0.7, loaded: false },
};

/** Called once fonts are ready: records whether the webfont loaded and its cap ratio. */
export function setFaceMetrics(face: Face, loaded: boolean, capRatio: number): void {
  metrics[face] = { loaded, capRatio: capRatio > 0.3 && capRatio < 1.2 ? capRatio : 0.7 };
}

const FAMILY: Record<Face, [string, string]> = {
  display: [FONT_DISPLAY, FONT_DISPLAY_FALLBACK],
  caps: [FONT_DISPLAY_CAPS, FONT_DISPLAY_FALLBACK],
  body: [FONT_BODY, FONT_BODY_FALLBACK],
};

export function fontFamily(face: Face): string {
  const [family, fallback] = FAMILY[face];
  return metrics[face].loaded ? `"${family}", ${fallback}` : fallback;
}

export function fontFor(style: TextStyle, scale = 1): string {
  const face = style.face ?? 'display';
  const m = metrics[face];
  const size = (style.cap * scale) / m.capRatio;
  const weight = face === 'body' ? (style.weight ?? 500) : m.loaded ? 400 : 900;
  return `${weight} ${size.toFixed(3)}px ${fontFamily(face)}`;
}

export function measureText(ctx: Ctx, text: string, style: TextStyle, scale = 1): number {
  ctx.save();
  ctx.font = fontFor(style, scale);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

function baselineY(y: number, style: TextStyle, cap: number): number {
  switch (style.anchor ?? 'baseline') {
    case 'middle':
      return y + cap / 2;
    case 'top':
      return y + cap;
    case 'baseline':
      return y;
  }
}

export interface DrawTextOptions {
  /** Uniform scale around (x, y), for pop animations. */
  readonly scale?: number;
  readonly alpha?: number;
  /** Shrinks the text to fit this width. */
  readonly maxWidth?: number;
}

/** Draws one line of text and returns its drawn width. */
export function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  opts: DrawTextOptions = {},
): number {
  if (text.length === 0) return 0;
  let scale = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0 || scale <= 0) return 0;
  if (opts.maxWidth !== undefined) {
    const natural = measureText(ctx, text, style, scale);
    if (natural > opts.maxWidth) scale *= opts.maxWidth / natural;
  }
  const cap = style.cap * scale;
  const base = baselineY(y, style, cap);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = fontFor(style, scale);
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const width = ctx.measureText(text).width;

  if (style.shadow !== undefined) {
    const s = style.shadow;
    const o = (style.outline?.width ?? 0) * scale;
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = o * 2;
    if (o > 0) ctx.strokeText(text, x + s.dx * scale, base + s.dy * scale);
    ctx.fillText(text, x + s.dx * scale, base + s.dy * scale);
  }
  if (style.glow !== undefined) {
    ctx.save();
    ctx.shadowColor = style.glow.color;
    ctx.shadowBlur = style.glow.blur * scale * ctxScale(ctx);
    ctx.fillStyle = style.glow.color;
    ctx.strokeStyle = style.glow.color;
    ctx.lineWidth = ((style.outline?.width ?? 0) * 2 + 1) * scale;
    ctx.strokeText(text, x, base);
    ctx.restore();
  }
  if (style.outerOutline !== undefined) {
    ctx.strokeStyle = style.outerOutline.color;
    ctx.lineWidth = style.outerOutline.width * 2 * scale;
    ctx.strokeText(text, x, base);
  }
  if (style.outline !== undefined) {
    ctx.strokeStyle = style.outline.color;
    ctx.lineWidth = style.outline.width * 2 * scale;
    ctx.strokeText(text, x, base);
  }
  ctx.fillStyle =
    typeof style.fill === 'string' ? style.fill : linear(ctx, 0, base - cap, 0, base, style.fill);
  ctx.fillText(text, x, base);

  if (style.sheen !== undefined && style.sheen > 0) {
    // A light band over the upper part of the caps, drawn as the glyphs themselves.
    ctx.fillStyle = linear(ctx, 0, base - cap, 0, base - cap * 0.45, [
      [0, `rgba(255,255,255,${style.sheen})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillText(text, x, base);
  }
  ctx.restore();
  return width;
}

/** Device pixels per world unit of the current transform, for blur radii. */
function ctxScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b);
}

/**
 * Draws text along a circular arc centered on `angle` (radians, 0 = up, clockwise positive),
 * glyph by glyph, with the baseline on the circle of radius `radius` around (cx, cy).
 */
export function drawTextOnArc(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  style: TextStyle,
  opts: { maxAngle?: number; alpha?: number } = {},
): void {
  ctx.save();
  ctx.font = fontFor(style);
  // Display text is plain ASCII, so code points are glyphs.
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let scale = 1;
  if (opts.maxAngle !== undefined && total / radius > opts.maxAngle) {
    scale = (opts.maxAngle * radius) / total;
  }
  ctx.restore();
  let a = angle - (total * scale) / radius / 2;
  chars.forEach((ch, i) => {
    const w = (widths[i] ?? 0) * scale;
    const mid = a + w / radius / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.sin(mid), cy - radius * Math.cos(mid));
    ctx.rotate(mid);
    drawText(
      ctx,
      ch,
      0,
      0,
      { ...style, align: 'center', anchor: 'baseline' },
      {
        scale,
        alpha: opts.alpha ?? 1,
      },
    );
    ctx.restore();
    a += w / radius;
  });
}

// Presets (16.5). Each returns a fresh style so callers can spread and override.

export const textStyle = {
  score: (): TextStyle => ({
    cap: type.score,
    fill: [
      [0, color.textScore],
      [1, color.textScoreLow],
    ],
    outline: { color: color.textScoreOutline, width: 1.1 },
    align: 'right',
    anchor: 'middle',
  }),
  label: (): TextStyle => ({
    face: 'caps',
    cap: type.label,
    fill: [
      [0, '#a6e4ff'],
      [1, color.textLabel],
    ],
  }),
  ballCount: (): TextStyle => ({
    cap: type.ballCount,
    fill: [
      [0, '#d6ff9a'],
      [0.35, color.textBallCount],
      [1, color.textBallCountLow],
    ],
    outline: { color: color.textBallCountGlow, width: 2 },
    glow: { color: 'rgba(10, 60, 20, 0.9)', blur: 4 },
    align: 'center',
    anchor: 'middle',
  }),
  pegValue: (): TextStyle => ({
    cap: type.pegValue,
    fill: color.textPegValue,
    outline: { color: '#1d1a00', width: 1.3 },
    align: 'center',
    anchor: 'middle',
  }),
  styleShot: (): TextStyle => ({
    cap: type.callout,
    fill: [
      [0, color.textStyleShotHi],
      [1, color.textStyleShot],
    ],
    outline: { color: color.textStyleOutline, width: 1.8 },
    align: 'center',
    anchor: 'middle',
  }),
  bonusPink: (): TextStyle => ({
    cap: type.pegValue,
    fill: [
      [0, color.textBonusPinkHi],
      [1, color.textBonusPink],
    ],
    outline: { color: '#2e0630', width: 1.4 },
    align: 'center',
    anchor: 'middle',
  }),
  powerLabel: (): TextStyle => ({
    cap: type.pegValue,
    fill: [
      [0, '#b6ff8e'],
      [1, '#4fd13b'],
    ],
    outline: { color: '#0a2c08', width: 1.4 },
    align: 'center',
    anchor: 'middle',
  }),
  tally: (cap: number): TextStyle => ({
    cap,
    fill: [
      [0, '#fbff6a'],
      [0.5, color.textTally],
      [1, '#e0cf0c'],
    ],
    outline: { color: '#000000', width: cap > 15 ? 2.4 : 1.9 },
    align: 'center',
    anchor: 'middle',
  }),
  stylePoints: (): TextStyle => ({
    cap: type.stylePoints,
    fill: color.textStylePoints,
    outline: { color: '#06240a', width: 1.8 },
    align: 'center',
    anchor: 'middle',
  }),
  /** "font2": hot warning (8.2). */
  warning: (cap: number = type.warning): TextStyle => ({
    cap,
    fill: [
      [0, color.textWarnTop],
      [0.4, color.textWarnTop],
      [0.5, color.textWarnMid],
      [0.62, color.textWarnLow],
      [0.66, color.textWarnBottom],
      [1, color.textWarnBottom],
    ],
    outline: { color: '#000000', width: Math.max(1.6, cap * 0.075) },
    shadow: { color: 'rgba(0,0,0,0.55)', dx: cap * 0.03, dy: cap * 0.05 },
    align: 'center',
    anchor: 'middle',
  }),
  /** "font1": cool title (8.2). */
  title: (cap: number = type.title): TextStyle => ({
    cap,
    fill: [
      [0, '#e9fdff'],
      [0.18, color.textTitleTop],
      [0.55, color.textTitleTop],
      [0.62, color.textTitleLow],
      [1, '#3a86b8'],
    ],
    outline: { color: color.textTitleOutline, width: Math.max(1.4, cap * 0.09) },
    outerOutline: { color: 'rgba(8, 6, 60, 0.9)', width: Math.max(2, cap * 0.14) },
    align: 'center',
    anchor: 'middle',
  }),
  bigNumber: (cap: number = type.bigNumber): TextStyle => ({
    cap,
    fill: [
      [0, '#fffd8a'],
      [0.3, '#ffe82a'],
      [0.62, '#ff9a12'],
      [1, '#e8360a'],
    ],
    outline: { color: '#000000', width: 3 },
    shadow: { color: 'rgba(0,0,0,0.5)', dx: 1.5, dy: 2.5 },
    align: 'center',
    anchor: 'middle',
  }),
  rowLabel: (): TextStyle => ({
    cap: type.rowLabel,
    fill: [
      [0, '#a8f7f7'],
      [1, color.textRowLabel],
    ],
    outline: { color: '#06083a', width: 1.4 },
    anchor: 'middle',
  }),
  rowValue: (): TextStyle => ({
    cap: type.rowValue,
    fill: [
      [0, '#fffa9a'],
      [1, color.textValue],
    ],
    outline: { color: '#000000', width: 1.4 },
    align: 'right',
    anchor: 'middle',
  }),
  button: (ink: string = color.textButton): TextStyle => ({
    cap: type.button,
    fill: ink,
    shadow: { color: 'rgba(20, 40, 10, 0.5)', dx: 0.8, dy: 1 },
    align: 'center',
    anchor: 'middle',
  }),
  body: (fill: string = color.textBody): TextStyle => ({
    face: 'body',
    cap: type.body * 0.72,
    weight: 500,
    fill,
    anchor: 'baseline',
  }),
  stats: (): TextStyle => ({
    face: 'body',
    cap: type.body * 0.72,
    weight: 500,
    fill: color.textStats,
    anchor: 'middle',
  }),
} as const;

/** Thousands separators, as every number on screen uses them. */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.trunc(Math.abs(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s.charAt(i);
  }
  return sign + out;
}
