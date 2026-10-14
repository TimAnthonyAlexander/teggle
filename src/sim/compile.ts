// Turns a parsed level into the immutable body list the world simulates: one body per level
// element plus the base geometry that the original kept in its `_base` level (walls, ceiling,
// free ball bucket, Pyramid slopes, Fireball cover, flippers, Fever buckets). Compile once per
// level; any number of worlds share the result.

import { cos, sin, sincos, TAU, type SinCos } from '../core/dmath';
import {
  curvedBrickVertices,
  signedArea,
  straightBrickVertices,
  type Vec2,
} from '../level/geometry';
import type { Level, LevelElement, Movement } from '../level/schema';
import { Grid } from './grid';
import { movementPhase, movementPose, type Pose } from './movement';
import {
  BASE_BOUNCY,
  BUCKET_CATCH_HEIGHT,
  BUCKET_CATCH_WIDTH,
  BUCKET_CATCH_Y,
  BUCKET_PHASE,
  BUCKET_REFERENCE_CYCLE,
  BUCKET_REFERENCE_TRAVEL,
  BUCKET_RIM_VERTICES,
  BUCKET_RIM_X,
  BUCKET_RIM_Y,
  BUCKET_TRAVEL_INSET,
  CEILING_BOTTOM,
  CEILING_TOP,
  CIRCLE_BOUNCY,
  CIRCLE_ROLLY,
  COVER_INNER_RADIUS,
  COVER_POINTS,
  COVER_ROTATION,
  COVER_SECTOR,
  COVER_WIDTH,
  COVER_Y,
  FEVER_DIVIDER_RADIUS,
  FEVER_DIVIDER_X,
  FEVER_DIVIDER_Y,
  FEVER_HOLE_HEIGHT,
  FEVER_HOLE_WIDTH,
  FEVER_HOLE_X,
  FEVER_HOLE_Y,
  FEVER_RISE_PERIOD,
  FEVER_RISE_PHASE,
  FEVER_RISE_RADIUS,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LEFT_VERTICES,
  FLIPPER_MAX_ANGLE,
  FLIPPER_MAX_BOUNCE_VELOCITY,
  FLIPPER_PERIOD,
  FLIPPER_PHASE,
  FLIPPER_RIGHT_PIVOT,
  FLIPPER_RIGHT_VERTICES,
  GRID_CELL,
  LINE_BOUNCY,
  LINE_ROLLY,
  ORIGINAL_BOARD_WIDTH,
  PYRAMID_VERTICES,
  PYRAMID_X,
  PYRAMID_Y,
  WALL_BOTTOM_DEPTH,
  WALL_ROLLY,
  WALL_THICKNESS,
  WALL_TOP,
} from './tuning';

/** How a body collides: a circle, a closed polygon (solid, one-sided edges), a two-sided
 * segment, or a trigger box that never collides. */
export type BodyShape = 'circle' | 'polygon' | 'segment' | 'trigger';

/** Where a body came from. Everything but `element` is base geometry. */
export type BodyRole =
  | 'element'
  | 'wall'
  | 'ceiling'
  | 'bucketRim'
  | 'bucketCatch'
  | 'pyramid'
  | 'cover'
  | 'flipper'
  | 'feverDivider'
  | 'feverHole';

/** What drives a body's pose: nothing, the level's movement, or a world-controlled mover. */
export type BodyMotion = 'static' | 'element' | 'bucket' | 'flipper' | 'fever';

/** An edge in a body's local frame: end points, unit direction, length, outward normal. */
export interface LocalEdge {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly ux: number;
  readonly uy: number;
  readonly len: number;
  readonly nx: number;
  readonly ny: number;
}

export interface TeleportDef {
  readonly outDelay: number;
  readonly exit: 'element' | 'point' | 'remove';
  /** Body index of the exit element, or -1. */
  readonly exitBody: number;
  readonly exitX: number;
  readonly exitY: number;
}

