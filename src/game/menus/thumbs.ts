// Level thumbnails for the menus (visual guide 10.4): the level's picture, or the plain field
// while it has none, with its pegs and bricks where they stand at the start, all blue (colors
// are drawn at random per attempt). Rendered at run time from the level file, once per level,
// size and device scale, into a cache of their own.

import type { LevelElement } from '../../level/schema';
import type { CompiledLevel } from '../../sim/compile';
import { WORLD_H, WORLD_W, layout, type Box } from '../layout';
import { backgroundUrl, paintPlain } from '../play/backdrop';
import { loadLevel } from '../play/load';
import { LayerCache, createCanvas, drawLayer, releaseCanvas, screenScale } from '../render/cache';
import { circlePath, type Ctx } from '../render/paint';
import { drawBrick, drawPeg, type BrickShape } from '../render/pegs';
import type { ManifestLevel } from '../modes/manifest';

type Status = 'loading' | 'ready' | 'failed';

interface Picture {
  readonly image: CanvasImageSource;
  /** Its width, and the width of the file it was made from, px. */
  readonly width: number;
  readonly sourceWidth: number;
}

interface Entry {
  readonly level: ManifestLevel;
  status: Status;
  compiled: CompiledLevel | null;
  picture: Picture | null;
}

/** World units of picture a thumbnail shows at most: a 292-unit cell shows about 300. */
const THUMB_PICTURE_UNITS = 300;
/** Widest copy ever kept: even a 4K screen draws 300 units at under 1,100 device pixels. */
const THUMB_PICTURE_W = 1100;
/** Levels whose file and picture stay loaded; the menus show at most six at a time. */
const MAX_ENTRIES = 16;

/** Width of the picture copy a thumbnail needs at `k` device pixels per world unit. */
function pictureWidth(k: number): number {
  return k > 0 ? Math.min(THUMB_PICTURE_W, Math.ceil(THUMB_PICTURE_UNITS * k)) : THUMB_PICTURE_W;
}

/**
 * Loads a level's picture and keeps a copy no larger than a thumbnail needs on this screen: the
 * full picture (2732 x 1644, 18 MB decoded) would otherwise stay in memory for every level the
 * menus showed, and even the 1,100 px a 4K screen needs is three times a phone's (spec 14.2).
 */
async function loadPicture(id: string, base: string, w: number): Promise<Picture | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = backgroundUrl(id, base);
  try {
    await img.decode();
  } catch {
    return null;
  }
  const sourceWidth = img.naturalWidth;
  if (sourceWidth === 0 || img.naturalHeight === 0) return null;
  if (sourceWidth <= w) return { image: img, width: sourceWidth, sourceWidth };
  const h = Math.round((img.naturalHeight * w) / sourceWidth);
  const small = createCanvas(w, h);
  const c = small.getContext('2d');
  if (c === null) return { image: img, width: sourceWidth, sourceWidth };
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, w, h);
  return { image: small, width: w, sourceWidth };
}

/** Frees a picture copy's canvas once no thumbnail will be drawn from it again. */
function releasePicture(p: Picture | null): void {
  if (p !== null && p.image instanceof HTMLCanvasElement) releaseCanvas(p.image);
}

function brickShape(e: LevelElement, x: number, y: number, rotation: number): BrickShape | null {
  if (e.kind === 'brick') {
    return { kind: 'brick', x, y, rotation, length: e.length, width: e.width };
  }
  if (e.kind === 'curvedBrick') {
    return {
      kind: 'curvedBrick',
      x,
      y,
      rotation,
      innerRadius: e.innerRadius,
      width: e.width,
      sector: e.sector,
      points: e.points,
    };
  }
  return null;
}

