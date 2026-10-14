// Teggle level file format, version 1.
//
// Units follow the original game: board pixels (x right, y down), ball radius 6, standard peg
// radius 10, time in ticks of 1/100 s, angles in radians turning counterclockwise on screen.
// The format is a cleaned-up reading of the original's level entries (research section 2):
// no binary-format artifacts, no emitters, and every element has a stable integer id.
//
// Every element has an anchor (x, y). Without a movement that is its position. With a
// movement, the movement's path runs around the anchor (research 3.3). With a parent, the
// anchor rides on the parent's position: anchor(t) = (x, y) + parent(t) - parent(0), so every
// coordinate in the file is the layout at world tick 0 (research 3.4).

import { z } from 'zod';
import { TAU } from '../core/dmath';
import { findSelfIntersection, signedArea } from './geometry';

export const FORMAT_VERSION = 1;

/** The twelve movement types of the 2007 game (research 3.3); RetraceCircle is expansion-only. */
export const MOVEMENT_TYPES = [
  'verticalCycle',
  'horizontalCycle',
  'circle',
  'horizontalInfinity',
  'verticalInfinity',
  'horizontalArc',
  'verticalArc',
  'rotate',
  'rotateBackAndForth',
  'verticalWrap',
  'horizontalWrap',
  'rotateAroundCircle',
] as const;

const vec2Schema = z.strictObject({ x: z.number(), y: z.number() });

export const movementSchema = z
  .strictObject({
    type: z.enum(MOVEMENT_TYPES),
    /** Runs the path the other way (the original's negative type). */
    reverse: z.boolean().default(false),
    /** Ticks per cycle, pauses excluded. */
    period: z.int().min(1),
    /** Ticks added to the world clock before the phase is computed. */
    offset: z.int().default(0),
    /** Start phase as a fraction of the cycle. */
    phase: z.number().default(0),
    /** Horizontal radius in px (the travel distance for wraps). */
    radius: z.number().min(0).default(0),
    /** Vertical radius in px; 0 means the same as radius. */
    radius2: z.number().min(0).default(0),
    /** Rotates the whole path about the anchor; also offsets rotateBackAndForth. */
    pathRotation: z.number().default(0),
    /** Arc span or swing amplitude for the arcs and rotateBackAndForth; 0 means PI. */
    maxAngle: z.number().default(0),
    /** First pause in ticks. Pauses only run when pause1 > 0 (research 3.2). */
    pause1: z.int().min(0).default(0),
    /** Percent of the period at which the first pause happens. */
    pause1At: z.int().min(0).max(100).default(0),
    pause2: z.int().min(0).default(0),
    pause2At: z.int().min(0).max(100).default(0),
    /** Fraction of the whole cycle, pauses included, added to the clock when pauses run. */
    postDelayPhase: z.number().min(-1).max(1).default(0),
  })
  .refine((m) => m.pause2 === 0 || m.pause1 > 0, {
    message: 'pause2 has no effect unless pause1 > 0',
    path: ['pause2'],
  });

const elementShape = {
  /** Stable id, unique within the level. Never reused for a different element. */
  id: z.int().min(0),
  x: z.number(),
  y: z.number(),
  collision: z.boolean().default(true),
  visible: z.boolean().default(true),
  /** Draw order: lower layers are drawn first. */
  layer: z.int().default(0),
  /** Restitution override; 0 = default (0.9 circles, 0.82 lines, bricks, polygons). */
  bouncy: z.number().min(0).default(0),
  /** Slide threshold override in px/tick; 0 = default (1.0 circles, 1.4 lines). */
  rolly: z.number().min(0).default(0),
  /** A contact with this element resets the ball's stuck counter. */
  ballStopReset: z.boolean().default(false),
  /** Caps the ball speed after a bounce off this element; 0 = no cap. */
  maxBounceVelocity: z.number().min(0).default(0),
  movement: movementSchema.optional(),
  /** Id of the element whose position carries this element's anchor (nesting). */
  parent: z.int().min(0).optional(),
};

const scoringShape = {
  /** The color randomizer may pick this element as an orange peg. */
  canBeOrange: z.boolean().default(true),
  /** The element disappears about 97 ticks after it lights up instead of at shot end. */
  quickDisappear: z.boolean().default(false),
};

export const pegSchema = z.strictObject({
  kind: z.literal('peg'),
  ...elementShape,
  ...scoringShape,
  radius: z.number().positive().default(10),
});

