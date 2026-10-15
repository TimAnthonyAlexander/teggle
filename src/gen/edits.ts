// Manual edits of a generated level (spec 12, step 5): single pegs and bricks moved, turned,
// deleted, added or given other flags in the line editor. They live in the recipe as a list the
// generator applies after it has placed everything, so a rebuild keeps them.
//
// An entry without `add` changes one generated object: the scoring object whose position lies
// nearest to `at`, within EDIT_MATCH px, in the level as generated (before any edit). Matching by
// position rather than by id survives upstream changes that renumber elements; an entry whose
// object is gone (its line moved, say) matches nothing and is reported, never applied elsewhere.
// Each object is changed by at most one entry. Entries with `add` place a new peg or straight
// brick; they get the next free ids, in list order, after the changes.

import { z } from 'zod';
import { HALF_PI } from '../core/dmath';
import { elementSchema, isScoringElement, type LevelElement } from '../level/schema';
import {
  BRICK_LENGTH,
  BRICK_LENGTH_MAX,
  BRICK_LENGTH_MIN,
  BRICK_WIDTH,
  PEG_RADIUS,
} from './constants';

/** An entry matches the generated object within this distance of its `at` (px). */
export const EDIT_MATCH = 2;

const point = z.tuple([z.number(), z.number()]);

const flags = {
  canBeOrange: z.boolean().optional(),
  quickDisappear: z.boolean().optional(),
};

export const changeEditSchema = z
  .strictObject({
    /** Position of the generated peg or brick this entry changes. */
    at: point,
    /** Where it goes instead. */
    to: point.optional(),
    /** Its new rotation (bricks only; radians, counterclockwise on screen). */
    rotation: z.number().optional(),
    /** Removes it. */
    delete: z.literal(true).optional(),
    ...flags,
  })
  .superRefine((e, ctx) => {
    const changes =
      e.to !== undefined ||
      e.rotation !== undefined ||
      e.canBeOrange !== undefined ||
      e.quickDisappear !== undefined;
    if (e.delete === true && changes) {
      ctx.addIssue({ code: 'custom', message: 'a deleted object takes no other change' });
    }
    if (e.delete !== true && !changes) {
      ctx.addIssue({ code: 'custom', message: 'the entry changes nothing' });
    }
  });

export const addEditSchema = z
  .strictObject({
    add: z.enum(['peg', 'brick']),
    /** Position of the new object. */
    at: point,
    /** A brick's facing (default: lying flat, facing up). */
    rotation: z.number().optional(),
    /** A brick's length. */
    length: z.number().min(BRICK_LENGTH_MIN).max(BRICK_LENGTH_MAX).optional(),
    ...flags,
  })
  .superRefine((e, ctx) => {
    if (e.add === 'peg' && (e.rotation !== undefined || e.length !== undefined)) {
      ctx.addIssue({ code: 'custom', message: 'a peg has no rotation or length' });
    }
  });

export const editSchema = z.union([addEditSchema, changeEditSchema]);

export type Edit = z.output<typeof editSchema>;
export type AddEdit = z.output<typeof addEditSchema>;
export type ChangeEdit = z.output<typeof changeEditSchema>;

export function isAddEdit(e: Edit): e is AddEdit {
  return 'add' in e;
}

export interface EditOutcome {
  /** The level's elements after the edits. */
  readonly elements: readonly LevelElement[];
  /** Edit entry index for every element an entry changed or added, by element id. */
  readonly entryOf: ReadonlyMap<number, number>;
  /** Element id each entry changed or added, by entry index (deleted ones included). */
  readonly target: ReadonlyMap<number, number>;
  /** Entries that could not be applied, with the reason. */
  readonly errors: readonly string[];
}

function fmt(p: readonly [number, number]): string {
  return `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`;
}

/** Applies a recipe's edit list to the generated elements. */
export function applyEdits(elements: readonly LevelElement[], edits: readonly Edit[]): EditOutcome {
  const errors: string[] = [];
  const entryOf = new Map<number, number>();
  const target = new Map<number, number>();
  const scoring = elements.filter(isScoringElement);
  const change = new Map<number, ChangeEdit>();
  edits.forEach((e, i) => {
    if (isAddEdit(e)) return;
    let best: LevelElement | null = null;
    let bestD = EDIT_MATCH;
    for (const el of scoring) {
      const dx = el.x - e.at[0];
      const dy = el.y - e.at[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= bestD && (best === null || d < bestD || el.id < best.id)) {
        best = el;
        bestD = d;
      }
    }
    if (best === null) {
      errors.push(`edit ${i + 1}: no peg or brick within ${EDIT_MATCH} px of ${fmt(e.at)}`);
      return;
    }
    const earlier = entryOf.get(best.id);
    if (earlier !== undefined) {
      errors.push(`edit ${i + 1}: the object at ${fmt(e.at)} is already edit ${earlier + 1}'s`);
      return;
    }
    if (e.rotation !== undefined && best.kind === 'peg') {
      errors.push(`edit ${i + 1}: the object at ${fmt(e.at)} is a peg, which has no rotation`);
      return;
    }
    entryOf.set(best.id, i);
    target.set(i, best.id);
    change.set(best.id, e);
  });
  const out: LevelElement[] = [];
  for (const el of elements) {
    const e = change.get(el.id);
    if (e === undefined) {
      out.push(el);
      continue;
    }
    if (e.delete === true || !isScoringElement(el)) continue;
    const moved: LevelElement = {
      ...el,
      ...(e.to === undefined ? {} : { x: e.to[0], y: e.to[1] }),
      ...(e.canBeOrange === undefined ? {} : { canBeOrange: e.canBeOrange }),
      ...(e.quickDisappear === undefined ? {} : { quickDisappear: e.quickDisappear }),
    };
    out.push(
      e.rotation !== undefined && (moved.kind === 'brick' || moved.kind === 'curvedBrick')
        ? { ...moved, rotation: e.rotation }
        : moved,
    );
  }
  let nextId = elements.reduce((m, el) => Math.max(m, el.id), 0) + 1;
  edits.forEach((e, i) => {
    if (!isAddEdit(e)) return;
    const id = nextId++;
    const common = {
      id,
      x: e.at[0],
      y: e.at[1],
      ...(e.canBeOrange === undefined ? {} : { canBeOrange: e.canBeOrange }),
      ...(e.quickDisappear === undefined ? {} : { quickDisappear: e.quickDisappear }),
    };
    out.push(
      elementSchema.parse(
        e.add === 'peg'
          ? { kind: 'peg', ...common, radius: PEG_RADIUS }
          : {
              kind: 'brick',
              ...common,
              rotation: e.rotation ?? HALF_PI,
              length: e.length ?? BRICK_LENGTH,
              width: BRICK_WIDTH,
            },
      ),
    );
    entryOf.set(id, i);
    target.set(i, id);
  });
  return { elements: out, entryOf, target, errors };
}
