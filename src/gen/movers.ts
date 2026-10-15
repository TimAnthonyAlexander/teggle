// Line movers (spec 14.2, "Decided in the moving lines"): traced lines whose objects move.
//
// Groups. Lines join a named group and move as one. The group's movement is any of the
// original's twelve types or a glide along another line. Its parts keep their offsets from the
// group, and the encoding stays inside the original's model (research 3.3 and 3.4):
//   - the sliding, circling, figure-eight, arc and wrap types: every part carries the group's
//     movement around its own place, so all of them move by the same offset at every tick;
//   - rotate and rotateAroundCircle (a circle): the group turns about its pivot; every part
//     orbits the pivot on rotateAroundCircle at its own radius and start angle, as the
//     original's rotating groups do, and bricks turn with it;
//   - rotateBackAndForth: the group swings about its pivot; a peg off the pivot swings on a
//     horizontalArc that spans twice the swing, a quarter cycle ahead, which puts it where the
//     swing does; a brick rides on an invisible carrier on that arc and swings its own facing
//     with the group's movement; parts on the pivot swing in place;
//   - followPath along a line: an invisible carrier travels along the line (Teggle's followPath),
//     starting at the point nearest the pivot, and the parts ride on it.
// A group can ride on another (nesting). The child's pivot is a carrier inside the parent group,
// moving as the parent's parts do, and the child's parts ride on its position; only position
// carries over, so a child on a turning parent stays upright, like a gondola.
//
// Travel. A line's objects can instead travel along the line itself: evenly spaced in time
// along the whole line, each on a followPath movement with its phase stepped, around a closed
// line or from start to end and back to the start on an open one. Bricks keep a full gap from
// each other and turn with the line.
//
// Placement. Everything that moves together (a top-level group with the groups riding on it and
// the lines traveling in them, or a line that travels alone) is one unit, placed whole or not at
// all, before any static line. Its parts are sampled over the unit's whole cycle, every tick when
// that is at most 6,000 ticks as the validity check does, and kept whenever some point moved
// SWEEP_STEP: the sweep. The unit fits when every sample lies inside the board and clear of the
// cannon and the flippers' swing with SWEEP_STEP to spare, and the parts that move against each
// other (travelers, nested groups) keep the minimum gap at every sampled tick. Then the sweep must
// keep the minimum gap from static objects and other moving parts, and it is reserved, so static
// lines and fills placed after it stay clear of everywhere the unit goes.

import { atan2, cos, PI, sin, wrapAngle } from '../core/dmath';
import type { Vec2 } from '../level/geometry';
import {
  elementSchema,
  movementSchema,
  type LevelElement,
  type LevelPathInput,
  type MovementInput,
} from '../level/schema';
import { movementPose, type Pose } from '../sim/movement';
import { MotionModel } from '../sim/poses';
import { Track, type TrackPoint } from '../sim/track';
import { sweptZone } from './builder';
import {
  BOARD_H,
  BOARD_W,
  BOTTOM_LIMIT,
  BRICK_LENGTH,
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  JOIN_GAP,
  MIN_GAP,
  PEG_SPACING,
  SIDE_LIMIT,
  TOP_LIMIT,
} from './constants';
import type { Draft, ScoringDraft } from './draft';
import { flipperGap } from './flippers';
import {
  smoothLine,
  type LineGeometry,
  type RecipeGroup,
  type RecipeGroupMovement,
  type Travel,
} from './lines';
import { brickOnSpan, bricksAlong, bricksAround, peg, pointsAlong } from './place';
import { PathSampler, type Path } from './paths';
import { elementShape, localOutline, pointGap, shapeGap, type Shape } from './shapes';
import { Sweep, SWEEP_STEP } from './sweep';
import type { TemplateContext } from './template';

/** Free space between two bricks that travel along a line (px). */
export const TRAIN_BRICK_GAP = 16;
/** A traced line becomes a followPath path within this distance of its smoothed curve (px). */
export const PATH_TOLERANCE = 0.1;
/** Moving parts are checked at every tick of a cycle up to this long, else at SAMPLES ticks. */
const FULL_CYCLE = 6000;
const SAMPLES = 3000;
const CYCLE_LIMIT = 200_000;

// ---------------------------------------------------------------------------------------------
// Lines as objects and as paths

