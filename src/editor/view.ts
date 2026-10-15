// The editor's camera: how many screen pixels one board unit covers and which board point sits
// at the canvas's top left. Screen coordinates are CSS pixels of the canvas element.

export interface View {
  /** Screen pixels per board unit. */
  readonly zoom: number;
  /** Board coordinates at the canvas's top left. */
  readonly x: number;
  readonly y: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 16;

export function toScreen(v: View, bx: number, by: number): { x: number; y: number } {
  return { x: (bx - v.x) * v.zoom, y: (by - v.y) * v.zoom };
}

export function toBoard(v: View, sx: number, sy: number): { x: number; y: number } {
  return { x: v.x + sx / v.zoom, y: v.y + sy / v.zoom };
}

/** The view that shows a board area (x0, y0)-(x1, y1) whole and centered in a canvas. */
export function fitView(
  width: number,
  height: number,
  area: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
): View {
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.min(width / (area.x1 - area.x0), height / (area.y1 - area.y0))),
  );
  return {
    zoom,
    x: (area.x0 + area.x1) / 2 - width / 2 / zoom,
    y: (area.y0 + area.y1) / 2 - height / 2 / zoom,
  };
}

/** Zooms by `factor` keeping the board point under the screen point (sx, sy) in place. */
export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  const p = toBoard(v, sx, sy);
  return { zoom, x: p.x - sx / zoom, y: p.y - sy / zoom };
}

export function panBy(v: View, dxScreen: number, dyScreen: number): View {
  return { ...v, x: v.x - dxScreen / v.zoom, y: v.y - dyScreen / v.zoom };
}

/** The view moved so a board point sits in the middle of the canvas. */
export function centerOn(v: View, width: number, height: number, bx: number, by: number): View {
  return { ...v, x: bx - width / 2 / v.zoom, y: by - height / 2 / v.zoom };
}
