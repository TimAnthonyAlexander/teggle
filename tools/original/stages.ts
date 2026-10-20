// Reads the level list of the original's stage config (`levels/stages.cfg` in its main.pak,
// docs/research/original-tech.md section 2.1): each stage's `Level: <file>, <display name>` lines
// in play order. Block comments are skipped (stage 2 keeps an old list in one); a level without a
// display name shows its file name, as stage 6's five do.

export interface StageLevel {
  /** The level's file name as the config writes it, e.g. "ThreeValleys". */
  readonly file: string;
  /** Its display name, e.g. "Skate Park". */
  readonly name: string;
}

const LEVEL_LINE = /^\s*Level:\s*([A-Za-z0-9_]+)\s*(?:,\s*(.*?))?\s*$/;

/** The levels of a stages.cfg text in play order. */
export function parseStageLevels(text: string): StageLevel[] {
  const out: StageLevel[] = [];
  for (const line of text.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/)) {
    const m = LEVEL_LINE.exec(line);
    if (m === null) continue;
    const file = m[1] ?? '';
    const raw = (m[2] ?? '').trim();
    const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
    const name = (quoted ? raw.slice(1, -1) : raw).trim();
    out.push({ file, name: name === '' ? file : name });
  }
  return out;
}
