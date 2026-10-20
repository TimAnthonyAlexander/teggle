// Converts the original game's 55 campaign levels into Teggle levels at run time, at their own
// 650 x 560 board size, so the self-play report can measure them next to Teggle's levels. The
// owner's copy is unpacked locally to reference/ (gitignored); nothing converted here is ever
// written into the repo, only statistics derived from playing it.
//
// Input: the JSON dumps of the level files (docs/research/original-tech.md section 2 describes
// the fields). What carries over: round pegs and bricks (straight and curved) with their
// can-be-orange and quick-disappear flags, solid circles, polygons and rods, teleports, and every
// movement with its nesting. Images, colors, sounds and logic tags do not; the one logic tag in
// the campaign (`movetoggle`, the fish in stage 5 level 2 that jumps to the other side when hit)
// is played as a plain mover. A solid the original does not draw (its picture shows it) is not
// drawn either; teleports always are, since the images that mark them stay behind. Reading
// choices, from comparing the data with the layouts it draws:
//
// - References (teleport destinations, shared movers, parent movers) name an object's id plus
//   one, as the fan editor numbers them; the dumps number from 2.
// - A brick's angle builds its shape; a mover's rotation turns it on top of that, so a moving
//   brick's base rotation is its angle plus the mover's rotation. A moving polygon takes the
//   mover's rotation (its own stored rotation is the state at save time).
// - A mover with a parent mover rides on it as Teggle's element nesting does: a parent that no
//   element carries gets an invisible, non-colliding carrier element.
// - Polygons that are not simple closed outlines become one rod per edge.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { PI } from '../../src/core/dmath';
import {
  curvedBrickVertices,
  findSelfIntersection,
  signedArea,
  straightBrickVertices,
  type Vec2,
} from '../../src/level/geometry';
import {
  MOVEMENT_TYPES,
  parseLevel,
  type Level,
  type LevelElementInput,
  type Movement,
  type MovementType,
} from '../../src/level/schema';
import { movementPose, type Pose } from '../../src/sim/movement';

/** Where the owner's copy of the original levels is dumped (gitignored, never committed). */
export const ORIGINAL_LEVELS_DIR = 'reference/peggle-2007/levels-json';
export const ORIGINAL_BOARD = { width: 650, height: 560 } as const;

/** The original campaign in play order: stage s, level l is entry 5 (s - 1) + l - 1. */
// prettier-ignore
export const ORIGINAL_CAMPAIGN: readonly string[] = [
  'level1', 'level2', 'level3', 'level4', 'level5',
  'plinko', 'ram', 'threevalleys', 'spiral', 'owl',
  'totempole', 'infinity', 'eye', 'fourdoors', 'fever',
  'theamoeban', '3d', 'bug', 'spaceballs', 'sunflower',
  'threehills', 'toggle', 'sine', 'infinitejest', 'sideaction',
  'waves', 'spiderweb', 'blockers', 'baseball', 'vermin',
  'windmills', 'tulips', 'tubing', 'car', 'sunny',
  'monkey', 'pinball', 'cyclops', 'dice', 'cards',
  'paperclips', 'gateway', 'blocks', 'hollywoodcircles', 'bunches',
  'spincycle', 'vortex', 'holes', 'yinyang', 'doublehelix',
  'whirlpool', 'crisscross', 'blindfold', 'aim', 'dna',
];

// ---------------------------------------------------------------------------------------------
// Input schema: only the fields the conversion reads; everything else passes through unread.

interface RawMover {
  readonly type?: number | undefined;
  readonly anchorX?: number | undefined;
  readonly anchorY?: number | undefined;
  readonly time?: number | undefined;
  readonly offset?: number | undefined;
  readonly radius?: number | undefined;
  readonly radius2?: number | undefined;
  readonly phase?: number | null | undefined;
  readonly moveRotation?: number | null | undefined;
  readonly maxAngle?: number | null | undefined;
  readonly rotation?: number | null | undefined;
  readonly pause1?: number | undefined;
  readonly pause2?: number | undefined;
  readonly phase1?: number | undefined;
  readonly phase2?: number | undefined;
  readonly postDelayPhase?: number | null | undefined;
  readonly parentX?: number | undefined;
  readonly parentY?: number | undefined;
  readonly parent?: RawMover | undefined;
  readonly moverId?: number | undefined;
  readonly moverRef?: number | undefined;
}

const num = z.number().optional();
const loose = z.number().nullable().optional();

