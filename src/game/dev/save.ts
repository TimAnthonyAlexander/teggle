// DEV ONLY: #/dev/save. Exports the saved progress (the localStorage record `teggle.save.v1`,
// src/game/progress/save.ts) as a JSON file for the self-play calibration
// (`npm run agents:calibrate -- <file>`, tools/agents/calibrate.ts), which fits the noisy agent's
// aim error to the tries and wins per level. The route exists only in the dev server
// (src/game/routes.ts) and no menu links to it. It reads the save and changes nothing.
//
// The board lists the levels with tries; a plain link over the canvas downloads the record,
// because a download needs a real click on a real link.

import type { FrameInfo, Screen } from '../app/screens';
import { WORLD_H, WORLD_W } from '../layout';
import { serializeProgress, type Progress } from '../progress/save';
import { progressStore } from '../progress/store';
import { drawText } from '../ui/text';

const ROWS_PER_COLUMN = 14;
const ROW_H = 24;

/** File name of an export made on `d`: teggle-save-2026-10-15.json. */
export function saveFileName(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `teggle-save-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Levels with at least one try, in campaign order: "1-3", tries, wins. */
export function playedLevels(p: Progress): { id: string; tries: number; wins: number }[] {
  return Object.entries(p.levels)
    .filter(([, r]) => r.tries > 0)
    .map(([id, r]) => ({ id, tries: r.tries, wins: r.wins }))
    .sort((a, b) => {
      const [as = 0, al = 0] = a.id.split('-').map(Number);
      const [bs = 0, bl = 0] = b.id.split('-').map(Number);
      return as - bs || al - bl;
    });
}

export class DevSaveScreen implements Screen {
  private link: HTMLAnchorElement | null = null;
  private url: string | null = null;
  private progress: Progress | null = null;

  enter(): void {
    const progress = progressStore().progress;
    this.progress = progress;
    this.url = URL.createObjectURL(
      new Blob([serializeProgress(progress)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = this.url;
    link.download = saveFileName(new Date());
    link.textContent = 'Download save';
    Object.assign(link.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      padding: '10px 16px',
      font: '600 15px system-ui, sans-serif',
      color: '#10131a',
      background: '#f2efe6',
      borderRadius: '6px',
      textDecoration: 'none',
      zIndex: '10',
    });
    document.body.appendChild(link);
    this.link = link;
  }

  exit(): void {
    this.link?.remove();
    this.link = null;
    if (this.url !== null) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  render(frame: FrameInfo): void {
    const ctx = frame.ctx;
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const text = { face: 'body' as const, weight: 500, fill: '#e8e4d8' };
    drawText(ctx, 'Save export (dev only)', 40, 60, { ...text, cap: 16 });
    const levels = this.progress === null ? [] : playedLevels(this.progress);
    const tries = levels.reduce((s, l) => s + l.tries, 0);
    const wins = levels.reduce((s, l) => s + l.wins, 0);
    const summary =
      levels.length === 0
        ? 'No level has a try yet. Play some levels, then come back.'
        : `${levels.length} levels played, ${tries} tries, ${wins} wins. ` +
          'Calibrate with: npm run agents:calibrate -- <downloaded file>';
    drawText(
      ctx,
      summary,
      40,
      96,
      { ...text, cap: 8, fill: '#b9b4a6' },
      { maxWidth: WORLD_W - 80 },
    );
    levels.forEach((l, i) => {
      const x = 40 + Math.floor(i / ROWS_PER_COLUMN) * 200;
      const y = 140 + (i % ROWS_PER_COLUMN) * ROW_H;
      drawText(ctx, `${l.id}   ${l.wins} of ${l.tries}`, x, y, { ...text, cap: 9 });
    });
  }
}