/** The objects a line places when it stands still (the outline template's rules). */
export function lineDrafts(p: LineGeometry): ScoringDraft[] {
  const path = smoothLine(p);
  if (p.mode === 'pegs') {
    return pointsAlong(path, { spacing: p.spacing ?? PEG_SPACING }).map((q) => peg(q.x, q.y));
  }
  return p.closed
    ? bricksAround(path, { facing: 'left' })
    : bricksAlong(path, 0, new PathSampler(path).length, { facing: 'left' });
}

/** True when a line's objects move: it is in a group or travels. */
export function isMovingLine(p: { readonly group?: unknown; readonly travel?: unknown }): boolean {
  return p.group !== undefined || p.travel !== undefined;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + ex * t - p.x;
  const dy = a.y + ey * t - p.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Douglas-Peucker: the fewest points that stay within `tolerance` of the polyline. */
function simplify(points: readonly Vec2[], closed: boolean, tolerance: number): Vec2[] {
  const first = points[0];
  if (points.length < 3 || first === undefined) return [...points];
  const ring = closed ? [...points, first] : [...points];
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [a, b] = top;
    const pa = ring[a];
    const pb = ring[b];
    if (pa === undefined || pb === undefined) continue;
    let far = -1;
    let farD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const p = ring[i];
      if (p === undefined) continue;
      const d = segmentDistance(p, pa, pb);
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([a, far], [far, b]);
  }
  const out = ring.filter((_, i) => keep[i] === 1);
  if (closed) out.pop();
  return out;
}

/** A line as a followPath path: its smoothed curve, simplified, relative to its start. */
export interface LineTrack {
  /** The path's start in board coordinates: the anchor of everything that runs along it. */
  readonly anchor: Vec2;
  /** The path as the level file stores it. */
  readonly path: LevelPathInput;
  readonly track: Track;
  /** The path in board coordinates. */
  readonly board: Path;
}

export function lineTrack(g: {
  readonly closed: boolean;
  readonly points: readonly (readonly [number, number])[];
  readonly corners: readonly number[];
}): LineTrack {
  const smooth = smoothLine(g);
  const pts = simplify(smooth.points, smooth.closed, PATH_TOLERANCE);
  const start = pts[0] ?? { x: 0, y: 0 };
  const anchor = { x: round2(start.x), y: round2(start.y) };
  const rel: Vec2[] = [];
  for (const p of pts) {
    const q = { x: round2(p.x - anchor.x), y: round2(p.y - anchor.y) };
    const last = rel[rel.length - 1];
    if (last !== undefined && last.x === q.x && last.y === q.y) continue;
    rel.push(q);
  }
  const head = rel[0];
  const tail = rel[rel.length - 1];
  if (g.closed && rel.length > 1 && head !== undefined && tail !== undefined) {
    if (head.x === tail.x && head.y === tail.y) rel.pop();
  }
  const path: LevelPathInput = { closed: g.closed, points: rel };
  return {
    anchor,
    path,
    track: new Track(rel, g.closed),
    board: { closed: g.closed, points: rel.map((p) => ({ x: anchor.x + p.x, y: anchor.y + p.y })) },
  };
}

/** Objects a traveling line carries: evenly spaced in time over the line's whole length. */
export function trainCount(
  length: number,
  closed: boolean,
  mode: LineGeometry['mode'],
  spacing: number,
): number {
  if (mode === 'bricks') return Math.max(1, Math.round(length / (BRICK_LENGTH + TRAIN_BRICK_GAP)));
  return Math.max(closed ? 3 : 1, Math.round(length / spacing));
}

/** Arc length of the point of a path nearest to p. */
function nearestArc(path: Path, p: Vec2): number {
  const pts = path.points;
  const n = pts.length;
  let best = Infinity;
  let bestS = 0;
  let s = 0;
  for (let i = 0; i < (path.closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    let t = len > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / (len * len) : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + ex * t - p.x;
    const dy = a.y + ey * t - p.y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestS = s + t * len;
    }
    s += len;
  }
  return bestS;
}

// ---------------------------------------------------------------------------------------------
// Clocks

function floorMod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

/** A start phase as whole ticks of the period. */
function phaseTicks(phase: number | undefined, period: number): number {
  return floorMod(Math.round((phase ?? 0) * period), period);
}

/**
 * A phase that the clock turns into exactly `ticks` (research 3.2 truncates phase x period):
 * ticks / period when that survives the round trip, else half a tick more.
 */
export function phaseFor(ticks: number, period: number): number {
  const p = ticks / period;
  return Math.trunc(p * period) === ticks ? p : (ticks + 0.5) / period;
}

