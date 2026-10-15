// Count fitting: nudges a recipe until its level has exactly its target object count (spec 15's
// count times 1.409 for campaign levels), deterministically, so nobody tunes spacing by hand.
//
// A recipe that already hits its count comes back unchanged. Otherwise, in this order:
//   1. A fill that picks its own spacing is told the exact number of pegs that are missing
//      (its `count`, templates/fill.ts).
//   2. Peg lines (the outline template's traced paths in 'pegs' mode) gain or lose one peg at a
//      time. Along a line the peg count is what the spacing sets, so a nudge is the spacing
//      nearest the written one that gives one peg more or fewer. The line whose new spacing
//      stays closest to its written spacing goes first; a nudge is kept only when the level's
//      count moves toward the target and every manual edit still finds its object. When no
//      single peg helps, one peg the other way or two pegs on one line may: moving a line's
//      pegs can let pegs of other lines in, or keep them out.
//   3. When no line can move, a fill with a fixed spacing gets a count as well.
// Brick lines never change, so a level keeps its brick count (the campaign keeps each level's
// split of pegs and bricks), and neither do lines marked keepSpacing.

import { PEG_SPACING, MIN_PEG_SPACING } from './constants';
import { assembleLevel, type AssembledLevel, type GeneratedLevel } from './generate';
import { LINE_SPACING_MAX, LINE_SPACING_MIN, lineGeometrySchema, smoothLine } from './lines';
import { PathSampler } from './paths';
import { recipeSchema, targetFor, type RecipeInput } from './recipe';
import { validateLevel } from './validate';

/** A peg line's spacing changed by the fitter. */
export interface SpacingNudge {
  readonly kind: 'spacing';
  /** Recipe part index and path index within the outline part. */
  readonly part: number;
  readonly path: number;
  /** Written and fitted spacing, and the pegs each gives along the line. */
  readonly from: number;
  readonly to: number;
  readonly pegsFrom: number;
  readonly pegsTo: number;
}

/** The fill's exact peg count set by the fitter. */
export interface FillNudge {
  readonly kind: 'fill';
  readonly count: number;
}

export type Nudge = SpacingNudge | FillNudge;

export interface FitResult {
  /** The fitted recipe: the input itself when nothing had to change. */
  readonly recipe: RecipeInput;
  /** The level the fitted recipe makes, with its validity issues. */
  readonly generated: GeneratedLevel;
  readonly target: number;
  readonly count: number;
  readonly ok: boolean;
  readonly nudges: readonly Nudge[];
  /** Levels built while fitting. */
  readonly generations: number;
}

/** Most levels one fit may build (each takes a few milliseconds). */
export const MAX_GENERATIONS = 200;

interface Knob {
  readonly part: number;
  readonly path: number;
  readonly length: number;
  readonly closed: boolean;
  /** The spacing the recipe was written with. */
  readonly written: number;
}

interface PathInput {
  mode?: unknown;
  spacing?: number;
}

function clone(r: RecipeInput): RecipeInput {
  return JSON.parse(JSON.stringify(r)) as RecipeInput;
}

function pathsOf(r: RecipeInput, part: number): PathInput[] | null {
  const p = r.parts[part];
  if (p?.template !== 'outline') return null;
  const paths = (p.params as { paths?: unknown } | undefined)?.paths;
  return Array.isArray(paths) ? (paths as PathInput[]) : null;
}

/** Pegs a line gets at a spacing: the same arithmetic as pointsAlong (place.ts). */
export function pegsAt(length: number, closed: boolean, spacing: number): number {
  return closed
    ? Math.max(3, Math.round(length / spacing))
    : Math.max(1, Math.round(length / spacing) + 1);
}

function step(k: Knob, n: number): number {
  if (k.closed) return k.length / n;
  return n > 1 ? k.length / (n - 1) : Infinity;
}

/** The spacing nearest `want`, to 0.01 px, at which the line gets n pegs; null if none does. */
export function spacingFor(
  length: number,
  closed: boolean,
  n: number,
  want: number,
): number | null {
  const m = closed ? n : n - 1;
  if (m < 1 || (closed && n < 3)) return null;
  const lo = Math.max(length / (m + 0.5), LINE_SPACING_MIN);
  const hi = Math.min(m > 0.5 ? length / (m - 0.5) : Infinity, LINE_SPACING_MAX);
  if (!(lo < hi)) return null;
  const near = Math.min(Math.max(want, lo), hi);
  const tries = [
    Math.round(near * 100) / 100,
    Math.ceil(lo * 100 + 1) / 100,
    Math.floor(hi * 100) / 100,
    Math.round(((lo + hi) / 2) * 100) / 100,
  ];
  for (const s of tries) {
    if (s >= LINE_SPACING_MIN && s <= LINE_SPACING_MAX && pegsAt(length, closed, s) === n) return s;
  }
  return null;
}

function knobs(input: RecipeInput): Knob[] {
  const out: Knob[] = [];
  input.parts.forEach((_, part) => {
    pathsOf(input, part)?.forEach((raw, path) => {
      const g = lineGeometrySchema.safeParse(raw);
      if (!g.success || g.data.mode !== 'pegs' || g.data.keepSpacing === true) return;
      const length = new PathSampler(smoothLine(g.data)).length;
      out.push({
        part,
        path,
        length,
        closed: g.data.closed,
        written: g.data.spacing ?? PEG_SPACING,
      });
    });
  });
  return out;
}

