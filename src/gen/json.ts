// JSON text for the source files people read and diff, so a file the line editor writes looks
// like one written by hand.
//
// sourceJson: what Prettier makes of the value (printWidth 100, the repository's .prettierrc),
// so `npm run format:check` accepts campaign/levels/<id>.json as the editor writes it. Prettier
// keeps an object expanded when its text has a line break after "{", so the choice is ours: the
// top level and the objects directly in it are expanded, deeper objects stay on one line when
// they fit. Arrays follow Prettier's own rules: arrays of two or more objects (or arrays) that
// each have two or more entries break one per line, number arrays that break fill each line,
// other arrays stay on one line when they fit and break one per line when they do not.
//
// linesJson: the lines file style (public/levels/campaign/<id>.lines.json, outside Prettier):
// the groups of moving lines first, one per line where they fit, then one line object per
// block, its keys in a fixed order, its travel on one line and its points as [x, y] pairs packed
// into rows of at most 100 columns.

import type { Line, LineGroup, LinesFile } from './lines';

const WIDTH = 100;
const INDENT = '  ';

type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

function isObject(v: Json): v is { readonly [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArray(v: Json): v is readonly Json[] {
  return Array.isArray(v);
}

function scalar(v: Json): string {
  if (typeof v === 'number') return JSON.stringify(v).replace('e+', 'e');
  return JSON.stringify(v);
}

/** Prettier breaks an array of two or more objects or arrays that each hold two or more items. */
function matrix(a: readonly Json[]): boolean {
  if (a.length < 2) return false;
  const first = a[0];
  if (first === undefined) return false;
  const kind = Array.isArray(first) ? 'array' : isObject(first) ? 'object' : null;
  if (kind === null) return false;
  return a.every((e) =>
    kind === 'array' ? Array.isArray(e) && e.length > 1 : isObject(e) && Object.keys(e).length > 1,
  );
}

/** One-line text of a value, or null when it may not stand on one line. */
function flat(v: Json, depth: number): string | null {
  if (isArray(v)) {
    if (v.length === 0) return '[]';
    if (matrix(v)) return null;
    const parts = v.map((e) => flat(e, depth + 1));
    return parts.some((p) => p === null) ? null : `[${parts.join(', ')}]`;
  }
  if (isObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    if (depth <= 1) return null;
    const parts = keys.map((k) => {
      const inner = flat(v[k] ?? null, depth + 1);
      return inner === null ? null : `${JSON.stringify(k)}: ${inner}`;
    });
    return parts.some((p) => p === null) ? null : `{ ${parts.join(', ')} }`;
  }
  return scalar(v);
}

/**
 * Prints a value that starts at `column` on a line indented `level` deep; `tail` characters
 * (a comma) follow it on the same line.
 */
function print(v: Json, level: number, column: number, tail: number, depth: number): string {
  const one = flat(v, depth);
  if (one !== null && column + one.length + tail <= WIDTH) return one;
  const pad = INDENT.repeat(level + 1);
  const close = INDENT.repeat(level);
  if (isArray(v)) {
    if (v.length > 1 && v.every((e) => typeof e === 'number')) {
      // Prettier's fill: as many numbers per line as fit, a comma after each but the last.
      const items = v.map((e, i) => scalar(e) + (i < v.length - 1 ? ',' : ''));
      const rows: string[] = [];
      let row = '';
      for (const item of items) {
        if (row === '') row = item;
        else if (pad.length + row.length + 1 + item.length <= WIDTH) row += ` ${item}`;
        else {
          rows.push(row);
          row = item;
        }
      }
      rows.push(row);
      return `[\n${rows.map((r) => pad + r).join('\n')}\n${close}]`;
    }
    const items = v.map(
      (e, i) => pad + print(e, level + 1, pad.length, i < v.length - 1 ? 1 : 0, depth + 1),
    );
    return `[\n${items.join(',\n')}\n${close}]`;
  }
  if (isObject(v)) {
    const keys = Object.keys(v);
    const items = keys.map((k, i) => {
      const key = `${JSON.stringify(k)}: `;
      const value = print(
        v[k] ?? null,
        level + 1,
        pad.length + key.length,
        i < keys.length - 1 ? 1 : 0,
        depth + 1,
      );
      return pad + key + value;
    });
    return `{\n${items.join(',\n')}\n${close}}`;
  }
  return scalar(v);
}

/** Prettier-compatible JSON text with a final newline (see the file comment). */
export function sourceJson(value: unknown): string {
  return `${print(JSON.parse(JSON.stringify(value)) as Json, 0, 0, 0, 0)}\n`;
}

function pointsText(points: readonly (readonly [number, number])[]): string {
  const pairs = points.map(([x, y]) => `[${scalar(x)}, ${scalar(y)}]`);
  const inline = `      "points": [${pairs.join(', ')}]`;
  if (inline.length <= WIDTH) return inline;
  const pad = INDENT.repeat(4);
  const rows: string[] = [];
  let row = '';
  pairs.forEach((p, i) => {
    const item = p + (i < pairs.length - 1 ? ',' : '');
    if (row === '') row = item;
    else if (pad.length + row.length + 1 + item.length <= WIDTH) row += ` ${item}`;
    else {
      rows.push(row);
      row = item;
    }
  });
  rows.push(row);
  return `      "points": [\n${rows.map((r) => pad + r).join('\n')}\n      ]`;
}

/** Movement and travel fields in a fixed order. */
const CLOCK_KEYS = [
  'type',
  'line',
  'period',
  'reverse',
  'offset',
  'phase',
  'radius',
  'radius2',
  'pathRotation',
  'maxAngle',
  'pause1',
  'pause1At',
  'pause2',
  'pause2At',
  'postDelayPhase',
] as const;

/** A movement or travel object on one line, its keys in CLOCK_KEYS order. */
function clockText(m: Readonly<Partial<Record<(typeof CLOCK_KEYS)[number], unknown>>>): string {
  const parts = CLOCK_KEYS.flatMap((k) =>
    m[k] === undefined ? [] : [`${JSON.stringify(k)}: ${scalar(m[k] as Json)}`],
  );
  return `{ ${parts.join(', ')} }`;
}

function lineText(line: Line): string {
  const fields: string[] = [`"id": ${JSON.stringify(line.id)}`];
  if (line.note !== undefined) fields.push(`"note": ${JSON.stringify(line.note)}`);
  fields.push(`"mode": ${JSON.stringify(line.mode)}`);
  if (line.closed) fields.push('"closed": true');
  if (line.spacing !== undefined) fields.push(`"spacing": ${scalar(line.spacing)}`);
  if (line.keepSpacing === true) fields.push('"keepSpacing": true');
  if (line.group !== undefined) fields.push(`"group": ${JSON.stringify(line.group)}`);
  if (line.travel !== undefined) fields.push(`"travel": ${clockText(line.travel)}`);
  if (line.corners.length > 0) fields.push(`"corners": [${line.corners.map(scalar).join(', ')}]`);
  const body = fields.map((f) => `      ${f}`);
  body.push(pointsText(line.points));
  return `    {\n${body.join(',\n')}\n    }`;
}

/** A group on one line when it fits, else one field per line. */
function groupText(g: LineGroup): string {
  const fields: string[] = [`"id": ${JSON.stringify(g.id)}`];
  if (g.note !== undefined) fields.push(`"note": ${JSON.stringify(g.note)}`);
  if (g.parent !== undefined) fields.push(`"parent": ${JSON.stringify(g.parent)}`);
  if (g.pivot !== undefined) fields.push(`"pivot": [${scalar(g.pivot[0])}, ${scalar(g.pivot[1])}]`);
  if (g.movement !== undefined) fields.push(`"movement": ${clockText(g.movement)}`);
  const one = `    { ${fields.join(', ')} }`;
  if (one.length <= WIDTH) return one;
  return `    {\n${fields.map((f) => `      ${f}`).join(',\n')}\n    }`;
}

/** A lines file in its hand-written style (see the file comment). */
export function linesJson(file: LinesFile): string {
  const head = [
    `  "formatVersion": ${file.formatVersion}`,
    `  "background": ${JSON.stringify(file.background)}`,
    `  "board": { "width": ${scalar(file.board.width)}, "height": ${scalar(file.board.height)} }`,
  ];
  if (file.groups !== undefined && file.groups.length > 0) {
    head.push(`  "groups": [\n${file.groups.map(groupText).join(',\n')}\n  ]`);
  }
  if (file.lines.length === 0) return `{\n${head.join(',\n')},\n  "lines": []\n}\n`;
  const lines = file.lines.map(lineText);
  return `{\n${head.join(',\n')},\n  "lines": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
