// Manual edits as the editor makes them: each user action on a peg or brick becomes the recipe's
// edit list with at most one entry per object (src/gen/edits.ts). Moving an object twice
// updates its entry; deleting an added object removes its entry; an entry that no longer
// changes anything goes away.

import {
  isAddEdit,
  type AddEdit,
  type ChangeEdit,
  type Edit,
  type EditOutcome,
} from '../gen/edits';
import { isScoringElement, type LevelElement, type ScoringElement } from '../level/schema';
import { round1, round2, type Point } from './doc';

/** Where a shown object comes from. */
export interface Origin {
  /** The object as the generator placed it, before any edit; null for an added one. */
  readonly generated: ScoringElement | null;
  /** The edit entry that changes or added it, or -1. */
  readonly entry: number;
}

export function originOf(
  shown: { readonly generated: readonly LevelElement[]; readonly edits: EditOutcome },
  id: number,
): Origin {
  const g = shown.generated.find((e) => e.id === id);
  return {
    generated: g !== undefined && isScoringElement(g) ? g : null,
    entry: shown.edits.entryOf.get(id) ?? -1,
  };
}

type Flag = 'canBeOrange' | 'quickDisappear';
const FLAG_DEFAULTS: Record<Flag, boolean> = { canBeOrange: true, quickDisappear: false };

function same(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
}

function rotationOf(e: ScoringElement): number | null {
  return e.kind === 'peg' ? null : e.rotation;
}

/** A change entry with the fields equal to the generated object's dropped; null if empty. */
function tidy(entry: ChangeEdit, generated: ScoringElement): ChangeEdit | null {
  if (entry.delete === true) return { at: entry.at, delete: true };
  const out: { -readonly [K in keyof ChangeEdit]: ChangeEdit[K] } = { at: entry.at };
  if (entry.to !== undefined && !same(entry.to, [generated.x, generated.y])) out.to = entry.to;
  if (entry.rotation !== undefined && entry.rotation !== rotationOf(generated)) {
    out.rotation = entry.rotation;
  }
  if (entry.canBeOrange !== undefined && entry.canBeOrange !== generated.canBeOrange) {
    out.canBeOrange = entry.canBeOrange;
  }
  if (entry.quickDisappear !== undefined && entry.quickDisappear !== generated.quickDisappear) {
    out.quickDisappear = entry.quickDisappear;
  }
  return Object.keys(out).length > 1 ? out : null;
}

function replace(edits: readonly Edit[], index: number, entry: Edit | null): Edit[] {
  if (index < 0) return entry === null ? [...edits] : [...edits, entry];
  const out = [...edits];
  if (entry === null) out.splice(index, 1);
  else out[index] = entry;
  return out;
}

/** The entry that changes a generated object, merged with `patch`. */
function change(edits: readonly Edit[], o: Origin, patch: Partial<ChangeEdit>): Edit[] {
  const g = o.generated;
  if (g === null) return [...edits];
  const old = o.entry >= 0 ? edits[o.entry] : undefined;
  const base: ChangeEdit =
    old !== undefined && !isAddEdit(old) ? old : { at: [round2(g.x), round2(g.y)] };
  const merged: ChangeEdit = { ...base, ...patch };
  return replace(edits, o.entry, tidy(merged, g));
}

function added(edits: readonly Edit[], o: Origin): AddEdit | null {
  const e = o.entry >= 0 ? edits[o.entry] : undefined;
  return e !== undefined && isAddEdit(e) ? e : null;
}

export function moveObject(edits: readonly Edit[], o: Origin, to: Point): Edit[] {
  const p: [number, number] = [round1(to[0]), round1(to[1])];
  const a = added(edits, o);
  if (a !== null) return replace(edits, o.entry, { ...a, at: p });
  return change(edits, o, { to: p });
}

export function rotateObject(edits: readonly Edit[], o: Origin, rotation: number): Edit[] {
  const r = Math.round(rotation * 1e4) / 1e4;
  const a = added(edits, o);
  if (a !== null)
    return a.add === 'brick' ? replace(edits, o.entry, { ...a, rotation: r }) : [...edits];
  if (o.generated === null || o.generated.kind === 'peg') return [...edits];
  return change(edits, o, { rotation: r });
}

export function deleteObject(edits: readonly Edit[], o: Origin): Edit[] {
  if (added(edits, o) !== null) return replace(edits, o.entry, null);
  const g = o.generated;
  if (g === null) return [...edits];
  const old = o.entry >= 0 ? edits[o.entry] : undefined;
  const at = old !== undefined && !isAddEdit(old) ? old.at : ([round2(g.x), round2(g.y)] as const);
  return replace(edits, o.entry, { at: [at[0], at[1]], delete: true });
}

export function setFlag(edits: readonly Edit[], o: Origin, flag: Flag, value: boolean): Edit[] {
  const a = added(edits, o);
  if (a !== null) {
    const next: Record<string, unknown> = { ...a };
    if (value === FLAG_DEFAULTS[flag]) Reflect.deleteProperty(next, flag);
    else next[flag] = value;
    return replace(edits, o.entry, next as AddEdit);
  }
  return change(
    edits,
    o,
    flag === 'canBeOrange' ? { canBeOrange: value } : { quickDisappear: value },
  );
}

export function addObject(
  edits: readonly Edit[],
  kind: 'peg' | 'brick',
  at: Point,
  rotation?: number,
): Edit[] {
  const p: [number, number] = [round1(at[0]), round1(at[1])];
  const entry: AddEdit =
    kind === 'brick' && rotation !== undefined
      ? { add: kind, at: p, rotation: Math.round(rotation * 1e4) / 1e4 }
      : { add: kind, at: p };
  return [...edits, entry];
}

export function removeEntry(edits: readonly Edit[], index: number): Edit[] {
  return replace(edits, index, null);
}

/** One line of text describing an entry, for the edit list. */
export function describeEdit(e: Edit): string {
  const p = (q: readonly [number, number]) => `(${q[0]}, ${q[1]})`;
  const flags = [
    e.canBeOrange === undefined ? '' : e.canBeOrange ? 'can be orange' : 'never orange',
    e.quickDisappear === undefined ? '' : e.quickDisappear ? 'quick disappear' : 'stays',
  ].filter((s) => s !== '');
  if (isAddEdit(e)) {
    const r = e.rotation === undefined ? '' : `, turned ${e.rotation}`;
    return [`add ${e.add} at ${p(e.at)}${r}`, ...flags].join(', ');
  }
  if (e.delete === true) return `delete ${p(e.at)}`;
  const parts = [
    e.to === undefined ? `at ${p(e.at)}` : `move ${p(e.at)} to ${p(e.to)}`,
    e.rotation === undefined ? '' : `turn to ${e.rotation}`,
    ...flags,
  ].filter((s) => s !== '');
  return parts.join(', ');
}