interface Clock {
  readonly period: number;
  readonly reverse?: boolean | undefined;
  readonly offset?: number | undefined;
  readonly phase?: number | undefined;
  readonly pause1?: number | undefined;
  readonly pause1At?: number | undefined;
  readonly pause2?: number | undefined;
  readonly pause2At?: number | undefined;
  readonly postDelayPhase?: number | undefined;
}

/** A movement with a clock's fields, left out where they are defaults, at `ticks` of phase. */
function withClock(
  c: Clock,
  fields: Omit<MovementInput, 'period'>,
  ticks: number,
  reverse = c.reverse === true,
): MovementInput {
  const out: Record<string, unknown> = { ...fields, period: c.period };
  if (reverse) out.reverse = true;
  if ((c.offset ?? 0) !== 0) out.offset = c.offset;
  const phase = phaseFor(floorMod(ticks, c.period), c.period);
  if (phase !== 0) out.phase = phase;
  if ((c.pause1 ?? 0) > 0) {
    out.pause1 = c.pause1;
    if ((c.pause1At ?? 0) !== 0) out.pause1At = c.pause1At;
    if ((c.pause2 ?? 0) > 0) out.pause2 = c.pause2;
    if ((c.pause2At ?? 0) !== 0) out.pause2At = c.pause2At;
    if ((c.postDelayPhase ?? 0) !== 0) out.postDelayPhase = c.postDelayPhase;
  }
  return out as MovementInput;
}

function cycleOf(m: { readonly period: number; readonly pause1: number; readonly pause2: number }) {
  return m.pause1 > 0 ? m.period + m.pause1 + m.pause2 : m.period;
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Ticks at which a set of elements is checked: its whole cycle, or samples of a long one. */
export function cycleTicks(elements: readonly LevelElement[]): number[] {
  let l = 1;
  for (const e of elements) {
    if (e.movement === undefined) continue;
    const c = cycleOf(e.movement);
    l = (l / gcd(l, c)) * c;
    if (l > CYCLE_LIMIT) {
      l = CYCLE_LIMIT;
      break;
    }
  }
  if (l <= FULL_CYCLE) return Array.from({ length: l }, (_, i) => i);
  return Array.from({ length: SAMPLES }, (_, i) => Math.floor((i * l) / SAMPLES));
}

// ---------------------------------------------------------------------------------------------
// The tree of moving lines

interface Train {
  readonly index: number;
  readonly part: string;
  readonly line: LineTrack;
  readonly travel: Travel;
  /** Objects where they are at tick 0 (home frame), with the phase ticks of each. */
  readonly members: { readonly draft: ScoringDraft; readonly ticks: number }[];
}

interface Node {
  readonly group: RecipeGroup | null;
  readonly pivot: Vec2;
  readonly members: { readonly draft: ScoringDraft; readonly part: string }[];
  readonly trains: Train[];
  readonly children: Node[];
  /** Smallest path index in the subtree, for placement order. */
  readonly first: number;
}

/** A line's objects that travel along it, at their tick-0 places. */
function trainOf(
  p: LineGeometry,
  index: number,
  part: string,
  travel: Travel,
  reject: (d: ScoringDraft, why: string) => void,
): Train {
  const line = lineTrack(p);
  const L = line.track.length;
  const period = travel.period;
  const q = phaseTicks(travel.phase, period);
  const n = trainCount(L, p.closed, p.mode, p.spacing ?? PEG_SPACING);
  const sampler = new PathSampler(line.board);
  const tp: TrackPoint = { x: 0, y: 0, turn: 0 };
  const members: Train['members'][number][] = [];
  const brickLength = L / n - TRAIN_BRICK_GAP;
  for (let i = 0; i < n; i++) {
    const ticks = floorMod(q + Math.round((i * period) / n), period);
    const u = ticks / period;
    const s = (travel.reverse === true ? 1 - u : u) * L;
    line.track.at(s, tp);
    const x = line.anchor.x + tp.x;
    const y = line.anchor.y + tp.y;
    if (p.mode === 'pegs') {
      members.push({ draft: peg(x, y), ticks });
      continue;
    }
    // A brick's shape comes from its stretch of the line; on an open line the stretch stays on
    // the line. It rides on its middle.
    let s0 = s - brickLength / 2;
    if (!p.closed) s0 = Math.min(Math.max(s0, 0), Math.max(0, L - brickLength));
    const b = brickLength >= 10 ? brickOnSpan(sampler, s0, s0 + brickLength, 'left') : null;
    if (b === null) {
      reject(peg(x, y), 'the line bends too tightly for a brick here');
      continue;
    }
    members.push({ draft: { ...b, x, y }, ticks });
  }
  return { index, part, line, travel, members };
}

function boxCenter(points: readonly Vec2[]): Vec2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : { x: 0, y: 0 };
}

