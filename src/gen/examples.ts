// One example recipe per archetype, with the seed that produced the example level in
// public/levels/examples/. Dev material: they show what each template makes and feed the dev
// route's review; the campaign's 55 levels are a later wave.
//
// As a set they follow the campaign's composition (spec 13.2): about one level in three round
// pegs only (plinko, web, helix), about one in eleven bricks only (architecture), and about
// 42% bricks overall.

import { PI } from '../core/dmath';
import type { RecipeInput } from './recipe';

export interface Example {
  /** File name under public/levels/examples/. */
  readonly file: string;
  readonly seed: number;
  readonly recipe: RecipeInput;
}

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
];