function spacingNow(r: RecipeInput, k: Knob): number {
  return pathsOf(r, k.part)?.[k.path]?.spacing ?? PEG_SPACING;
}

function withSpacing(r: RecipeInput, k: Knob, spacing: number): RecipeInput {
  const out = clone(r);
  const p = pathsOf(out, k.part)?.[k.path];
  if (p !== undefined) p.spacing = spacing;
  return out;
}

/** A recipe without a fill field gets the default fill, which picks its own spacing. */
function withFillCount(r: RecipeInput, count: number): RecipeInput {
  const out = clone(r);
  if (out.fill === 'none') return out;
  out.fill = { ...(out.fill ?? {}), count: Math.max(0, count) };
  return out;
}

/** Fits a recipe to its target count; see the file comment. */
export function fitCount(
  input: RecipeInput,
  seed: number,
  maxGenerations = MAX_GENERATIONS,
): FitResult {
  const parsed = recipeSchema.parse(input);
  const target = targetFor(parsed);
  let current = input;
  let a: AssembledLevel = assembleLevel(current, seed);
  let generations = 1;
  const usable = (x: AssembledLevel): boolean => x.edits.errors.length === 0;
  const better = (x: AssembledLevel): boolean =>
    usable(x) && Math.abs(target - x.scoring) < Math.abs(target - a.scoring);
  const attempt = (trial: RecipeInput): boolean => {
    const b = assembleLevel(trial, seed);
    generations++;
    if (!better(b)) return false;
    current = trial;
    a = b;
    return true;
  };
  const fill = parsed.fill ?? {};
  const hasFill = fill !== 'none';
  let fillSet = false;
  if (a.scoring !== target && usable(a) && fill !== 'none' && fill.spacing === undefined) {
    fillSet = attempt(withFillCount(current, a.fillPegs + target - a.scoring));
  }
  const all = knobs(input);
  /** Nudges of every line by `steps` pegs, cheapest first. */
  const nudgesBy = (steps: readonly number[]) =>
    all
      .flatMap((k) =>
        steps.map((d) => {
          const n = pegsAt(k.length, k.closed, spacingNow(current, k)) + d;
          const s = spacingFor(k.length, k.closed, n, k.written);
          if (s === null || step(k, n) < MIN_PEG_SPACING) return null;
          return { k, s, cost: Math.abs(step(k, n) - k.written) / k.written };
        }),
      )
      .filter((o) => o !== null)
      .sort((x, y) => x.cost - y.cost || x.k.part - y.k.part || x.k.path - y.k.path);
  let fillTried = fillSet;
  while (a.scoring !== target && usable(a) && generations < maxGenerations) {
    const dir = target > a.scoring ? 1 : -1;
    // One peg more (or fewer) on one line, the cheapest that helps.
    let moved = false;
    for (const o of nudgesBy([dir])) {
      if (generations >= maxGenerations) break;
      if (attempt(withSpacing(current, o.k, o.s))) {
        moved = true;
        break;
      }
    }
    if (moved) continue;
    // Otherwise the other way round or two pegs at once: moving a line's pegs can let pegs of
    // other lines in, or keep them out. The nudge that helps most wins, the cheapest on a tie.
    let best: { trial: RecipeInput; level: AssembledLevel } | null = null;
    for (const o of nudgesBy([-dir, 2 * dir, -2 * dir])) {
      if (generations >= maxGenerations) break;
      const trial = withSpacing(current, o.k, o.s);
      const b = assembleLevel(trial, seed);
      generations++;
      if (!better(b)) continue;
      if (best === null || Math.abs(target - b.scoring) < Math.abs(target - best.level.scoring)) {
        best = { trial, level: b };
      }
      if (b.scoring === target) break;
    }
    if (best !== null) {
      current = best.trial;
      a = best.level;
      continue;
    }
    if (!fillTried && hasFill) {
      fillTried = true;
      if (attempt(withFillCount(current, a.fillPegs + target - a.scoring))) continue;
    }
    break;
  }
  const nudges: Nudge[] = [];
  for (const k of all) {
    const to = spacingNow(current, k);
    const from = spacingNow(input, k);
    if (to === from) continue;
    nudges.push({
      kind: 'spacing',
      part: k.part,
      path: k.path,
      from,
      to,
      pegsFrom: pegsAt(k.length, k.closed, from),
      pegsTo: pegsAt(k.length, k.closed, to),
    });
  }
  const fitted = current.fill;
  if (fitted !== undefined && fitted !== 'none' && fitted.count !== undefined) {
    const before = input.fill;
    const was = before === undefined || before === 'none' ? undefined : before.count;
    if (was !== fitted.count) nudges.push({ kind: 'fill', count: fitted.count });
  }
  return {
    recipe: current,
    generated: { ...a, issues: validateLevel(a.level) },
    target,
    count: a.scoring,
    ok: a.scoring === target && usable(a),
    nudges,
    generations,
  };
}
