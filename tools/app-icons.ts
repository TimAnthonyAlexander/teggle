// Renders the home screen icons (web app manifest and Apple touch icon) from Teggle's own
// favicon, public/favicon.svg (the orange peg): the peg with the game's object shadow
// (guide 16.6, shadow.object) on the theme blue of index.html. No other art is involved.
//
// Writes public/icons/: icon-192.png and icon-512.png (purpose "any"), icon-maskable-512.png
// (purpose "maskable": the peg inside the 80% safe circle) and apple-touch-icon.png (180).
//
// Usage: npx tsx tools/app-icons.ts

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'icons');
/** index.html's theme color and page background. */
const BLUE = '#1c3989';

interface Icon {
  readonly file: string;
  readonly size: number;
  /** Peg diameter as a share of the icon. */
  readonly peg: number;
}

const ICONS: readonly Icon[] = [
  { file: 'icon-192.png', size: 192, peg: 0.64 },
  { file: 'icon-512.png', size: 512, peg: 0.64 },
  { file: 'icon-maskable-512.png', size: 512, peg: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, peg: 0.64 },
];

async function main(): Promise<void> {
  const svg = await readFile(path.join(ROOT, 'public', 'favicon.svg'), 'utf8');
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const icon of ICONS) {
      const dataUrl = await page.evaluate(
        async ({ svg, size, peg, blue }) => {
          const img = new Image();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (ctx === null) throw new Error('no 2D context');
          ctx.fillStyle = blue;
          ctx.fillRect(0, 0, size, size);
          // A soft light behind the peg, as on the plain playfield (src/game/play/backdrop.ts).
          const glow = ctx.createRadialGradient(
            size / 2,
            size / 2,
            0,
            size / 2,
            size / 2,
            size * 0.6,
          );
          glow.addColorStop(0, 'rgba(70, 96, 170, 0.45)');
          glow.addColorStop(1, 'rgba(70, 96, 170, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, size, size);
          const d = size * peg;
          const x = (size - d) / 2;
          // The object shadow, black at 45% with no blur, offset down and to the left like the
          // game's (-4, 3) on a 20-unit peg, at about half that reach so the mark stays compact.
          const shadow = document.createElement('canvas');
          shadow.width = size;
          shadow.height = size;
          const sc = shadow.getContext('2d');
          if (sc === null) throw new Error('no 2D context');
          sc.drawImage(img, x - d * 0.1, x + d * 0.075, d, d);
          sc.globalCompositeOperation = 'source-in';
          sc.fillStyle = 'rgba(0, 0, 0, 0.45)';
          sc.fillRect(0, 0, size, size);
          ctx.drawImage(shadow, 0, 0);
          ctx.drawImage(img, x, x, d, d);
          return canvas.toDataURL('image/png');
        },
        { svg, size: icon.size, peg: icon.peg, blue: BLUE },
      );
      const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      await writeFile(path.join(OUT, icon.file), bytes);
      console.log(`${path.relative(ROOT, path.join(OUT, icon.file))} (${bytes.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
