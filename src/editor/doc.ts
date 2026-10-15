// The line editor's document: a level's lines file and its campaign source (recipe, names,
// prompt), edited only through the pure functions here, so every change is one new value that
// undo and redo can hold.

import type { LevelSourceInput } from '../gen/campaign-source';
import type { Edit } from '../gen/edits';
import { SLUG, type Line, type LineGroup, type LinesFile, type Travel } from '../gen/lines';

export type Point = readonly [number, number];

export interface Doc {
  readonly lines: LinesFile;
  readonly source: LevelSourceInput;
}

/** Coordinates the editor writes: a tenth of a pixel, finer than anything visible. */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Edit positions keep two decimals: far inside the 2 px an edit matches by. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clampToBoard(file: LinesFile, p: Point): [number, number] {
  return [
    round1(Math.min(Math.max(p[0], 0), file.board.width)),
    round1(Math.min(Math.max(p[1], 0), file.board.height)),
  ];
}

export function lineIndex(doc: Doc, id: string): number {
  return doc.lines.lines.findIndex((l) => l.id === id);
}

export function findLine(doc: Doc, id: string | null): Line | null {
  if (id === null) return null;
  return doc.lines.lines.find((l) => l.id === id) ?? null;
}

/** A copy of an object without one key. */
function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const out = { ...o };
  Reflect.deleteProperty(out, key);
  return out;
}

function withLines(doc: Doc, lines: readonly Line[]): Doc {
  return { ...doc, lines: { ...doc.lines, lines: [...lines] } };
}

function withRecipe(doc: Doc, patch: Partial<LevelSourceInput['recipe']>): Doc {
  return { ...doc, source: { ...doc.source, recipe: { ...doc.source.recipe, ...patch } } };
}

/** Replaces one line (found by id) with the result of `f`. */
export function updateLine(doc: Doc, id: string, f: (line: Line) => Line): Doc {
  return withLines(
    doc,
    doc.lines.lines.map((l) => (l.id === id ? f(l) : l)),
  );
}