export const brickSchema = z.strictObject({
  kind: z.literal('brick'),
  ...elementShape,
  ...scoringShape,
  /** Facing direction: 0 faces +x (brick stands vertical), PI/2 faces up (brick lies flat). */
  rotation: z.number().default(0),
  length: z.number().positive().default(30),
  width: z.number().positive().default(20),
});

export const curvedBrickSchema = z.strictObject({
  kind: z.literal('curvedBrick'),
  ...elementShape,
  ...scoringShape,
  /** Direction the outer arc faces, along the bisector. */
  rotation: z.number().default(0),
  innerRadius: z.number().positive().default(35),
  width: z.number().positive().default(20),
  /** Arc span in radians. */
  sector: z
    .number()
    .gt(0)
    .lt(TAU)
    .default(TAU / 12),
  /** Points per arc; the polygon has twice as many vertices. */
  points: z.int().min(2).max(64).default(4),
});

export const circleSchema = z.strictObject({
  kind: z.literal('circle'),
  ...elementShape,
  radius: z.number().positive(),
});

export const polygonSchema = z
  .strictObject({
    kind: z.literal('polygon'),
    ...elementShape,
    rotation: z.number().default(0),
    /** Closed outline relative to (x, y); the last vertex connects back to the first. */
    vertices: z.array(vec2Schema).min(3),
  })
  .superRefine((p, ctx) => {
    const n = p.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = p.vertices[i];
      const b = p.vertices[(i + 1) % n];
      if (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y) {
        ctx.addIssue({
          code: 'custom',
          message: `vertices ${i} and ${(i + 1) % n} coincide`,
          path: ['vertices', i],
        });
        return;
      }
    }
    if (signedArea(p.vertices) === 0) {
      ctx.addIssue({ code: 'custom', message: 'polygon has zero area', path: ['vertices'] });
      return;
    }
    const crossing = findSelfIntersection(p.vertices);
    if (crossing !== null) {
      ctx.addIssue({
        code: 'custom',
        message: `polygon edges ${crossing[0]} and ${crossing[1]} intersect`,
        path: ['vertices'],
      });
    }
  });

export const rodSchema = z
  .strictObject({
    kind: z.literal('rod'),
    ...elementShape,
    rotation: z.number().default(0),
    /** End points relative to (x, y). The rod has no thickness and blocks from both sides. */
    a: vec2Schema,
    b: vec2Schema,
  })
  .refine((r) => r.a.x !== r.b.x || r.a.y !== r.b.y, {
    message: 'rod end points coincide',
    path: ['b'],
  });

const teleportExitSchema = z.discriminatedUnion('type', [
  /** The ball reappears at another element's current position. */
  z.strictObject({ type: z.literal('element'), element: z.int().min(0) }),
  /** The ball reappears at a fixed board position. */
  z.strictObject({ type: z.literal('point'), x: z.number(), y: z.number() }),
  /** The ball leaves play. */
  z.strictObject({ type: z.literal('remove') }),
]);

export const teleportSchema = z.strictObject({
  kind: z.literal('teleport'),
  ...elementShape,
  /** Trigger box centered on the position; the ball's center has to enter it. */
  width: z.number().positive(),
  height: z.number().positive(),
  /** Use the ellipse inscribed in the box instead of the box. */
  circular: z.boolean().default(false),
  /** Ticks the ball stays hidden before it reappears. */
  outDelay: z.int().min(0).default(0),
  exit: teleportExitSchema,
});

export const elementSchema = z.discriminatedUnion('kind', [
  pegSchema,
  brickSchema,
  curvedBrickSchema,
  circleSchema,
  polygonSchema,
  rodSchema,
  teleportSchema,
]);

const SCORING_KINDS = new Set(['peg', 'brick', 'curvedBrick']);