/** Paints the playfield opening of a level, scaled into a w x h box at the origin. */
function paintThumb(
  c: Ctx,
  k: number,
  level: CompiledLevel,
  picture: CanvasImageSource | null,
  w: number,
  h: number,
): void {
  const o = layout.opening;
  const s = Math.max(w / o.w, h / o.h);
  const kk = k * s;
  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  c.translate((w - o.w * s) / 2, (h - o.h * s) / 2);
  c.scale(s, s);
  c.translate(-o.x, -o.y);
  paintPlain(c);
  if (picture !== null) {
    c.imageSmoothingQuality = 'high';
    c.drawImage(picture, o.x, o.y, o.w, o.h);
  }
  const offX = WORLD_W / 2 - level.width / 2;
  const offY = WORLD_H - level.height;
  // Solids first (blockers, rods, round bumpers), then shadows, then the pegs and bricks.
  for (const def of level.bodies) {
    const e = def.element;
    if (e === null || def.scoring || !e.visible) continue;
    const pose = level.initialPoses[def.index];
    const x = (pose?.x ?? e.x) + offX;
    const y = (pose?.y ?? e.y) + offY;
    const rot = pose?.rotation ?? 0;
    c.save();
    c.translate(x, y);
    if (e.kind === 'circle') {
      circlePath(c, 0, 0, e.radius);
      c.fillStyle = '#7f9caa';
      c.fill();
    } else if (e.kind === 'polygon') {
      c.rotate(-rot);
      c.beginPath();
      e.vertices.forEach((v, i) => {
        if (i === 0) c.moveTo(v.x, v.y);
        else c.lineTo(v.x, v.y);
      });
      c.closePath();
      c.fillStyle = '#2c5560';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = '#06161b';
      c.stroke();
    } else if (e.kind === 'rod') {
      c.rotate(-rot);
      c.beginPath();
      c.moveTo(e.a.x, e.a.y);
      c.lineTo(e.b.x, e.b.y);
      c.lineCap = 'round';
      c.lineWidth = 5;
      c.strokeStyle = '#a9c3cf';
      c.stroke();
    }
    c.restore();
  }
  c.fillStyle = 'rgba(0,0,0,0.4)';
  for (const i of level.scoringBodies) {
    const def = level.bodies[i];
    const e = def?.element;
    if (e?.kind !== 'peg') continue;
    const pose = level.initialPoses[i];
    circlePath(c, (pose?.x ?? e.x) + offX - 4, (pose?.y ?? e.y) + offY + 3, e.radius);
    c.fill();
  }
  for (const i of level.scoringBodies) {
    const e = level.bodies[i]?.element;
    if (e === null || e === undefined) continue;
    const pose = level.initialPoses[i];
    const x = (pose?.x ?? e.x) + offX;
    const y = (pose?.y ?? e.y) + offY;
    if (e.kind === 'peg') {
      drawPeg(c, kk, x, y, 'blue', false, e.radius);
      continue;
    }
    const shape = brickShape(e, x, y, pose?.rotation ?? 0);
    if (shape !== null) drawBrick(c, kk, shape, 'blue', false);
  }
  c.restore();
}

export class LevelThumbs {
  private readonly entries = new Map<string, Entry>();
  /** At most 40 thumbnails, together no larger than two full-screen layers. */
  private readonly cache = new LayerCache(40, 2, 0);

  constructor(private readonly base: string = import.meta.env.BASE_URL) {}

  /**
   * Starts loading a level's file and picture, once while it stays among the levels asked for
   * most recently; the oldest beyond MAX_ENTRIES are let go and load again when asked for.
   */
  request(entry: ManifestLevel, k = screenScale()): void {
    const id = entry.level.id;
    const known = this.entries.get(id);
    if (known !== undefined) {
      this.entries.delete(id);
      this.entries.set(id, known);
      return;
    }
    const e: Entry = { level: entry, status: 'loading', compiled: null, picture: null };
    this.entries.set(id, e);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.entries().next();
      if (oldest.done === true) break;
      const [oldId, old] = oldest.value;
      this.entries.delete(oldId);
      releasePicture(old.picture);
      old.picture = null;
    }
    void Promise.allSettled([
      loadLevel(entry.level.file, this.base),
      loadPicture(entry.level.background, this.base, pictureWidth(k)),
    ]).then(([level, picture]) => {
      const pic = picture.status === 'fulfilled' ? picture.value : null;
      // Let go of while loading: nothing will draw from it.
      if (this.entries.get(id) !== e) {
        releasePicture(pic);
        return;
      }
      if (level.status === 'rejected') {
        releasePicture(pic);
        e.status = 'failed';
        return;
      }
      e.compiled = level.value.compiled;
      e.picture = pic;
      e.status = 'ready';
    });
  }

  status(id: string): Status | 'idle' {
    return this.entries.get(id)?.status ?? 'idle';
  }

  /** Draws the level's thumbnail into `b`; false while it is not ready (or failed). */
  draw(ctx: Ctx, k: number, id: string, b: Box): boolean {
    const e = this.entries.get(id);
    if (e === undefined || e.status !== 'ready' || e.compiled === null) return false;
    const p = e.picture;
    if (p !== null && p.width < p.sourceWidth && p.width < pictureWidth(k) * 0.9) {
      // The screen grew past the copy kept (a desktop window made larger): load a finer one.
      this.entries.delete(id);
      releasePicture(p);
      e.picture = null;
      this.request(e.level, k);
      return false;
    }
    const level = e.compiled;
    const picture = p?.image ?? null;
    const layer = this.cache.get(`thumb:${id}:${b.w}x${b.h}`, k, 0, 0, b.w, b.h, (c) => {
      paintThumb(c, k, level, picture, b.w, b.h);
    });
    drawLayer(ctx, layer, b.x, b.y);
    return true;
  }
}

/** The app's one thumbnail cache, shared by the main menu and the level select. */
export const levelThumbs = new LevelThumbs();
