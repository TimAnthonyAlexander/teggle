// Level thumbnails for the menus (visual guide 10.4): the level's picture, or the plain field
// while it has none, with its pegs and bricks where they stand at the start, all blue (colors
// are drawn at random per attempt). Rendered at run time from the level file, once per level,
// size and device scale, into a cache of their own. Teggle's levels fill the thumbnail with their
// playfield opening; the original's show their whole picture, the board around it left dark.

import { ORIGINAL_PICTURE, type OriginalEntry } from '../../level/original';
import type { LevelElement } from '../../level/schema';
import type { CompiledLevel } from '../../sim/compile';
import { boardOrigin, layout, type Box } from '../layout';
import { paintPlain } from '../play/backdrop';
import { loadPublicLevel } from '../play/load';
import { LayerCache, createCanvas, drawLayer, releaseCanvas, screenScale } from '../render/cache';
import { circlePath, type Ctx } from '../render/paint';
import { drawBrick, drawPeg, type BrickShape } from '../render/pegs';
import type { ManifestLevel } from '../modes/manifest';

type Status = 'loading' | 'ready' | 'failed';

/** What a thumbnail is made from. */
export interface ThumbSource {
  /** The thumbnail's key, unique over every level the menus show. */
  readonly key: string;
  /** The level file and its picture, under the app's public folder. */
  readonly file: string;
  readonly picture: string;
  /** Where the picture lies: over the playfield opening, or where the original put it. */
  readonly placement: 'opening' | 'original';
}

/** A campaign level's thumbnail, keyed by its id. */
export function campaignThumb(entry: ManifestLevel): ThumbSource {
  return {
    key: entry.level.id,
    file: `levels/${entry.level.file}`,
    picture: `backgrounds/${entry.level.background}.webp`,
    placement: 'opening',
  };
}

/** One of the original's levels' thumbnail, keyed "original/<id>". */
export function originalThumb(entry: OriginalEntry): ThumbSource {
  return {
    key: `original/${entry.id}`,
    file: `original/${entry.file}`,
    picture: `original/backgrounds/${entry.background}.webp`,
    placement: 'original',
  };
}

interface Picture {
  readonly image: CanvasImageSource;
  /** Its width, and the width of the file it was made from, px. */
  readonly width: number;
  readonly sourceWidth: number;
}

interface Entry {
  readonly source: ThumbSource;
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
async function loadPicture(url: string, w: number): Promise<Picture | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
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

/**
 * Paints a level's playfield scaled into a w x h box at the origin: the whole box covered by the
 * opening (Teggle's levels), or the original's whole picture fitted in, dark around it.
 */
function paintThumb(
  c: Ctx,
  k: number,
  level: CompiledLevel,
  picture: CanvasImageSource | null,
  placement: ThumbSource['placement'],
  w: number,
  h: number,
): void {
  const origin = boardOrigin(level.width, level.height);
  const p = ORIGINAL_PICTURE;
  const cover = placement === 'opening';
  const view: Box = cover
    ? layout.opening
    : { x: origin.x + p.x, y: origin.y + p.y, w: p.width, h: p.height };
  const s = cover ? Math.max(w / view.w, h / view.h) : Math.min(w / view.w, h / view.h);
  const kk = k * s;
  const vx = (w - view.w * s) / 2;
  const vy = (h - view.h * s) / 2;
  c.save();
  if (!cover) {
    c.fillStyle = '#0e1638';
    c.fillRect(0, 0, w, h);
  }
  c.beginPath();
  c.rect(Math.max(0, vx), Math.max(0, vy), Math.min(w, view.w * s), Math.min(h, view.h * s));
  c.clip();
  c.translate(vx, vy);
  c.scale(s, s);
  c.translate(-view.x, -view.y);
  paintPlain(c);
  if (picture !== null) {
    c.imageSmoothingQuality = 'high';
    c.drawImage(picture, view.x, view.y, view.w, view.h);
  }
  const offX = origin.x;
  const offY = origin.y;
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

  /** Starts loading a campaign level's thumbnail (requestSource). */
  request(entry: ManifestLevel, k = screenScale()): void {
    this.requestSource(campaignThumb(entry), k);
  }

  /**
   * Starts loading a level's file and picture, once while it stays among the levels asked for
   * most recently; the oldest beyond MAX_ENTRIES are let go and load again when asked for.
   */
  requestSource(source: ThumbSource, k = screenScale()): void {
    const id = source.key;
    const known = this.entries.get(id);
    if (known !== undefined) {
      this.entries.delete(id);
      this.entries.set(id, known);
      return;
    }
    const e: Entry = { source, status: 'loading', compiled: null, picture: null };
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
      loadPublicLevel(source.file, this.base),
      loadPicture(`${this.base}${source.picture}`, pictureWidth(k)),
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

  /** Draws the thumbnail keyed `id` into `b`; false while it is not ready (or failed). */
  draw(ctx: Ctx, k: number, id: string, b: Box): boolean {
    const e = this.entries.get(id);
    if (e === undefined || e.status !== 'ready' || e.compiled === null) return false;
    const p = e.picture;
    if (p !== null && p.width < p.sourceWidth && p.width < pictureWidth(k) * 0.9) {
      // The screen grew past the copy kept (a desktop window made larger): load a finer one.
      this.entries.delete(id);
      releasePicture(p);
      e.picture = null;
      this.requestSource(e.source, k);
      return false;
    }
    const level = e.compiled;
    const picture = p?.image ?? null;
    const placement = e.source.placement;
    const layer = this.cache.get(`thumb:${id}:${b.w}x${b.h}`, k, 0, 0, b.w, b.h, (c) => {
      paintThumb(c, k, level, picture, placement, b.w, b.h);
    });
    drawLayer(ctx, layer, b.x, b.y);
    return true;
  }
}

/** The app's one thumbnail cache, shared by the main menu and the level select. */
export const levelThumbs = new LevelThumbs();
