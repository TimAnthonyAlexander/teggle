import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../layout';
import { clientToWorld, fitWorld } from './viewport';

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
