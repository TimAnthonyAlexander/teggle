// The editor route's screen: while it is on, the line editor's own page covers the game canvas
// and takes all input; the canvas underneath only paints a plain field.

import type { FrameInfo, Screen } from '../game/app/screens';
import { WORLD_H, WORLD_W } from '../game/layout';
import css from './editor.css?inline';
import { Editor } from './editor';

export class EditorScreen implements Screen {
  private editor: Editor | null = null;

  constructor(private readonly levelId: string | null) {}

  enter(): void {
    this.editor = new Editor(this.levelId, css);
    this.editor.mount();
  }

  exit(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  render(frame: FrameInfo): void {
    frame.ctx.fillStyle = '#141517';
    frame.ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  letterbox(): string {
    return '#141517';
  }
}
