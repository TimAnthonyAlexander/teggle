// What the screen is like, for sizing the UI on phones and tablets (spec 14.2, mobile pass): how
// many CSS pixels one world unit spans, and whether a finger is the primary pointer. The app
// updates it on every resize; menus, dialogs and the HUD read it to keep touch targets at least
// 44 CSS px and small text legible. On a desktop screen of usual size nothing here changes a
// thing: the floors only bite where the 16:9 world is shown smaller than its 1066.67 x 600 units.

import type { TextStyle } from '../ui/text';

/** Smallest touch target, CSS px (Apple's 44 pt; Android asks for 48 dp, about the same). */
export const MIN_TARGET_CSS = 44;
/** Smallest cap height of sentence text (the body face), CSS px. */
export const MIN_BODY_CAP_CSS = 7;
/** Smallest cap height of display-face labels and numbers, CSS px. */
export const MIN_LABEL_CAP_CSS = 6.5;

export interface DisplayMetrics {
  /** CSS pixels per world unit. */
  cssPerUnit: number;
  /** The primary pointer is a finger (pointer: coarse). */
  coarse: boolean;
}

export const display: DisplayMetrics = { cssPerUnit: 1, coarse: false };

export function setDisplay(cssPerUnit: number, coarse: boolean): void {
  display.cssPerUnit = cssPerUnit > 0 && Number.isFinite(cssPerUnit) ? cssPerUnit : 1;
  display.coarse = coarse;
}

/** World units that span `css` CSS pixels on this screen. */
export function cssToWorld(css: number): number {
  return css / display.cssPerUnit;
}

/** The size, in world units, a touch target needs on this screen. */
export function minTarget(): number {
  return cssToWorld(MIN_TARGET_CSS);
}

/** How far apart (world units) stacked controls sit: the design pitch, or more on touch screens. */
export function touchPitch(design: number, max = design * 2): number {
  if (!display.coarse) return design;
  return Math.max(design, Math.min(max, minTarget()));
}

/** A cap height raised so it spans at least `minCss` CSS pixels; never below the design `cap`. */
export function legibleCap(cap: number, minCss: number = MIN_LABEL_CAP_CSS): number {
  return Math.max(cap, cssToWorld(minCss));
}

/** How much `legibleCap` enlarges `cap` (1 where the design size is legible already). */
export function legibleScale(cap: number, minCss: number = MIN_LABEL_CAP_CSS): number {
  return legibleCap(cap, minCss) / cap;
}

/**
 * `style` with its cap height raised to the floor for its face (sentences in the body face get
 * the body floor, everything else the label floor); outlines grow with it.
 */
export function legible(style: TextStyle): TextStyle {
  const floor = style.face === 'body' ? MIN_BODY_CAP_CSS : MIN_LABEL_CAP_CSS;
  const s = legibleScale(style.cap, floor);
  if (s === 1) return style;
  return {
    ...style,
    cap: style.cap * s,
    ...(style.outline === undefined
      ? {}
      : { outline: { color: style.outline.color, width: style.outline.width * s } }),
  };
}
