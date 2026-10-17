import { describe, expect, it } from 'vitest';
import { generateLevel } from '../../src/gen/generate';
import { parseLines } from '../../src/gen/lines';
import { levelStats } from '../../src/gen/stats';
import { lookOf, pictureSchema } from '../../src/gen/campaign-source';
import {
  composeManifest,
  composeRecipe,
  levelSourceSchema,
  stagesFileSchema,
  type CampaignLevelSource,
  type StageSource,
} from './source';

const look = {
  brightness: 1.05,
  saturation: 0.8,
  palette: ['#5a7aa6', '#a9c6e4', '#fbf6ea'],
  tint: 0.25,
  gamma: 1.1,
  floor: 0.22,
  ceiling: 0.97,
};

const stages = stagesFileSchema.parse({
  layout: 'Leave the top center open.',
  stages: [
    {
      stage: 1,
      world: 'Cloud Isles',
      master: 'guide',
      palette: 'Powder-blue sky, cream clouds.',
      look,
      levels: ['1-1', '1-2'],
    },
  ],
});
function firstStage(): StageSource {
  const s = stages.stages[0];
  if (s === undefined) throw new Error('no stage');
  return s;
}
const stage = firstStage();

function level(id: string, recipe: Record<string, unknown>) {
  return levelSourceSchema.parse({
    id,
    name: `Level ${id}`,
    concept: { subject: 's', composition: 'c', layout: 'l' },
    background: { id: `test-${id}`, prompt: 'A kite.' },
    recipe: { seed: 7, targetCount: 60, ...recipe },
  });
}

const lines = parseLines({
  formatVersion: 1,
  background: 'test-1-1',
  board: { width: 916, height: 560 },
  lines: [
    {
      id: 'ring',
      mode: 'pegs',
      closed: true,
      points: [
        [458, 220],
        [598, 300],
        [458, 420],
        [318, 300],
      ],
    },
    {
      id: 'slide',
      mode: 'bricks',
      points: [
        [80, 300],
        [160, 380],
        [260, 430],
      ],
    },
  ],
});

function source(recipe: Record<string, unknown>): CampaignLevelSource {
  return { stage, level: level('1-1', recipe), lines };
}

describe('campaign sources', () => {
  it('checks that each stage lists its own levels in order', () => {
    expect(() =>
      stagesFileSchema.parse({
        layout: 'x',
        stages: [{ stage: 1, world: 'w', master: 'guide', palette: 'p', look, levels: ['1-2'] }],
      }),
    ).toThrow(/level 1 is 1-1, not 1-2/);
  });

  it("checks a stage's look", () => {
    const valid = (patch: Record<string, unknown>) =>
      stagesFileSchema.safeParse({
        layout: 'x',
        stages: [
          {
            stage: 1,
            world: 'w',
            master: 'guide',
            palette: 'p',
            look: { ...look, ...patch },
            levels: ['1-1'],
          },
        ],
      }).success;
    expect(valid({})).toBe(true);
    expect(valid({ palette: ['#5a7aa6', 'blue', '#fbf6ea'] })).toBe(false);
    expect(valid({ floor: 0.9 })).toBe(false);
    // The softening goes by the picture's kind, not by the stage.
    expect(valid({ paint: 2 })).toBe(false);
  });

  it('builds the recipe: solids first, then every line, then the fill', () => {
    const recipe = composeRecipe(
      source({ solids: { circles: [{ x: 700, y: 300, r: 20 }] }, fill: { style: 'lattice' } }),
    );
    expect(recipe.parts.map((p) => p.template)).toEqual(['solids', 'outline']);
    expect(recipe.parts[1]?.params).toEqual({
      paths: [
        expect.objectContaining({ mode: 'pegs', closed: true }),
        expect.objectContaining({ mode: 'bricks', closed: false }),
      ],
    });
    expect(recipe).toMatchObject({ name: 'Level 1-1', stage: 1, targetCount: 60 });
  });

  it('takes only the named lines, in the order named', () => {
    const recipe = composeRecipe(source({ lines: ['slide'] }));
    const params = recipe.parts[0]?.params as { paths: { mode: string }[] };
    expect(params.paths.map((p) => p.mode)).toEqual(['bricks']);
    expect(() => composeRecipe(source({ lines: ['nope'] }))).toThrow(/no line "nope"/);
  });

  it('keeps a fill inside a named line, and the generator honors it', () => {
    const recipe = composeRecipe(
      source({ lines: ['slide'], fill: { style: 'lattice', spacing: 40, within: 'ring' } }),
    );
    expect(recipe.fill).toMatchObject({ within: { points: lines.lines[0]?.points } });
    const g = generateLevel(recipe, 7);
    const fill = g.level.elements.filter((e) => g.partOf.get(e.id) === 'fill');
    expect(fill.length).toBeGreaterThan(4);
    // The smoothed ring is a rounded shape through x 318..598 and y 220..420, close to the
    // ellipse through those points; every fill peg lies inside it.
    for (const e of fill) {
      const dx = (e.x - 458) / 140;
      const dy = (e.y - 310) / 100;
      expect(dx * dx + dy * dy).toBeLessThan(1);
    }
    expect(levelStats(g.level).scoring).toBe(g.parts.reduce((n, p) => n + p.scoring, 0));
    expect(() => composeRecipe(source({ fill: { within: 'nope' } }))).toThrow(/no line "nope"/);
  });

  it('writes a manifest the game accepts, with each stage master and file', () => {
    const second: CampaignLevelSource = { stage, level: level('1-2', {}), lines };
    const m = composeManifest(stages.stages, [source({}), second]);
    expect(m.stages[0]).toMatchObject({ stage: 1, master: 'guide', world: 'Cloud Isles' });
    expect(m.stages[0]?.levels.map((l) => [l.id, l.number, l.file, l.background])).toEqual([
      ['1-1', 1, 'campaign/1-1.json', 'test-1-1'],
      ['1-2', 2, 'campaign/1-2.json', 'test-1-2'],
    ]);
  });
});