function isBrick(d: { readonly kind: string }): boolean {
  return d.kind === 'brick' || d.kind === 'curvedBrick';
}

// ---------------------------------------------------------------------------------------------
// Encoding: the tree as level elements

interface Item {
  readonly draft: Draft;
  readonly part: string;
  /** Index of the item it rides on, or null. */
  readonly parent: number | null;
  /** Parts with the same rigid set never move against each other; -1 for carriers. */
  readonly set: number;
  /** Where the object is meant to be, for reports when the unit does not fit. */
  readonly home: ScoringDraft | null;
}

/** An invisible, non-colliding circle that carries movement for others (research 2.10). */
function carrier(x: number, y: number, movement?: MovementInput): Draft {
  return {
    kind: 'circle',
    x,
    y,
    radius: 1,
    collision: false,
    visible: false,
    ...(movement === undefined ? {} : { movement }),
  };
}

function facingOf(d: Draft): number | null {
  return d.kind === 'brick' || d.kind === 'curvedBrick' ? (d.rotation ?? 0) : null;
}

class Encoder {
  readonly items: Item[] = [];
  /** New paths, indexed from `pathBase`. */
  readonly paths: LevelPathInput[] = [];
  private readonly tracks: Track[];
  private sets = 0;

  constructor(
    existing: readonly Track[],
    private readonly pathBase: number,
    private readonly carrierPart: string,
  ) {
    this.tracks = [...existing];
  }

  private addPath(t: LineTrack): number {
    this.paths.push(t.path);
    this.tracks.push(t.track);
    return this.pathBase + this.paths.length - 1;
  }

  private push(item: Item): number {
    this.items.push(item);
    return this.items.length - 1;
  }

  /** Where an item is at tick 0: its movement around its file position. */
  private pose0(index: number): Pose {
    const d = this.items[index]?.draft;
    const out: Pose = {
      x: d?.x ?? 0,
      y: d?.y ?? 0,
      rotation: d === undefined ? 0 : (facingOf(d) ?? 0),
    };
    if (d?.movement === undefined) return out;
    const m = movementSchema.parse(d.movement);
    const track = m.path === undefined ? null : (this.tracks[m.path] ?? null);
    return movementPose(m, out.x, out.y, out.rotation, 0, out, 0, track);
  }

  /**
   * Encodes a node riding on item `outer` (null: on nothing), its file positions shifted by
   * `shift`: where `outer` is at tick 0 minus where the node's frame has it.
   */
  node(node: Node, outer: number | null, shift: Vec2): void {
    const m = node.group?.movement;
    const set = this.sets++;
    const P = node.pivot;
    const sh = <T extends Draft>(d: T): T => ({ ...d, x: d.x + shift.x, y: d.y + shift.y });
    let follow: number | null = null;
    if (m?.type === 'followPath' && m.along !== undefined) {
      const lt = lineTrack({ ...m.along, corners: m.along.corners });
      const k = this.addPath(lt);
      const L = lt.track.length;
      const s = nearestArc(lt.board, P) / L;
      const start = Math.round((m.reverse === true ? 1 - s : s) * m.period);
      const ticks = start + phaseTicks(m.phase, m.period);
      follow = this.push({
        draft: sh(
          carrier(lt.anchor.x, lt.anchor.y, withClock(m, { type: 'followPath', path: k }, ticks)),
        ),
        part: this.carrierPart,
        parent: outer,
        set: -1,
        home: null,
      });
    }
    const add = (d: Draft, part: string, home: ScoringDraft | null): number => {
      const itemSet = home === null ? -1 : set;
      if (m === undefined || follow !== null) {
        return this.push({ draft: sh(d), part, parent: follow ?? outer, set: itemSet, home });
      }
      return this.encodeMoving(d, part, home, itemSet, m, P, outer, sh);
    };
    for (const member of node.members) add(member.draft, member.part, member.draft);
    for (const train of node.trains) {
      const a = train.line.anchor;
      // A train alone needs no carrier: its path has nothing to ride on.
      const ride =
        node.group === null && outer === null
          ? null
          : add(carrier(a.x, a.y), this.carrierPart, null);
      const p0 = ride === null ? a : this.pose0(ride);
      this.train(train, ride, { x: p0.x - a.x, y: p0.y - a.y });
    }
    for (const child of node.children) {
      const k = add(carrier(child.pivot.x, child.pivot.y), this.carrierPart, null);
      const p0 = this.pose0(k);
      this.node(child, k, { x: p0.x - child.pivot.x, y: p0.y - child.pivot.y });
    }
  }

