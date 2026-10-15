import { afterEach, describe, expect, it } from 'vitest';
import { textStyle } from '../ui/text';
import {
  MIN_BODY_CAP_CSS,
  MIN_LABEL_CAP_CSS,
  display,
  legible,
  legibleCap,
  legibleScale,
  minTarget,
  setDisplay,
  touchPitch,
} from './display';

/** CSS px per world unit on a 780 x 360 phone in landscape (360 / 600). */
const PHONE = 0.6;
/** On a 1600 x 900 desktop window. */
const DESKTOP = 1.5;

afterEach(() => {
  setDisplay(1, false);
});

describe('display metrics', () => {
  it('sizes touch targets to 44 CSS px', () => {
    setDisplay(PHONE, true);
    expect(minTarget() * display.cssPerUnit).toBeCloseTo(44, 9);
  });

  it('spreads touch controls only on a touch screen, and only when they are too close', () => {
    setDisplay(PHONE, false);
    expect(touchPitch(42)).toBe(42);
    setDisplay(DESKTOP, true);
    expect(touchPitch(42)).toBe(42);
    setDisplay(PHONE, true);
    expect(touchPitch(42) * PHONE).toBeCloseTo(44, 9);
    expect(touchPitch(42, 60)).toBe(60);
  });

  it('leaves text alone on a desktop screen', () => {
    setDisplay(DESKTOP, false);
    for (const style of [textStyle.label(), textStyle.body(), textStyle.pegValue()]) {
      expect(legible(style)).toBe(style);
    }
  });

  it('raises small text to the floors on a phone, never shrinks larger text', () => {
    setDisplay(PHONE, true);
    expect(legible(textStyle.body()).cap * PHONE).toBeCloseTo(MIN_BODY_CAP_CSS, 9);
    expect(legible(textStyle.label()).cap * PHONE).toBeCloseTo(MIN_LABEL_CAP_CSS, 9);
    expect(legibleCap(30)).toBe(30);
    expect(legibleScale(9)).toBeCloseTo(MIN_LABEL_CAP_CSS / PHONE / 9, 9);
  });

  it('grows the outline with the text', () => {
    setDisplay(PHONE, true);
    const style = textStyle.pegValue();
    const big = legible(style);
    expect(big.outline?.width).toBeCloseTo((style.outline?.width ?? 0) * (big.cap / style.cap), 9);
  });

  it('falls back to 1 CSS px per unit for nonsense', () => {
    setDisplay(Number.NaN, false);
    expect(display.cssPerUnit).toBe(1);
    setDisplay(0, false);
    expect(display.cssPerUnit).toBe(1);
  });
});
