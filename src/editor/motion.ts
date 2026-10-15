// The line editor's view of moving lines (src/gen/movers.ts): which lines move together, where
// a group's pivot is, the shown level at any tick of its cycle, and the area a moving unit
// sweeps, for drawing.

import type { LineGroup, LinesFile } from '../gen/lines';
import type { Path } from '../gen/paths';
import { elementShape, type Shape } from '../gen/shapes';
import { CYCLE_CAP, levelCycle } from '../gen/validate';
import type { Level } from '../level/schema';
import type { Pose } from '../sim/movement';
import { MotionModel } from '../sim/poses';

/** The group a group rides on at the top of its chain. */
function topGroup(file: LinesFile, id: string): string {
  const byId = new Map((file.groups ?? []).map((g) => [g.id, g]));
  let g = byId.get(id);
  const seen = new Set<string>();
  while (g?.parent !== undefined && byId.has(g.parent) && !seen.has(g.id)) {
    seen.add(g.id);
    g = byId.get(g.parent);
  }
  return g?.id ?? id;
}

/** Every group in a group's tree: itself and all that ride on it, at any depth. */
function treeOf(file: LinesFile, root: string): Set<string> {
  const out = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const g of file.groups ?? []) {
      if (g.parent !== undefined && out.has(g.parent) && !out.has(g.id)) {
        out.add(g.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * The lines that move together with a line: everything in its top group's tree, or a
 * traveling line on its own. Empty for a line that stands still.
 */
export function unitLines(file: LinesFile, id: string): Set<string> {
  const line = file.lines.find((l) => l.id === id);
  if (line === undefined) return new Set();
  if (line.group === undefined) return line.travel === undefined ? new Set() : new Set([id]);
  const tree = treeOf(file, topGroup(file, line.group));
  return new Set(
    file.lines.filter((l) => l.group !== undefined && tree.has(l.group)).map((l) => l.id),
  );
}

/** A group's pivot: its own, or the middle of its lines' box as the generator takes it. */
export function groupPivot(
  file: LinesFile,
  smoothed: ReadonlyMap<string, Path>,
  group: LineGroup,
): readonly [number, number] | null {
  if (group.pivot !== undefined) return group.pivot;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of file.lines) {
    if (l.group !== group.id) continue;
    for (const p of smoothed.get(l.id)?.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

/** The shown level in motion: poses at any tick, and the cycle the preview runs through. */
export class Preview {
  readonly model: MotionModel;
  /** Ticks after which everything is back where it started (capped). */
  readonly cycle: number;
  readonly moving: boolean;
  private tick = -1;
  private readonly index: Map<number, number>;

  constructor(readonly level: Level) {
    this.model = new MotionModel(level.elements, level.paths);
    this.moving = level.elements.some((e) => e.movement !== undefined || e.parent !== undefined);
    this.cycle = this.moving ? Math.min(levelCycle(level).ticks, CYCLE_CAP) : 1;
    this.index = new Map(level.elements.map((e, i) => [e.id, i]));
  }

  /** Moves the model to a tick of the cycle. */
  at(tick: number): this {
    const t = ((tick % this.cycle) + this.cycle) % this.cycle;
    if (t !== this.tick) {
      this.model.at(t);
      this.tick = t;
    }
    return this;
  }

  /** The pose of an element at the last at(). */
  pose(id: number): Pose {
    const i = this.index.get(id);
    return i === undefined ? { x: 0, y: 0, rotation: 0 } : this.model.poseOf(i);
  }

  /** Collision shapes of the given elements at `samples` ticks spread over the cycle. */
  sweep(ids: ReadonlySet<number>, samples = 240): Shape[] {
    const out: Shape[] = [];
    const list = this.level.elements.flatMap((e, i) => (ids.has(e.id) ? [{ e, i }] : []));
    const n = Math.min(this.cycle, samples);
    const keep = this.tick;
    for (let k = 0; k < n; k++) {
      this.model.at(Math.floor((k * this.cycle) / n));
      for (const { e, i } of list) {
        const s = elementShape(e, this.model.poseOf(i));
        if (s !== null) out.push(s);
      }
    }
    this.tick = -1;
    if (keep >= 0) this.at(keep);
    return out;
  }
}