const moverSchema: z.ZodType<RawMover> = z.lazy(() =>
  z.looseObject({
    type: z.int().optional(),
    anchorX: num,
    anchorY: num,
    time: z.int().optional(),
    offset: z.int().optional(),
    radius: num,
    radius2: num,
    phase: loose,
    moveRotation: loose,
    maxAngle: loose,
    rotation: loose,
    pause1: z.int().optional(),
    pause2: z.int().optional(),
    phase1: z.int().optional(),
    phase2: z.int().optional(),
    postDelayPhase: loose,
    parentX: num,
    parentY: num,
    parent: moverSchema.optional(),
    moverId: z.int().optional(),
    moverRef: z.int().optional(),
  }),
);

interface RawEntry {
  readonly id?: number | undefined;
  readonly cls?: number | undefined;
  readonly backref?: number | undefined;
  readonly bits?:
    | {
        readonly collideable: boolean;
        readonly ballstopreset: boolean;
        readonly visible?: boolean | undefined;
      }
    | undefined;
  readonly peg?: { readonly canBeOrange: boolean; readonly crumble: boolean } | undefined;
  readonly mover?: RawMover | undefined;
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly radius?: number | undefined;
  readonly verts?: readonly (readonly [number, number])[] | undefined;
  readonly rotation?: number | null | undefined;
  readonly x1?: number | undefined;
  readonly y1?: number | undefined;
  readonly x2?: number | undefined;
  readonly y2?: number | undefined;
  readonly straight?: boolean | undefined;
  readonly length?: number | undefined;
  readonly angle?: number | undefined;
  readonly width?: number | undefined;
  readonly sector?: number | undefined;
  readonly curveRaw?: number | undefined;
  readonly w?: number | undefined;
  readonly h?: number | undefined;
  readonly circular?: boolean | undefined;
  readonly outDelay?: number | undefined;
  readonly dest?: RawEntry | undefined;
}

const entrySchema: z.ZodType<RawEntry> = z.lazy(() =>
  z.looseObject({
    id: z.int().optional(),
    cls: z.int().optional(),
    backref: z.int().optional(),
    bits: z
      .looseObject({
        collideable: z.boolean(),
        ballstopreset: z.boolean(),
        visible: z.boolean().optional(),
      })
      .optional(),
    peg: z.looseObject({ canBeOrange: z.boolean(), crumble: z.boolean() }).optional(),
    mover: moverSchema.optional(),
    x: num,
    y: num,
    radius: num,
    verts: z.array(z.tuple([z.number(), z.number()])).optional(),
    rotation: loose,
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    straight: z.boolean().optional(),
    length: num,
    angle: num,
    width: num,
    sector: num,
    curveRaw: z.int().optional(),
    w: num,
    h: num,
    circular: z.boolean().optional(),
    outDelay: z.int().optional(),
    dest: entrySchema.optional(),
  }),
);

const fileSchema = z.looseObject({ entries: z.array(entrySchema) });

export class OriginalLevelError extends Error {
  override readonly name = 'OriginalLevelError';
}

// ---------------------------------------------------------------------------------------------
// Conversion

const DEG = PI / 180;
/** Ids of carrier elements: this plus the mover's id. Rods split from a polygon: see rodId. */
const CARRIER_ID_BASE = 1_000_000;
const ROD_ID_BASE = 2_000_000;

type Known = { readonly kind: 'entry'; readonly entry: RawEntry } | MoverKnown;
interface MoverKnown {
  readonly kind: 'mover';
  readonly mover: RawMover;
  /** The entry whose own mover this is, or null for a parent defined inline. */
  readonly owner: RawEntry | null;
}

class Converter {
  private readonly known = new Map<number, Known>();
  private readonly out: LevelElementInput[] = [];
  /** Teggle element id that carries each mover (by the mover's id). */
  private readonly carriers = new Map<number, number>();
  /** Each element's placement, to find a parent's position at tick 0. */
  private readonly placed = new Map<number, Placement>();
  /** Entries converted to an element that carries their own mover. */
  private readonly converted = new Set<RawEntry>();

  constructor(private readonly entries: readonly RawEntry[]) {
    for (const e of entries) this.index(e);
  }

  convert(): LevelElementInput[] {
    // Entries that become colliding elements carry their own movers; mark them first so a
    // parent reference resolves to them rather than to a new carrier.
    for (const e of this.entries) if (this.becomesElement(e)) this.converted.add(e);
    for (const e of this.entries) this.entry(e);
    return this.out;
  }

