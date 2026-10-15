// One example recipe per archetype, with the seed that produced the example level in
// public/levels/examples/. Dev material: they show what each template makes and feed the dev
// route's review; the campaign's 55 levels are a later wave.
//
// As a set they follow the campaign's composition (spec 13.2): about one level in three round
// pegs only (plinko, web, helix), about one in eleven bricks only (architecture), and about
// 42% bricks overall.

import { cos, PI, sin } from '../core/dmath';
import { lineGroups, linePaths, parseLines, type LinesFile } from './lines';
import type { RecipeInput } from './recipe';

export interface Example {
  /** File name under public/levels/examples/. */
  readonly file: string;
  readonly seed: number;
  readonly recipe: RecipeInput;
  /** The traced lines the recipe's outline part was made from, for the line editor. */
  readonly lines?: LinesFile;
}

// ---------------------------------------------------------------------------------------------
// Moving lines (movers.ts): lines laid out here the way they would be traced over a picture.

type Point = [number, number];

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** n points around a circle, counterclockwise on screen from angle a0 (0 = right, PI/2 = up). */
function ringPoints(cx: number, cy: number, r: number, n: number, a0 = 0, ry = r): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (2 * PI * i) / n;
    return [r1(cx + r * cos(a)), r1(cy - ry * sin(a))];
  });
}

/** Points along a circular arc from a0 to a1 (radians, counterclockwise on screen). */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [r1(cx + r * cos(a)), r1(cy - r * sin(a))];
  });
}

/** The point at radius r and angle a around (cx, cy). */
function polar(cx: number, cy: number, r: number, a: number): Point {
  return [r1(cx + r * cos(a)), r1(cy - r * sin(a))];
}

function mirrorX(points: readonly Point[]): Point[] {
  return points.map(([x, y]) => [r1(916 - x), y]);
}

/** A recipe that places every line of a lines file with the outline template. */
function linesRecipe(
  name: string,
  targetCount: number,
  lines: LinesFile,
  fill: RecipeInput['fill'],
): RecipeInput {
  const ids = lines.lines.map((l) => l.id);
  const groups = lineGroups(lines, ids);
  return {
    name,
    targetCount,
    parts: [
      {
        template: 'outline',
        params: { paths: linePaths(lines, ids), ...(groups.length > 0 ? { groups } : {}) },
      },
    ],
    fill,
  };
}

function linesFile(lines: unknown[], groups: unknown[] = []): LinesFile {
  return parseLines({
    formatVersion: 1,
    background: 'dev-backdrop',
    board: { width: 916, height: 560 },
    lines,
    ...(groups.length > 0 ? { groups } : {}),
  });
}

/**
 * Lanterns gliding around a figure-eight wire: the wire's pegs travel along it. Where the wire
 * crosses itself two lanterns must pass without touching, which an even spacing allows only
 * from about 100 px apart on this crossing.
 */
const EIGHT_LINES = linesFile([
  {
    id: 'wire',
    note: 'the lanterns gliding around the figure eight',
    mode: 'pegs',
    closed: true,
    spacing: 112,
    keepSpacing: true,
    travel: { period: 3600 },
    points: Array.from({ length: 16 }, (_, i): Point => {
      const t = (2 * PI * i) / 16;
      return [r1(458 + 250 * cos(t)), r1(300 - 105 * sin(2 * t))];
    }),
  },
  {
    id: 'lobe-left',
    note: 'a ring inside the left loop',
    mode: 'pegs',
    closed: true,
    spacing: 36,
    points: ringPoints(318, 300, 38, 8),
  },
  {
    id: 'lobe-right',
    note: 'a ring inside the right loop',
    mode: 'pegs',
    closed: true,
    spacing: 36,
    points: ringPoints(598, 300, 38, 8),
  },
  {
    id: 'chimney-left',
    note: 'the left chimney stack',
    mode: 'bricks',
    points: [
      [96, 170],
      [96, 330],
    ],
  },
  {
    id: 'chimney-right',
    note: 'the right chimney stack',
    mode: 'bricks',
    points: [
      [820, 170],
      [820, 330],
    ],
  },
  {
    id: 'roof-left',
    note: 'the left roof, sloping toward the middle',
    mode: 'bricks',
    points: [
      [140, 440],
      [330, 475],
    ],
  },
  {
    id: 'roof-right',
    note: 'the right roof, sloping toward the middle',
    mode: 'bricks',
    points: mirrorX([
      [140, 440],
      [330, 475],
    ]),
  },
]);

