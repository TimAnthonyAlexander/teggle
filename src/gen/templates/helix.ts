// Helix (spec 9): two strands of round pegs that wiggle or spin. A strand is a row of pegs
// whose movements are phased along it, so a wave runs through it; the second strand is the
// first one's mirror image across the helix axis, half a cycle apart, so the pair breathes like
// a double helix seen from the side. The strands never cross: on a flat board, crossing
// strands would have to pass pegs through each other.
//   wiggle: every peg bobs across the axis (verticalCycle, or horizontalCycle on a standing
//           helix)
//   spin:   every peg circles its spot, the circles' angles turning along the strand
// 'bands' horizontal helices span the middle; 'sides' adds a standing helix by each wall.

import { z } from 'zod';
import { PI, TAU } from '../../core/dmath';
import {
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  CENTER_X,
  MIN_PEG_SPACING,
  PEG_RADIUS,
} from '../constants';
import type { Zone } from '../builder';
import type { PegDraft } from '../draft';
import { mirrorElement } from '../mirror';
import { float, bob } from '../motion';
import { peg } from '../place';
import type { TemplateContext } from '../template';

export const helixParams = z
  .strictObject({
    mode: z.enum(['wiggle', 'spin']),
    /** Horizontal helices across the middle (0 to 2). */
    bands: z.int().min(0).max(2),
    /** A standing helix next to each wall. */
    sides: z.boolean(),
    /** How far a peg moves from its spot (wiggle) or the radius it circles on (spin). */
    amplitude: z.number().min(8).max(60),
    /** Length of one wave along the strand. */
    wavelength: z.number().min(160).max(900),
    /** Peg spacing along a strand. */
    spacing: z
      .number()
      .min(MIN_PEG_SPACING + 2)
      .max(60),
    period: z.int().min(400).max(3000),
  })
  .partial();

export type HelixParams = z.infer<typeof helixParams>;

interface Strands {
  readonly mode: 'wiggle' | 'spin';
  readonly amplitude: number;
  readonly wavelength: number;
  readonly spacing: number;
  readonly period: number;
}

/** Free distance between the two strands' axes beyond what their motion needs. */
const CLEAR = MIN_PEG_SPACING + 6;

/** Half the distance between the two strands' rest lines. */
function halfGap(s: Strands): number {
  return s.amplitude + CLEAR / 2;
}

/**
 * Pegs of a horizontal helix centered on the board at height cy, from the center out to
 * xMax (right half; the region mirror makes the left half). Returns the pegs.
 */
function band(s: Strands, cy: number, xMax: number): PegDraft[] {
  const out: PegDraft[] = [];
  const g = halfGap(s);
  for (let k = 0; ; k++) {
    const x = CENTER_X + (k + 0.5) * s.spacing;
    if (x + PEG_RADIUS + s.amplitude * (s.mode === 'spin' ? 1 : 0) > xMax) break;
    const phase = (x - CENTER_X) / s.wavelength;
    for (const strand of [0, 1]) {
      const y = strand === 0 ? cy - g : cy + g;
      // Keep the cannon's area clear at every point of the peg's motion.
      const dx = x - CANNON_X;
      const dy = y - CANNON_Y;
      if (Math.sqrt(dx * dx + dy * dy) - s.amplitude - PEG_RADIUS < CANNON_CLEARANCE + 2) continue;
      const p = peg(x, y);
      if (s.mode === 'wiggle') {
        out.push(bob(p, s.amplitude, s.period, phase + strand * 0.5));
      } else {
        // Circles: the second strand is the first one's mirror image across the axis.
        const angle = phase * TAU;
        out.push(float(p, s.amplitude, s.period, strand === 0 ? angle : -angle, strand === 1));
      }
    }
  }
  return out;
}

