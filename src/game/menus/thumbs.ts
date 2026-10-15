// Level thumbnails for the menus (visual guide 10.4): the level's picture, or the plain field
// while it has none, with its pegs and bricks where they stand at the start, all blue (colors
// are drawn at random per attempt). Rendered at run time from the level file, once per level,
// size and device scale, into a cache of their own.

import type { LevelElement } from '../../level/schema';
import type { CompiledLevel } from '../../sim/compile';
import { WORLD_H, WORLD_W, layout, type Box } from '../layout';
import { backgroundUrl, paintPlain } from '../play/backdrop';
import { loadLevel } from '../play/load';
import { LayerCache, drawLayer } from '../render/cache';
import { circlePath, type Ctx } from '../render/paint';
import { drawBrick, drawPeg, type BrickShape } from '../render/pegs';
import type { ManifestLevel } from '../modes/manifest';

type Status = 'loading' | 'ready' | 'failed';

interface Entry {
  status: Status;
  compiled: CompiledLevel | null;
  picture: HTMLImageElement | null;
}

async function loadPicture(id: string, base: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = backgroundUrl(id, base);
  try {
    await img.decode();
  } catch {
    return null;
  }
  return img.naturalWidth > 0 ? img : null;
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
  picture: HTMLImageElement | null,
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
  private readonly cache = new LayerCache(40);

  constructor(private readonly base: string = import.meta.env.BASE_URL) {}

  /** Starts loading a level's file and picture, once. */
  request(entry: ManifestLevel): void {
    const id = entry.level.id;
    if (this.entries.has(id)) return;
    const e: Entry = { status: 'loading', compiled: null, picture: null };
    this.entries.set(id, e);
    void Promise.allSettled([
      loadLevel(entry.level.file, this.base),
      loadPicture(entry.level.background, this.base),
    ]).then(([level, picture]) => {
      if (level.status === 'rejected') {
        e.status = 'failed';
        return;
      }
      e.compiled = level.value.compiled;
      e.picture = picture.status === 'fulfilled' ? picture.value : null;
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
    const level = e.compiled;
    const picture = e.picture;
    const layer = this.cache.get(`thumb:${id}:${b.w}x${b.h}`, k, 0, 0, b.w, b.h, (c) => {
      paintThumb(c, k, level, picture, b.w, b.h);
    });
    drawLayer(ctx, layer, b.x, b.y);
    return true;
  }
}

/** The app's one thumbnail cache, shared by the main menu and the level select. */
export const levelThumbs = new LevelThumbs();
