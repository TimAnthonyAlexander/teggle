// Bit-exact digests for determinism checks: the same numbers give the same digest in every
// engine, and any difference in any bit changes it.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export class Digest {
  private h1 = FNV_OFFSET;
  private h2 = 0x9747b28c;
  private readonly view = new DataView(new ArrayBuffer(8));

  number(x: number): this {
    this.view.setFloat64(0, x);
    for (let i = 0; i < 8; i++) this.byte(this.view.getUint8(i));
    return this;
  }

  int(x: number): this {
    this.view.setInt32(0, x);
    for (let i = 0; i < 4; i++) this.byte(this.view.getUint8(i));
    return this;
  }

  string(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c & 0xff);
      this.byte(c >>> 8);
    }
    return this;
  }

  hex(): string {
    return (
      (this.h1 >>> 0).toString(16).padStart(8, '0') + (this.h2 >>> 0).toString(16).padStart(8, '0')
    );
  }

  private byte(b: number): void {
    this.h1 = Math.imul(this.h1 ^ b, FNV_PRIME);
    this.h2 = Math.imul(this.h2 ^ b, 0x5bd1e995);
    this.h2 ^= this.h2 >>> 13;
  }
}

export function digestNumbers(values: readonly number[]): string {
  const d = new Digest();
  for (const v of values) d.number(v);
  return d.hex();
}