export interface BodyDef {
  readonly index: number;
  readonly role: BodyRole;
  /** The level element, or null for base geometry. */
  readonly element: LevelElement | null;
  /** Element id, or -1 for base geometry. */
  readonly id: number;
  readonly shape: BodyShape;
  readonly scoring: boolean;
  readonly quickDisappear: boolean;
  /** The body takes part in collisions at all (a collidable shape with collision on). */
  readonly collides: boolean;
  readonly bouncy: number;
  readonly rolly: number;
  readonly ballStopReset: boolean;
  readonly maxBounceVelocity: number;
  /** Circle radius. */
  readonly radius: number;
  /** Trigger half size and shape. */
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly circular: boolean;
  /** Polygon or segment edges in the local frame (unrotated, relative to the position). */
  readonly localEdges: readonly LocalEdge[];
  readonly motion: BodyMotion;
  /** Anchor at tick 0. For bucket bodies x is the offset from the bucket center. */
  readonly baseX: number;
  readonly baseY: number;
  readonly baseRotation: number;
  readonly movement: Movement | null;
  /** Parent body index for nested movement, or -1. */
  readonly parent: number;
  /** Parent position at tick 0. */
  readonly parentRefX: number;
  readonly parentRefY: number;
  /** Wall side or flipper side for events. */
  readonly side: 'left' | 'right' | 'ceiling' | null;
  /** Fever bucket or divider index, left to right, or -1. */
  readonly feverIndex: number;
  readonly teleport: TeleportDef | null;
}

export interface CompiledLevel {
  readonly level: Level;
  readonly width: number;
  readonly height: number;
  readonly bodies: readonly BodyDef[];
  readonly bodyIndexById: ReadonlyMap<number, number>;
  /** Bodies driven by level movement or a parent, parents before children. */
  readonly elementMotionOrder: readonly number[];
  readonly bucketBodies: readonly number[];
  readonly flipperBodies: readonly number[];
  readonly feverBodies: readonly number[];
  /** Teleports, the bucket catch box and the Fever buckets, in body order. */
  readonly triggers: readonly number[];
  /** Static colliding bodies, binned once. */
  readonly staticGrid: Grid;
  /** Colliding bodies that move; the world bins them every tick. */
  readonly dynamicBodies: readonly number[];
  readonly scoringBodies: readonly number[];
  /** Middle of the bucket's path, its default travel (middle to either end) and its cycle. */
  readonly bucketCenterX: number;
  readonly bucketTravel: number;
  readonly bucketCycle: number;
  /** Body poses at world tick 0. */
  readonly initialPoses: readonly Pose[];
  /** Per body: its movement's pose for every tick of one cycle, or null (see PoseTable). */
  readonly poseTables: readonly (PoseTable | null)[];
  /** cos(phase * TAU) of the bucket mover for every tick of its cycle. */
  readonly bucketWave: Float64Array;
  /** Movers the world drives with its own clocks (research 4.6 and the original `_base`). */
  readonly movers: {
    readonly bucket: Movement;
    readonly leftFlipper: Movement;
    readonly rightFlipper: Movement;
    readonly fever: Movement;
  };
}

/** Grid extent below the board's bottom edge, enough to cover the Fever buckets. */
const GRID_BELOW = 64;
const GRID_ABOVE = 32;

function edgesFromVertices(vertices: readonly Vec2[], closed: boolean): LocalEdge[] {
  const n = vertices.length;
  const sign = closed && signedArea(vertices) < 0 ? -1 : 1;
  const count = closed ? n : n - 1;
  const edges: LocalEdge[] = [];
  for (let i = 0; i < count; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    const ux = ex / len;
    const uy = ey / len;
    edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, ux, uy, len, nx: sign * uy, ny: -sign * ux });
  }
  return edges;
}

