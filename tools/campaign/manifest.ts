// The asset manifest's record of the campaign backgrounds (docs/assets.md, "Backgrounds"): one
// table of the stages' looks and one row per shipped picture, made from the level sources and
// the shipped files, so the manifest says exactly what the sources and files say.
// `npm run campaign:art -- manifest` prints it; tools/campaign/backgrounds.test.ts checks that
// docs/assets.md holds it unchanged.

import { lookOf, type StageSource } from '../../src/gen/campaign-source';
import type { LoadedLevelSource } from './source';

/** A shipped picture's bytes, as the manifest records them. */
export interface ShippedFile {
  readonly bytes: number;
  readonly sha256: string;
}

/** Markdown table cell text: pipes escaped, line breaks flattened. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function link(text: string, url: string | undefined): string {
  const t = cell(text).replace(/[[\]]/g, '');
  return url === undefined ? t : `[${t}](${url})`;
}

function thousands(n: number): string {
  return n.toLocaleString('en-US');
}

/** Number as the sources write it (no trailing zeros). */
function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** The last part of a URL's path, as the image link's text. */
function fileName(url: string): string {
  const name = new URL(url).pathname
    .split('/')
    .filter((s) => s !== '')
    .at(-1);
  return name === undefined ? url : decodeURIComponent(name);
}

/** The id a source gives the picture: "pexels:123" -> "123". */
function sourceId(ref: string): string {
  return ref.slice(ref.indexOf(':') + 1);
}

/** What the picture's processing changes from its stage's look, in source order. */
function processing(src: LoadedLevelSource): string {
  const p = src.level.background.picture;
  if (p === undefined) return '';
  const [x, y, w, h] = p.crop;
  const look = lookOf(src.stage, p);
  const changes = Object.entries(p.adjust)
    .filter(([k, v]) => v !== undefined && k !== 'paint')
    .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(' ') : num(Number(v))}`);
  return [
    `${p.kind}, crop ${x},${y} ${w} x ${h} of ${p.size[0]} x ${p.size[1]}${p.flop ? ', mirrored' : ''}`,
    [`paint ${num(look.paint)}`, ...changes].join(', '),
  ].join('; ');
}

function looksTable(stages: readonly StageSource[]): string {
  const rows = stages.map((s) => {
    const l = s.look;
    return `| ${s.stage} ${cell(s.world)} | ${num(l.brightness)} | ${num(l.saturation)} | ${l.palette.map((c) => `\`${c}\``).join(' ')} | ${num(l.tint)} | ${num(l.gamma)} | ${num(l.floor)} to ${num(l.ceiling)} |`;
  });
  return [
    '| Stage | Brightness | Saturation | Palette (shadow, middle, light) | Tint | Gamma | Values |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function filesTable(
  levels: readonly LoadedLevelSource[],
  files: ReadonlyMap<string, ShippedFile>,
): string {
  const rows = levels.flatMap((src) => {
    const p = src.level.background.picture;
    const id = src.level.background.id;
    const file = files.get(id);
    if (p === undefined || file === undefined) return [];
    return [
      [
        `\`public/backgrounds/${id}.webp\``,
        `${src.level.id} ${cell(src.level.name)}`,
        link(`${p.source} ${sourceId(p.ref)}`, p.page),
        link(fileName(p.image), p.image),
        p.author === undefined ? 'not stated' : link(p.author, p.authorUrl),
        p.license === undefined ? 'not stated' : link(p.license, p.licenseUrl),
        p.fetched,
        `${processing(src)}; ${thousands(file.bytes)} bytes`,
        `\`${file.sha256}\``,
      ],
    ];
  });
  return [
    '| File | Level | Source page | Image | Author | License | Fetched | Processing | SHA-256 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/**
 * The manifest's two background tables: each stage's look, then every level's picture with
 * where it came from, how it was processed and the shipped file's size and SHA-256.
 */
export function backgroundsManifest(
  stages: readonly StageSource[],
  levels: readonly LoadedLevelSource[],
  files: ReadonlyMap<string, ShippedFile>,
): string {
  return `${looksTable(stages)}\n\n${filesTable(levels, files)}\n`;
}
