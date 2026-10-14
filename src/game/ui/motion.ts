// Animation curves for UI motion (guide 9.3, 7.5, 10.6 and 16.6). All times are milliseconds.

import { motion } from './tokens';

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const ease = {
  outQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  outCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2,
  inOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Overshoots past 1 by about `s / 10` before settling. */
  outBack:
    (s = 1.70158) =>
    (t: number): number => {
      const c3 = s + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    },
} as const;

export interface PopFrame {
  readonly scale: number;
  readonly alpha: number;
  readonly done: boolean;
}

/** Total length of the style shot pop: grow, settle, hold, fade. */
export const POP_TOTAL_MS = motion.popSettleMs + motion.popHoldMs + motion.popFadeMs;

/**
 * Style shot callout pop (9.3): grows to 1.85x at 80 ms, settles to 1.0x by 250 ms, holds for
 * 600 ms, then fades over 350 ms.
 */
export function popIn(tMs: number, holdMs: number = motion.popHoldMs): PopFrame {
  const peak = motion.popPeakScale;
  if (tMs < 0) return { scale: 1, alpha: 0, done: false };
  if (tMs < motion.popPeakMs) {
    return { scale: lerp(1, peak, ease.outQuad(tMs / motion.popPeakMs)), alpha: 1, done: false };
  }
  if (tMs < motion.popSettleMs) {
    const t = (tMs - motion.popPeakMs) / (motion.popSettleMs - motion.popPeakMs);
    return { scale: lerp(peak, 1, ease.inOutCubic(t)), alpha: 1, done: false };
  }
  const fadeStart = motion.popSettleMs + holdMs;
  if (tMs < fadeStart) return { scale: 1, alpha: 1, done: false };
  const f = (tMs - fadeStart) / motion.popFadeMs;
  if (f >= 1) return { scale: 1, alpha: 0, done: true };
  return { scale: 1, alpha: 1 - ease.inOutSine(f), done: false };
}

export interface WarningFrame {
  readonly scale: number;
  readonly alpha: number;
  readonly done: boolean;
}

/**
 * Low-ball warning (7.5): appears big, shrinks to its rest size under the launcher and holds
 * for about 3 s. `startScale` is the size ratio of the entrance to the settled text.
 */
export function warningIn(tMs: number, startScale: number, holdMs = 3000): WarningFrame {
  const shrinkMs = 450;
  const fadeMs = 400;
  if (tMs < 0) return { scale: startScale, alpha: 0, done: false };
  if (tMs < shrinkMs) {
    const t = ease.outCubic(tMs / shrinkMs);
    return { scale: lerp(startScale, 1, t), alpha: clamp01(tMs / 90), done: false };
  }
  if (tMs < shrinkMs + holdMs) return { scale: 1, alpha: 1, done: false };
  const f = (tMs - shrinkMs - holdMs) / fadeMs;
  if (f >= 1) return { scale: 1, alpha: 0, done: true };
  return { scale: 1, alpha: 1 - f, done: false };
}

/** Dialog drop (10.6): falls from above the screen to rest in about 170 ms with a small bounce. */
export function dialogDrop(tMs: number, distance: number): number {
  const t = clamp01(tMs / motion.dialogDropMs);
  return -distance * (1 - ease.outBack(1.2)(t));
}

/** Peg value popup: rises a little and fades. Lifetime is a Teggle choice (the guide has a gap). */
export const PEG_VALUE_MS = 900;

export function pegValueFrame(tMs: number): { rise: number; alpha: number; done: boolean } {
  if (tMs < 0) return { rise: 0, alpha: 0, done: false };
  const t = tMs / PEG_VALUE_MS;
  if (t >= 1) return { rise: 6, alpha: 0, done: true };
  return { rise: 6 * ease.outCubic(t), alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3, done: false };
}