/**
 * A fish shaped boat sliding across the middle, its tail swinging as it goes: the tail is a group
 * riding on the fish.
 */
const FISH_LINES = linesFile(
  [
    {
      id: 'fish-body',
      note: 'the body outline',
      mode: 'pegs',
      closed: true,
      spacing: 38,
      group: 'fish',
      corners: [5],
      points: [
        [568, 322],
        [540, 291],
        [494, 274],
        [440, 276],
        [398, 296],
        [372, 322],
        [398, 348],
        [440, 368],
        [494, 370],
        [540, 353],
      ],
    },
    {
      id: 'fish-eye',
      note: 'the eye',
      mode: 'pegs',
      group: 'fish',
      points: [
        [510, 318],
        [514, 318],
      ],
    },
    {
      id: 'fish-fin',
      note: 'the back fin',
      mode: 'pegs',
      spacing: 36,
      group: 'fish',
      points: [
        [430, 312],
        [472, 326],
      ],
    },
    {
      id: 'fish-tail',
      note: 'the tail fan',
      mode: 'pegs',
      spacing: 38,
      group: 'tail',
      corners: [1],
      points: [
        [282, 268],
        [338, 322],
        [282, 376],
      ],
    },
    {
      id: 'waves',
      note: 'the wave crests under the boat',
      mode: 'pegs',
      spacing: 40,
      points: [
        [130, 452],
        [230, 438],
        [330, 452],
        [458, 440],
        [586, 452],
        [686, 438],
        [786, 452],
      ],
    },
    {
      id: 'buoy-left',
      note: 'a buoy',
      mode: 'pegs',
      spacing: 36,
      points: [
        [70, 190],
        [70, 300],
      ],
    },
    {
      id: 'buoy-right',
      note: 'a buoy',
      mode: 'pegs',
      spacing: 36,
      points: [
        [846, 190],
        [846, 300],
      ],
    },
  ],
  [
    {
      id: 'fish',
      note: 'the fish boat crossing the cove',
      movement: { type: 'horizontalCycle', period: 1800, radius: 120 },
    },
    {
      id: 'tail',
      note: 'the tail, swinging about where it joins the body',
      parent: 'fish',
      pivot: [352, 322],
      movement: { type: 'rotateBackAndForth', period: 600, maxAngle: 0.35 },
    },
  ],
);

/** Rings of curved bricks floating on small circles, neighbors turning opposite ways. */
const RING_CENTERS: readonly Point[] = [
  [168, 200],
  [318, 200],
  [598, 200],
  [748, 200],
  [168, 340],
  [313, 340],
  [458, 340],
  [603, 340],
  [748, 340],
];

const RINGS_LINES = linesFile(
  [
    ...RING_CENTERS.map(([x, y], i) => ({
      id: `ring-${i + 1}`,
      note: 'a bubble: a ring of curved bricks open at the bottom',
      mode: 'bricks',
      group: `bubble-${i + 1}`,
      points: arcPoints(x, y, 42, -PI / 2 + 0.55, (3 * PI) / 2 - 0.55, 10),
    })),
    {
      id: 'terrace-left',
      note: 'the left terrace wall',
      mode: 'bricks',
      points: [
        [110, 445],
        [300, 480],
      ],
    },
    {
      id: 'terrace-right',
      note: 'the right terrace wall',
      mode: 'bricks',
      points: mirrorX([
        [110, 445],
        [300, 480],
      ]),
    },
  ],
  RING_CENTERS.map((_, i) => ({
    id: `bubble-${i + 1}`,
    movement: {
      type: 'circle',
      period: 1600,
      radius: 16,
      ...(i % 2 === 1 ? { reverse: true } : {}),
      ...(i % 4 === 0 ? {} : { phase: (i % 4) / 4 }),
    },
  })),
);

/**
 * The conveyor row's slope (3 degrees down to the right): a flat moving row carries a resting
 * ball along forever; on the slope it slides off.
 */
const RIPPLE_SLOPE = PI / 60;

