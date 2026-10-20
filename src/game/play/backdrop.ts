// The playfield behind the pegs: the level's background picture (spec 12), loaded by its asset
// id from public/backgrounds/<id>.webp and drawn into the playfield opening; the original's
// levels draw theirs (public/original/backgrounds/) where the original put it on the board. A
// level whose picture is missing or fails to load gets a plain, quiet night-blue field instead:
// no scenery pretending to be its art. The plain field fills the whole world under the picture
// too, so the Fever zoom never shows an edge while the frame fades.
//
// Both are painted once per resolution into a cached layer (render/cache.ts); the play screen's
// static layer draws that layer, so a picture costs one image draw per static rebuild.

import { ORIGINAL_PICTURE } from '../../level/original';
import { WORLD_H, WORLD_W, layout } from '../layout';
import { drawLayer, layers } from '../render/cache';
import { linear, radial, type Ctx } from '../render/paint';

export type BackdropPainter = (ctx: Ctx, k: number) => void;

/** Background asset ids: lowercase words joined by hyphens (src/gen/lines.ts). */
const ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The plain field over the whole world (also under the level thumbnails of the menus). */
export function paintPlain(ctx: Ctx): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, '#0e1638'],
    [0.55, '#1a2350'],
    [1, '#241c46'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const o = layout.opening;
  const cx = o.x + o.w / 2;
  ctx.fillStyle = radial(ctx, cx, 330, 40, cx, 330, 520, [
    [0, 'rgba(70, 96, 170, 0.35)'],
    [1, 'rgba(70, 96, 170, 0)'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

export const plainBackdrop: BackdropPainter = (ctx, k) => {
  drawLayer(ctx, layers.get('play:backdrop', k, 0, 0, WORLD_W, WORLD_H, paintPlain));
};

/** The picture covers the playfield opening exactly (visual guide 16.2). */
function paintPicture(ctx: Ctx, image: CanvasImageSource): void {
  paintPlain(ctx);
  const o = layout.opening;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, o.x, o.y, o.w, o.h);
}

/** A painter that draws a loaded picture, cached per resolution under the picture's id. */
export function pictureBackdrop(id: string, image: CanvasImageSource): BackdropPainter {
  const key = `play:backdrop:${id}`;
  const paint = (ctx: Ctx): void => {
    paintPicture(ctx, image);
  };
  return (ctx, k) => {
    drawLayer(ctx, layers.get(key, k, 0, 0, WORLD_W, WORLD_H, paint));
  };
}

/** URL of a background picture under the app's base path. */
export function backgroundUrl(id: string, base: string): string {
  return `${base}backgrounds/${id}.webp`;
}

/** URL of one of the original's pictures (public/original/backgrounds/, src/level/original.ts). */
export function originalPictureUrl(id: string, base: string): string {
  return `${base}original/backgrounds/${id}.webp`;
}

/** Loads and decodes a picture; null when it is missing or broken. */
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  return image.naturalWidth === 0 || image.naturalHeight === 0 ? null : image;
}

/**
 * Loads and decodes the picture for a background id. Resolves to the picture's painter, or to
 * the plain field when the id is not a valid asset id or the picture is missing or broken.
 */
export async function loadBackdrop(id: string, base: string): Promise<BackdropPainter> {
  if (!ASSET_ID.test(id)) return plainBackdrop;
  const image = await loadImage(backgroundUrl(id, base));
  return image === null ? plainBackdrop : pictureBackdrop(id, image);
}

/**
 * The original's picture of a level whose board's (0, 0) is at `origin` on screen: the plain
 * field, and the picture where the original draws it on the board (ORIGINAL_PICTURE). The plain
 * field stands in when the picture is missing or broken.
 */
export async function loadOriginalBackdrop(
  id: string,
  base: string,
  origin: { readonly x: number; readonly y: number },
): Promise<BackdropPainter> {
  if (!ASSET_ID.test(id)) return plainBackdrop;
  const image = await loadImage(originalPictureUrl(id, base));
  if (image === null) return plainBackdrop;
  const p = ORIGINAL_PICTURE;
  const key = `play:backdrop:original:${id}:${origin.x.toFixed(2)}`;
  const paint = (ctx: Ctx): void => {
    paintPlain(ctx);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, origin.x + p.x, origin.y + p.y, p.width, p.height);
  };
  return (ctx, k) => {
    drawLayer(ctx, layers.get(key, k, 0, 0, WORLD_W, WORLD_H, paint));
  };
}
