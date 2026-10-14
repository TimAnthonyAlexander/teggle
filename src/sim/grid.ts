// Uniform grid broadphase in compressed-row form. Bodies are binned by their bounding box;
// a query visits the cells under a box and yields body indices, possibly more than once (the
// caller deduplicates). Positions outside the grid clamp to the border cells, which keeps
// queries correct for anything above, below or beside the board. Rebuilding reuses the
// arrays, so a per-tick rebuild only allocates when the item count outgrows them.

export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cellStart: Int32Array;
  items: Int32Array;
  private readonly fill: Int32Array;

  constructor(
    readonly originX: number,
    readonly originY: number,
    width: number,
    height: number,
    readonly cell: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.fill = new Int32Array(this.cols * this.rows);
    this.items = new Int32Array(64);
  }

  col(x: number): number {
    const c = Math.floor((x - this.originX) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  row(y: number): number {
    const r = Math.floor((y - this.originY) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /**
   * Bins `count` entries. Entry k has body index ids[k] and box
   * boxes[4k .. 4k + 3] = minX, minY, maxX, maxY.
   */
  build(count: number, ids: Int32Array, boxes: Float64Array): void {
    const start = this.cellStart;
    start.fill(0);
    let total = 0;
    for (let k = 0; k < count; k++) {
      const c0 = this.col(boxes[4 * k] ?? 0);
      const r0 = this.row(boxes[4 * k + 1] ?? 0);
      const c1 = this.col(boxes[4 * k + 2] ?? 0);
      const r1 = this.row(boxes[4 * k + 3] ?? 0);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * this.cols + c + 1;
          start[cell] = (start[cell] ?? 0) + 1;
        }
      }
      total += (r1 - r0 + 1) * (c1 - c0 + 1);
    }
    for (let i = 1; i < start.length; i++) start[i] = (start[i] ?? 0) + (start[i - 1] ?? 0);
    if (this.items.length < total)
      this.items = new Int32Array(Math.max(total, this.items.length * 2));
    const items = this.items;
    const fill = this.fill;
    for (let i = 0; i < fill.length; i++) fill[i] = start[i] ?? 0;
    for (let k = 0; k < count; k++) {
      const c0 = this.col(boxes[4 * k] ?? 0);
      const r0 = this.row(boxes[4 * k + 1] ?? 0);
      const c1 = this.col(boxes[4 * k + 2] ?? 0);
      const r1 = this.row(boxes[4 * k + 3] ?? 0);
      const id = ids[k] ?? 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * this.cols + c;
          const at = fill[cell] ?? 0;
          items[at] = id;
          fill[cell] = at + 1;
        }
      }
    }
  }
}
