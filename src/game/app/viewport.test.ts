import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../layout';
import { clientToWorld, cssPixels, fitWorld } from './viewport';

describe('fitWorld', () => {
  it('fills a 16:9 viewport exactly', () => {
    const fit = fitWorld(1600, 900, 1);
    expect(fit.scale).toBeCloseTo(1.5, 9);
    expect(fit.originX).toBe(0);
    expect(fit.originY).toBe(0);
    expect(fit.pixelWidth).toBe(1600);
  });

  it('letterboxes a 4:3 viewport top and bottom', () => {
    const fit = fitWorld(1024, 768, 1);
    expect(fit.scale).toBeCloseTo(1024 / WORLD_W, 9);
    expect(fit.originX).toBe(0);
    expect(fit.originY).toBe(Math.round((768 - WORLD_H * fit.scale) / 2));
  });

  it('pillarboxes a wide phone in landscape and sizes the backing store by DPR', () => {
    const fit = fitWorld(852, 393, 3);
    expect(fit.scale).toBeCloseTo(393 / WORLD_H, 9);
    expect(fit.pixelWidth).toBe(2556);
    expect(fit.pixelHeight).toBe(1179);
    expect(fit.k).toBeCloseTo(fit.scale * 3, 9);
    expect(fit.originY).toBe(0);
    expect(fit.originX).toBeGreaterThan(0);
  });

  it('caps the device pixel ratio', () => {
    expect(fitWorld(800, 450, 5).dpr).toBe(3);
    expect(fitWorld(800, 450, 0).dpr).toBe(1);
  });
});

describe('fitWorld with safe-area insets', () => {
  it('matches the plain fit exactly when there are no insets', () => {
    for (const [w, h, dpr] of [
      [1600, 900, 1],
      [852, 393, 3],
      [1013, 761, 1.25],
    ] as const) {
      expect(fitWorld(w, h, dpr, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual(
        fitWorld(w, h, dpr),
      );
    }
  });

  it('keeps the world out of a notch and off the home indicator on a phone in landscape', () => {
    // iPhone 13 in landscape: 844 x 390 CSS px, 47 px insets left and right, 21 px at the bottom.
    const insets = { top: 0, right: 47, bottom: 21, left: 47 };
    const fit = fitWorld(844, 390, 3, insets);
    expect(fit.scale).toBeCloseTo(369 / WORLD_H, 9);
    // The backing store still covers the whole screen; the letterbox fills the edges.
    expect(fit.pixelWidth).toBe(844 * 3);
    expect(fit.pixelHeight).toBe(390 * 3);
    const topLeft = { x: fit.originX / 3, y: fit.originY / 3 };
    const bottomRight = {
      x: (fit.originX + WORLD_W * fit.k) / 3,
      y: (fit.originY + WORLD_H * fit.k) / 3,
    };
    expect(topLeft.x).toBeGreaterThanOrEqual(47 - 0.5);
    expect(bottomRight.x).toBeLessThanOrEqual(844 - 47 + 0.5);
    expect(topLeft.y).toBeGreaterThanOrEqual(-0.5);
    expect(bottomRight.y).toBeLessThanOrEqual(390 - 21 + 0.5);
    // Centered in the safe area.
    expect(topLeft.x - 47).toBeCloseTo(844 - 47 - bottomRight.x, 0);
  });

  it('ignores insets that would leave less than half the screen', () => {
    const fit = fitWorld(800, 450, 1, { top: 0, right: 300, bottom: 0, left: 300 });
    expect(fit).toEqual(fitWorld(800, 450, 1));
  });

  it('maps a tap through the inset fit back to the world', () => {
    const fit = fitWorld(844, 390, 3, { top: 0, right: 47, bottom: 21, left: 47 });
    const p = clientToWorld(fit, fit.originX / 3, fit.originY / 3);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
});

describe('cssPixels', () => {
  it('reads computed lengths and treats anything else as 0', () => {
    expect(cssPixels('47px')).toBe(47);
    expect(cssPixels('0px')).toBe(0);
    expect(cssPixels('')).toBe(0);
    expect(cssPixels('auto')).toBe(0);
    expect(cssPixels('-3px')).toBe(0);
  });
});

describe('clientToWorld', () => {
  it('maps the viewport corners of a 16:9 fit to the world corners', () => {
    const fit = fitWorld(1600, 900, 2);
    expect(clientToWorld(fit, 0, 0)).toEqual({ x: 0, y: 0 });
    const br = clientToWorld(fit, 1600, 900);
    expect(br.x).toBeCloseTo(WORLD_W, 6);
    expect(br.y).toBeCloseTo(WORLD_H, 6);
  });

  it('accounts for the letterbox offset', () => {
    const fit = fitWorld(1000, 1000, 1);
    const top = clientToWorld(fit, 500, fit.originY);
    expect(top.y).toBeCloseTo(0, 6);
    expect(top.x).toBeCloseTo(WORLD_W / 2, 6);
  });
});
