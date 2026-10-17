// Prerendered display text for the play screen. Peg values, callouts, warnings and the Fever
// title are drawn many times while they animate; rendering each distinct text once into its own
// canvas and blitting it keeps the per-frame path free of font work and allocation. Sprites are
// centered on the anchor and rendered at twice the device resolution, so the 1.85x pop stays
// sharp.

import { createCanvas, context2d, releaseCanvas } from '../render/cache';
import type { Ctx } from '../render/paint';
import { drawText, measureText, type TextStyle } from '../ui/text';

export interface TextSprite {
  readonly canvas: HTMLCanvasElement;
  /** Size in world units; the anchor is the center. */
  readonly w: number;
  readonly h: number;
}

const OVERSAMPLE = 2;

let scratch: Ctx | null = null;

function measureCtx(): Ctx {
  scratch ??= context2d(createCanvas(4, 4));
  return scratch;
}

function render(k: number, style: TextStyle, text: string): TextSprite {
  const width = measureText(measureCtx(), text, style);
  const outline = (style.outline?.width ?? 0) + (style.outerOutline?.width ?? 0);
  const blur = style.glow?.blur ?? 0;
  const shadow = Math.max(Math.abs(style.shadow?.dx ?? 0), Math.abs(style.shadow?.dy ?? 0));
  const pad = Math.ceil(outline * 1.5 + blur * 1.6 + shadow + 2);
  // Overload's caps sit inside about 1.35 cap heights including the descent of commas.
  const w = width + 2 * pad;
  const h = style.cap * 1.4 + 2 * pad;
  const res = k * OVERSAMPLE;
  const canvas = createCanvas(w * res, h * res);
  const ctx = context2d(canvas);
  ctx.scale(canvas.width / w, canvas.height / h);
  drawText(ctx, text, w / 2, h / 2, { ...style, align: 'center', anchor: 'middle' });
  return { canvas, w, h };
}

/** Sprites per style id and text, for one device resolution at a time. */
export class TextSprites {
  private k = 0;
  private readonly styles = new Map<string, Map<string, TextSprite>>();

  /**
   * The sprite of `text` in `style`; `styleId` names the style (one id per distinct style). A
   * sprite is drawn when it is fetched and kept nowhere else, so a new resolution frees the old
   * sprites' canvases at once (releaseCanvas).
   */
  get(k: number, styleId: string, style: TextStyle, text: string): TextSprite {
    if (k !== this.k) {
      this.release();
      this.k = k;
    }
    let byText = this.styles.get(styleId);
    if (byText === undefined) {
      byText = new Map();
      this.styles.set(styleId, byText);
    }
    let sprite = byText.get(text);
    if (sprite === undefined) {
      sprite = render(k, style, text);
      byText.set(text, sprite);
    }
    return sprite;
  }

  /** Forgets the texts of one style (tally lines change every shot). */
  forget(styleId: string): void {
    for (const s of this.styles.get(styleId)?.values() ?? []) releaseCanvas(s.canvas);
    this.styles.delete(styleId);
  }

  /** Forgets every sprite and frees its canvas (a new resolution, or the screen is gone). */
  release(): void {
    for (const byText of this.styles.values()) {
      for (const s of byText.values()) releaseCanvas(s.canvas);
    }
    this.styles.clear();
  }
}

/** Draws a sprite centered on (x, y) at `scale`, with the current alpha times `alpha`. */
export function drawTextSprite(
  ctx: Ctx,
  s: TextSprite,
  x: number,
  y: number,
  scale = 1,
  alpha = 1,
): void {
  if (alpha <= 0 || scale <= 0) return;
  const w = s.w * scale;
  const h = s.h * scale;
  if (alpha >= 1) {
    ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
    return;
  }
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = a;
}
