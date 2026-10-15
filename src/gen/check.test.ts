import { describe, expect, it } from 'vitest';
import { cos, HALF_PI, PI, sin } from '../core/dmath';
import { parseLevel, type Level, type LevelElementInput } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { planCheck, runCheck, runCheckJob, type CheckConfig } from './check';
import { BOARD_H, BOARD_W, BRICK_LENGTH } from './constants';
import { checkAndFix, type JobRunner } from './fix';
import { validateLevel } from './validate';

function level(elements: LevelElementInput[]): Level {
  return parseLevel({
    formatVersion: 1,
    name: 'test',
    background: 'test',
    board: { width: BOARD_W, height: BOARD_H },
    elements,
  });
}

/** Runs every job in this thread. */
const inThread: JobRunner = (l, plan) => {
  const compiled = compileLevel(l);
  return Promise.resolve(plan.jobs.map((_, i) => runCheckJob(compiled, plan, i)));
};

/** Rows of open pegs, so advancing shots always light something. */
function rows(firstId: number): LevelElementInput[] {
  const out: LevelElementInput[] = [];
  let id = firstId;
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 9; k++) {
      out.push({ kind: 'peg', id: id++, x: 120 + k * 85 + (r % 2) * 42, y: 200 + r * 60 });
    }
  }
  return out;
}

/** A closed ring of twelve curved bricks around (cx, cy) with a peg inside it. */
function shieldedPeg(
  cx: number,
  cy: number,
  pegId: number,
  firstBrick: number,
): LevelElementInput[] {
  const out: LevelElementInput[] = [{ kind: 'peg', id: pegId, x: cx, y: cy }];
  const sector = PI / 6;
  const rm = 45;
  for (let k = 0; k < 12; k++) {
    const a = HALF_PI - (k + 0.5) * sector;
    out.push({
      kind: 'curvedBrick',
      id: firstBrick + k,
      x: cx + rm * cos(a),
      y: cy - rm * sin(a),
      rotation: a,
      innerRadius: 35,
      sector: sector - 1 / rm,
    });
  }
  return out;
}

const SMALL: Partial<CheckConfig> = { playouts: 8, depth: 5, angles: 90 };

/**
 * These run thousands of simulated shots: about a second each on an idle machine, many times
 * that while other work (a campaign build) loads every core.
 */
const HEAVY = { timeout: 60_000 };

describe('reachability check', HEAVY, () => {
  const l = level([...rows(1), ...shieldedPeg(458, 420, 100, 200)]);

  it('builds a valid fixture', () => {
    expect(validateLevel(l)).toEqual([]);
  });

  it('misses a shielded peg on the full board', () => {
    const r = runCheck(l, { ...SMALL, depth: 1 });
    expect(r.hits.get(100)).toBe(0);
    // The shield itself is hit.
    expect([...Array(12).keys()].some((k) => (r.hits.get(200 + k) ?? 0) > 0)).toBe(true);
  });

  it('reaches it once playouts have cleared part of its shield', () => {
    const r = runCheck(l, SMALL);
    expect(r.hits.get(100) ?? 0).toBeGreaterThan(0);
  });

  it('gives the same result however the jobs are split', () => {
    const plan = planCheck(l, SMALL);
    const compiled = compileLevel(l);
    const forward = plan.jobs.map((_, i) => runCheckJob(compiled, plan, i));
    const backward = [...plan.jobs.keys()].reverse().map((i) => runCheckJob(compiled, plan, i));
    expect(backward.reverse()).toEqual(forward);
  });

  it('clears can-be-orange on a peg nothing can reach', async () => {
    // A peg boxed in by four rods, which never go away.
    const boxed = level([
      ...rows(1),
      { kind: 'peg', id: 100, x: 458, y: 440 },
      { kind: 'rod', id: 101, x: 458, y: 410, a: { x: -30, y: 0 }, b: { x: 30, y: 0 } },
      { kind: 'rod', id: 102, x: 458, y: 470, a: { x: -30, y: 0 }, b: { x: 30, y: 0 } },
      { kind: 'rod', id: 103, x: 428, y: 440, a: { x: 0, y: -30 }, b: { x: 0, y: 30 } },
      { kind: 'rod', id: 104, x: 488, y: 440, a: { x: 0, y: -30 }, b: { x: 0, y: 30 } },
    ]);
    const { level: fixed, report } = await checkAndFix(boxed, inThread, SMALL);
    expect(report.unflagged).toEqual([100]);
    expect(report.coverage).toBeLessThan(1);
    const peg = fixed.elements.find((e) => e.id === 100);
    expect(peg?.kind === 'peg' && peg.canBeOrange).toBe(false);
  });
});

describe('stuck check', HEAVY, () => {
  // Two bricks in a V, joined at the bottom: a pocket a ball rolls into and rests in.
  const tilt = (35 * PI) / 180;
  const half = BRICK_LENGTH / 2;
  const d = 6.3;
  const vee: LevelElementInput[] = [
    {
      kind: 'brick',
      id: 300,
      x: 458 - d - half * cos(tilt),
      y: 380 - half * sin(tilt),
      rotation: HALF_PI - tilt,
      length: BRICK_LENGTH,
    },
    {
      kind: 'brick',
      id: 301,
      x: 458 + d + half * cos(tilt),
      y: 380 - half * sin(tilt),
      rotation: HALF_PI + tilt,
      length: BRICK_LENGTH,
    },
  ];
  const l = level([...rows(1), ...vee]);

  it('builds a valid fixture', () => {
    expect(validateLevel(l)).toEqual([]);
  });

  it('finds the pocket where balls come to rest', () => {
    const r = runCheck(l, SMALL);
    const spot = r.spots.find((s) => s.scoring.includes(300) && s.scoring.includes(301));
    expect(spot).toBeDefined();
    expect(spot?.x).toBeCloseTo(458, 0);
  });

  it('fixes it with quick disappear, as the original did at arc bottoms', async () => {
    const { level: fixed, report } = await checkAndFix(l, inThread, SMALL);
    expect(report.quickDisappear).toEqual(expect.arrayContaining([300, 301]));
    expect(report.spotsFixed).toBeGreaterThan(0);
    expect(report.remainingSpots).toBe(0);
    for (const id of [300, 301]) {
      const e = fixed.elements.find((x) => x.id === id);
      expect(e?.kind === 'brick' && e.quickDisappear).toBe(true);
    }
  });
});