export const levelSchema = z
  .strictObject({
    formatVersion: z.literal(FORMAT_VERSION),
    name: z.string().min(1),
    /** Asset id of the background picture. */
    background: z.string().min(1),
    /** Playfield size in px. Teggle's standard board is 916 x 560 (the original's is 650 x 560). */
    board: z.strictObject({
      width: z.number().min(400).max(4000),
      height: z.number().min(400).max(4000),
    }),
    elements: z.array(elementSchema),
    /** Designer-placed green pegs for the first campaign play. */
    seededGreens: z.tuple([z.int().min(0), z.int().min(0)]).optional(),
    /** How a generated level was made, so it can be reproduced. */
    provenance: z
      .strictObject({
        generatorVersion: z.string().min(1),
        seed: z.int().min(0).max(0xffffffff),
      })
      .optional(),
  })
  .superRefine((level, ctx) => {
    const byId = new Map<number, { kind: string; parent: number | undefined; index: number }>();
    level.elements.forEach((e, index) => {
      if (byId.has(e.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate element id ${e.id}`,
          path: ['elements', index, 'id'],
        });
      } else {
        byId.set(e.id, { kind: e.kind, parent: e.parent, index });
      }
    });
    level.elements.forEach((e, index) => {
      if (e.parent !== undefined) {
        if (e.parent === e.id) {
          ctx.addIssue({
            code: 'custom',
            message: `element ${e.id} is its own parent`,
            path: ['elements', index, 'parent'],
          });
        } else if (!byId.has(e.parent)) {
          ctx.addIssue({
            code: 'custom',
            message: `parent ${e.parent} does not exist`,
            path: ['elements', index, 'parent'],
          });
        } else {
          const seen = new Set<number>([e.id]);
          let cursor: number | undefined = e.parent;
          while (cursor !== undefined) {
            if (seen.has(cursor)) {
              ctx.addIssue({
                code: 'custom',
                message: `parent chain of element ${e.id} loops back to ${cursor}`,
                path: ['elements', index, 'parent'],
              });
              break;
            }
            seen.add(cursor);
            cursor = byId.get(cursor)?.parent;
          }
        }
      }
      if (e.kind === 'teleport' && e.exit.type === 'element' && !byId.has(e.exit.element)) {
        ctx.addIssue({
          code: 'custom',
          message: `teleport exit element ${e.exit.element} does not exist`,
          path: ['elements', index, 'exit', 'element'],
        });
      }
    });
    if (level.seededGreens !== undefined) {
      const [a, b] = level.seededGreens;
      if (a === b) {
        ctx.addIssue({
          code: 'custom',
          message: 'seededGreens must name two different elements',
          path: ['seededGreens'],
        });
      }
      level.seededGreens.forEach((id, i) => {
        const entry = byId.get(id);
        if (entry === undefined || !SCORING_KINDS.has(entry.kind)) {
          ctx.addIssue({
            code: 'custom',
            message: `seeded green ${id} is not a peg or brick of this level`,
            path: ['seededGreens', i],
          });
        }
      });
    }
  });

export type Level = z.output<typeof levelSchema>;
/** What a level file may contain before defaults are filled in. */
export type LevelInput = z.input<typeof levelSchema>;
export type LevelElement = Level['elements'][number];
export type LevelElementInput = LevelInput['elements'][number];
export type ElementKind = LevelElement['kind'];
export type Movement = z.output<typeof movementSchema>;
export type MovementInput = z.input<typeof movementSchema>;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export type PegElement = z.output<typeof pegSchema>;
export type BrickElement = z.output<typeof brickSchema>;
export type CurvedBrickElement = z.output<typeof curvedBrickSchema>;
export type CircleElement = z.output<typeof circleSchema>;
export type PolygonElement = z.output<typeof polygonSchema>;
export type RodElement = z.output<typeof rodSchema>;
export type TeleportElement = z.output<typeof teleportSchema>;
export type ScoringElement = PegElement | BrickElement | CurvedBrickElement;

/** Pegs and bricks score and can take a color; everything else is a solid or a trigger. */
export function isScoringElement(e: LevelElement): e is ScoringElement {
  return e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick';
}

export class LevelFormatError extends Error {
  override readonly name = 'LevelFormatError';
}

/** Validates an untrusted level file and fills in defaults. Throws LevelFormatError. */
export function parseLevel(json: unknown): Level {
  if (typeof json === 'object' && json !== null && 'formatVersion' in json) {
    const version: unknown = json.formatVersion;
    if (version !== FORMAT_VERSION) {
      throw new LevelFormatError(
        `Unsupported level formatVersion ${JSON.stringify(version)}; this build reads version ${FORMAT_VERSION}.`,
      );
    }
  }
  const result = levelSchema.safeParse(json);
  if (!result.success) {
    throw new LevelFormatError(`Invalid level file:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
