// Collects a level's elements while a template places them. It assigns ids, keeps the static
// collision shapes in a grid, and answers "does this fit?": inside the board, clear of the
// cannon, the bucket and the flippers' swing, clear of keep-out zones reserved for moving
// parts, and at least MIN_GAP from every other object (bricks may also join: a seam of at most
// JOIN_GAP).

import { elementSchema, type LevelElement, type LevelPathInput } from '../level/schema';
import { Track } from '../sim/track';
import {
  BOARD_H,
  BOARD_W,
  BOTTOM_LIMIT,
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  CENTER_X,
  JOIN_GAP,
  MIN_GAP,
  SIDE_LIMIT,
  TOP_LIMIT,
} from './constants';
import type { Draft } from './draft';
import { flipperGap } from './flippers';
import { mirrorElement } from './mirror';
import {
  boundsGap,
  circleShape,
  elementShape,
  filePose,
  pointGap,
  polyShape,
  shapeGap,
  type Shape,
} from './shapes';
import { SWEEP_STEP, type Sweep } from './sweep';

/** A placed element and the template part that made it. */
export interface Placed {
  readonly element: LevelElement;
  /** Collision shape at the file pose; null when it never collides. */
  readonly shape: Shape | null;
  readonly moving: boolean;
  readonly part: string;
}

/** An area reserved for a moving part; nothing static may come within MIN_GAP of it. */
export type Zone =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly r: number }
  | {
      readonly kind: 'box';
      readonly minX: number;
      readonly minY: number;
      readonly maxX: number;
      readonly maxY: number;
    };

/** A reserved area: a template's zone, or the exact area a moving line covers (sweep.ts). */
export type Reserved = Zone | { readonly kind: 'swept'; readonly sweep: Sweep };

/**
 * An area a template's structure owns: fills leave it free, so the structure reads as one
 * shape. Unlike a zone it does not block other templates.
 */
export type Claim =
  | Reserved
  | {
      readonly kind: 'ellipse';
      readonly x: number;
      readonly y: number;
      readonly rx: number;
      readonly ry: number;
    };

export interface FitOptions {
  /** Required free distance to other objects (default MIN_GAP). */
  readonly gap?: number;
  /** Ignore the keep-out zones (for the moving part that owns them). */
  readonly ignoreZones?: boolean;
  /** Also keep `gap` from every zone and claimed area (fills). */
  readonly avoidClaims?: boolean;
}

/** True when a shape comes within `gap` of a claimed area. */
function inClaim(c: Claim, s: Shape, gap: number): boolean {
  if (c.kind === 'ellipse') {
    // The shape's box center against the ellipse grown by the gap and the shape's half size.
    const cx = (s.minX + s.maxX) / 2;
    const cy = (s.minY + s.maxY) / 2;
    const hx = (s.maxX - s.minX) / 2;
    const hy = (s.maxY - s.minY) / 2;
    const dx = (cx - c.x) / (c.rx + gap + hx);
    const dy = (cy - c.y) / (c.ry + gap + hy);
    return dx * dx + dy * dy < 1;
  }
  return zoneGap(c, s, gap) < gap;
}

const CELL = 64;

function isBrick(e: LevelElement): boolean {
  return e.kind === 'brick' || e.kind === 'curvedBrick';
}

/** Board limits, cannon clearance, bucket clearance and the flippers' swing for one shape. */
export function insideBoard(s: Shape): boolean {
  if (s.minX < SIDE_LIMIT || s.maxX > BOARD_W - SIDE_LIMIT) return false;
  if (s.minY < TOP_LIMIT || s.maxY > BOTTOM_LIMIT) return false;
  if (pointGap(s, CANNON_X, CANNON_Y) < CANNON_CLEARANCE) return false;
  return flipperGap(s, BOARD_W, BOARD_H) >= MIN_GAP;
}

/** A candidate a template wanted to place but could not, and why. */
export interface Rejected {
  readonly draft: Draft;
  readonly part: string;
  readonly reason: string;
}