/** Pegs of a standing helix at x (left side; mirrored to the right), from y0 to y1. */
function standing(s: Strands, x: number, y0: number, y1: number): PegDraft[] {
  const out: PegDraft[] = [];
  const g = halfGap(s);
  const n = Math.max(2, Math.floor((y1 - y0) / s.spacing) + 1);
  const step = (y1 - y0) / (n - 1);
  for (let i = 0; i < n; i++) {
    const y = y0 + i * step;
    const phase = (y - y0) / s.wavelength;
    for (const strand of [0, 1]) {
      const px = strand === 0 ? x - g : x + g;
      const p = peg(px, y);
      if (s.mode === 'wiggle') {
        out.push({
          ...p,
          movement: {
            type: 'horizontalCycle',
            period: s.period,
            radius: s.amplitude,
            phase: (((0.25 + phase + strand * 0.5) % 1) + 1) % 1,
          },
        });
      } else {
        const angle = phase * TAU + (strand === 0 ? 0 : PI);
        out.push(float(p, s.amplitude, s.period, angle, false));
      }
    }
  }
  return out;
}

function addMoving(ctx: TemplateContext, pegs: readonly PegDraft[], zone: Zone): boolean {
  const b = ctx.builder;
  const twin: Zone =
    zone.kind === 'box'
      ? { ...zone, minX: 2 * CENTER_X - zone.maxX, maxX: 2 * CENTER_X - zone.minX }
      : { ...zone, x: 2 * CENTER_X - zone.x };
  const centered = zone.kind === 'box' && zone.minX < CENTER_X && zone.maxX > CENTER_X;
  if (!b.canReserve(zone)) return false;
  if (!centered && !b.canReserve(twin)) return false;
  for (const p of pegs) {
    b.add(p, ctx.part);
    if (Math.abs(p.x - CENTER_X) > 1e-9) b.add(mirrorElement(p), ctx.part);
  }
  b.reserve(zone);
  if (!centered) b.reserve(twin);
  // Strands are pegs like a fill's; the fill keeps its full distance so they stay readable.
  b.claim(zone);
  if (!centered) b.claim(twin);
  return true;
}

export function buildHelix(ctx: TemplateContext, params: HelixParams): void {
  const d = ctx.draw;
  const mode = params.mode ?? d.pick(['wiggle', 'spin'] as const);
  const s: Strands = {
    mode,
    amplitude: params.amplitude ?? (mode === 'wiggle' ? d.float(22, 34) : d.float(12, 16)),
    wavelength: params.wavelength ?? (mode === 'wiggle' ? d.float(260, 380) : d.float(520, 700)),
    spacing: params.spacing ?? (mode === 'wiggle' ? d.float(38, 42) : d.float(44, 48)),
    period: params.period ?? 4 * d.int(200, 300),
  };
  const bands = params.bands ?? d.int(1, 2);
  const sides = params.sides ?? d.bool(0.7);
  const box = ctx.region.box;
  const reach = halfGap(s) + s.amplitude + PEG_RADIUS + 2;
  const sideX = box.x0 + reach + 6;
  const xMax = sides ? sideX + reach + 26 : box.x1;
  const bandMax = 2 * CENTER_X - xMax;
  if (sides) {
    // Pegs move across the strand, so the strand's ends only need the peg's own clearance.
    const along = s.mode === 'spin' ? s.amplitude : 0;
    const y0 = box.y0 + PEG_RADIUS + 6 + along;
    const y1 = box.y1 - PEG_RADIUS - 6 - along;
    const pegs = standing(s, sideX, y0, y1);
    addMoving(ctx, pegs, {
      kind: 'box',
      minX: sideX - reach,
      maxX: sideX + reach,
      minY: y0 - PEG_RADIUS - along - 2,
      maxY: y1 + PEG_RADIUS + along + 2,
    });
  }
  // Bands sit below the cannon's area, stacked from the lowest one up.
  const top = Math.max(box.y0, CANNON_Y + CANNON_CLEARANCE + 14) + reach;
  const bottom = box.y1 - reach - 4;
  const levels =
    bands === 2 && bottom - top >= 2 * reach
      ? [bottom - 2 * reach - 6, bottom]
      : bands >= 1
        ? [(top + bottom) / 2 + 20]
        : [];
  for (const cy of levels) {
    const pegs = band(s, cy, bandMax);
    addMoving(ctx, pegs, {
      kind: 'box',
      minX: 2 * CENTER_X - bandMax,
      maxX: bandMax,
      minY: cy - reach,
      maxY: cy + reach,
    });
  }
}