  private index(e: RawEntry): void {
    if (e.id !== undefined && e.backref === undefined)
      this.known.set(e.id, { kind: 'entry', entry: e });
    if (e.mover !== undefined) this.indexMover(e.mover, e);
    if (e.dest !== undefined) this.index(e.dest);
  }

  private indexMover(m: RawMover, owner: RawEntry | null): void {
    if (m.moverId !== undefined) this.known.set(m.moverId, { kind: 'mover', mover: m, owner });
    if (m.parent !== undefined) this.indexMover(m.parent, null);
  }

  /** The object a reference names: its id plus one. */
  private lookup(ref: number): Known {
    const k = this.known.get(ref - 1);
    if (k === undefined) throw new OriginalLevelError(`reference ${ref} names no object`);
    return k;
  }

  /** A mover link resolved to its definition (shared movers name an earlier one). */
  private resolveMover(m: RawMover): MoverKnown {
    if (m.moverRef === undefined) {
      if (m.moverId === undefined) throw new OriginalLevelError('a mover has no id');
      const k = this.known.get(m.moverId);
      if (k?.kind !== 'mover') throw new OriginalLevelError(`mover ${m.moverId} is not indexed`);
      return k;
    }
    const k = this.lookup(m.moverRef);
    if (k.kind === 'mover') return k;
    if (k.entry.mover === undefined) {
      throw new OriginalLevelError(`reference ${m.moverRef} names an object without a mover`);
    }
    return this.resolveMover(k.entry.mover);
  }

  private becomesElement(e: RawEntry): boolean {
    if (e.backref !== undefined) return false;
    const collide = e.bits?.collideable ?? true;
    switch (e.cls) {
      case 5:
      case 6:
        return e.peg !== undefined || collide;
      case 2:
      case 3:
      case 8:
        return collide;
      default:
        return false;
    }
  }

  /** Movement, anchor and parent of an element on mover `m` (its own or shared). */
  private motion(m: RawMover): Placement {
    const def = this.resolveMover(m).mover;
    const type = Math.abs(def.type ?? 0);
    const name = MOVEMENT_TYPE_BY_NUMBER[type];
    if (name === undefined) {
      throw new OriginalLevelError(`movement type ${String(def.type)} is not played`);
    }
    const movement: Movement = {
      type: name,
      reverse: (def.type ?? 0) < 0,
      period: def.time ?? 1,
      offset: def.offset ?? 0,
      phase: def.phase ?? 0,
      radius: def.radius ?? 0,
      radius2: def.radius2 ?? 0,
      pathRotation: def.moveRotation ?? 0,
      maxAngle: def.maxAngle ?? 0,
      pause1: def.pause1 ?? 0,
      pause1At: def.phase1 ?? 0,
      pause2: def.pause2 ?? 0,
      pause2At: def.phase2 ?? 0,
      postDelayPhase: def.postDelayPhase ?? 0,
    };
    let x = def.anchorX ?? 0;
    let y = def.anchorY ?? 0;
    if (def.parent === undefined) return { x, y, movement };
    // The original moves the anchor by the parent's displacement since the level was saved;
    // Teggle by its displacement since tick 0. Shift the anchor so the two agree.
    const parent = this.carrierOf(this.resolveMover(def.parent));
    const p0 = this.poseAtZero(parent);
    x += p0.x - (def.parentX ?? p0.x);
    y += p0.y - (def.parentY ?? p0.y);
    return { x, y, movement, parent };
  }

  /** Where an element is at tick 0: its anchor moved along its movement. */
  private poseAtZero(id: number): Pose {
    const p = this.placed.get(id);
    if (p === undefined) throw new OriginalLevelError(`element ${id} is used before it exists`);
    const pose: Pose = { x: p.x, y: p.y, rotation: 0 };
    return p.movement === undefined ? pose : movementPose(p.movement, p.x, p.y, 0, 0, pose);
  }

  /** The element that carries a mover: its owner when that became an element, else a carrier. */
  private carrierOf(k: MoverKnown): number {
    const id = k.mover.moverId ?? -1;
    const known = this.carriers.get(id);
    if (known !== undefined) return known;
    const owner = k.owner;
    if (owner?.id !== undefined && this.converted.has(owner)) {
      // The owner may come later in file order; convert it now so it exists first.
      this.entry(owner);
      if (this.placed.has(owner.id)) {
        this.carriers.set(id, owner.id);
        return owner.id;
      }
    }
    const carrier = CARRIER_ID_BASE + id;
    this.carriers.set(id, carrier);
    const at = this.motion(k.mover);
    this.push(
      {
        kind: 'circle',
        ...placementFields(at),
        id: carrier,
        radius: 1,
        collision: false,
        visible: false,
      },
      at,
    );
    return carrier;
  }