/** Free distance from a zone to a shape; a swept zone answers Infinity from `limit` on. */
function zoneGap(z: Reserved, s: Shape, limit = MIN_GAP): number {
  if (z.kind === 'circle') return pointGap(s, z.x, z.y) - z.r;
  if (z.kind === 'swept') return z.sweep.gap(s, limit);
  return boundsGap(z, s);
}

function zonesGap(a: Reserved, b: Reserved): number {
  if (a.kind === 'circle' && b.kind === 'circle') {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) - a.r - b.r;
  }
  if (a.kind === 'swept' && b.kind === 'swept') return a.sweep.gapTo(b.sweep, MIN_GAP);
  if (a.kind === 'swept' || b.kind === 'swept') {
    const swept = a.kind === 'swept' ? a.sweep : b.kind === 'swept' ? b.sweep : null;
    const other = a.kind === 'swept' ? b : a;
    let best = Infinity;
    for (const s of swept?.shapes ?? []) best = Math.min(best, zoneGap(other, s) - SWEEP_STEP);
    return best;
  }
  const box = (z: Zone) =>
    z.kind === 'circle'
      ? { minX: z.x - z.r, minY: z.y - z.r, maxX: z.x + z.r, maxY: z.y + z.r }
      : z;
  return boundsGap(box(a), box(b));
}

/** The area of a swept zone, for reserving it. */
export function sweptZone(sweep: Sweep): Reserved {
  return { kind: 'swept', sweep };
}

export class Builder {
  readonly placed: Placed[] = [];
  readonly zones: Reserved[] = [];
  readonly claims: Claim[] = [];
  /** Single drafts that tryAdd and tryAddMirrored turned down, for the editor's preview. */
  readonly rejected: Rejected[] = [];
  /** The level's paths for followPath movements, in index order. */
  readonly paths: LevelPathInput[] = [];
  private readonly trackList: Track[] = [];
  private nextId = 1;
  private readonly grid = new Map<number, number[]>();

  /** The id the next added element gets. */
  peekId(): number {
    return this.nextId;
  }

  /** Adds a path for followPath movements; returns its index. */
  addPath(path: LevelPathInput): number {
    this.paths.push(path);
    this.trackList.push(new Track(path.points, path.closed ?? false));
    return this.paths.length - 1;
  }

  /** The compiled paths, by index. */
  get tracks(): readonly Track[] {
    return this.trackList;
  }

  /**
   * The free distance from a swept area to the static objects placed so far, or Infinity when
   * it keeps `limit`; `why` gets the nearest one's description.
   */
  sweptGap(sweep: Sweep, limit: number): { gap: number; why: string } {
    let best = Infinity;
    let why = '';
    const probe = {
      minX: sweep.minX,
      minY: sweep.minY,
      maxX: sweep.maxX,
      maxY: sweep.maxY,
    };
    for (const index of this.nearBox(probe, limit + SWEEP_STEP)) {
      const p = this.placed[index];
      if (p?.shape === undefined || p.shape === null) continue;
      const g = sweep.gap(p.shape, limit);
      if (g < best) {
        best = g;
        why = `${Math.max(0, g).toFixed(2)} px from element ${p.element.id} (${p.part}) as it moves`;
      }
    }
    return { gap: best, why };
  }

  /** True when a swept area comes within MIN_GAP of a reserved zone. */
  sweptClashes(sweep: Sweep): boolean {
    const zone = sweptZone(sweep);
    return this.zones.some((z) => zonesGap(z, zone) < MIN_GAP);
  }

  /** Parses and adds an element without any check. Returns it with its id. */
  add(draft: Draft, part: string, moving = false): LevelElement {
    const element = elementSchema.parse({ ...draft, id: this.nextId++ });
    const isMoving = moving || element.movement !== undefined || element.parent !== undefined;
    const shape = elementShape(element, filePose(element));
    const index = this.placed.length;
    this.placed.push({ element, shape, moving: isMoving, part });
    if (shape !== null && !isMoving) this.index(shape, index);
    return element;
  }

