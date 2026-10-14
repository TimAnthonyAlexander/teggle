// Composition numbers of a level, measured the way docs/research/original-levels.md measured
// the original's: counts, brick share, flags, and nearest-neighbor spacing of static pegs.

import type { Level, LevelElement } from '../level/schema';

export interface LevelStats {
  readonly scoring: number;
  readonly pegs: number;
  readonly bricks: number;
  readonly straightBricks: number;
  readonly curvedBricks: number;
  readonly brickShare: number;
  readonly canBeOrange: number;
  readonly quickDisappear: number;
  readonly moving: number;
  readonly solids: number;
  readonly teleports: number;
  /** Nearest-neighbor center distance of static round pegs: median, 5th percentile, minimum. */
  readonly pegSpacing: { readonly median: number; readonly p5: number; readonly min: number };
}

function isScoring(e: LevelElement): boolean {
  return e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick';
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

export function levelStats(level: Level): LevelStats {
  const els = level.elements;
  const scoring = els.filter(isScoring);
  const pegs = scoring.filter((e) => e.kind === 'peg');
  const straight = scoring.filter((e) => e.kind === 'brick').length;
  const curved = scoring.filter((e) => e.kind === 'curvedBrick').length;
  const flagged = scoring.filter(
    (e) => (e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick') && e.canBeOrange,
  ).length;
  const quick = scoring.filter(
    (e) => (e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick') && e.quickDisappear,
  ).length;
  const moving = scoring.filter((e) => e.movement !== undefined || e.parent !== undefined).length;
  const staticPegs = pegs.filter((e) => e.movement === undefined && e.parent === undefined);
  const nn: number[] = [];
  for (const a of staticPegs) {
    let best = Infinity;
    for (const b of staticPegs) {
      if (a === b) continue;
      const d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      if (d < best) best = d;
    }
    if (best < Infinity) nn.push(best);
  }
  nn.sort((x, y) => x - y);
  const bricks = straight + curved;
  return {
    scoring: scoring.length,
    pegs: pegs.length,
    bricks,
    straightBricks: straight,
    curvedBricks: curved,
    brickShare: scoring.length === 0 ? 0 : bricks / scoring.length,
    canBeOrange: flagged,
    quickDisappear: quick,
    moving,
    solids: els
      .filter((e) => e.kind === 'circle' || e.kind === 'polygon' || e.kind === 'rod')
      .filter((e) => e.collision).length,
    teleports: els.filter((e) => e.kind === 'teleport').length,
    pegSpacing: { median: quantile(nn, 0.5), p5: quantile(nn, 0.05), min: nn[0] ?? 0 },
  };
}