/** A fresh line id like "line-3" that no line has yet. */
export function freshId(doc: Doc, base = 'line'): string {
  const taken = new Set(doc.lines.lines.map((l) => l.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function addLine(doc: Doc, line: Line): Doc {
  const order = doc.source.recipe.lines;
  const next = withLines(doc, [...doc.lines.lines, line]);
  return order === undefined ? next : withRecipe(next, { lines: [...order, line.id] });
}

export function deleteLine(doc: Doc, id: string): Doc {
  const order = doc.source.recipe.lines;
  let next = withLines(
    doc,
    doc.lines.lines.filter((l) => l.id !== id),
  );
  if (order !== undefined) next = withRecipe(next, { lines: order.filter((x) => x !== id) });
  const fill = next.source.recipe.fill;
  if (fill !== undefined && fill !== 'none' && fill.within === id) {
    next = withRecipe(next, { fill: omit(fill, 'within') });
  }
  return next;
}

/** Why a line id cannot be used, or null. */
export function idProblem(doc: Doc, oldId: string, newId: string): string | null {
  if (!SLUG.test(newId)) return 'lowercase words joined by hyphens';
  if (newId !== oldId && doc.lines.lines.some((l) => l.id === newId)) return 'already taken';
  return null;
}

export function renameLine(doc: Doc, oldId: string, newId: string): Doc {
  if (oldId === newId || idProblem(doc, oldId, newId) !== null) return doc;
  let next = updateLine(doc, oldId, (l) => ({ ...l, id: newId }));
  const order = next.source.recipe.lines;
  if (order !== undefined) {
    next = withRecipe(next, { lines: order.map((x) => (x === oldId ? newId : x)) });
  }
  const fill = next.source.recipe.fill;
  if (fill !== undefined && fill !== 'none' && fill.within === oldId) {
    next = withRecipe(next, { fill: { ...fill, within: newId } });
  }
  // A group that follows the line follows it under its new name.
  if (next.lines.groups?.some((g) => g.movement?.line === oldId) === true) {
    next = withGroups(
      next,
      (next.lines.groups ?? []).map((g) =>
        g.movement?.line === oldId ? { ...g, movement: { ...g.movement, line: newId } } : g,
      ),
    );
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Moving lines: groups and travel (src/gen/lines.ts, src/gen/movers.ts)

function withGroups(doc: Doc, groups: readonly LineGroup[]): Doc {
  const lines: LinesFile = { ...doc.lines };
  if (groups.length === 0) Reflect.deleteProperty(lines, 'groups');
  else lines.groups = [...groups];
  return { ...doc, lines };
}

export function findGroup(doc: Doc, id: string | undefined): LineGroup | null {
  if (id === undefined) return null;
  return doc.lines.groups?.find((g) => g.id === id) ?? null;
}

/** A fresh group id like "group-2" that no group has yet. */
export function freshGroupId(doc: Doc, base = 'group'): string {
  const taken = new Set((doc.lines.groups ?? []).map((g) => g.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Adds a group, or replaces the one with its id. */
export function putGroup(doc: Doc, group: LineGroup): Doc {
  const groups = doc.lines.groups ?? [];
  const at = groups.findIndex((g) => g.id === group.id);
  return withGroups(
    doc,
    at < 0 ? [...groups, group] : groups.map((g, i) => (i === at ? group : g)),
  );
}

/**
 * Removes a group: its lines stand still again and the groups that rode on it ride on its
 * parent, or move on their own when it had none.
 */
export function deleteGroup(doc: Doc, id: string): Doc {
  const gone = findGroup(doc, id);
  if (gone === null) return doc;
  const groups = (doc.lines.groups ?? [])
    .filter((g) => g.id !== id)
    .map((g) => {
      if (g.parent !== id) return g;
      const out: LineGroup = { ...g };
      if (gone.parent === undefined) Reflect.deleteProperty(out, 'parent');
      else out.parent = gone.parent;
      return out;
    });
  const next = withGroups(doc, groups);
  return withLines(
    next,
    next.lines.lines.map((l) => (l.group === id ? withoutKey(l, 'group') : l)),
  );
}

export function renameGroup(doc: Doc, oldId: string, newId: string): Doc {
  if (oldId === newId || !SLUG.test(newId) || findGroup(doc, newId) !== null) return doc;
  const groups = (doc.lines.groups ?? []).map((g) => ({
    ...g,
    ...(g.id === oldId ? { id: newId } : {}),
    ...(g.parent === oldId ? { parent: newId } : {}),
  }));
  const next = withGroups(doc, groups);
  return withLines(
    next,
    next.lines.lines.map((l) => (l.group === oldId ? { ...l, group: newId } : l)),
  );
}

/** Puts a line in a group (or takes it out with undefined); a line in a group does not travel. */
export function setLineGroup(doc: Doc, lineId: string, group: string | undefined): Doc {
  return updateLine(doc, lineId, (l) => {
    const out = withoutKey(l, 'group');
    return group === undefined ? out : { ...out, group };
  });
}

/** Makes a line's objects travel along it, or stop (undefined). */
export function setLineTravel(doc: Doc, lineId: string, travel: Travel | undefined): Doc {
  return updateLine(doc, lineId, (l) => {
    const out = withoutKey(l, 'travel');
    return travel === undefined ? out : { ...out, travel };
  });
}

function withoutKey<T extends object>(o: T, key: keyof T): T {
  const out = { ...o };
  Reflect.deleteProperty(out, key);
  return out;
}

/** Moves a line one place earlier (-1) or later (+1) in placement order. */
export function reorderLine(doc: Doc, id: string, delta: -1 | 1): Doc {
  const order = doc.source.recipe.lines;
  if (order !== undefined) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return doc;
    const next = [...order];
    next[i] = order[j] ?? id;
    next[j] = id;
    return withRecipe(doc, { lines: next });
  }
  const lines = [...doc.lines.lines];
  const i = lines.findIndex((l) => l.id === id);
  const j = i + delta;
  const a = lines[i];
  const b = lines[j];
  if (a === undefined || b === undefined) return doc;
  lines[i] = b;
  lines[j] = a;
  return withLines(doc, lines);
}

/** The ids the recipe places, in order (recipe.lines when it is given). */
export function placementOrder(doc: Doc): string[] {
  return doc.source.recipe.lines ?? doc.lines.lines.map((l) => l.id);
}

export function movePoint(doc: Doc, id: string, index: number, p: Point): Doc {
  const q = clampToBoard(doc.lines, p);
  return updateLine(doc, id, (l) => ({
    ...l,
    points: l.points.map((old, i) => (i === index ? q : old)),
  }));
}

export function translateLine(doc: Doc, id: string, dx: number, dy: number): Doc {
  return updateLine(doc, id, (l) => ({
    ...l,
    points: l.points.map(([x, y]) => clampToBoard(doc.lines, [x + dx, y + dy])),
  }));
}

/** Inserts a point before `index` (so it gets that index); corners after it shift. */
export function insertPoint(doc: Doc, id: string, index: number, p: Point): Doc {
  const q = clampToBoard(doc.lines, p);
  return updateLine(doc, id, (l) => ({
    ...l,
    points: [...l.points.slice(0, index), q, ...l.points.slice(index)],
    corners: l.corners.map((c) => (c >= index ? c + 1 : c)),
  }));
}

/** Removes a point; a line keeps at least 2 points (3 when closed). */
export function deletePoint(doc: Doc, id: string, index: number): Doc {
  return updateLine(doc, id, (l) => {
    if (l.points.length <= (l.closed ? 3 : 2)) return l;
    return {
      ...l,
      points: l.points.filter((_, i) => i !== index),
      corners: l.corners.filter((c) => c !== index).map((c) => (c > index ? c - 1 : c)),
    };
  });
}

export function toggleCorner(doc: Doc, id: string, index: number): Doc {
  return updateLine(doc, id, (l) => ({
    ...l,
    corners: l.corners.includes(index)
      ? l.corners.filter((c) => c !== index)
      : [...l.corners, index].sort((a, b) => a - b),
  }));
}

export function setClosed(doc: Doc, id: string, closed: boolean): Doc {
  return updateLine(doc, id, (l) => (l.points.length < 3 && closed ? l : { ...l, closed }));
}

/** Sets or clears optional line fields (undefined removes the field). */
export function setLineFields(
  doc: Doc,
  id: string,
  fields: {
    readonly note?: string | undefined;
    readonly mode?: Line['mode'];
    readonly spacing?: number | undefined;
    readonly keepSpacing?: boolean | undefined;
  },
): Doc {
  return updateLine(doc, id, (l) => {
    const out: Record<string, unknown> = { ...l };
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === '' || v === false) Reflect.deleteProperty(out, k);
      else out[k] = v;
    }
    if (out.mode === undefined) out.mode = l.mode;
    return out as Line;
  });
}

export function setEdits(doc: Doc, edits: readonly Edit[]): Doc {
  if (edits.length === 0) {
    return { ...doc, source: { ...doc.source, recipe: omit(doc.source.recipe, 'edits') } };
  }
  return withRecipe(doc, { edits: [...edits] });
}

export function recipeEdits(doc: Doc): readonly Edit[] {
  return doc.source.recipe.edits ?? [];
}

export function setRecipeFields(doc: Doc, patch: Partial<LevelSourceInput['recipe']>): Doc {
  return withRecipe(doc, patch);
}

export function setSourceFields(
  doc: Doc,
  patch: {
    readonly name?: string;
    readonly subject?: string;
    readonly composition?: string;
    readonly layout?: string;
    readonly prompt?: string;
  },
): Doc {
  const s = doc.source;
  return {
    ...doc,
    source: {
      ...s,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      concept: {
        ...s.concept,
        ...(patch.subject === undefined ? {} : { subject: patch.subject }),
        ...(patch.composition === undefined ? {} : { composition: patch.composition }),
        ...(patch.layout === undefined ? {} : { layout: patch.layout }),
      },
      background: {
        ...s.background,
        ...(patch.prompt === undefined ? {} : { prompt: patch.prompt }),
      },
    },
  };
}