  private encodeMoving(
    d: Draft,
    part: string,
    home: ScoringDraft | null,
    set: number,
    m: RecipeGroupMovement,
    P: Vec2,
    outer: number | null,
    sh: <T extends Draft>(d: T) => T,
  ): number {
    const q = phaseTicks(m.phase, m.period);
    const vx = d.x - P.x;
    const vy = d.y - P.y;
    const r = Math.sqrt(vx * vx + vy * vy);
    const angle = (x: number, y: number): number => atan2(-y, x);
    switch (m.type) {
      case 'rotate':
      case 'rotateAroundCircle': {
        // Turning about the pivot (and, for rotateAroundCircle, the pivot's own orbit): one
        // rotating vector, so one rotateAroundCircle around the pivot.
        const R = m.type === 'rotateAroundCircle' ? (m.radius ?? 0) : 0;
        const pr = m.pathRotation ?? 0;
        const wx = vx + R * cos(pr);
        const wy = vy - R * sin(pr);
        const w = Math.sqrt(wx * wx + wy * wy);
        const movement = withClock(
          m,
          w > 1e-9
            ? { type: 'rotateAroundCircle', radius: w, pathRotation: angle(wx, wy) }
            : { type: 'rotateAroundCircle' },
          q,
        );
        return this.push({
          draft: sh({ ...d, x: P.x, y: P.y, movement }),
          part,
          parent: outer,
          set,
          home,
        });
      }
      case 'rotateBackAndForth': {
        const swing = withClock(
          m,
          {
            type: 'rotateBackAndForth',
            ...((m.maxAngle ?? 0) !== 0 ? { maxAngle: m.maxAngle } : {}),
            ...((m.pathRotation ?? 0) !== 0 ? { pathRotation: m.pathRotation } : {}),
          },
          q,
        );
        if (r < 1e-9) {
          return this.push({
            draft: sh({ ...d, movement: swing }),
            part,
            parent: outer,
            set,
            home,
          });
        }
        // The swing as a position: the arc eases 0 -> 2A -> 0, a quarter cycle ahead (three
        // quarters when reversed) and started A back, which is A sin over the swing's clock.
        const A = (m.maxAngle ?? 0) === 0 ? PI : (m.maxAngle ?? 0);
        const dir = m.reverse === true ? -1 : 1;
        const arc = withClock(
          m,
          {
            type: 'horizontalArc',
            radius: r,
            maxAngle: 2 * A,
            pathRotation: angle(vx, vy) + dir * (m.pathRotation ?? 0) - A,
          },
          q + (dir > 0 ? m.period / 4 : (3 * m.period) / 4),
          false,
        );
        if (facingOf(d) === null) {
          return this.push({
            draft: sh({ ...d, x: P.x, y: P.y, movement: arc }),
            part,
            parent: outer,
            set,
            home,
          });
        }
        const c = this.push({
          draft: sh(carrier(P.x, P.y, arc)),
          part: this.carrierPart,
          parent: outer,
          set: -1,
          home: null,
        });
        const at = this.pose0(c);
        return this.push({
          draft: { ...d, x: at.x, y: at.y, movement: swing },
          part,
          parent: c,
          set,
          home,
        });
      }
      default: {
        const fields: Record<string, unknown> = { type: m.type };
        if ((m.radius ?? 0) !== 0) fields.radius = m.radius;
        if ((m.radius2 ?? 0) !== 0) fields.radius2 = m.radius2;
        if ((m.pathRotation ?? 0) !== 0) fields.pathRotation = m.pathRotation;
        if ((m.maxAngle ?? 0) !== 0) fields.maxAngle = m.maxAngle;
        const movement = withClock(m, fields as Omit<MovementInput, 'period'>, q);
        return this.push({ draft: sh({ ...d, movement }), part, parent: outer, set, home });
      }
    }
  }

