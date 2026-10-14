// What every template gets: the builder, its own random stream and the region it fills.

import type { Rng } from '../core/rng';
import type { Builder, FitOptions } from './builder';
import {
  BOARD_W,
  BOTTOM_LIMIT,
  CENTER_X,
  JOIN_GAP,
  MIN_GAP,
  SIDE_LIMIT,
  TOP_LIMIT,
} from './constants';
import type { Draft } from './draft';
import { mirrorElement } from './mirror';
import { shapeGap } from './shapes';

/** An axis-aligned area of the board. */
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Where a template builds: a box, and whether everything is mirrored about the center line. */
export interface Region {
  readonly box: Box;
  /** Elements are added together with their mirror image about x = CENTER_X. */
  readonly mirrored: boolean;
}

export const REGION_NAMES = ['full', 'center', 'sides', 'top', 'bottom', 'middle'] as const;
export type RegionName = (typeof REGION_NAMES)[number];

const FULL: Box = { x0: SIDE_LIMIT, y0: TOP_LIMIT, x1: BOARD_W - SIDE_LIMIT, y1: BOTTOM_LIMIT };

/** Named regions. 'sides' is the left part, mirrored onto the right. */
export function namedRegion(name: RegionName): Region {
  switch (name) {
    case 'full':
      return { box: FULL, mirrored: true };
    case 'center':
      return { box: { ...FULL, x0: CENTER_X - 250, x1: CENTER_X + 250 }, mirrored: true };
    case 'sides':
      return { box: { ...FULL, x1: CENTER_X - 210 }, mirrored: true };
    case 'top':
      return { box: { ...FULL, y1: 285 }, mirrored: true };
    case 'bottom':
      return { box: { ...FULL, y0: 285 }, mirrored: true };
    case 'middle':
      return { box: { ...FULL, y0: 150, y1: 420 }, mirrored: true };
  }
}

/** Uniform helpers over an Rng. */
export class Draw {
  constructor(readonly rng: Rng) {}

  float(lo: number, hi: number): number {
    return lo + (hi - lo) * this.rng.nextFloat();
  }

  int(lo: number, hi: number): number {
    return lo + this.rng.nextInt(hi - lo + 1);
  }

  pick<T>(items: readonly T[]): T {
    return this.rng.pick(items);
  }

  bool(p = 0.5): boolean {
    return this.rng.nextFloat() < p;
  }
}

export interface TemplateContext {
  readonly builder: Builder;
  readonly draw: Draw;
  readonly region: Region;
  /** Part name, recorded on every element for the report. */
  readonly part: string;
}

function isBrick(d: Draft): boolean {
  return d.kind === 'brick' || d.kind === 'curvedBrick';
}

/**
 * How many elements place() would add for these drafts, assuming they keep their distance from
 * each other (a lattice, a row). Used to pick a density that lands on a count.
 */
export function countFitting(ctx: TemplateContext, drafts: readonly Draft[]): number {
  const b = ctx.builder;
  let n = 0;
  for (const d of drafts) {
    const s = b.shapeOf(d);
    if (s === null || !b.fits(s, isBrick(d))) continue;
    if (!ctx.region.mirrored || Math.abs(d.x - CENTER_X) < 1e-9) {
      n += 1;
      continue;
    }
    const t = b.shapeOf(mirrorElement(d));
    if (t !== null && b.fits(t, isBrick(d)) && shapeGap(s, t) >= MIN_GAP) n += 2;
  }
  return n;
}

/** Adds a draft (with its mirror image when the region is mirrored); returns elements added. */
export function place(ctx: TemplateContext, draft: Draft, options: FitOptions = {}): number {
  if (ctx.region.mirrored) return ctx.builder.tryAddMirrored(draft, ctx.part, options);
  return ctx.builder.tryAdd(draft, ctx.part, options) === null ? 0 : 1;
}

/** The drafts plus their mirror images when the region is mirrored. */
export function withMirrors(ctx: TemplateContext, drafts: readonly Draft[]): Draft[] {
  const all: Draft[] = [];
  for (const d of drafts) {
    all.push(d);
    if (ctx.region.mirrored && Math.abs(d.x - CENTER_X) > 1e-9) all.push(mirrorElement(d));
  }
  return all;
}

/**
 * True when every draft fits on the board and keeps the gap to everything placed and to the
 * other drafts (bricks may join).
 */
export function groupFits(b: Builder, drafts: readonly Draft[], options: FitOptions = {}): boolean {
  const gap = options.gap ?? MIN_GAP;
  const shapes = drafts.map((d) => b.shapeOf(d));
  for (let i = 0; i < drafts.length; i++) {
    const si = shapes[i];
    const di = drafts[i];
    if (si === null || si === undefined || di === undefined) continue;
    if (!b.fits(si, isBrick(di), options)) return false;
    for (let j = i + 1; j < drafts.length; j++) {
      const sj = shapes[j];
      const dj = drafts[j];
      if (sj === null || sj === undefined || dj === undefined) continue;
      if (si.maxX + gap < sj.minX || sj.maxX + gap < si.minX) continue;
      if (si.maxY + gap < sj.minY || sj.maxY + gap < si.minY) continue;
      const g = shapeGap(si, sj);
      if (g >= gap) continue;
      if (isBrick(di) && isBrick(dj) && g >= 0 && g <= JOIN_GAP) continue;
      b.lastReject = `group members ${i} and ${j} are ${g.toFixed(2)} px apart`;
      return false;
    }
  }
  return true;
}

/**
 * Places the first of several alternative groups that fits (each with mirror images when
 * mirrored). Returns the number of elements added, 0 when none fit.
 */
export function placeFirst(
  ctx: TemplateContext,
  alternatives: Iterable<readonly Draft[]>,
  options: FitOptions = {},
): number {
  for (const drafts of alternatives) {
    const n = placeGroup(ctx, drafts, options);
    if (n > 0) return n;
  }
  return 0;
}

/**
 * Adds a group of drafts (with mirror images when mirrored) only if all of them fit.
 * Returns the number of elements added, 0 when the group was rejected.
 */
export function placeGroup(
  ctx: TemplateContext,
  drafts: readonly Draft[],
  options: FitOptions = {},
): number {
  const all = withMirrors(ctx, drafts);
  if (!groupFits(ctx.builder, all, options)) return 0;
  for (const d of all) ctx.builder.add(d, ctx.part);
  return all.length;
}