  /** The shape a draft would have, or null when it would not collide. */
  shapeOf(draft: Draft): Shape | null {
    const element = elementSchema.parse({ ...draft, id: 0 });
    return elementShape(element, filePose(element));
  }

  /** Why the last fits() call said no, for diagnostics. */
  lastReject = '';

  /** True when a static shape fits: inside the board and clear of everything placed so far. */
  fits(shape: Shape, brick: boolean, options: FitOptions = {}): boolean {
    if (!insideBoard(shape)) {
      this.lastReject = `outside the board, near the cannon or in the flippers' swing (${shape.minX.toFixed(0)}, ${shape.minY.toFixed(0)})`;
      return false;
    }
    const gap = options.gap ?? MIN_GAP;
    if (options.ignoreZones !== true) {
      // Zones already cover a moving part's whole sweep, so fills keep a smaller margin there.
      const zoneMin = options.avoidClaims === true ? Math.min(gap, MIN_GAP + 8) : MIN_GAP;
      for (const z of this.zones) {
        if (zoneGap(z, shape, zoneMin) < zoneMin) {
          this.lastReject = "in a moving part's zone";
          return false;
        }
      }
    }
    if (options.avoidClaims === true) {
      for (const c of this.claims) {
        if (inClaim(c, shape, gap)) {
          this.lastReject = 'in a claimed area';
          return false;
        }
      }
    }
    for (const index of this.near(shape, gap)) {
      const p = this.placed[index];
      if (p?.shape === undefined || p.shape === null) continue;
      if (boundsGap(p.shape, shape) >= gap) continue;
      const g = shapeGap(p.shape, shape);
      if (g >= gap) continue;
      if (brick && isBrick(p.element) && g >= 0 && g <= JOIN_GAP) continue;
      this.lastReject = `${g.toFixed(2)} px from element ${p.element.id} (${p.part})`;
      return false;
    }
    return true;
  }

  /** Adds the draft if it fits; returns the element or null. */
  tryAdd(draft: Draft, part: string, options: FitOptions = {}): LevelElement | null {
    const shape = this.shapeOf(draft);
    if (shape === null) return this.add(draft, part);
    const brick = draft.kind === 'brick' || draft.kind === 'curvedBrick';
    if (this.fits(shape, brick, options)) return this.add(draft, part);
    this.rejected.push({ draft, part, reason: this.lastReject });
    return null;
  }

  /**
   * Adds a draft and its mirror image about the center line, both or neither. A draft on the
   * center line is added once. Returns the number of elements added.
   */
  tryAddMirrored(draft: Draft, part: string, options: FitOptions = {}): number {
    if (Math.abs(draft.x - CENTER_X) < 1e-9) return this.tryAdd(draft, part, options) ? 1 : 0;
    const twin = mirrorElement(draft);
    const a = this.shapeOf(draft);
    const b = this.shapeOf(twin);
    const brick = draft.kind === 'brick' || draft.kind === 'curvedBrick';
    const reject = (): 0 => {
      this.rejected.push({ draft, part, reason: this.lastReject });
      this.rejected.push({ draft: twin, part, reason: this.lastReject });
      return 0;
    };
    if (a !== null && !this.fits(a, brick, options)) return reject();
    if (b !== null && !this.fits(b, brick, options)) return reject();
    if (a !== null && b !== null) {
      const g = shapeGap(a, b);
      const gap = options.gap ?? MIN_GAP;
      if (g < gap && !(brick && g >= 0 && g <= JOIN_GAP)) {
        this.lastReject = `${g.toFixed(2)} px from its mirror image`;
        return reject();
      }
    }
    this.add(draft, part);
    this.add(twin, part);
    return 2;
  }

  /** Reserves an area for a moving part. */
  reserve(zone: Reserved): void {
    this.zones.push(zone);
  }

