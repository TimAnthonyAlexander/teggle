// Small color helpers for procedural drawing. Colors are '#rrggbb' strings throughout.

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null) throw new Error(`Not a #rrggbb color: ${hex}`);
  const v = Number.parseInt(m[1] ?? '000000', 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function channel(v: number): string {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return c.toString(16).padStart(2, '0');
}

export function toHex(rgb: Rgb): string {
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/** Linear blend from a (t = 0) to b (t = 1). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function lighten(c: string, t: number): string {
  return mix(c, '#ffffff', t);
}

export function darken(c: string, t: number): string {
  return mix(c, '#000000', t);
}

/** CSS rgba() string with the given alpha. */
export function rgba(c: string, alpha: number): string {
  const [r, g, b] = parseHex(c);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/** Relative luminance in 0..1 (sRGB, Rec. 709 weights), for picking readable ink. */
export function luminance(c: string): number {
  const [r, g, b] = parseHex(c);
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