  private push(e: LevelElementInput, at: Placement): void {
    this.out.push(e);
    this.placed.set(e.id, at);
  }

  /** Position, movement and parent of an entry: its own, or its mover's. */
  private place(e: RawEntry): Placement {
    if (e.mover === undefined) return { x: e.x ?? 0, y: e.y ?? 0 };
    return this.motion(e.mover);
  }

  private entry(e: RawEntry): void {
    const id = e.id;
    if (id === undefined || !this.becomesElement(e) || this.placed.has(id)) return;
    const at = this.place(e);
    const common: CommonFields = {
      ...placementFields(at),
      id,
      ballStopReset: e.bits?.ballstopreset ?? false,
    };
    const moverRotation =
      e.mover === undefined ? 0 : (this.resolveMover(e.mover).mover.rotation ?? 0);
    // Pegs and bricks are always drawn; a solid as the original draws it.
    const solid: CommonFields = (e.bits?.visible ?? true) ? common : { ...common, visible: false };
    switch (e.cls) {
      case 5:
        if (e.peg !== undefined) {
          this.push(
            {
              kind: 'peg',
              ...common,
              radius: e.radius ?? 10,
              canBeOrange: e.peg.canBeOrange,
              quickDisappear: e.peg.crumble,
            },
            at,
          );
        } else {
          this.push({ kind: 'circle', ...solid, radius: e.radius ?? 10 }, at);
        }
        return;
      case 6: {
        const rotation = (e.angle ?? 0) * DEG + moverRotation;
        const width = e.width ?? 20;
        const length = e.length ?? 30;
        const sector = (e.sector ?? 30) * DEG;
        const points = e.curveRaw === undefined ? 4 : e.curveRaw + 2;
        if (e.peg !== undefined) {
          const flags = { canBeOrange: e.peg.canBeOrange, quickDisappear: e.peg.crumble };
          if (e.straight === true) {
            this.push({ kind: 'brick', ...common, ...flags, rotation, length, width }, at);
          } else {
            this.push(
              {
                kind: 'curvedBrick',
                ...common,
                ...flags,
                rotation,
                innerRadius: length,
                width,
                sector,
                points,
              },
              at,
            );
          }
        } else {
          const vertices =
            e.straight === true
              ? straightBrickVertices(length, width)
              : curvedBrickVertices(length, width, sector, points);
          this.polygon(solid, at, vertices, rotation);
        }
        return;
      }
      case 3: {
        const raw = e.verts ?? [];
        const vertices = raw.map(([x, y]) => ({ x, y }));
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        const closed =
          first !== undefined && last !== undefined && first.x === last.x && first.y === last.y;
        if (closed) vertices.pop();
        const rotation = e.mover === undefined ? (e.rotation ?? 0) : moverRotation;
        if (closed) this.polygon(solid, at, vertices, rotation);
        else this.rods(solid, at, vertices, rotation, false);
        return;
      }
      case 2: {
        // Rods never move in the campaign; a rod sits at its midpoint.
        const x = ((e.x1 ?? 0) + (e.x2 ?? 0)) / 2;
        const y = ((e.y1 ?? 0) + (e.y2 ?? 0)) / 2;
        const a = { x: (e.x1 ?? 0) - x, y: (e.y1 ?? 0) - y };
        const b = { x: (e.x2 ?? 0) - x, y: (e.y2 ?? 0) - y };
        this.push({ kind: 'rod', ...solid, x, y, a, b }, { x, y });
        return;
      }
      case 8:
        this.push(
          {
            kind: 'teleport',
            ...common,
            width: e.w ?? 20,
            height: e.h ?? 20,
            circular: e.circular ?? false,
            outDelay: e.outDelay ?? 0,
            exit: this.exitOf(e.dest),
          },
          at,
        );
        return;
      default:
        return;
    }
  }

  private polygon(
    common: CommonFields,
    at: Placement,
    vertices: readonly Vec2[],
    rotation: number,
  ): void {
    const simple =
      vertices.length >= 3 && signedArea(vertices) !== 0 && findSelfIntersection(vertices) === null;
    if (simple) {
      this.push({ kind: 'polygon', ...common, rotation, vertices: vertices.slice() }, at);
    } else {
      this.rods(common, at, vertices, rotation, true);
    }
  }

