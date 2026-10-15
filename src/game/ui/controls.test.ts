import { describe, expect, it } from 'vitest';
import { pickTarget, type Target } from './controls';

// Two pill buttons side by side and a round button below, in world units.
const TARGETS: readonly Target[] = [
  { box: { x: 100, y: 100, w: 150, h: 27 } },
  { box: { x: 270, y: 100, w: 150, h: 27 } },
  { box: { x: 100, y: 200, w: 50, h: 50 }, round: true },
];

describe('pickTarget', () => {
  it('hits only the exact shapes for a mouse', () => {
    expect(pickTarget(TARGETS, 120, 110)).toBe(0);
    expect(pickTarget(TARGETS, 300, 110)).toBe(1);
    expect(pickTarget(TARGETS, 120, 95)).toBe(-1);
    // The round button's corner is outside its circle.
    expect(pickTarget(TARGETS, 102, 202)).toBe(-1);
    expect(pickTarget(TARGETS, 125, 225)).toBe(2);
  });

  it('grows small targets to the finger size around their centers', () => {
    // 73 units tall around the pill's center (113.5): 77 to 150.
    expect(pickTarget(TARGETS, 120, 80, 73)).toBe(0);
    expect(pickTarget(TARGETS, 120, 149, 73)).toBe(0);
    expect(pickTarget(TARGETS, 120, 152, 73)).toBe(-1);
    expect(pickTarget(TARGETS, 102, 202, 73)).toBe(2);
    // The round button grows to 73 across: 88.5 to 161.5.
    expect(pickTarget(TARGETS, 90, 225, 73)).toBe(2);
  });

  it('grows a target only up to the finger size', () => {
    // The pills are wider than 73 already: the gap between them belongs to neither.
    expect(pickTarget(TARGETS, 260, 110, 73)).toBe(-1);
  });

  it('gives the overlap of two grown targets to the nearer one', () => {
    const small: Target[] = [
      { box: { x: 100, y: 100, w: 40, h: 27 } },
      { box: { x: 150, y: 100, w: 40, h: 27 } },
    ];
    expect(pickTarget(small, 144, 110, 73)).toBe(0);
    expect(pickTarget(small, 147, 110, 73)).toBe(1);
  });

  it('prefers an exact hit over a nearer grown one', () => {
    const overlapping: Target[] = [
      { box: { x: 0, y: 0, w: 100, h: 100 } },
      { box: { x: 100, y: 0, w: 10, h: 10 } },
    ];
    expect(pickTarget(overlapping, 99, 5, 73)).toBe(0);
  });

  it('skips targets that are not usable', () => {
    expect(pickTarget(TARGETS, 120, 110, 73, (i) => i !== 0)).toBe(-1);
    expect(pickTarget(TARGETS, 300, 80, 73, (i) => i !== 0)).toBe(1);
    expect(pickTarget(TARGETS, 300, 80, 73, (i) => i !== 1)).toBe(-1);
  });
});