  /** Marks an area as part of a structure, to be left free by fills. */
  claim(c: Claim): void {
    this.claims.push(c);
  }

  /**
   * True when a zone lies inside the board, clear of the cannon and the flippers' swing, and at
   * least MIN_GAP from every static object and every other zone.
   */
  canReserve(zone: Zone): boolean {
    const ok = this.zoneFits(zone);
    if (!ok) this.lastReject = `the ${zone.kind} zone of a moving part does not fit`;
    return ok;
  }

  private zoneFits(zone: Zone): boolean {
    const box =
      zone.kind === 'circle'
        ? {
            minX: zone.x - zone.r,
            minY: zone.y - zone.r,
            maxX: zone.x + zone.r,
            maxY: zone.y + zone.r,
          }
        : zone;
    if (box.minX < SIDE_LIMIT || box.maxX > BOARD_W - SIDE_LIMIT) return false;
    if (box.minY < TOP_LIMIT || box.maxY > BOTTOM_LIMIT) return false;
    if (zone.kind === 'circle') {
      const dx = zone.x - CANNON_X;
      const dy = zone.y - CANNON_Y;
      if (Math.sqrt(dx * dx + dy * dy) - zone.r < CANNON_CLEARANCE) return false;
    } else {
      const dx = Math.max(box.minX - CANNON_X, CANNON_X - box.maxX, 0);
      const dy = Math.max(box.minY - CANNON_Y, CANNON_Y - box.maxY, 0);
      if (Math.sqrt(dx * dx + dy * dy) < CANNON_CLEARANCE) return false;
    }
    const area =
      zone.kind === 'circle'
        ? circleShape(zone.x, zone.y, zone.r)
        : polyShape(
            [
              { x: box.minX, y: box.minY },
              { x: box.maxX, y: box.minY },
              { x: box.maxX, y: box.maxY },
              { x: box.minX, y: box.maxY },
            ],
            { x: 0, y: 0, rotation: 0 },
            true,
          );
    if (flipperGap(area, BOARD_W, BOARD_H) < MIN_GAP) return false;
    for (const p of this.placed) {
      if (p.shape === null || p.moving) continue;
      if (zoneGap(zone, p.shape) < MIN_GAP) return false;
    }
    for (const z of this.zones) if (zonesGap(z, zone) < MIN_GAP) return false;
    return true;
  }

  /** Count of scoring objects so far. */
  scoringCount(): number {
    return this.placed.filter((p) => {
      const k = p.element.kind;
      return k === 'peg' || k === 'brick' || k === 'curvedBrick';
    }).length;
  }

  /** Every element placed so far, in id order. */
  elements(): LevelElement[] {
    return this.placed.map((p) => p.element);
  }

  private cellKey(cx: number, cy: number): number {
    return (cy + 64) * 4096 + (cx + 64);
  }

  private index(s: Shape, index: number): void {
    const x0 = Math.floor(s.minX / CELL);
    const x1 = Math.floor(s.maxX / CELL);
    const y0 = Math.floor(s.minY / CELL);
    const y1 = Math.floor(s.maxY / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = this.cellKey(cx, cy);
        const list = this.grid.get(key);
        if (list === undefined) this.grid.set(key, [index]);
        else list.push(index);
      }
    }
  }

  private near(s: Shape, margin: number): Set<number> {
    return this.nearBox(s, margin);
  }

  private nearBox(
    s: {
      readonly minX: number;
      readonly minY: number;
      readonly maxX: number;
      readonly maxY: number;
    },
    margin: number,
  ): Set<number> {
    const out = new Set<number>();
    const x0 = Math.floor((s.minX - margin) / CELL);
    const x1 = Math.floor((s.maxX + margin) / CELL);
    const y0 = Math.floor((s.minY - margin) / CELL);
    const y1 = Math.floor((s.maxY + margin) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const i of this.grid.get(this.cellKey(cx, cy)) ?? []) out.add(i);
      }
    }
    return out;
  }
}