  /** One rod per edge, each anchored at the shape's position so it moves and turns with it. */
  private rods(
    common: CommonFields,
    at: Placement,
    vertices: readonly Vec2[],
    rotation: number,
    closed: boolean,
  ): void {
    const n = vertices.length;
    const count = closed ? n : n - 1;
    for (let k = 0; k < count; k++) {
      const a = vertices[k];
      const b = vertices[(k + 1) % n];
      if (a === undefined || b === undefined || (a.x === b.x && a.y === b.y)) continue;
      const id = ROD_ID_BASE + common.id * 64 + k;
      this.push({ kind: 'rod', ...common, id, rotation, a, b }, at);
    }
  }

  private exitOf(
    dest: RawEntry | undefined,
  ): { type: 'element'; element: number } | { type: 'point'; x: number; y: number } {
    if (dest === undefined) throw new OriginalLevelError('a teleport has no destination');
    const k: Known =
      dest.backref !== undefined ? this.lookup(dest.backref) : { kind: 'entry', entry: dest };
    if (k.kind === 'mover') return { type: 'element', element: this.carrierOf(k) };
    const target = k.entry;
    if (target.id !== undefined && this.converted.has(target)) {
      this.entry(target);
      return { type: 'element', element: target.id };
    }
    if (target.mover !== undefined) {
      return { type: 'element', element: this.carrierOf(this.resolveMover(target.mover)) };
    }
    return { type: 'point', x: target.x ?? 0, y: target.y ?? 0 };
  }
}

/** Where an element sits: its anchor, and its movement and parent if it moves. */
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly movement?: Movement;
  readonly parent?: number;
}

interface CommonFields {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly movement?: Movement;
  readonly parent?: number;
  readonly ballStopReset: boolean;
  /** Left out (drawn) unless the original hides the solid. */
  readonly visible?: false;
}

function placementFields(at: Placement): Omit<CommonFields, 'id' | 'ballStopReset' | 'visible'> {
  return {
    x: at.x,
    y: at.y,
    ...(at.movement === undefined ? {} : { movement: at.movement }),
    ...(at.parent === undefined ? {} : { parent: at.parent }),
  };
}

/** Teggle's movement names by the original's type number (1 to 13; 10 has no movement). */
const MOVEMENT_TYPE_BY_NUMBER: Readonly<Record<number, MovementType>> = Object.fromEntries(
  MOVEMENT_TYPES.map((name, i) => [i < 9 ? i + 1 : i + 2, name]),
);

/** Reads one dumped level file. The dumps write NaN for unset floats, which JSON lacks. */
export function readOriginalFile(path: string): RawEntry[] {
  const text = readFileSync(path, 'utf8').replace(/:\s*-?NaN\b/g, ': null');
  const parsed = fileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new OriginalLevelError(`${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data.entries;
}

/** Converts the entries of one original level into a Teggle level on the 650 x 560 board. */
export function convertOriginal(name: string, entries: readonly RawEntry[]): Level {
  const elements = new Converter(entries).convert();
  return parseLevel({
    formatVersion: 1,
    name,
    background: 'none',
    board: ORIGINAL_BOARD,
    elements,
  });
}

export interface OriginalLevel {
  /** "1-3": stage and level in the original's campaign. */
  readonly id: string;
  /** Campaign number, 1 to 55. */
  readonly number: number;
  readonly stage: number;
  readonly file: string;
  readonly level: Level;
}

/** Finds the dump of a campaign level's file, matching its name without regard to case. */
function fileFor(dir: string, name: string): string {
  const match = readdirSync(dir).find((f) => f.toLowerCase() === `${name}.json`);
  if (match === undefined) throw new OriginalLevelError(`${dir} has no dump of "${name}"`);
  return join(dir, match);
}

/** Loads and converts original campaign level `number` (1 to 55). */
export function loadOriginal(number: number, dir = ORIGINAL_LEVELS_DIR): OriginalLevel {
  const name = ORIGINAL_CAMPAIGN[number - 1];
  if (name === undefined) throw new OriginalLevelError(`there is no campaign level ${number}`);
  const stage = Math.ceil(number / 5);
  const id = `${stage}-${number - (stage - 1) * 5}`;
  const file = fileFor(dir, name);
  return {
    id,
    number,
    stage,
    file,
    level: convertOriginal(`original ${id}`, readOriginalFile(file)),
  };
}