describe('level pictures', () => {
  const picture = {
    ref: 'pexels:123',
    kind: 'photo',
    source: 'Pexels',
    page: 'https://www.pexels.com/photo/a-kite-123/',
    image: 'https://images.pexels.com/photos/123/pexels-photo-123.jpeg',
    author: 'A. Photographer',
    fetched: '2026-10-15',
    sha256: 'a'.repeat(64),
    size: [6000, 4000],
    crop: [0, 200, 6000, 3610],
  };

  it('records where a picture came from and how it is cropped', () => {
    const p = pictureSchema.parse(picture);
    expect(p).toMatchObject({ flop: false, adjust: {} });
    expect(pictureSchema.safeParse({ ...picture, crop: [10, 400, 6000, 3610] }).success).toBe(
      false,
    );
    expect(pictureSchema.safeParse({ ...picture, page: 'not a url' }).success).toBe(false);
    expect(pictureSchema.safeParse({ ...picture, kind: 'generated' }).success).toBe(false);
  });

  it("processes a picture with its stage's look, its kind's softening and its own changes", () => {
    const photo = pictureSchema.parse({ ...picture, adjust: { brightness: 1.1 } });
    expect(lookOf(stage, photo)).toEqual({ ...look, paint: 2, brightness: 1.1 });
    const painting = pictureSchema.parse({ ...picture, kind: 'painting', adjust: { paint: 0 } });
    expect(lookOf(stage, painting)).toEqual({ ...look, paint: 0 });
  });
});

describe('draft levels', () => {
  const plan = {
    archetypes: ['spiral', 'outline'],
    templates: ['outline', 'spiral'],
    fill: 'none',
    pegs: 36,
    bricks: 24,
    moving: [{ what: 'the spiral arms', type: 'rotateAroundCircle' }],
    features: ['Spiral layout'],
    difficulty: { target: 0.3, note: 'Middle of the stage.' },
  };

  function draft(fields: Record<string, unknown>) {
    return levelSourceSchema.safeParse({
      id: '1-2',
      name: 'Planned',
      draft: true,
      concept: { subject: 's', composition: 'c', layout: 'l' },
      plan,
      background: { id: 'test-1-2', prompt: 'A spiral.' },
      recipe: { seed: 102, targetCount: 60 },
      ...fields,
    });
  }

  it('accepts a plan whose pegs and bricks make the count, with no lines yet', () => {
    const r = draft({});
    expect(r.success).toBe(true);
    expect(r.data?.plan).toMatchObject({ pegs: 36, bricks: 24 });
  });

  it('needs a plan, and a plan that adds up to the recipe count', () => {
    expect(draft({ plan: undefined }).error?.issues[0]?.message).toMatch(/a draft needs its plan/);
    expect(draft({ plan: { ...plan, pegs: 35 } }).error?.issues[0]?.message).toMatch(
      /35 pegs and 24 bricks are not the recipe's 60 objects/,
    );
  });

  it('keeps a plan to what a campaign recipe can place', () => {
    const two = draft({ plan: { ...plan, templates: ['outline', 'spiral', 'rotating'] } });
    expect(two.error?.issues[0]?.message).toMatch(/at most one template besides/);
    const filled = draft({ plan: { ...plan, pegs: 0, bricks: 60, fill: 'lattice' } });
    expect(filled.error?.issues[0]?.message).toMatch(/bricks-only level has no fill/);
    const moving = draft({ plan: { ...plan, moving: [{ what: 'x', type: 'teleport' }] } });
    expect(moving.success).toBe(false);
  });

  it('stays out of the manifest', () => {
    const planned = draft({}).data;
    if (planned === undefined) throw new Error('the draft did not parse');
    const m = composeManifest(stages.stages, [source({}), { stage, level: planned, lines }]);
    expect(m.stages[0]?.levels.map((l) => l.id)).toEqual(['1-1']);
  });
});
