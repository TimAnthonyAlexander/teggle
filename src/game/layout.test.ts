import { describe, expect, it } from 'vitest';
import { CANNON_PIVOT_Y } from '../sim/tuning';
import {
  BOARD_W,
  BOARD_X,
  CANNON_PIVOT,
  CENTER_X,
  WORLD_H,
  WORLD_W,
  boardFrame,
  boardOrigin,
  frameInset,
  layout,
  machineLayout,
} from './layout';

describe('boardOrigin', () => {
  it("places Teggle's 916 board where the play screen always drew it", () => {
    expect(boardOrigin(916, 560)).toEqual({ x: CENTER_X - 458, y: 40 });
    expect(boardOrigin(916, 560).x).toBeCloseTo(75.333, 3);
  });

  it("centers the original's 650 board across the screen", () => {
    const o = boardOrigin(650, 560);
    expect(o.x).toBeCloseTo(208.333, 3);
    expect(o.y).toBe(40);
    // Its right edge sits as far from the screen's right edge as its left from the left.
    expect(o.x + 650).toBeCloseTo(2 * CENTER_X - o.x, 9);
  });

  it('maps the board center at the pivot height to the cannon pivot for any width', () => {
    for (const [w, h] of [
      [916, 560],
      [650, 560],
      [800, 500],
    ] as const) {
      const o = boardOrigin(w, h);
      expect(o.x + w / 2).toBe(CANNON_PIVOT.x);
      expect(o.y + h).toBe(WORLD_H);
    }
    const o = boardOrigin(650, 560);
    expect(o.y + CANNON_PIVOT_Y).toBe(CANNON_PIVOT.y);
  });
});

describe('boardFrame', () => {
  it("is the full board area for Teggle's board, bit for bit", () => {
    expect(boardFrame(916)).toEqual({ x: BOARD_X, w: BOARD_W });
  });

  it('is the board itself for a narrower one', () => {
    const f = boardFrame(650);
    expect(f.x).toBeCloseTo(boardOrigin(650, 560).x, 9);
    expect(f.w).toBeCloseTo(650, 9);
  });
});

describe('machineLayout', () => {
  it("is Teggle's own layout for Teggle's board, bit for bit", () => {
    const g = machineLayout(916);
    expect(frameInset(916)).toBe(0);
    expect(g).toMatchObject({ inset: 0, left: 0, right: WORLD_W });
    expect(g.opening).toBe(layout.opening);
    expect(g.scoreLeft).toBe(layout.scoreLeft);
    expect(g.scoreRight).toBe(layout.scoreRight);
    expect(g.menuButton).toBe(layout.menuButton);
    expect(g.holdButton).toBe(layout.holdButton);
  });

  it("gives the original's 650 board its 800-wide frame, centered", () => {
    const g = machineLayout(650);
    expect(g.inset).toBeCloseTo(400 / 3, 9);
    expect(g.right - g.left).toBeCloseTo(800, 9);
    expect((g.left + g.right) / 2).toBeCloseTo(CENTER_X, 9);
    // The board sits 75 in from the frame's left edge, as in the original's window.
    expect(boardOrigin(650, 560).x - g.left).toBeCloseTo(BOARD_X, 9);
    // The opening shows board x 3 to 647, as the original's does.
    const origin = boardOrigin(650, 560);
    expect(g.opening.x - origin.x).toBeCloseTo(3, 9);
    expect(g.opening.x + g.opening.w - origin.x).toBeCloseTo(647, 9);
    expect(g.opening.y).toBe(layout.opening.y);
  });

  it('moves the side buttons in with the frame and keeps the score windows at the housing', () => {
    const g = machineLayout(650);
    expect(g.menuButton).toEqual({ ...layout.menuButton, x: layout.menuButton.x + g.inset });
    expect(g.holdButton).toEqual({ ...layout.holdButton, x: layout.holdButton.x - g.inset });
    expect(g.scoreLeft.x).toBeCloseTo(layout.scoreLeft.x + g.inset, 9);
    expect(g.scoreLeft.x + g.scoreLeft.w).toBeCloseTo(layout.housing.x, 9);
    expect(g.scoreRight.x).toBe(layout.housing.x + layout.housing.w);
    expect(g.scoreRight.x + g.scoreRight.w).toBeCloseTo(g.right - 110, 9);
  });
});
