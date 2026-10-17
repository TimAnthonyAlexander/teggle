import { describe, expect, it } from 'vitest';
import type { Look } from '../../src/gen/campaign-source';
import { ASPECT, centerCrop, magickArgs, parseCrop, PICTURE_H, PICTURE_W, webpSize } from './look';

const look: Look = {
  brightness: 1,
  saturation: 0.9,
  palette: ['#7a6650', '#c9b48e', '#f6efdc'],
  tint: 0.2,
  gamma: 1.05,
  floor: 0.14,
  ceiling: 0.96,
  paint: 2,
};

describe('picture crops', () => {
  it('cover the playfield opening at 3 px per world unit', () => {
    expect([PICTURE_W, PICTURE_H]).toEqual([2732, 1644]);
  });

  it('take the largest centered crop at the shipped aspect', () => {
    // A wide file loses its sides, a tall one its top and bottom.
    expect(centerCrop(4228, 2377)).toEqual([139, 0, 3950, 2377]);
    expect(centerCrop(4032, 3024)).toEqual([0, 299, 4032, 2426]);
    for (const [w, h] of [
      [6000, 4000],
      [1280, 854],
      [3000, 1000],
    ] as const) {
      const [x, y, cw, ch] = centerCrop(w, h);
      expect(x + cw).toBeLessThanOrEqual(w);
      expect(y + ch).toBeLessThanOrEqual(h);
      expect(Math.abs(cw / ch - ASPECT) / ASPECT).toBeLessThan(0.005);
    }
  });

  it('read a crop in pixels or in fractions, the height following from the aspect', () => {
    expect(parseCrop('0,0,2765', 3200, 2168)).toEqual([0, 0, 2765, 1664]);
    expect(parseCrop('0.5,0.25,0.5', 4000, 3000)).toEqual([2000, 750, 2000, 1204]);
    expect(parseCrop('center', 4228, 2377)).toEqual(centerCrop(4228, 2377));
    expect(() => parseCrop('0,0', 100, 100)).toThrow(/x,y,w/);
    expect(() => parseCrop('100,0,3200', 3200, 2168)).toThrow(/leaves/);
    expect(() => parseCrop('0,1000,3200', 3200, 2168)).toThrow(/leaves/);
  });
});

describe('WebP headers', () => {
  function header(chunk: string, body: readonly number[]): Uint8Array {
    const ascii = (s: string): number[] =>
      Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
    const bytes = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(chunk), 0, 0, 0, 0];
    return Uint8Array.from([...bytes, ...body, ...new Array<number>(16).fill(0)]);
  }

  it('give the size of a lossy, a lossless and an extended file', () => {
    // 2732 = 0x0aac, 1644 = 0x066c.
    expect(webpSize(header('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0xac, 0x0a, 0x6c, 0x06]))).toEqual([
      2732, 1644,
    ]);
    // Lossless: width - 1 in 14 bits, then height - 1.
    const bits = (2731 | (1643 << 14)) >>> 0;
    const lossless = [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24];
    expect(webpSize(header('VP8L', lossless))).toEqual([2732, 1644]);
    // Extended: 4 bytes of flags, then width - 1 and height - 1 in 24 bits each.
    expect(webpSize(header('VP8X', [0, 0, 0, 0, 0xab, 0x0a, 0, 0x6b, 0x06, 0]))).toEqual([
      2732, 1644,
    ]);
    expect(webpSize(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(webpSize(header('VP8 ', [0, 0, 0, 1, 2, 3, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('picture processing', () => {
  it('crops, mirrors, softens, grades and clamps in that order', () => {
    const args = magickArgs('in.jpg', [10, 20, 3000, 1805], true, look, 'out.png');
    const at = (a: string): number => args.indexOf(a);
    expect(args[0]).toBe('in.jpg[0]');
    expect(args[at('-crop') + 1]).toBe('3000x1805+10+20');
    expect(at('-flop')).toBeGreaterThan(at('-crop'));
    expect(args[at('-kuwahara') + 1]).toBe('2');
    expect(args[at('-selective-blur') + 1]).toBe('0x4+12%');
    expect(args[at('-blur') + 1]).toBe('0x2.4');
    expect(args[at('-modulate') + 1]).toBe('100,90,100');
    expect(args).toContain('gradient:#7a6650-#c9b48e');
    expect(args).toContain('gradient:#c9b48e-#f6efdc');
    expect(args).toContain('compose:args=20');
    expect(args[at('-gamma') + 1]).toBe('1.05');
    expect(args[at('+level') + 1]).toBe('14%,96%');
    expect(at('-kuwahara')).toBeLessThan(at('-modulate'));
    expect(at('-modulate')).toBeLessThan(at('-gamma'));
    expect(at('-gamma')).toBeLessThan(at('+level'));
    expect(args.at(-1)).toBe('out.png');
    // Every picture ends at the shipped size, whatever the crop.
    expect(args).toContain(`${PICTURE_W}x${PICTURE_H}!`);
  });

  it('leaves a picture unsoftened at paint 0 and unmirrored without flop', () => {
    const args = magickArgs('in.png', [0, 0, 2732, 1644], false, { ...look, paint: 0 }, 'o.png');
    expect(args).not.toContain('-kuwahara');
    expect(args).not.toContain('-selective-blur');
    expect(args).not.toContain('-blur');
    expect(args).not.toContain('-flop');
  });
});