/** A water wheel and a gear turning opposite ways over a mill stream: bricks only. */
function wheel(id: string, cx: number, cy: number, spokeAngle: number): unknown[] {
  const out: unknown[] = [];
  // The rim in four arcs, one over each spoke, with slots between them: a ball that gets inside
  // (once a rim brick is gone) falls out again instead of riding around.
  const slot = 32 / 88;
  for (let k = 0; k < 4; k++) {
    const a = spokeAngle + (k * PI) / 2;
    out.push({
      id: `${id}-rim-${k + 1}`,
      note: 'a quarter of the rim',
      mode: 'bricks',
      group: id,
      points: arcPoints(cx, cy, 88, a - PI / 4 + slot / 2, a + PI / 4 - slot / 2, 4),
    });
  }
  for (let k = 0; k < 12; k++) {
    const a = spokeAngle + PI / 12 + (k * PI) / 6;
    out.push({
      id: `${id}-paddle-${k + 1}`,
      note: 'a paddle',
      mode: 'bricks',
      group: id,
      points: [polar(cx, cy, 112, a), polar(cx, cy, 146, a)],
    });
  }
  return out;
}

const MILL_LINES = linesFile(
  [
    ...wheel('water-wheel', 300, 250, 0),
    ...wheel('gear', 616, 250, PI / 4),
    {
      id: 'ripples',
      note: 'the near row of ripples, flowing down its slope and starting over (a conveyor)',
      mode: 'bricks',
      group: 'ripples',
      // 575 px: sixteen 35 px bricks and their seams, so one step is exactly 36 px.
      points: [
        [176, 418],
        polar(176, 418, 575, -RIPPLE_SLOPE),
      ],
    },
    {
      id: 'stream',
      note: 'the far row: ripples running along the stream and back to its start',
      mode: 'bricks',
      travel: { period: 2400 },
      points: [
        [140, 496],
        [300, 488],
        [458, 496],
        [616, 488],
        [776, 496],
      ],
    },
    {
      id: 'chute-left',
      note: 'the mill chute',
      mode: 'bricks',
      points: [
        [40, 90],
        [150, 128],
      ],
    },
    {
      id: 'chute-right',
      note: 'the mill roof',
      mode: 'bricks',
      points: mirrorX([
        [40, 90],
        [150, 128],
      ]),
    },
    {
      id: 'bank-left',
      note: 'the left bank',
      mode: 'bricks',
      points: [
        [24, 300],
        [124, 356],
      ],
    },
    {
      id: 'bank-right',
      note: 'the right bank',
      mode: 'bricks',
      points: mirrorX([
        [24, 300],
        [124, 356],
      ]),
    },
    {
      id: 'ledge-left',
      note: 'the left ledge',
      mode: 'bricks',
      points: [
        [24, 196],
        [118, 236],
      ],
    },
    {
      id: 'ledge-right',
      note: 'the right ledge',
      mode: 'bricks',
      points: mirrorX([
        [24, 196],
        [118, 236],
      ]),
    },
    {
      id: 'post-left',
      note: 'the left post of the mill house',
      mode: 'bricks',
      points: [
        [30, 118],
        [30, 168],
      ],
    },
    {
      id: 'post-right',
      note: 'the right post of the mill house',
      mode: 'bricks',
      points: mirrorX([
        [30, 118],
        [30, 168],
      ]),
    },
    {
      id: 'eave-left',
      note: 'the left eave',
      mode: 'bricks',
      points: [
        [24, 40],
        [104, 58],
      ],
    },
    {
      id: 'eave-right',
      note: 'the right eave',
      mode: 'bricks',
      points: mirrorX([
        [24, 40],
        [104, 58],
      ]),
    },
  ],
  [
    { id: 'water-wheel', pivot: [300, 250], movement: { type: 'rotate', period: 2400 } },
    { id: 'gear', pivot: [616, 250], movement: { type: 'rotate', period: 2400, reverse: true } },
    {
      id: 'ripples',
      note: 'moves one brick and its seam along the slope per period, then starts over',
      movement: {
        type: 'horizontalWrap',
        period: 720,
        radius: 36,
        pathRotation: -RIPPLE_SLOPE,
      },
    },
  ],
);

