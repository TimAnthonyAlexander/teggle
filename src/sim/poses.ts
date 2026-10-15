// Where every element of a level is at any tick, without a world: the same motion the world
// applies each tick (world.ts, updateMotion), parents before children, an anchor riding on its
// parent's displacement since tick 0 (research 3.4), from movementPose itself, so the poses have
// the world's bits. The generator samples moving parts with it and the line editor previews them.

import type { Level, LevelElement } from '../level/schema';
import { movementPose, type Pose } from './movement';
import { Track } from './track';

/** The rotation of an element in its file (0 for kinds that have none). */
export function fileRotation(e: LevelElement): number {
  return e.kind === 'brick' || e.kind === 'curvedBrick' || e.kind === 'polygon' || e.kind === 'rod'
    ? e.rotation
    : 0;
}

export class MotionModel {
  readonly elements: readonly LevelElement[];
  readonly tracks: readonly Track[];
  /** Element indices in evaluation order: parents before children. */
  private readonly order: number[] = [];
  private readonly parentIndex: Int32Array;
  private readonly refX: Float64Array;
  private readonly refY: Float64Array;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly rotations: Float64Array;
  private readonly pose: Pose = { x: 0, y: 0, rotation: 0 };

  /** `tracks` are the level's paths, compiled (or compiled here from `paths`). */
  constructor(elements: readonly LevelElement[], paths: Level['paths'] | readonly Track[] = []) {
    this.elements = elements;
    this.tracks = paths.map((p) => (p instanceof Track ? p : new Track(p.points, p.closed)));
    const n = elements.length;
    const indexById = new Map(elements.map((e, i) => [e.id, i]));
    this.parentIndex = new Int32Array(n).fill(-1);
    elements.forEach((e, i) => {
      if (e.parent !== undefined) this.parentIndex[i] = indexById.get(e.parent) ?? -1;
    });
    const done = new Uint8Array(n);
    const visit = (i: number, depth: number): void => {
      if (done[i] === 1 || depth > n) return;
      const p = this.parentIndex[i] ?? -1;
      if (p >= 0) visit(p, depth + 1);
      done[i] = 1;
      this.order.push(i);
    };
    for (let i = 0; i < n; i++) visit(i, 0);
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.rotations = new Float64Array(n);
    this.refX = new Float64Array(n);
    this.refY = new Float64Array(n);
    // Tick 0: every anchor is its file position, so the parents' poses there are the references.
    this.evaluate(0, false);
    this.refX.set(this.xs);
    this.refY.set(this.ys);
  }

  /** Moves every element to its pose at `tick` (in xs, ys, rotations, by element index). */
  at(tick: number): this {
    this.evaluate(tick, true);
    return this;
  }

  private evaluate(tick: number, carried: boolean): void {
    const pose = this.pose;
    for (const i of this.order) {
      const e = this.elements[i];
      if (e === undefined) continue;
      let ax = e.x;
      let ay = e.y;
      const p = this.parentIndex[i] ?? -1;
      if (p >= 0 && carried) {
        ax += (this.xs[p] ?? 0) - (this.refX[p] ?? 0);
        ay += (this.ys[p] ?? 0) - (this.refY[p] ?? 0);
      }
      const base = fileRotation(e);
      const m = e.movement;
      if (m === undefined) {
        this.xs[i] = ax;
        this.ys[i] = ay;
        this.rotations[i] = base;
        continue;
      }
      const track = m.path === undefined ? null : (this.tracks[m.path] ?? null);
      movementPose(m, ax, ay, base, tick, pose, 0, track);
      this.xs[i] = pose.x;
      this.ys[i] = pose.y;
      this.rotations[i] = pose.rotation;
    }
  }

  /** The pose of element `i` after the last at(). */
  poseOf(i: number): Pose {
    return { x: this.xs[i] ?? 0, y: this.ys[i] ?? 0, rotation: this.rotations[i] ?? 0 };
  }
}
