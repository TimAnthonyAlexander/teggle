// Deterministic math for everything that feeds the simulation (spec 13.4).
//
// ECMA-262 lets engines approximate Math.sin, Math.cos, Math.atan2 and friends, so two
// browsers can disagree in the last bit. These ports of musl's kernels use only +, -, *, /,
// Math.round and Math.abs, which the spec defines exactly, so every engine gives the same bits.
// Math.sqrt is exactly rounded by the spec and is safe to use directly.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11; // pi/2 - PIO2_1
const PIO4 = 7.85398163397448278999e-1;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

// Kernel sine on [-pi/4, pi/4]; x + y is the reduced argument with y the tail.
function kernelSin(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

// Kernel cosine on [-pi/4, pi/4].
function kernelCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const one = 1 - hz;
  return one + (1 - one - hz + (z * r - x * y));
}

let reducedHead = 0;
let reducedTail = 0;

// Reduces x to head + tail in [-pi/4, pi/4] and returns the quadrant (0 to 3). Accurate for
// |x| up to about 2^20 * pi/2; beyond that it stays deterministic but loses precision.
function reduce(x: number): number {
  const n = Math.round(x * INV_PIO2);
  const r = x - n * PIO2_1; // exact: PIO2_1 has 33 significant bits
  const w = n * PIO2_1T;
  reducedHead = r - w;
  reducedTail = r - reducedHead - w;
  return ((n % 4) + 4) % 4;
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (Math.abs(x) <= PIO4) return x === 0 ? x : kernelSin(x, 0);
  switch (reduce(x)) {
    case 0:
      return kernelSin(reducedHead, reducedTail);
    case 1:
      return kernelCos(reducedHead, reducedTail);
    case 2:
      return -kernelSin(reducedHead, reducedTail);
    default:
      return -kernelCos(reducedHead, reducedTail);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (Math.abs(x) <= PIO4) return kernelCos(x, 0);
  switch (reduce(x)) {
    case 0:
      return kernelCos(reducedHead, reducedTail);
    case 1:
      return -kernelSin(reducedHead, reducedTail);
    case 2:
      return -kernelCos(reducedHead, reducedTail);
    default:
      return kernelSin(reducedHead, reducedTail);
  }
}

export interface SinCos {
  sin: number;
  cos: number;
}

/**
 * Sine and cosine of one angle with a single argument reduction. Gives exactly the bits of
 * sin(x) and cos(x); it only saves the second reduction on the simulation's hot path.
 */
export function sincos(x: number, out: SinCos): SinCos {
  if (!Number.isFinite(x)) {
    out.sin = Number.NaN;
    out.cos = Number.NaN;
    return out;
  }
  if (Math.abs(x) <= PIO4) {
    out.sin = x === 0 ? x : kernelSin(x, 0);
    out.cos = kernelCos(x, 0);
    return out;
  }
  const quadrant = reduce(x);
  const s = kernelSin(reducedHead, reducedTail);
  const c = kernelCos(reducedHead, reducedTail);
  switch (quadrant) {
    case 0:
      out.sin = s;
      out.cos = c;
      break;
    case 1:
      out.sin = c;
      out.cos = -s;
      break;
    case 2:
      out.sin = -s;
      out.cos = -c;
      break;
    default:
      out.sin = -c;
      out.cos = s;
  }
  return out;
}

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
] as const;
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
] as const;
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;

export function atan(x: number): number {
  if (Number.isNaN(x)) return x;
  const negative = x < 0;
  let a = Math.abs(x);
  if (a >= 7.378697629483821e19) return negative ? -HALF_PI : HALF_PI; // 2^66
  let id: number;
  if (a < 0.4375) {
    if (a < 7.450580596923828e-9) return x; // 2^-27
    id = -1;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return x - x * (s1 + s2);
  const hi = ATAN_HI[id as 0 | 1 | 2 | 3];
  const lo = ATAN_LO[id as 0 | 1 | 2 | 3];
  const result = hi - (a * (s1 + s2) - lo - a);
  return negative ? -result : result;
}

const PI_LO = 1.2246467991473532e-16;

export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  const yNegative = y < 0 || Object.is(y, -0);
  const xNegative = x < 0 || Object.is(x, -0);
  if (y === 0) {
    if (!xNegative) return y;
    return yNegative ? -PI : PI;
  }
  if (x === 0) return yNegative ? -HALF_PI : HALF_PI;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const ax = Number.isFinite(x) ? 0 : x > 0 ? 1 : -1;
    const ay = Number.isFinite(y) ? 0 : y > 0 ? 1 : -1;
    if (ax !== 0 && ay !== 0) {
      const base = ax > 0 ? PIO4 : 3 * PIO4;
      return ay > 0 ? base : -base;
    }
    if (ay !== 0) return ay > 0 ? HALF_PI : -HALF_PI;
    if (ax > 0) return yNegative ? -0 : 0;
    return yNegative ? -PI : PI;
  }
  const z = atan(Math.abs(y / x));
  if (!xNegative) return yNegative ? -z : z;
  return yNegative ? z - PI_LO - PI : PI - (z - PI_LO);
}

// Natural logarithm: a port of fdlibm's __ieee754_log, which musl also shipped before 2017.
// Its bit tricks on the high and low 32-bit words of the double go through a DataView, which
// reads and writes the IEEE 754 bits exactly in every engine. Error below 1 ulp.
const LN2_HI = 6.9314718036912381649e-1; // 0x3fe62e42 0xfee00000
const LN2_LO = 1.90821492927058770002e-10; // 0x3dea39ef 0x35793c76
const TWO54 = 1.8014398509481984e16;
const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

const words = new DataView(new ArrayBuffer(8));

export function log(x: number): number {
  words.setFloat64(0, x);
  let hx = words.getInt32(0);
  const lx = words.getUint32(4);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return Number.NaN;
    // Subnormal: scale up into the normal range.
    k -= 54;
    x *= TWO54;
    words.setFloat64(0, x);
    hx = words.getInt32(0);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  // Normalize x or x/2 into [sqrt(2)/2, sqrt(2)) by replacing its exponent.
  words.setInt32(0, hx | (i ^ 0x3ff00000));
  x = words.getFloat64(0);
  k += i >> 20;
  const f = x - 1;
  const dk = k;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    if (k === 0) return f - r;
    return dk * LN2_HI - (r - dk * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + r));
    return dk * LN2_HI - (hfsq - (s * (hfsq + r) + dk * LN2_LO) - f);
  }
  if (k === 0) return f - s * (f - r);
  return dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f);
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  const turns = Math.round(a / TAU);
  let r = a - turns * TAU;
  if (r >= PI) r -= TAU;
  if (r < -PI) r += TAU;
  return r;
}
