// Portal pairs (spec 9): teleports that link areas of the board. Two kinds, both symmetric:
//   vaults: rings of bricks near the top corners, open at the bottom, with pegs inside; a
//           portal low on each side sends the ball into the vault on the other side
//   wrap:   a portal by each wall at the same height, linked to each other, so a ball that
//           enters one comes out of the other with its speed kept
// A portal is a circular teleport trigger; its exit is an invisible marker (research 2.9).
// Triggers and exits reserve their area, so nothing else is placed in them.

import { z } from 'zod';
import { cos, HALF_PI, PI, sin } from '../../core/dmath';
import { BRICK_WIDTH, CENTER_X, MIN_GAP, PEG_RADIUS } from '../constants';
import type { Draft, ScoringDraft } from '../draft';
import { bricksAlong, peg } from '../place';
import { PathSampler } from '../paths';
import { placeGroup, type TemplateContext } from '../template';

export const portalParams = z
  .strictObject({
    vaults: z.boolean(),
    wrap: z.boolean(),
    /** Center line radius of a vault's ring. */
    vaultRadius: z.number().min(56).max(110),
    /** Portal trigger diameter. */
    size: z.number().min(24).max(56),
  })
  .partial();

export type PortalParams = z.infer<typeof portalParams>;

/** Room kept around an exit marker, enough for the ball to appear there. */
const EXIT_ROOM = 9;

/** Ring of bricks around (cx, cy) with an opening of `open` radians at the bottom. */
function vaultRing(cx: number, cy: number, r: number, open: number): ScoringDraft[] {
  const a0 = -HALF_PI + open / 2;
  const a1 = -HALF_PI - open / 2 + 2 * PI;
  const pts = [];
  for (let i = 0; i <= 180; i++) {
    const a = a0 + ((a1 - a0) * i) / 180;
    pts.push({ x: cx + r * cos(a), y: cy - r * sin(a) });
  }
  const s = new PathSampler({ closed: false, points: pts });
  return bricksAlong(s, 0, s.length, { facing: 'right' });
}

/** A row of pegs across a vault, a little below its middle. */
function vaultPegs(cx: number, cy: number, inner: number): ScoringDraft[] {
  const out: ScoringDraft[] = [];
  const pitch = 2 * PEG_RADIUS + MIN_GAP + 4;
  const n = Math.max(1, Math.floor((2 * (inner - PEG_RADIUS - MIN_GAP - 4)) / pitch) + 1);
  for (let i = 0; i < n; i++) out.push(peg(cx + (i - (n - 1) / 2) * pitch, cy + 12));
  return out;
}

function portal(x: number, y: number, size: number, exit: number): Draft {
  return {
    kind: 'teleport',
    x,
    y,
    width: size,
    height: size,
    circular: true,
    exit: { type: 'element', element: exit },
  };
}

function marker(x: number, y: number): Draft {
  return { kind: 'circle', x, y, radius: 4, collision: false, visible: false };
}

/** Adds two portals that lead to two markers (each portal to the other side's marker). */
function addPair(
  ctx: TemplateContext,
  portals: readonly [{ x: number; y: number }, { x: number; y: number }],
  exits: readonly [{ x: number; y: number }, { x: number; y: number }],
  size: number,
): boolean {
  const b = ctx.builder;
  const zones = [
    ...portals.map((p) => ({ kind: 'circle' as const, x: p.x, y: p.y, r: size / 2 })),
    ...exits.map((p) => ({ kind: 'circle' as const, x: p.x, y: p.y, r: EXIT_ROOM })),
  ];
  // Exits may sit inside a portal (wrap pairs exit at the other portal's center).
  const distinct = zones.filter(
    (z, i) => i < 2 || !portals.some((p) => p.x === z.x && p.y === z.y),
  );
  const added: typeof distinct = [];
  for (const z of distinct) {
    if (!b.canReserve(z)) {
      for (let i = 0; i < added.length; i++) b.zones.pop();
      return false;
    }
    b.reserve(z);
    added.push(z);
  }
  const m0 = b.add(marker(exits[0].x, exits[0].y), ctx.part);
  const m1 = b.add(marker(exits[1].x, exits[1].y), ctx.part);
  b.add(portal(portals[0].x, portals[0].y, size, m1.id), ctx.part);
  b.add(portal(portals[1].x, portals[1].y, size, m0.id), ctx.part);
  return true;
}

export function buildPortals(ctx: TemplateContext, params: PortalParams): void {
  const d = ctx.draw;
  const vaults = params.vaults ?? true;
  const wrap = params.wrap ?? d.bool(0.6);
  const size = params.size ?? d.float(34, 42);
  const box = ctx.region.box;
  if (vaults) {
    const r = params.vaultRadius ?? d.float(70, 84);
    const inner = r - BRICK_WIDTH / 2;
    const vx = box.x0 + r + BRICK_WIDTH / 2 + 30;
    const vy = box.y0 + r + BRICK_WIDTH / 2 + 34;
    const group = [...vaultRing(vx, vy, r, 1.05), ...vaultPegs(vx, vy, inner)];
    if (placeGroup(ctx, group) > 0) {
      // The exits sit just under the top of each vault; the left portal leads into the right
      // vault and the right portal into the left one.
      const exitY = vy - inner + EXIT_ROOM + MIN_GAP + 2;
      const py = box.y1 - size / 2 - 40;
      const px = box.x0 + 150;
      // Portal i leads to exit 1 - i.
      addPair(
        ctx,
        [
          { x: px, y: py },
          { x: 2 * CENTER_X - px, y: py },
        ],
        [
          { x: vx, y: exitY },
          { x: 2 * CENTER_X - vx, y: exitY },
        ],
        size,
      );
    }
  }
  if (wrap) {
    // A portal by each wall, each the other's exit.
    const y = (box.y0 + box.y1) / 2 + 30;
    const x = box.x0 + size / 2 + 8;
    const left = { x, y };
    const right = { x: 2 * CENTER_X - x, y };
    addPair(ctx, [left, right], [left, right], size);
  }
}
