// Level file output: every field that equals its schema default is left out, numbers are
// rounded to 1e-6 px (far below anything visible or physical), and the result parses back to
// the same level up to that rounding.

import type { Level, LevelElement, Movement } from '../level/schema';

const ELEMENT_DEFAULTS: Record<string, unknown> = {
  collision: true,
  visible: true,
  layer: 0,
  bouncy: 0,
  rolly: 0,
  ballStopReset: false,
  maxBounceVelocity: 0,
  canBeOrange: true,
  quickDisappear: false,
  circular: false,
  outDelay: 0,
};

const MOVEMENT_DEFAULTS: Record<string, unknown> = {
  reverse: false,
  offset: 0,
  phase: 0,
  radius: 0,
  radius2: 0,
  pathRotation: 0,
  maxAngle: 0,
  pause1: 0,
  pause1At: 0,
  pause2: 0,
  pause2At: 0,
  postDelayPhase: 0,
};

function round(v: unknown): unknown {
  if (typeof v === 'number') {
    const r = Math.round(v * 1e6) / 1e6;
    return Object.is(r, -0) ? 0 : r;
  }
  if (Array.isArray(v)) return v.map(round);
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]));
  }
  return v;
}

function compactMovement(m: Movement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (k in MOVEMENT_DEFAULTS && MOVEMENT_DEFAULTS[k] === v) continue;
    out[k] = v;
  }
  return out;
}

function compactElement(e: LevelElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k in ELEMENT_DEFAULTS && ELEMENT_DEFAULTS[k] === v) continue;
    if (e.kind === 'peg' && k === 'radius' && v === 10) continue;
    if ((e.kind === 'brick' || e.kind === 'curvedBrick') && k === 'width' && v === 20) continue;
    if (e.kind === 'curvedBrick' && k === 'points' && v === 4) continue;
    if (k === 'movement' && v !== undefined) {
      out[k] = compactMovement(v as Movement);
      continue;
    }
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** The level as a plain JSON object, defaults left out. */
export function compactLevel(level: Level): Record<string, unknown> {
  const out: Record<string, unknown> = {
    formatVersion: level.formatVersion,
    name: level.name,
    background: level.background,
    board: level.board,
  };
  if (level.provenance !== undefined) out.provenance = level.provenance;
  if (level.seededGreens !== undefined) out.seededGreens = level.seededGreens;
  out.elements = level.elements.map((e) => round(compactElement(e)));
  return out;
}

/**
 * Stable JSON text: two-space indentation for the header, one element per line, so diffs of
 * regenerated levels stay readable.
 */
export function levelJson(level: Level): string {
  const c = compactLevel(level);
  const { elements, ...header } = c;
  const head = JSON.stringify(header, null, 2).slice(0, -2);
  const lines = (elements as unknown[]).map((e) => `    ${JSON.stringify(e)}`);
  return `${head},\n  "elements": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