export const EXAMPLES: readonly Example[] = [
  {
    file: 'plinko',
    seed: 11,
    recipe: {
      name: 'Example: Plinko',
      parts: [{ template: 'plinko', params: { shape: 'rect', count: 150, wave: 10 } }],
      fill: 'none',
    },
  },
  {
    file: 'spiral',
    seed: 21,
    recipe: {
      name: 'Example: Spiral',
      targetCount: 140,
      parts: [
        { template: 'spiral', params: { layout: 'twin', arm: 'mixed', brickShare: 0.85, spin: 0 } },
      ],
      fill: { style: 'arcs' },
    },
  },
  {
    file: 'web',
    seed: 31,
    recipe: {
      name: 'Example: Web',
      targetCount: 140,
      parts: [{ template: 'web', params: { outer: 'pegs', corners: true } }],
      fill: { style: 'lattice' },
    },
  },
  {
    file: 'architecture',
    seed: 41,
    recipe: {
      name: 'Example: Architecture',
      parts: [{ template: 'architecture', params: { layout: 'colonnade' } }],
      fill: 'none',
    },
  },
  {
    file: 'rotating',
    seed: 51,
    recipe: {
      name: 'Example: Rotating',
      targetCount: 124,
      parts: [
        { template: 'rotating', params: { kind: 'wheel', layout: 'pair' } },
        {
          template: 'outline',
          params: {
            shapes: [
              { shape: 'arc', mode: 'bricks', x: 458, y: 162, size: 310, span: 1.0 },
              { shape: 'arc', mode: 'bricks', x: 458, y: 228, size: 200, span: 0.9 },
            ],
          },
        },
      ],
      fill: { style: 'arcs' },
    },
  },
  {
    file: 'platforms',
    seed: 61,
    recipe: {
      name: 'Example: Moving Platforms',
      targetCount: 121,
      parts: [
        { template: 'platforms', region: 'top', params: { kind: 'shelves', tiers: 2 } },
        { template: 'platforms', region: 'bottom', params: { kind: 'floaters', tiers: 2 } },
      ],
      fill: { style: 'arcs', clearance: 20 },
    },
  },
  {
    file: 'helix',
    seed: 71,
    recipe: {
      name: 'Example: Helix',
      targetCount: 138,
      parts: [{ template: 'helix', params: { mode: 'wiggle', bands: 2, sides: true } }],
      fill: { style: 'lattice' },
    },
  },
  {
    file: 'portals',
    seed: 81,
    recipe: {
      name: 'Example: Portals',
      targetCount: 124,
      parts: [
        { template: 'portals', params: { vaults: true, wrap: true } },
        {
          template: 'outline',
          params: {
            shapes: [
              { shape: 'circle', mode: 'bricks', x: 458, y: 288, size: 250, gap: 44 },
              { shape: 'arc', mode: 'bricks', x: 458, y: 452, size: 500, span: PI * 0.2 },
            ],
          },
        },
      ],
      fill: { style: 'arcs' },
    },
  },
  {
    file: 'outline',
    seed: 91,
    recipe: {
      name: 'Example: Outline',
      targetCount: 140,
      parts: [
        {
          template: 'outline',
          params: {
            shapes: [
              { shape: 'heart', mode: 'bricks', x: 458, y: 286, size: 360, gap: 30 },
              {
                shape: 'circle',
                mode: 'bricks',
                x: 134,
                y: 150,
                size: 190,
                gap: 46,
                mirror: true,
              },
              {
                shape: 'arc',
                mode: 'bricks',
                x: 166,
                y: 446,
                size: 280,
                span: 0.9,
                mirror: true,
              },
            ],
          },
        },
      ],
      fill: { style: 'arcs' },
    },
  },
  {
    file: 'mixed',
    seed: 101,
    recipe: {
      name: 'Example: Mixed',
      targetCount: 128,
      parts: [
        {
          template: 'rotating',
          region: 'center',
          params: { kind: 'windmill', layout: 'single', spokes: 6 },
        },
        { template: 'spiral', region: 'sides', params: { layout: 'twin', arm: 'bricks' } },
      ],
      fill: { style: 'arcs' },
    },
  },
  {
    file: 'eight',
    seed: 111,
    lines: EIGHT_LINES,
    recipe: linesRecipe('Example: Figure-Eight Lanterns', 132, EIGHT_LINES, { style: 'lattice' }),
  },
  {
    file: 'fish',
    seed: 121,
    lines: FISH_LINES,
    recipe: linesRecipe('Example: Fish Boat', 136, FISH_LINES, { style: 'lattice' }),
  },
  {
    file: 'bubbles',
    seed: 131,
    lines: RINGS_LINES,
    recipe: linesRecipe('Example: Floating Rings', 140, RINGS_LINES, { style: 'arcs' }),
  },
  {
    file: 'mill',
    seed: 141,
    lines: MILL_LINES,
    recipe: linesRecipe('Example: Mill Wheels', 120, MILL_LINES, 'none'),
  },
];