function mirror(vertices: readonly Vec2[]): Vec2[] {
  return vertices.map((v) => ({ x: -v.x, y: v.y }));
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

type BodySpec = Omit<BodyDef, 'index' | 'parent' | 'parentRefX' | 'parentRefY'> & {
  readonly parentId?: number | undefined;
};

const blank = {
  element: null,
  id: -1,
  scoring: false,
  quickDisappear: false,
  ballStopReset: false,
  maxBounceVelocity: 0,
  radius: 0,
  halfWidth: 0,
  halfHeight: 0,
  circular: false,
  localEdges: [] as readonly LocalEdge[],
  motion: 'static' as BodyMotion,
  baseRotation: 0,
  movement: null,
  side: null,
  feverIndex: -1,
  teleport: null,
};

function elementSpec(e: LevelElement): BodySpec {
  const common = {
    ...blank,
    role: 'element' as const,
    element: e,
    id: e.id,
    ballStopReset: e.ballStopReset,
    maxBounceVelocity: e.maxBounceVelocity,
    motion: (e.movement !== undefined || e.parent !== undefined
      ? 'element'
      : 'static') as BodyMotion,
    baseX: e.x,
    baseY: e.y,
    movement: e.movement ?? null,
    parentId: e.parent,
  };
  const circleResponse = {
    bouncy: e.bouncy === 0 ? CIRCLE_BOUNCY : e.bouncy,
    rolly: e.rolly === 0 ? CIRCLE_ROLLY : e.rolly,
  };
  const lineResponse = {
    bouncy: e.bouncy === 0 ? LINE_BOUNCY : e.bouncy,
    rolly: e.rolly === 0 ? LINE_ROLLY : e.rolly,
  };
  switch (e.kind) {
    case 'peg':
      return {
        ...common,
        ...circleResponse,
        shape: 'circle',
        scoring: true,
        quickDisappear: e.quickDisappear,
        collides: e.collision,
        radius: e.radius,
      };
    case 'circle':
      return {
        ...common,
        ...circleResponse,
        shape: 'circle',
        collides: e.collision,
        radius: e.radius,
      };
    case 'brick':
      return {
        ...common,
        ...lineResponse,
        shape: 'polygon',
        scoring: true,
        quickDisappear: e.quickDisappear,
        collides: e.collision,
        baseRotation: e.rotation,
        localEdges: edgesFromVertices(straightBrickVertices(e.length, e.width), true),
      };
    case 'curvedBrick':
      return {
        ...common,
        ...lineResponse,
        shape: 'polygon',
        scoring: true,
        quickDisappear: e.quickDisappear,
        collides: e.collision,
        baseRotation: e.rotation,
        localEdges: edgesFromVertices(
          curvedBrickVertices(e.innerRadius, e.width, e.sector, e.points),
          true,
        ),
      };
    case 'polygon':
      return {
        ...common,
        ...lineResponse,
        shape: 'polygon',
        collides: e.collision,
        baseRotation: e.rotation,
        localEdges: edgesFromVertices(e.vertices, true),
      };
    case 'rod':
      return {
        ...common,
        ...lineResponse,
        shape: 'segment',
        collides: e.collision,
        baseRotation: e.rotation,
        localEdges: edgesFromVertices([e.a, e.b], false),
      };
    case 'teleport':
      return {
        ...common,
        ...lineResponse,
        shape: 'trigger',
        collides: false,
        halfWidth: e.width / 2,
        halfHeight: e.height / 2,
        circular: e.circular,
        teleport: {
          outDelay: e.outDelay,
          exit: e.exit.type,
          // Resolved to a body index once every body exists.
          exitBody: e.exit.type === 'element' ? e.exit.element : -1,
          exitX: e.exit.type === 'point' ? e.exit.x : 0,
          exitY: e.exit.type === 'point' ? e.exit.y : 0,
        },
      };
  }
}

/** Base geometry for a board of the given size (spec 14.2 records the derivation). */
function baseSpecs(width: number, height: number): BodySpec[] {
  const specs: BodySpec[] = [];
  const solid = {
    ...blank,
    shape: 'polygon' as const,
    collides: true,
    bouncy: BASE_BOUNCY,
    rolly: LINE_ROLLY,
  };
  const wallBottom = height + WALL_BOTTOM_DEPTH;
  specs.push({
    ...solid,
    role: 'wall',
    side: 'left',
    rolly: WALL_ROLLY,
    baseX: 0,
    baseY: 0,
    localEdges: edgesFromVertices(rectangle(-WALL_THICKNESS, WALL_TOP, 0, wallBottom), true),
  });
  specs.push({
    ...solid,
    role: 'wall',
    side: 'right',
    rolly: WALL_ROLLY,
    baseX: width,
    baseY: 0,
    localEdges: edgesFromVertices(rectangle(0, WALL_TOP, WALL_THICKNESS, wallBottom), true),
  });
  specs.push({
    ...solid,
    role: 'ceiling',
    side: 'ceiling',
    baseX: 0,
    baseY: 0,
    localEdges: edgesFromVertices(
      rectangle(-WALL_THICKNESS, CEILING_TOP, width + WALL_THICKNESS, CEILING_BOTTOM),
      true,
    ),
  });

  const bucket = { ...solid, motion: 'bucket' as const };
  specs.push({
    ...bucket,
    role: 'bucketRim',
    baseX: -BUCKET_RIM_X,
    baseY: height + BUCKET_RIM_Y,
    localEdges: edgesFromVertices(BUCKET_RIM_VERTICES, true),
  });
  specs.push({
    ...bucket,
    role: 'bucketRim',
    baseX: BUCKET_RIM_X,
    baseY: height + BUCKET_RIM_Y,
    localEdges: edgesFromVertices(mirror(BUCKET_RIM_VERTICES), true),
  });
  specs.push({
    ...bucket,
    role: 'pyramid',
    baseX: -PYRAMID_X,
    baseY: height + PYRAMID_Y,
    localEdges: edgesFromVertices(PYRAMID_VERTICES, true),
  });
  specs.push({
    ...bucket,
    role: 'pyramid',
    baseX: PYRAMID_X,
    baseY: height + PYRAMID_Y,
    localEdges: edgesFromVertices(mirror(PYRAMID_VERTICES), true),
  });
  specs.push({
    ...bucket,
    role: 'cover',
    baseX: 0,
    baseY: height + COVER_Y,
    baseRotation: COVER_ROTATION,
    localEdges: edgesFromVertices(
      curvedBrickVertices(COVER_INNER_RADIUS, COVER_WIDTH, COVER_SECTOR, COVER_POINTS),
      true,
    ),
  });
  specs.push({
    ...bucket,
    role: 'bucketCatch',
    shape: 'trigger',
    collides: false,
    baseX: 0,
    baseY: height + BUCKET_CATCH_Y,
    halfWidth: BUCKET_CATCH_WIDTH / 2,
    halfHeight: BUCKET_CATCH_HEIGHT / 2,
  });

  const flipper = {
    ...blank,
    shape: 'polygon' as const,
    collides: true,
    motion: 'flipper' as const,
    bouncy: LINE_BOUNCY,
    rolly: LINE_ROLLY,
    ballStopReset: true,
    maxBounceVelocity: FLIPPER_MAX_BOUNCE_VELOCITY,
  };
  specs.push({
    ...flipper,
    role: 'flipper',
    side: 'left',
    baseX: FLIPPER_LEFT_PIVOT.x,
    baseY: height + FLIPPER_LEFT_PIVOT.y,
    baseRotation: FLIPPER_MAX_ANGLE,
    localEdges: edgesFromVertices(FLIPPER_LEFT_VERTICES, true),
  });
  specs.push({
    ...flipper,
    role: 'flipper',
    side: 'right',
    baseX: width - FLIPPER_RIGHT_PIVOT.x,
    baseY: height + FLIPPER_RIGHT_PIVOT.y,
    baseRotation: -FLIPPER_MAX_ANGLE,
    localEdges: edgesFromVertices(FLIPPER_RIGHT_VERTICES, true),
  });

  // Fever parts scale horizontally with the board so every bucket keeps its share of the width;
  // the dividers grow downward, keeping their tops at the original height.
  const scale = width / ORIGINAL_BOARD_WIDTH;
  const dividerRadius = FEVER_DIVIDER_RADIUS * scale;
  FEVER_DIVIDER_X.forEach((x, i) => {
    const top = (FEVER_DIVIDER_Y[i] ?? 0) - FEVER_DIVIDER_RADIUS;
    specs.push({
      ...blank,
      role: 'feverDivider',
      shape: 'circle',
      collides: true,
      motion: 'fever',
      bouncy: CIRCLE_BOUNCY,
      rolly: CIRCLE_ROLLY,
      radius: dividerRadius,
      baseX: x * scale,
      baseY: height + top + dividerRadius,
      feverIndex: i,
    });
  });
  FEVER_HOLE_X.forEach((x, i) => {
    specs.push({
      ...blank,
      role: 'feverHole',
      shape: 'trigger',
      collides: false,
      motion: 'fever',
      bouncy: LINE_BOUNCY,
      rolly: LINE_ROLLY,
      baseX: x * scale,
      baseY: height + FEVER_HOLE_Y,
      halfWidth: (FEVER_HOLE_WIDTH * scale) / 2,
      halfHeight: FEVER_HOLE_HEIGHT / 2,
      feverIndex: i,
    });
  });
  return specs;
}

/**
 * A movement's pose at every tick of one cycle, relative to its anchor. A movement repeats
 * exactly after `cycle` ticks (the period, plus both pauses when pauses run; research 3.2), and
 * movementPose adds the anchor last, so anchor + table entry has the same bits as calling
 * movementPose. Entry k (stride 5) holds dx, dy, rotation, cos(rotation), sin(rotation) for
 * every tick t with t mod cycle = k.
 */
export interface PoseTable {
  readonly cycle: number;
  readonly data: Float64Array;
}

/** Longer cycles are computed every tick instead of tabulated, to bound memory. */
const MAX_TABLE_CYCLE = 6000;

function movementCycle(m: Movement): number {
  return m.pause1 > 0 ? m.period + m.pause1 + m.pause2 : m.period;
}

function buildPoseTable(m: Movement, baseRotation: number): PoseTable | null {
  const cycle = movementCycle(m);
  if (cycle > MAX_TABLE_CYCLE) return null;
  const data = new Float64Array(cycle * 5);
  const pose: Pose = { x: 0, y: 0, rotation: 0 };
  const sc: SinCos = { sin: 0, cos: 0 };
  for (let k = 0; k < cycle; k++) {
    movementPose(m, 0, 0, baseRotation, k, pose);
    sincos(pose.rotation, sc);
    data[5 * k] = pose.x;
    data[5 * k + 1] = pose.y;
    data[5 * k + 2] = pose.rotation;
    data[5 * k + 3] = sc.cos;
    data[5 * k + 4] = sc.sin;
  }
  return { cycle, data };
}

/**
 * A movement with every field set in one fixed order. Objects of one shape keep property reads
 * on the hot path monomorphic in the JS engine; parsed level data comes in many key orders.
 */
function normalizeMovement(m: Movement): Movement {
  return {
    type: m.type,
    reverse: m.reverse,
    period: m.period,
    offset: m.offset,
    phase: m.phase,
    radius: m.radius,
    radius2: m.radius2,
    pathRotation: m.pathRotation,
    maxAngle: m.maxAngle,
    pause1: m.pause1,
    pause1At: m.pause1At,
    pause2: m.pause2,
    pause2At: m.pause2At,
    postDelayPhase: m.postDelayPhase,
  };
}

function mover(fields: Pick<Movement, 'type' | 'period' | 'phase'> & Partial<Movement>): Movement {
  return normalizeMovement({
    reverse: false,
    offset: 0,
    radius: 0,
    radius2: 0,
    pathRotation: 0,
    maxAngle: 0,
    pause1: 0,
    pause1At: 0,
    pause2: 0,
    pause2At: 0,
    postDelayPhase: 0,
    ...fields,
  });
}

function flipperMover(reverse: boolean): Movement {
  return mover({
    type: 'rotateBackAndForth',
    reverse,
    period: FLIPPER_PERIOD,
    phase: FLIPPER_PHASE,
    maxAngle: FLIPPER_MAX_ANGLE,
  });
}

export function compileLevel(level: Level): CompiledLevel {
  const width = level.board.width;
  const height = level.board.height;
  const specs = [...level.elements.map(elementSpec), ...baseSpecs(width, height)];

  const bodyIndexById = new Map<number, number>();
  specs.forEach((s, index) => {
    if (s.id >= 0) bodyIndexById.set(s.id, index);
  });
  const indexOf = (id: number): number => {
    const index = bodyIndexById.get(id);
    if (index === undefined) throw new Error(`level references unknown element ${id}`);
    return index;
  };

  // Parents before children (research 3.4). parseLevel has already rejected cycles.
  const order: number[] = [];
  const placed = new Set<number>();
  const place = (index: number): void => {
    if (placed.has(index)) return;
    const spec = specs[index];
    if (spec === undefined) return;
    if (spec.parentId !== undefined) place(indexOf(spec.parentId));
    placed.add(index);
    if (spec.motion === 'element') order.push(index);
  };
  specs.forEach((_, index) => {
    place(index);
  });

  // Poses at tick 0, so children know where their parent started.
  const poses: Pose[] = specs.map((s) => ({ x: s.baseX, y: s.baseY, rotation: s.baseRotation }));
  const parentRef = specs.map(() => ({ x: 0, y: 0 }));
  for (const index of order) {
    const spec = specs[index];
    const pose = poses[index];
    const ref = parentRef[index];
    if (spec === undefined || pose === undefined || ref === undefined) continue;
    if (spec.parentId !== undefined) {
      // At tick 0 the parent is at its reference position, so the anchor is (x, y) itself.
      const parentPose = poses[indexOf(spec.parentId)];
      if (parentPose !== undefined) {
        ref.x = parentPose.x;
        ref.y = parentPose.y;
      }
    }
    if (spec.movement !== null) {
      movementPose(spec.movement, spec.baseX, spec.baseY, spec.baseRotation, 0, pose);
    }
  }

  const bucketCenterX = width / 2;
  const bucketTravel = width / 2 - BUCKET_TRAVEL_INSET;
  // Same peak speed as the original's 260 px travel in 600 ticks.
  const bucketCycle = Math.max(
    1,
    Math.round((BUCKET_REFERENCE_CYCLE * bucketTravel) / BUCKET_REFERENCE_TRAVEL),
  );
  // One object literal with a fixed key order, so every body has the same engine shape.
  const bodies: BodyDef[] = specs.map((s, index) => {
    const ref = parentRef[index] ?? { x: 0, y: 0 };
    const tp = s.teleport;
    return {
      index,
      role: s.role,
      element: s.element,
      id: s.id,
      shape: s.shape,
      scoring: s.scoring,
      quickDisappear: s.quickDisappear,
      collides: s.collides,
      bouncy: s.bouncy,
      rolly: s.rolly,
      ballStopReset: s.ballStopReset,
      maxBounceVelocity: s.maxBounceVelocity,
      radius: s.radius,
      halfWidth: s.halfWidth,
      halfHeight: s.halfHeight,
      circular: s.circular,
      localEdges: s.localEdges,
      motion: s.motion,
      baseX: s.baseX,
      baseY: s.baseY,
      baseRotation: s.baseRotation,
      movement: s.movement === null ? null : normalizeMovement(s.movement),
      parent: s.parentId === undefined ? -1 : indexOf(s.parentId),
      parentRefX: ref.x,
      parentRefY: ref.y,
      side: s.side,
      feverIndex: s.feverIndex,
      teleport:
        tp === null
          ? null
          : {
              outDelay: tp.outDelay,
              exit: tp.exit,
              exitBody: tp.exit === 'element' ? indexOf(tp.exitBody) : -1,
              exitX: tp.exitX,
              exitY: tp.exitY,
            },
    };
  });
  const staticBodies = bodies.filter((b) => b.collides && b.motion === 'static');
  const staticGrid = new Grid(0, -GRID_ABOVE, width, height + GRID_ABOVE + GRID_BELOW, GRID_CELL);
  const ids = new Int32Array(staticBodies.length);
  const boxes = new Float64Array(staticBodies.length * 4);
  staticBodies.forEach((b, k) => {
    ids[k] = b.index;
    const box = bodyBox(b, poses[b.index] ?? { x: 0, y: 0, rotation: 0 });
    boxes.set(box, 4 * k);
  });
  staticGrid.build(staticBodies.length, ids, boxes);

  // Bodies with the same movement and rotation share one table (rings, platforms, rows).
  const tableCache = new Map<string, PoseTable | null>();
  const poseTables = bodies.map((b) => {
    if (b.movement === null) return null;
    const key = JSON.stringify([b.movement, b.baseRotation]);
    let table = tableCache.get(key);
    if (table === undefined) {
      table = buildPoseTable(b.movement, b.baseRotation);
      tableCache.set(key, table);
    }
    return table;
  });

  const bucketMover = mover({
    type: 'horizontalCycle',
    period: bucketCycle,
    phase: BUCKET_PHASE,
    radius: bucketTravel,
  });
  const bucketWave = new Float64Array(bucketCycle);
  for (let k = 0; k < bucketCycle; k++) bucketWave[k] = cos(movementPhase(bucketMover, k) * TAU);

  const indicesWhere = (f: (b: BodyDef) => boolean): number[] =>
    bodies.filter(f).map((b) => b.index);
  return {
    level,
    width,
    height,
    bodies,
    bodyIndexById,
    elementMotionOrder: order,
    bucketBodies: indicesWhere((b) => b.motion === 'bucket'),
    flipperBodies: indicesWhere((b) => b.motion === 'flipper'),
    feverBodies: indicesWhere((b) => b.motion === 'fever'),
    triggers: indicesWhere((b) => b.shape === 'trigger'),
    staticGrid,
    dynamicBodies: indicesWhere((b) => b.collides && b.motion !== 'static'),
    scoringBodies: indicesWhere((b) => b.scoring),
    bucketCenterX,
    bucketTravel,
    bucketCycle,
    initialPoses: poses,
    poseTables,
    bucketWave,
    movers: {
      bucket: bucketMover,
      leftFlipper: flipperMover(false),
      rightFlipper: flipperMover(true),
      fever: mover({
        type: 'verticalCycle',
        period: FEVER_RISE_PERIOD,
        phase: FEVER_RISE_PHASE,
        radius: FEVER_RISE_RADIUS,
      }),
    },
  };
}

/** Bounding box [minX, minY, maxX, maxY] of a body at a pose. */
export function bodyBox(b: BodyDef, pose: Pose): [number, number, number, number] {
  if (b.shape === 'circle') {
    return [pose.x - b.radius, pose.y - b.radius, pose.x + b.radius, pose.y + b.radius];
  }
  if (b.shape === 'trigger') {
    return [
      pose.x - b.halfWidth,
      pose.y - b.halfHeight,
      pose.x + b.halfWidth,
      pose.y + b.halfHeight,
    ];
  }
  const c = cos(pose.rotation);
  const s = sin(pose.rotation);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of b.localEdges) {
    for (const [lx, ly] of [
      [e.ax, e.ay],
      [e.bx, e.by],
    ] as const) {
      const x = pose.x + lx * c + ly * s;
      const y = pose.y - lx * s + ly * c;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}
