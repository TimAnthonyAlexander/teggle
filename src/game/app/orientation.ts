// Mobile orientation and fullscreen (spec 14.1): the game is landscape only. On a touch device
// held upright, the app pauses and shows a rotate prompt in the game's own panel style.

import { drawPanel } from '../ui/controls';
import { lighten, rgba } from '../ui/color';
import { drawText, textStyle } from '../ui/text';
import { linear, roundRect, type Ctx } from '../render/paint';
import type { Theme } from '../ui/tokens';

/** True when the primary pointer is a finger. */
export function isTouchPrimary(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function needsRotate(cssWidth: number, cssHeight: number): boolean {
  return isTouchPrimary() && cssHeight > cssWidth;
}

/** Asks for fullscreen and a landscape lock where the browser allows it; failures are fine. */
export function enterFullscreen(): void {
  const el = document.documentElement;
  if (document.fullscreenElement !== null || typeof el.requestFullscreen !== 'function') return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      // Not every browser has orientation.lock (iOS Safari does not).
      const orientation: Partial<Pick<ScreenOrientation, 'lock'>> = screen.orientation;
      return orientation.lock?.call(screen.orientation, 'landscape');
    })
    .catch(() => {
      // iPhone Safari has no element fullscreen; the page still works in the browser chrome.
    });
}

function drawPhone(ctx: Ctx, cx: number, cy: number, angle: number, theme: Theme): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  roundRect(ctx, -26, -46, 52, 92, 9);
  ctx.fillStyle = '#000000';
  ctx.fill();
  roundRect(ctx, -24, -44, 48, 88, 8);
  ctx.fillStyle = linear(ctx, -24, 0, 24, 0, [
    [0, '#8d6a3a'],
    [0.3, '#f2dca8'],
    [1, '#704727'],
  ]);
  ctx.fill();
  roundRect(ctx, -19, -36, 38, 72, 4);
  ctx.fillStyle = linear(ctx, 0, -36, 0, 36, [
    [0, lighten(theme.base, 0.2)],
    [1, theme.dark],
  ]);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.25);
  ctx.fillRect(-15, -32, 6, 64);
  ctx.restore();
}

/**
 * Rotate prompt, drawn in CSS pixels over the whole canvas: a dialog panel with a phone that
 * turns to landscape.
 */
export function drawRotatePrompt(
  ctx: Ctx,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  timeMs: number,
  theme: Theme,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = linear(ctx, 0, 0, 0, cssHeight, [
    [0, theme.dark],
    [1, '#05030f'],
  ]);
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const pw = 250;
  const ph = 260;
  const s = Math.min((cssWidth - 32) / pw, (cssHeight - 32) / ph, 1.6);
  ctx.translate(cssWidth / 2, cssHeight / 2);
  ctx.scale(s, s);
  const box = { x: -pw / 2, y: -ph / 2, w: pw, h: ph };
  drawPanel(ctx, box, 'Turn Sideways');
  // The phone turns a quarter, holds, then snaps back.
  const cycle = (timeMs % 2400) / 2400;
  const t = cycle < 0.15 ? 0 : cycle < 0.55 ? (cycle - 0.15) / 0.4 : cycle < 0.9 ? 1 : 0;
  const eased = 0.5 - Math.cos(Math.PI * t) / 2;
  drawPhone(ctx, 0, 10, (-Math.PI / 2) * eased, theme);
  drawText(ctx, 'Teggle plays in landscape.', 0, 98, {
    ...textStyle.body(),
    align: 'center',
    cap: 9,
  });
}
