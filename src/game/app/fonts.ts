// Loads the self-hosted webfonts before the first render (docs/assets.md lists their sources and
// licenses). If a font fails or times out, text falls back to a heavy system face and the
// measured cap ratio of that face, so sizes stay right either way.

import { createCanvas, context2d } from '../render/cache';
import { setFaceMetrics, fontFamily, type Face } from '../ui/text';
import { FONT_BODY, FONT_DISPLAY, FONT_DISPLAY_CAPS } from '../ui/tokens';

const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`Font load timed out after ${ms} ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function measureCapRatio(face: Face): number {
  const ctx = context2d(createCanvas(8, 8));
  ctx.font = `${face === 'body' ? 500 : 400} 100px ${fontFamily(face)}`;
  const m = ctx.measureText('H');
  return m.actualBoundingBoxAscent / 100;
}

export type FontStatus = Readonly<Record<Face, boolean>>;

export async function loadFonts(timeoutMs = 5000): Promise<FontStatus> {
  const base = import.meta.env.BASE_URL;
  const faces: [Face, FontFace][] = [
    [
      'display',
      new FontFace(FONT_DISPLAY, `url("${base}fonts/overload.woff2") format("woff2")`, {
        display: 'block',
      }),
    ],
    [
      'caps',
      new FontFace(FONT_DISPLAY_CAPS, `url("${base}fonts/overload-caps.woff2") format("woff2")`, {
        display: 'block',
      }),
    ],
    [
      'body',
      new FontFace(FONT_BODY, `url("${base}fonts/exo2-latin.woff2") format("woff2")`, {
        weight: '100 900',
        display: 'swap',
        unicodeRange: LATIN_RANGE,
      }),
    ],
  ];
  const results = await Promise.allSettled(faces.map(([, f]) => withTimeout(f.load(), timeoutMs)));
  const status: Record<Face, boolean> = { display: false, caps: false, body: false };
  results.forEach((r, i) => {
    const entry = faces[i];
    if (entry === undefined) return;
    const [face, fontFace] = entry;
    if (r.status === 'fulfilled') {
      document.fonts.add(fontFace);
      status[face] = true;
    }
  });
  for (const face of ['display', 'caps', 'body'] as const) {
    setFaceMetrics(face, status[face], 0.7);
    setFaceMetrics(face, status[face], measureCapRatio(face));
  }
  return status;
}