  /** A traveling line's objects on followPath, riding on `ride` when it moves. */
  private train(t: Train, ride: number | null, shift: Vec2): void {
    const k = this.addPath(t.line);
    const a = t.line.anchor;
    const tp: TrackPoint = { x: 0, y: 0, turn: 0 };
    const L = t.line.track.length;
    for (const { draft, ticks } of t.members) {
      const movement = withClock(t.travel, { type: 'followPath', path: k }, ticks);
      const facing = facingOf(draft);
      let rotation = {};
      if (facing !== null) {
        const u = ticks / t.travel.period;
        t.line.track.at((t.travel.reverse === true ? 1 - u : u) * L, tp);
        rotation = { rotation: facing - wrapAngle(tp.turn) };
      }
      this.push({
        draft: { ...draft, x: a.x + shift.x, y: a.y + shift.y, ...rotation, movement },
        part: t.part,
        parent: ride,
        set: this.sets++,
        home: draft,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sweeping and checking a unit

interface UnitCheck {
  readonly sweep: Sweep;
  /** Why the unit cannot go anywhere (the board, its own parts), or null. */
  readonly problem: string | null;
}

/** The board limits with SWEEP_STEP to spare, for samples SWEEP_STEP apart. */
function insideWithMargin(s: Shape): boolean {
  const m = SWEEP_STEP;
  if (s.minX < SIDE_LIMIT + m || s.maxX > BOARD_W - SIDE_LIMIT - m) return false;
  if (s.minY < TOP_LIMIT + m || s.maxY > BOTTOM_LIMIT - m) return false;
  if (pointGap(s, CANNON_X, CANNON_Y) < CANNON_CLEARANCE + m) return false;
  return flipperGap(s, BOARD_W, BOARD_H, MIN_GAP + m) >= MIN_GAP + m;
}

/** How far any point of an element's body lies from its position. */
function reachOf(e: LevelElement): number {
  const outline = localOutline(e);
  if (outline === null) return 0;
  let r = 0;
  for (const v of outline.vertices) r = Math.max(r, Math.sqrt(v.x * v.x + v.y * v.y));
  return r;
}

const CACHE_SIZE = 12;
const cache = new Map<string, UnitCheck>();

/** Samples a unit over its cycle (see the file comment). Cached: units repeat while fitting. */
function checkUnit(
  elements: readonly LevelElement[],
  sets: readonly number[],
  tracks: readonly Track[],
  key: string,
): UnitCheck {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const model = new MotionModel(elements, tracks);
  const n = elements.length;
  const colliding: number[] = [];
  const reach = new Float64Array(n);
  elements.forEach((e, i) => {
    if (elementShape(e, model.poseOf(i)) === null) return;
    colliding.push(i);
    reach[i] = reachOf(e);
  });
  const rigid = new Set(colliding.map((i) => sets[i])).size <= 1;
  const lastX = new Float64Array(n).fill(NaN);
  const lastY = new Float64Array(n);
  const lastR = new Float64Array(n);
  const shapes: (Shape | null)[] = new Array<Shape | null>(n).fill(null);
  const sweep = new Sweep();
  let problem: string | null = null;
  outer: for (const tick of cycleTicks(elements)) {
    model.at(tick);
    for (const i of colliding) {
      const x = model.xs[i] ?? 0;
      const y = model.ys[i] ?? 0;
      const rot = model.rotations[i] ?? 0;
      const lx = lastX[i] ?? NaN;
      const dx = x - lx;
      const dy = y - (lastY[i] ?? 0);
      const moved = Number.isNaN(lx)
        ? Infinity
        : Math.sqrt(dx * dx + dy * dy) +
          Math.abs(wrapAngle(rot - (lastR[i] ?? 0))) * (reach[i] ?? 0);
      const keep = moved >= SWEEP_STEP;
      shapes[i] = null;
      if (!keep && rigid) continue;
      const e = elements[i];
      const s = e === undefined ? null : elementShape(e, { x, y, rotation: rot });
      shapes[i] = s;
      if (s === null || !keep) continue;
      lastX[i] = x;
      lastY[i] = y;
      lastR[i] = rot;
      if (!insideWithMargin(s)) {
        problem = `leaves the board, comes near the cannon or into the flippers' swing at tick ${tick}`;
        break outer;
      }
      sweep.add(s);
    }
    if (rigid) continue;
    for (let a = 0; a < colliding.length; a++) {
      const i = colliding[a] ?? 0;
      const si = shapes[i];
      if (si === null || si === undefined) continue;
      for (let b = a + 1; b < colliding.length; b++) {
        const j = colliding[b] ?? 0;
        const sj = shapes[j];
        if (sj === null || sj === undefined || sets[i] === sets[j]) continue;
        if (si.maxX + MIN_GAP < sj.minX || sj.maxX + MIN_GAP < si.minX) continue;
        if (si.maxY + MIN_GAP < sj.minY || sj.maxY + MIN_GAP < si.minY) continue;
        const g = shapeGap(si, sj);
        const ei = elements[i];
        const ej = elements[j];
        const joined = ei !== undefined && ej !== undefined && isBrick(ei) && isBrick(ej);
        if (g >= MIN_GAP || (joined && g >= 0 && g <= JOIN_GAP)) continue;
        problem =
          g < 0
            ? `two of its objects overlap at tick ${tick}`
            : `two of its objects come ${g.toFixed(2)} px close at tick ${tick}`;
        break outer;
      }
    }
  }
  const result = { sweep, problem };
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}

const meetCache = new Map<string, string | null>();

/**
 * Whether a unit's parts ever come too close to moving objects already placed, at every tick of
 * their joint cycle (sampled as the validity check samples a long one); the reason, or null.
 */
function meetsMoving(
  unit: readonly LevelElement[],
  placed: readonly LevelElement[],
  tracks: readonly Track[],
  key: string,
): string | null {
  const hit = meetCache.get(key);
  if (hit !== undefined) return hit;
  const all = [...placed, ...unit];
  const model = new MotionModel(all, tracks);
  const first = placed.length;
  const reach = all.map((e) => (e.kind === 'peg' || e.kind === 'circle' ? e.radius : reachOf(e)));
  const solid = all.map((e, i) => elementShape(e, model.poseOf(i)) !== null);
  const mine = unit.flatMap((_, k) => (solid[first + k] === true ? [first + k] : []));
  const theirs = placed.flatMap((_, j) => (solid[j] === true ? [j] : []));
  let problem: string | null = null;
  outer: for (const tick of cycleTicks(all)) {
    model.at(tick);
    for (const i of mine) {
      const xi = model.xs[i] ?? 0;
      const yi = model.ys[i] ?? 0;
      let si: Shape | null = null;
      for (const j of theirs) {
        const dx = (model.xs[j] ?? 0) - xi;
        const dy = (model.ys[j] ?? 0) - yi;
        const near = (reach[i] ?? 0) + (reach[j] ?? 0) + MIN_GAP;
        if (dx * dx + dy * dy >= near * near) continue;
        const ei = all[i];
        const ej = all[j];
        if (ei === undefined || ej === undefined) continue;
        si ??= elementShape(ei, model.poseOf(i));
        const sj = elementShape(ej, model.poseOf(j));
        if (si === null || sj === null) continue;
        const g = shapeGap(si, sj);
        if (g >= MIN_GAP || (isBrick(ei) && isBrick(ej) && g >= 0 && g <= JOIN_GAP)) continue;
        problem = `comes ${Math.max(0, g).toFixed(2)} px from element ${ej.id} at tick ${tick}`;
        break outer;
      }
    }
  }
  meetCache.set(key, problem);
  if (meetCache.size > CACHE_SIZE) {
    const oldest = meetCache.keys().next().value;
    if (oldest !== undefined) meetCache.delete(oldest);
  }
  return problem;
}

// ---------------------------------------------------------------------------------------------
// Placing the moving lines of an outline part

export interface MovingLines {
  readonly paths: readonly LineGeometry[];
  readonly groups: readonly RecipeGroup[];
  /** Part name of the objects path i places. */
  readonly partOf: (index: number) => string;
}

/**
 * Places every moving line of an outline part, unit by unit (see the file comment); the static
 * lines come after. Objects of a unit that does not fit go to the builder's rejected list with
 * the reason.
 */
export function placeMovingLines(ctx: TemplateContext, input: MovingLines): void {
  const b = ctx.builder;
  const byId = new Map(input.groups.map((g) => [g.id, g]));
  const reject = (d: ScoringDraft, part: string, why: string): void => {
    b.rejected.push({ draft: d, part, reason: why });
  };
  const nodeOf = (group: RecipeGroup | null, ids: readonly number[]): Node => {
    const members: Node['members'][number][] = [];
    const trains: Train[] = [];
    const accepted: { shape: Shape; brick: boolean }[] = [];
    const outline: Vec2[] = [];
    for (const i of ids) {
      const p = input.paths[i];
      if (p === undefined) continue;
      const part = input.partOf(i);
      outline.push(...smoothLine(p).points);
      if (p.travel !== undefined) {
        trains.push(
          trainOf(p, i, part, p.travel, (d, why) => {
            reject(d, part, why);
          }),
        );
        continue;
      }
      // A group's lines share it like the board: each object keeps the gap to the others.
      for (const d of lineDrafts(p)) {
        const s = b.shapeOf(d);
        const brick = isBrick(d);
        let why = '';
        for (const o of s === null ? [] : accepted) {
          if (s === null) break;
          if (o.shape.maxX + MIN_GAP < s.minX || s.maxX + MIN_GAP < o.shape.minX) continue;
          if (o.shape.maxY + MIN_GAP < s.minY || s.maxY + MIN_GAP < o.shape.minY) continue;
          const g = shapeGap(o.shape, s);
          if (g >= MIN_GAP || (brick && o.brick && g >= 0 && g <= JOIN_GAP)) continue;
          why = `${g.toFixed(2)} px from another object of its group`;
          break;
        }
        if (why !== '') {
          reject(d, part, why);
          continue;
        }
        if (s !== null) accepted.push({ shape: s, brick });
        members.push({ draft: d, part });
      }
    }
    const children = group === null ? [] : input.groups.filter((g) => g.parent === group.id);
    const childNodes = children
      .map((c) => nodeOf(c, linesOf(c.id)))
      .filter((c) => c.members.length + c.trains.length + c.children.length > 0);
    const pivot =
      group?.pivot !== undefined ? { x: group.pivot[0], y: group.pivot[1] } : boxCenter(outline);
    return {
      group,
      pivot,
      members,
      trains,
      children: childNodes,
      first: Math.min(...ids, ...childNodes.map((c) => c.first)),
    };
  };
  const linesOf = (group: string): number[] =>
    input.paths.flatMap((p, i) => (p.group === group ? [i] : []));
  const units: Node[] = [];
  for (const g of input.groups) {
    if (g.parent !== undefined && byId.has(g.parent)) continue;
    const node = nodeOf(g, linesOf(g.id));
    if (node.members.length + node.trains.length + node.children.length > 0) units.push(node);
  }
  input.paths.forEach((p, i) => {
    if (p.travel !== undefined && p.group === undefined) units.push(nodeOf(null, [i]));
  });
  units.sort((x, y) => x.first - y.first);
  for (const unit of units) placeUnit(ctx, unit);
}

function homes(node: Node): { draft: ScoringDraft; part: string }[] {
  return [
    ...node.members,
    ...node.trains.flatMap((t) => t.members.map((m) => ({ draft: m.draft, part: t.part }))),
    ...node.children.flatMap(homes),
  ];
}

function placeUnit(ctx: TemplateContext, unit: Node): void {
  const b = ctx.builder;
  const name = unit.group === null ? 'traveling line' : `group ${unit.group.id}`;
  const carrierPart = `${ctx.part}/${unit.group === null ? 'travel' : `group ${unit.group.id}`}`;
  const enc = new Encoder(b.tracks, b.paths.length, carrierPart);
  enc.node(unit, null, { x: 0, y: 0 });
  // The check numbers the unit's elements from 1, so it does not depend on what came before.
  const elements = enc.items.map((it, i) =>
    elementSchema.parse({
      ...it.draft,
      id: 1 + i,
      ...(it.parent === null ? {} : { parent: 1 + it.parent }),
    }),
  );
  const tracks = [...b.tracks, ...enc.paths.map((p) => new Track(p.points, p.closed ?? false))];
  const key = JSON.stringify([b.paths.length, enc.paths, elements]);
  const base = b.peekId();
  const check = checkUnit(
    elements,
    enc.items.map((it) => it.set),
    tracks,
    key,
  );
  let problem = check.problem;
  if (problem === null) {
    const env = b.sweptGap(check.sweep, MIN_GAP);
    if (env.gap < MIN_GAP) problem = env.why;
  }
  if (problem === null && b.sweptClashes(check.sweep)) {
    // The areas overlap; the parts may still never meet (neighbors circling opposite ways).
    const final = enc.items.map((it, i) =>
      elementSchema.parse({
        ...it.draft,
        id: base + i,
        ...(it.parent === null ? {} : { parent: base + it.parent }),
      }),
    );
    const moving = b.placed.filter((p) => p.moving).map((p) => p.element);
    problem = meetsMoving(final, moving, tracks, `${key}|${JSON.stringify(moving)}`);
  }
  if (problem !== null) {
    for (const h of homes(unit))
      b.rejected.push({ draft: h.draft, part: h.part, reason: `${name}: ${problem}` });
    return;
  }
  for (const p of enc.paths) b.addPath(p);
  enc.items.forEach((it, i) => {
    const added = b.add(
      it.parent === null ? it.draft : { ...it.draft, parent: base + it.parent },
      it.part,
      true,
    );
    if (added.id !== base + i) throw new Error('moving line ids out of step');
  });
  b.reserve(sweptZone(check.sweep));
}
