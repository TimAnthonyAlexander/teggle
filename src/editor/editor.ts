// The background line editor (spec 12): lines and curves drawn over a level's picture, the
// generator's result live under them, the full checks on demand, manual edits of single pegs
// and bricks, and saving to the repository or as downloads. A plain DOM tool over the game's
// canvas, mounted by the editor route (#/editor/<level id>).

import type { Rejected } from '../gen/builder';
import {
  composeManifest,
  LEVEL_ID,
  levelSourceSchema,
  stageOf,
  stagesFileSchema,
  type LevelSourceInput,
  type StagesFile,
} from '../gen/campaign-source';
import type { EditOutcome } from '../gen/edits';
import { assembleLevel } from '../gen/generate';
import type { FitResult, Nudge } from '../gen/fit';
import { flipperSweeps } from '../gen/flippers';
import { isMoving } from '../gen/edits';
import { linesJson, sourceJson } from '../gen/json';
import {
  GROUP_MOVEMENT_TYPES,
  LINE_SPACING_MAX,
  parseLines,
  TRAVEL_SPACING_MAX,
  smoothLine,
  SLUG,
  type GroupMovement,
  type GroupMovementType,
  type Line,
  type LineGroup,
  type LinesFile,
  type Travel,
} from '../gen/lines';
import type { Path } from '../gen/paths';
import { runPipeline, type PipelineResult } from '../gen/pipeline';
import { AREA_RATIO } from '../gen/recipe';
import { elementShape, filePose, pointGap } from '../gen/shapes';
import type { Issue } from '../gen/validate';
import { isScoringElement, type Level, type LevelElement } from '../level/schema';
import type { Pose } from '../sim/movement';
import {
  compose,
  lineOfPart,
  NO_STICKY,
  stickyOf,
  withSticky,
  type Composed,
  type Composition,
  type Sticky,
} from './derive';
import {
  addLine,
  clampToBoard,
  deleteGroup,
  deleteLine,
  deletePoint,
  findGroup,
  findLine,
  freshGroupId,
  freshId,
  idProblem,
  insertPoint,
  movePoint,
  placementOrder,
  putGroup,
  recipeEdits,
  renameGroup,
  renameLine,
  reorderLine,
  round1,
  setClosed,
  setEdits,
  setLineFields,
  setLineGroup,
  setLineTravel,
  setRecipeFields,
  setSourceFields,
  toggleCorner,
  translateLine,
  type Doc,
  type Point,
} from './doc';
import { drawScene, PICTURE, type Findings, type Layers, type Motion } from './draw';
import { groupPivot, Preview, unitLines } from './motion';
import {
  addObject,
  deleteObject,
  describeEdit,
  moveObject,
  originOf,
  removeEntry,
  rotateObject,
  setFlag,
} from './edit-ops';
import { download, paths, Repository } from './files';
import { History } from './history';
import { CheckPool, Fitter, type CheckProgress } from './pool';
import {
  button,
  checkbox,
  el,
  isTyping,
  numberInput,
  row,
  section,
  select,
  textArea,
  textInput,
} from './ui';
import { centerOn, fitView, panBy, toBoard, zoomAt, type View } from './view';

type Tool = 'lines' | 'draw' | 'objects';

/** The level on the board: the fit's when it is current, else the live preview. */
interface Shown {
  readonly version: number;
  readonly fitted: boolean;
  readonly level: Level;
  readonly partOf: ReadonlyMap<number, string>;
  readonly rejected: readonly Rejected[];
  readonly edits: EditOutcome;
  readonly generated: readonly LevelElement[];
  readonly issues: readonly Issue[] | null;
  readonly fit: FitResult | null;
}

type Drag =
  | { readonly kind: 'pan'; readonly sx: number; readonly sy: number; readonly view: View }
  | {
      readonly kind: 'point';
      readonly line: string;
      readonly index: number;
      readonly before: Doc;
      moved: boolean;
    }
  | {
      readonly kind: 'line';
      readonly line: string;
      readonly before: Doc;
      readonly start: Point;
      moved: boolean;
    }
  | {
      readonly kind: 'object';
      readonly id: number;
      readonly before: Doc;
      readonly start: Point;
      readonly from: Point;
      moved: boolean;
    }
  | { readonly kind: 'pivot'; readonly group: string; readonly before: Doc; moved: boolean };

const DRAG_THRESHOLD = 3;
const FIT_DELAY = 250;
const MOVES_WITH_LINE =
  'That object moves with its line: move or turn the line instead. It can still be deleted or flagged.';
/** What a new group starts with: a slow slide left and right. */
const NEW_GROUP_MOVEMENT: GroupMovement = { type: 'horizontalCycle', period: 1200, radius: 60 };
/** What a line starts with when its objects begin to travel along it. */
const NEW_TRAVEL: Travel = { period: 2400 };
const STAGE_AVERAGES = [97, 107, 102, 105, 105, 114, 99, 103, 109, 113, 117];

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function deg(rad: number): number {
  return Math.round(((rad * 180) / Math.PI) * 10) / 10;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = a[0] + ex * t - p[0];
  const dy = a[1] + ey * t - p[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export class Editor {
  private readonly root = el('div', { class: 'ted', attrs: { tabindex: '-1' } });
  private readonly style = el('style');
  private readonly bar = el('div', { class: 'ted-bar' });
  private readonly stage = el('div', { class: 'ted-stage' });
  private readonly canvas = el('canvas');
  private readonly hintBar = el('div', { class: 'ted-hintbar' });
  private readonly side = el('aside', { class: 'ted-side' });
  private readonly status = el('div', { class: 'ted-status' });
  private ctx: CanvasRenderingContext2D | null = null;

  private readonly repo = new Repository();
  private readonly fitter = new Fitter();
  private readonly history = new History<Doc>();
  private pool: CheckPool | null = null;

  private stages: StagesFile | null = null;
  private doc: Doc | null = null;
  /** The texts last loaded or saved, to tell whether there is anything to save. */
  private savedTexts: { lines: string; source: string } | null = null;
  private version = 0;
  private composition: Composition | null = null;
  private smoothed = new Map<string, Path>();
  private shown: Shown | null = null;
  private sticky: Sticky = NO_STICKY;
  private fitTimer: ReturnType<typeof setTimeout> | null = null;
  private fitError: string | null = null;
  private checked: { readonly version: number; readonly result: PipelineResult } | null = null;
  private checking: CheckProgress | null = null;
  private checkError: string | null = null;
  private saveReport: string[] = [];

  private tool: Tool = 'lines';
  private selLine: string | null = null;
  private selPoint: number | null = null;
  private selObject: number | null = null;
  private hoverLine: string | null = null;
  private hoverObject: number | null = null;
  private drawing: { points: Point[]; corners: number[] } | null = null;
  private cursor: Point | null = null;
  private drag: Drag | null = null;
  private spaceDown = false;

  private view: View = { zoom: 1, x: -20, y: -20 };
  private viewFitted = false;
  private layers: Layers = {
    picture: true,
    zones: true,
    objects: true,
    lines: true,
    findings: true,
    sweeps: true,
  };
  /** The motion preview: the tick shown, playback, and caches for the shown level. */
  private tick = 0;
  private playing = false;
  private playFrame = 0;
  private playLast = 0;
  private preview: Preview | null = null;
  private motionCache: {
    readonly level: Level;
    readonly key: string;
    readonly sweep: Motion['sweep'];
  } | null = null;
  private readonly clock = {
    slider: null as HTMLInputElement | null,
    label: null as HTMLElement | null,
  };
  private pictureOpacity = 1;
  private picture: HTMLImageElement | null = null;
  private pictureNote = '';
  private pictureUrl: string | null = null;
  private readonly open = new Map<string, boolean>([
    ['keys', false],
    ['concept', false],
  ]);
  private sideDirty = false;
  private frame = 0;
  private msg = '';
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly levelId: string | null,
    private readonly css: string,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Lifecycle

  mount(): void {
    this.style.textContent = this.css;
    document.head.append(this.style);
    this.stage.append(this.canvas, this.hintBar);
    this.root.append(this.bar, this.stage, this.side, this.status);
    document.body.append(this.root);
    this.ctx = this.canvas.getContext('2d');
    this.root.addEventListener('keydown', this.onKeyDown);
    this.root.addEventListener('keyup', this.onKeyUp);
    this.root.addEventListener('focusout', this.onFocusOut);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.stage);
    this.root.focus();
    if (import.meta.env.DEV) Object.assign(window, { __teggleEditor: this.debugHandle() });
    void this.start();
  }

  /** DEV ONLY: lets screenshot tools find board points on screen and read the state. */
  private debugHandle(): Record<string, unknown> {
    return {
      toClient: (x: number, y: number) => {
        const r = this.canvas.getBoundingClientRect();
        return {
          x: r.left + (x - this.view.x) * this.view.zoom,
          y: r.top + (y - this.view.y) * this.view.zoom,
        };
      },
      setView: (zoom: number, x: number, y: number) => {
        this.view = { zoom, x, y };
        this.renderAll();
      },
      /** Shows the motion at a tick (and stops playback). */
      setTick: (tick: number) => {
        this.setPlaying(false);
        this.setTick(tick);
      },
      /** Replaces the lines with a lines file's text, as one undoable change. */
      loadLines: (text: string) => {
        if (this.doc === null) return;
        this.commit({ ...this.doc, lines: parseLines(JSON.parse(text)) });
      },
      snapshot: () => ({
        loaded: this.doc !== null,
        version: this.version,
        tick: this.tick,
        cycle: this.previewOf()?.cycle ?? 1,
        playing: this.playing,
        tool: this.tool,
        selLine: this.selLine,
        selPoint: this.selPoint,
        selObject: this.selObject,
        fitted: this.shown?.fitted === true && this.shown.version === this.version,
        count: this.shown?.level.elements.filter(isScoringElement).length ?? null,
        issues: this.shown?.issues?.length ?? null,
        checking: this.checking !== null,
        checked:
          this.checked === null
            ? null
            : {
                current: this.checked.version === this.version,
                failures: this.checked.result.failures,
              },
        objects: (this.levelToDraw()?.elements ?? [])
          .filter(isScoringElement)
          .map((e) => ({ id: e.id, x: e.x, y: e.y, line: this.lineOf(e.id) })),
      }),
    };
  }

  destroy(): void {
    if (import.meta.env.DEV) Reflect.deleteProperty(window, '__teggleEditor');
    this.destroyed = true;
    if (this.fitTimer !== null) clearTimeout(this.fitTimer);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.playFrame);
    this.resizeObserver?.disconnect();
    this.fitter.dispose();
    this.pool?.dispose();
    if (this.pictureUrl !== null) URL.revokeObjectURL(this.pictureUrl);
    this.root.remove();
    this.style.remove();
  }

  private async start(): Promise<void> {
    await this.repo.restore();
    this.stages = await this.loadStages();
    if (this.levelId === null) {
      this.showStart(null, '');
      return;
    }
    await this.load(this.levelId);
  }

  private async loadStages(): Promise<StagesFile | null> {
    const text = await this.repo.readText(paths.stages).catch(() => null);
    if (text === null) return null;
    const parsed = stagesFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  }

  private async load(id: string): Promise<void> {
    if (!LEVEL_ID.test(id)) {
      this.showStart(null, `"${id}" is not a level id (like 1-3).`);
      return;
    }
    const sourceText = await this.repo.readText(paths.source(id)).catch(() => null);
    if (sourceText === null) {
      this.showStart(
        id,
        this.repo.connected
          ? `There is no ${paths.source(id)} yet.`
          : `No ${paths.source(id)} was found on the server. Start the level here, or connect the repository folder.`,
      );
      return;
    }
    let source: LevelSourceInput;
    try {
      source = JSON.parse(sourceText) as LevelSourceInput;
    } catch (err) {
      this.showStart(id, `${paths.source(id)}: ${message(err)}`);
      return;
    }
    const linesText = await this.repo.readText(paths.lines(id)).catch(() => null);
    let lines: LinesFile;
    try {
      lines =
        linesText === null ? emptyLines(source.background.id) : parseLines(JSON.parse(linesText));
    } catch (err) {
      this.showStart(id, `${paths.lines(id)}: ${message(err)}`);
      return;
    }
    this.open.set('concept', false);
    this.startDoc({ lines, source }, linesText === null);
  }

  private startDoc(doc: Doc, unsaved: boolean): void {
    this.doc = doc;
    this.savedTexts = unsaved
      ? null
      : { lines: linesJson(doc.lines), source: sourceJson(doc.source) };
    this.history.clear();
    this.root.querySelector('.ted-start')?.remove();
    if (this.stage.parentElement === null)
      this.root.append(this.bar, this.stage, this.side, this.status);
    this.recompute();
    this.scheduleFit(0);
    void this.loadPicture(doc.lines.background);
    this.renderAll();
  }

  private async loadPicture(background: string): Promise<void> {
    if (!SLUG.test(background)) return;
    const url = await this.repo.pictureUrl(paths.picture(background));
    if (url === null) {
      this.pictureNote = `No picture ${paths.picture(background)} yet.`;
      this.renderSide();
      return;
    }
    this.setPicture(url, false);
  }

  private setPicture(url: string, local: boolean): void {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img
      .decode()
      .then(() => {
        if (this.destroyed) return;
        if (this.pictureUrl !== null) URL.revokeObjectURL(this.pictureUrl);
        this.pictureUrl = url.startsWith('blob:') ? url : null;
        this.picture = img;
        this.pictureNote = local ? 'A local picture, shown only here; it is not saved.' : '';
        this.render();
        this.renderSide();
      })
      .catch(() => {
        this.pictureNote = `The picture ${this.doc?.lines.background ?? ''} could not be loaded.`;
        this.renderSide();
      });
  }

  private resize(): void {
    const r = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (!this.viewFitted && r.width > 0 && r.height > 0) {
      this.fitBoard();
      this.viewFitted = true;
    }
    this.render();
  }

  private fitBoard(): void {
    const r = this.stage.getBoundingClientRect();
    const board = this.doc?.lines.board ?? { width: 916, height: 560 };
    this.view = fitView(r.width, r.height, {
      x0: -14,
      y0: -10,
      x1: board.width + 14,
      y1: board.height + 14,
    });
  }

  // -------------------------------------------------------------------------------------------
  // The start page: open a campaign level or start a new one for a picture.

  private showStart(id: string | null, note: string): void {
    this.doc = null;
    for (const node of [this.bar, this.stage, this.side, this.status]) node.remove();
    this.root.querySelector('.ted-start')?.remove();
    const idInput = textInput(id ?? '', () => undefined, { placeholder: '2-1' });
    const bgInput = textInput('', () => undefined, { placeholder: 'cloud-isles-balloons' });
    const levels = this.stages?.stages.flatMap((s) => s.levels) ?? [];
    const start = el(
      'div',
      { class: 'ted-start' },
      el('h1', { text: 'Line editor' }),
      el('div', {
        class: 'ted-note',
        text: 'Trace lines over a level picture; the generator builds the level from them (spec 12).',
      }),
      note === '' ? null : el('p', { class: 'ted-bad-text', text: note }),
      el('h2', { text: 'Campaign levels' }),
      levels.length === 0
        ? el('div', {
            class: 'ted-note',
            text: 'campaign/stages.json could not be read. Connect the repository folder below.',
          })
        : el(
            'div',
            { class: 'ted-buttons' },
            ...levels.map((l) =>
              button(l, () => {
                window.location.hash = `#/editor/${l}`;
              }),
            ),
          ),
      el('h2', { text: 'New level for a picture' }),
      row('Level id', idInput),
      row('Picture id', bgInput, 'public/backgrounds/<id>.webp; it may not exist yet'),
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          'Start',
          () => {
            this.newLevel(idInput.value.trim(), bgInput.value.trim());
          },
          { primary: true },
        ),
      ),
      el('h2', { text: 'Repository folder' }),
      this.repoControls(() => {
        void this.start();
      }),
    );
    this.root.append(start);
  }

  private newLevel(id: string, background: string): void {
    if (!LEVEL_ID.test(id)) {
      this.showStart(id, `"${id}" is not a level id (like 2-1).`);
      return;
    }
    if (!SLUG.test(background)) {
      this.showStart(id, 'The picture id is lowercase words joined by hyphens.');
      return;
    }
    const stage = stageOf(id);
    const n = Number(id.split('-')[1]);
    const source: LevelSourceInput = {
      id,
      name: '',
      concept: { subject: '', composition: '', layout: '' },
      background: { id: background, prompt: '' },
      recipe: {
        seed: stage * 100 + n,
        targetCount: Math.round((STAGE_AVERAGES[stage - 1] ?? 103) * AREA_RATIO),
      },
    };
    window.history.replaceState(null, '', `#/editor/${id}`);
    this.open.set('concept', true);
    this.startDoc({ lines: emptyLines(background), source }, true);
    this.say('New level: set its name, concept and object count in the Level panel, then draw.');
  }

  // -------------------------------------------------------------------------------------------
  // Document changes

  /** Applies a change as one undoable step. */
  private commit(next: Doc): void {
    if (this.doc === null || next === this.doc) return;
    this.history.push(this.doc);
    this.apply(next);
  }

  /** Applies a change without recording it (drags record their start once). */
  private apply(next: Doc): void {
    this.doc = next;
    this.version++;
    if (this.selLine !== null && findLine(next, this.selLine) === null) {
      this.selLine = null;
      this.selPoint = null;
    }
    const line = findLine(next, this.selLine);
    if (line !== null && this.selPoint !== null && this.selPoint >= line.points.length)
      this.selPoint = null;
    this.recompute();
    this.scheduleFit();
    this.renderAll();
  }

  private undo(): void {
    if (this.doc === null) return;
    const prev = this.history.undo(this.doc);
    if (prev !== null) this.apply(prev);
  }

  private redo(): void {
    if (this.doc === null) return;
    const next = this.history.redo(this.doc);
    if (next !== null) this.apply(next);
  }

  /** Smooths the lines and rebuilds the live preview (a few milliseconds). */
  private recompute(): void {
    const doc = this.doc;
    if (doc === null) return;
    this.smoothed = new Map();
    for (const line of doc.lines.lines) {
      try {
        this.smoothed.set(line.id, smoothLine(line));
      } catch {
        // A line mid-edit may not smooth; it shows as its control points.
      }
    }
    this.composition = compose(doc);
    const c = this.composition;
    if (!c.ok) {
      this.shown = null;
      return;
    }
    try {
      const a = assembleLevel(withSticky(c.value, this.sticky), c.value.seed);
      this.shown = {
        version: this.version,
        fitted: false,
        level: a.level,
        partOf: a.partOf,
        rejected: a.rejected,
        edits: a.edits,
        generated: a.generated,
        issues: null,
        fit: null,
      };
    } catch (err) {
      this.composition = { ok: false, error: message(err), empty: false };
      this.shown = null;
    }
  }

  private scheduleFit(delay = FIT_DELAY): void {
    if (this.fitTimer !== null) clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => {
      this.fitTimer = null;
      if (this.drag !== null) {
        this.scheduleFit();
        return;
      }
      void this.runFit();
    }, delay);
  }

  private async runFit(): Promise<void> {
    const c = this.composition;
    if (c === null || !c.ok) return;
    const v = this.version;
    try {
      const fit = await this.fitter.fit(c.value.recipe, c.value.seed);
      if (fit === null || v !== this.version || this.destroyed) return;
      this.fitError = null;
      this.sticky = stickyOf(c.value, fit.nudges);
      const g = fit.generated;
      this.shown = {
        version: v,
        fitted: true,
        level: g.level,
        partOf: g.partOf,
        rejected: g.rejected,
        edits: g.edits,
        generated: g.generated,
        issues: g.issues,
        fit,
      };
    } catch (err) {
      this.fitError = message(err);
    }
    this.renderAll();
  }

  // -------------------------------------------------------------------------------------------
  // Checks and saving

  private async runChecks(): Promise<PipelineResult | null> {
    const c = this.composition;
    if (c === null || !c.ok || this.checking !== null) return null;
    const v = this.version;
    this.checkError = null;
    this.pool ??= new CheckPool(CheckPool.defaultSize(), (p) => {
      this.checking = p;
      this.renderSide();
    });
    this.checking = { round: 1, done: 0, total: 1 };
    this.renderAll();
    try {
      const result = await runPipeline(c.value.recipe, c.value.seed, c.value.background, {
        run: this.pool.runner,
      });
      if (this.destroyed) return null;
      this.checked = { version: v, result };
      this.say(
        result.failures.length === 0
          ? 'Checks passed.'
          : `Checks found problems: ${result.failures.join('; ')}.`,
      );
      return v === this.version ? result : null;
    } catch (err) {
      this.checkError = message(err);
      return null;
    } finally {
      this.checking = null;
      this.renderAll();
    }
  }

  private stopChecks(): void {
    this.pool?.dispose();
    this.pool = null;
    this.checking = null;
    this.renderAll();
  }

  /** The texts a save writes, or why it cannot. */
  private outputs(): { lines: string; source: string; problems: string[] } | null {
    const doc = this.doc;
    if (doc === null) return null;
    const problems: string[] = [];
    let lines = '';
    try {
      lines = linesJson(parseLines(doc.lines));
    } catch (err) {
      problems.push(message(err));
    }
    const parsed = levelSourceSchema.safeParse(doc.source);
    if (!parsed.success) {
      problems.push(
        ...parsed.error.issues.map(
          (i) => `${paths.source(doc.source.id)}: ${i.path.join('.')}: ${i.message}`,
        ),
      );
    }
    return { lines, source: sourceJson(doc.source), problems };
  }

  private async save(): Promise<void> {
    const doc = this.doc;
    const out = this.outputs();
    if (doc === null || out === null) return;
    const id = doc.source.id;
    const report: string[] = [];
    if (out.problems.length > 0) {
      this.saveReport = ['Not saved:', ...out.problems];
      this.open.set('files', true);
      this.renderSide();
      return;
    }
    let result = this.checked?.version === this.version ? this.checked.result : null;
    if (result === null) {
      this.say('Running the checks before saving...');
      result = await this.runChecks();
    }
    const level = result?.text ?? null;
    if (!this.repo.connected) {
      this.saveReport = [
        'No repository folder: use the downloads below.',
        level === null
          ? `The level file needs passing checks${result === null ? '' : `: ${result.failures.join('; ')}`}.`
          : '',
      ].filter((s) => s !== '');
      this.open.set('files', true);
      this.renderSide();
      return;
    }
    try {
      report.push(`${paths.lines(id)}: ${await this.repo.write(paths.lines(id), out.lines)}`);
      report.push(`${paths.source(id)}: ${await this.repo.write(paths.source(id), out.source)}`);
      this.savedTexts = { lines: out.lines, source: out.source };
      if (level !== null) {
        report.push(`${paths.level(id)}: ${await this.repo.write(paths.level(id), level)}`);
        report.push(...(await this.writeManifest()));
      } else {
        report.push(
          `${paths.level(id)}: not written (${result === null ? 'the checks did not finish' : result.failures.join('; ')})`,
        );
      }
    } catch (err) {
      report.push(`Save failed: ${message(err)}`);
    }
    this.saveReport = report;
    this.say(
      level === null
        ? 'Saved the lines and the recipe; the level file needs passing checks.'
        : 'Saved.',
    );
    this.renderAll();
  }

  /** Rewrites the manifest from every staged level with a level file, as the build does. */
  private async writeManifest(): Promise<string[]> {
    const stages = (await this.loadStages()) ?? this.stages;
    if (stages === null) return [`${paths.manifest}: not written (no ${paths.stages})`];
    const listed: {
      stage: { stage: number };
      level: ReturnType<typeof levelSourceSchema.parse>;
    }[] = [];
    let mine = false;
    for (const s of stages.stages) {
      for (const id of s.levels) {
        if (!(await this.repo.exists(paths.level(id)))) continue;
        const text = await this.repo.readText(paths.source(id));
        if (text === null) continue;
        const parsed = levelSourceSchema.safeParse(JSON.parse(text));
        if (!parsed.success)
          return [`${paths.manifest}: not written (${paths.source(id)} is invalid)`];
        listed.push({ stage: { stage: s.stage }, level: parsed.data });
        if (id === this.doc?.source.id) mine = true;
      }
    }
    const docId = this.doc?.source.id ?? '';
    const notes = !mine
      ? [`${docId} is not in ${paths.stages}, so the build will not build it.`]
      : this.doc?.source.draft === true
        ? [`${docId} is a draft: the build skips it and the manifest leaves it out.`]
        : [];
    const manifest = composeManifest(stages.stages, listed);
    const what = await this.repo.write(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    return [`${paths.manifest}: ${what}`, ...notes];
  }

  // -------------------------------------------------------------------------------------------
  // Selection helpers

  private composed(): Composed | null {
    const c = this.composition;
    return c !== null && c.ok ? c.value : null;
  }

  private lineOf(id: number): string | null {
    const c = this.composed();
    return c === null ? null : lineOfPart(c, this.shown?.partOf.get(id));
  }

  /** Placed and left-out counts per line id. */
  private perLine(): Map<string, { placed: number; left: number; reason: string }> {
    const out = new Map<string, { placed: number; left: number; reason: string }>();
    const c = this.composed();
    const s = this.shown;
    if (c === null || s === null) return out;
    for (const e of s.level.elements) {
      if (!isScoringElement(e)) continue;
      const id = lineOfPart(c, s.partOf.get(e.id));
      if (id === null) continue;
      const v = out.get(id) ?? { placed: 0, left: 0, reason: '' };
      v.placed++;
      out.set(id, v);
    }
    for (const r of s.rejected) {
      const id = lineOfPart(c, r.part);
      if (id === null) continue;
      const v = out.get(id) ?? { placed: 0, left: 0, reason: '' };
      v.left++;
      // "1.6 px from element 9 (1:outline/path 1)" names the line instead of the part.
      if (v.reason === '') {
        v.reason = r.reason.replace(/\((\d+:[a-z]+\/path \d+)\)/, (all, part: string) => {
          const line = lineOfPart(c, part);
          return line === null ? all : `on ${line}`;
        });
      }
      out.set(id, v);
    }
    return out;
  }

  private nudgeFor(lineId: string): Nudge | null {
    const c = this.composed();
    const fit = this.shown?.fit;
    if (c === null || fit === null || fit === undefined) return null;
    return (
      fit.nudges.find(
        (n) => n.kind === 'spacing' && n.part === c.part && c.ids[n.path] === lineId,
      ) ?? null
    );
  }

  private findings(): Findings | null {
    const s = this.shown;
    const checked = this.checked;
    if (checked !== null) {
      const r = checked.result;
      const report = r.check?.report;
      return {
        issues: r.issues,
        neverHit: new Set(report?.unflagged ?? []),
        stuckFixed: new Set(report?.quickDisappear ?? []),
        spots: [
          ...(report?.fixed ?? []).map((p) => ({ ...p, fixed: true })),
          ...(r.check?.result.spots ?? []).map((p) => ({ ...p, fixed: false })),
        ].map((p) => ({
          x: p.x,
          y: p.y,
          count: p.count,
          bad: p.scoring.length === 0,
          fixed: p.fixed,
        })),
        current: checked.version === this.version,
      };
    }
    if (s?.issues !== null && s?.issues !== undefined) {
      return {
        issues: s.issues,
        neverHit: new Set(),
        stuckFixed: new Set(),
        spots: [],
        current: true,
      };
    }
    return null;
  }

  /** The level to draw: the checked one when it is current (it carries the checks' flags). */
  private levelToDraw(): Level | null {
    const s = this.shown;
    if (s === null) return null;
    if (this.checked?.version === this.version && s.fitted) return this.checked.result.level;
    return s.level;
  }

  // -------------------------------------------------------------------------------------------
  // Motion preview

  /** The shown level in motion, at the preview's tick. */
  private previewOf(): Preview | null {
    const level = this.levelToDraw();
    if (level === null) return null;
    if (this.preview?.level !== level) this.preview = new Preview(level);
    return this.preview.at(this.tick);
  }

  private poseOf(e: LevelElement): Pose {
    return this.previewOf()?.pose(e.id) ?? filePose(e);
  }

  /** The level's compiled paths, for edits of objects that travel along one. */
  private tracks(): Preview['model']['tracks'] {
    return this.previewOf()?.model.tracks ?? [];
  }

  private setTick(tick: number): void {
    const cycle = this.previewOf()?.cycle ?? 1;
    this.tick = ((Math.round(tick) % cycle) + cycle) % cycle;
    this.render();
    this.renderClock();
  }

  private setPlaying(on: boolean): void {
    if (on === this.playing) return;
    this.playing = on;
    cancelAnimationFrame(this.playFrame);
    if (on) {
      this.playLast = performance.now();
      const step = (now: number): void => {
        if (!this.playing || this.destroyed) return;
        // 100 ticks per second, the simulation's own rate.
        const ticks = Math.floor((now - this.playLast) / 10);
        if (ticks > 0) {
          this.playLast += ticks * 10;
          this.setTick(this.tick + ticks);
        }
        this.playFrame = requestAnimationFrame(step);
      };
      this.playFrame = requestAnimationFrame(step);
    }
    this.renderSide();
  }

  /** Updates the preview's slider and readout without rebuilding the panel. */
  private renderClock(): void {
    const cycle = this.previewOf()?.cycle ?? 1;
    if (this.clock.slider !== null) {
      this.clock.slider.max = String(Math.max(0, cycle - 1));
      this.clock.slider.value = String(this.tick);
    }
    if (this.clock.label !== null) {
      this.clock.label.textContent = `tick ${this.tick} of ${cycle} (${(this.tick / 100).toFixed(2)} s of ${(cycle / 100).toFixed(2)} s)`;
    }
  }

  /** The group a line moves with and every group that group rides on, nearest first. */
  private groupChain(line: Line | null): LineGroup[] {
    const doc = this.doc;
    const out: LineGroup[] = [];
    if (doc === null || line === null) return out;
    for (let g = findGroup(doc, line.group); g !== null && !out.includes(g);) {
      out.push(g);
      g = findGroup(doc, g.parent);
    }
    return out;
  }

  /** The selected line's moving unit as the board shows it: swept area, pivots, routes. */
  private motionScene(): Motion | null {
    const doc = this.doc;
    const preview = this.previewOf();
    const line = findLine(doc ?? emptyDoc(), this.tool === 'objects' ? null : this.selLine);
    if (doc === null || preview === null || line === null) return null;
    const unit = unitLines(doc.lines, line.id);
    if (unit.size === 0) return null;
    const key = [...unit].join(' ');
    let sweep =
      this.motionCache?.level === preview.level && this.motionCache.key === key
        ? this.motionCache.sweep
        : null;
    if (sweep === null) {
      const ids = new Set(
        preview.level.elements.filter((e) => unit.has(this.lineOf(e.id) ?? '')).map((e) => e.id),
      );
      sweep = preview.sweep(ids);
      this.motionCache = { level: preview.level, key, sweep };
    }
    const groups = new Set(
      doc.lines.lines.flatMap((l) => (unit.has(l.id) && l.group !== undefined ? [l.group] : [])),
    );
    for (const g of [...groups])
      for (const a of this.groupChain({ ...line, group: g })) groups.add(a.id);
    const own = line.group;
    const pivots = [...groups].flatMap((id) => {
      const g = findGroup(doc, id);
      const p = g === null || !pivotMatters(g) ? null : groupPivot(doc.lines, this.smoothed, g);
      return p === null ? [] : [{ x: p[0], y: p[1], selected: id === own }];
    });
    const follows = [...groups].flatMap((id) => {
      const target = findGroup(doc, id)?.movement?.line;
      const path = target === undefined ? undefined : this.smoothed.get(target);
      return path === undefined ? [] : [path];
    });
    return { sweep, pivots, follows };
  }

  /** The group whose pivot handle is at p, among the selected line's unit. */
  private hitPivot(p: Point): string | null {
    const doc = this.doc;
    const m = this.motionScene();
    if (doc === null || m === null || !this.layers.sweeps) return null;
    const tol = 8 / this.view.zoom;
    for (const g of doc.lines.groups ?? []) {
      const q = groupPivot(doc.lines, this.smoothed, g);
      if (q === null || !m.pivots.some((v) => v.x === q[0] && v.y === q[1])) continue;
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol) return g.id;
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Hit testing (board coordinates)

  private hitPoint(p: Point, lineId: string | null): number | null {
    const line = findLine(this.doc ?? emptyDoc(), lineId);
    if (line === null) return null;
    const tol = 7 / this.view.zoom;
    let best: number | null = null;
    let bestD = tol;
    line.points.forEach(([x, y], i) => {
      const d = Math.sqrt((x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]));
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private hitLine(p: Point): string | null {
    const doc = this.doc;
    if (doc === null) return null;
    const tol = 6 / this.view.zoom;
    let best: string | null = null;
    let bestD = tol;
    for (const line of doc.lines.lines) {
      const path = this.smoothed.get(line.id);
      const pts: Point[] = path?.points.map((q) => [q.x, q.y] as const) ?? line.points;
      const n = pts.length;
      const closed = path?.closed ?? line.closed;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (a === undefined || b === undefined) continue;
        const d = distToSegment(p, a, b);
        if (d <= bestD) {
          best = line.id;
          bestD = d;
        }
      }
    }
    return best;
  }

  private hitObject(p: Point): number | null {
    const level = this.levelToDraw();
    if (level === null) return null;
    const tol = 3 / this.view.zoom;
    let best: number | null = null;
    let bestD = tol;
    for (const e of level.elements) {
      if (!isScoringElement(e)) continue;
      const s = elementShape(e, this.poseOf(e));
      if (s === null) continue;
      const d = pointGap(s, p[0], p[1]);
      if (d <= bestD) {
        best = e.id;
        bestD = d;
      }
    }
    return best;
  }

  /** Index at which a point at p goes into a line: before the end of its nearest segment. */
  private insertIndex(line: Line, p: Point): number {
    const n = line.points.length;
    let best = n;
    let bestD = Infinity;
    for (let i = 0; i < (line.closed ? n : n - 1); i++) {
      const a = line.points[i];
      const b = line.points[(i + 1) % n];
      if (a === undefined || b === undefined) continue;
      const d = distToSegment(p, a, b);
      if (d < bestD) {
        bestD = d;
        best = i + 1;
      }
    }
    return best;
  }

  private boardAt(e: { clientX: number; clientY: number }): Point {
    const r = this.canvas.getBoundingClientRect();
    const b = toBoard(this.view, e.clientX - r.left, e.clientY - r.top);
    return [b.x, b.y];
  }

  // -------------------------------------------------------------------------------------------
  // Pointer input

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.doc === null) return;
    this.root.focus();
    const p = this.boardAt(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events may not capture.
    }
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: this.view };
      return;
    }
    if (e.button !== 0) return;
    if (this.tool === 'draw') {
      this.addDrawPoint(p, e.shiftKey);
      return;
    }
    if (this.tool === 'objects') {
      const id = this.hitObject(p);
      this.selObject = id;
      if (id === null) {
        this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: this.view };
      } else {
        const level = this.levelToDraw();
        const obj = level?.elements.find((x) => x.id === id);
        this.drag = {
          kind: 'object',
          id,
          before: this.doc,
          start: p,
          from: [obj?.x ?? p[0], obj?.y ?? p[1]],
          moved: false,
        };
      }
      this.renderAll();
      return;
    }
    // Lines tool: the pivot of the selected line's group, a point of the selected (or hovered)
    // line, else a line, else pan.
    const pivot = this.hitPivot(p);
    if (pivot !== null) {
      this.drag = { kind: 'pivot', group: pivot, before: this.doc, moved: false };
      return;
    }
    for (const lineId of [this.selLine, this.hoverLine]) {
      const index = this.hitPoint(p, lineId);
      if (index !== null && lineId !== null) {
        this.selLine = lineId;
        this.selPoint = index;
        this.drag = { kind: 'point', line: lineId, index, before: this.doc, moved: false };
        this.renderAll();
        return;
      }
    }
    const lineId = this.hitLine(p);
    if (lineId !== null) {
      if (this.selLine !== lineId) this.selPoint = null;
      this.selLine = lineId;
      this.drag = { kind: 'line', line: lineId, before: this.doc, start: p, moved: false };
      this.renderAll();
      return;
    }
    this.selLine = null;
    this.selPoint = null;
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: this.view };
    this.renderAll();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.doc === null) return;
    const p = this.boardAt(e);
    this.cursor = p;
    const d = this.drag;
    if (d === null) {
      this.updateHover(p);
      this.renderStatus();
      if (this.tool === 'draw') this.render();
      return;
    }
    if (d.kind === 'pan') {
      this.view = panBy(d.view, e.clientX - d.sx, e.clientY - d.sy);
      this.render();
      this.renderStatus();
      return;
    }
    const k = this.view.zoom;
    if (d.kind === 'point') {
      if (!d.moved) {
        d.moved = true;
        this.history.push(d.before);
      }
      this.apply(movePoint(d.before, d.line, d.index, p));
      return;
    }
    if (d.kind === 'pivot') {
      const g = findGroup(d.before, d.group);
      if (g === null) return;
      if (!d.moved) {
        d.moved = true;
        this.history.push(d.before);
      }
      this.apply(putGroup(d.before, { ...g, pivot: clampToBoard(d.before.lines, p) }));
      return;
    }
    const dx = p[0] - d.start[0];
    const dy = p[1] - d.start[1];
    if (!d.moved && Math.sqrt(dx * dx + dy * dy) * k < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      this.history.push(d.before);
    }
    if (d.kind === 'line') {
      this.apply(translateLine(d.before, d.line, round1(dx), round1(dy)));
      return;
    }
    // Objects: the edit list changes with the drag.
    const shown = this.shown;
    if (shown === null) return;
    if (this.movingObject(d.id)) {
      this.say(MOVES_WITH_LINE);
      return;
    }
    const origin = originOf(shown, d.id, this.tracks());
    const to: Point = [d.from[0] + dx, d.from[1] + dy];
    this.apply(setEdits(d.before, moveObject(recipeEdits(d.before), origin, to)));
    this.selObject = this.findMoved(to) ?? d.id;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const d = this.drag;
    this.drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Not captured.
    }
    if (d !== null && d.kind !== 'pan' && d.moved) this.scheduleFit();
  };

  private readonly onPointerLeave = (): void => {
    this.cursor = null;
    this.hoverLine = null;
    this.hoverObject = null;
    this.renderStatus();
    this.render();
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    const doc = this.doc;
    if (doc === null) return;
    const p = this.boardAt(e);
    if (this.tool === 'draw') {
      this.finishDrawing();
      return;
    }
    if (this.tool !== 'lines') return;
    const lineId = this.hitLine(p);
    const line = findLine(doc, lineId);
    if (line === null || lineId === null) return;
    if (this.hitPoint(p, lineId) !== null) return;
    const index = this.insertIndex(line, p);
    this.commit(insertPoint(doc, lineId, index, p));
    this.selLine = lineId;
    this.selPoint = index;
    this.renderAll();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const factor = Math.exp((-e.deltaY * unit) / (e.ctrlKey ? 100 : 400));
      this.view = zoomAt(this.view, e.clientX - r.left, e.clientY - r.top, factor);
    } else {
      this.view = panBy(this.view, -e.deltaX, -e.deltaY);
    }
    this.render();
    this.renderStatus();
  };

  private updateHover(p: Point): void {
    const before = `${this.hoverLine}/${this.hoverObject}`;
    if (this.tool === 'objects') {
      this.hoverObject = this.hitObject(p);
      this.hoverLine = null;
    } else if (this.tool === 'lines') {
      this.hoverLine = this.hitPoint(p, this.selLine) !== null ? this.selLine : this.hitLine(p);
      this.hoverObject = null;
    } else {
      this.hoverLine = null;
      this.hoverObject = null;
    }
    this.canvas.style.cursor = this.spaceDown
      ? 'grab'
      : this.tool === 'draw'
        ? 'crosshair'
        : this.hoverLine !== null || this.hoverObject !== null
          ? 'pointer'
          : 'default';
    if (`${this.hoverLine}/${this.hoverObject}` !== before) this.render();
  }

  /** The id of the scoring object at a board position in the shown level. */
  private findMoved(p: Point): number | null {
    const level = this.levelToDraw();
    const e = level?.elements.find(
      (x) =>
        isScoringElement(x) &&
        Math.abs(x.x - round1(p[0])) < 0.06 &&
        Math.abs(x.y - round1(p[1])) < 0.06,
    );
    return e?.id ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // Drawing new lines

  private addDrawPoint(p: Point, corner: boolean): void {
    const doc = this.doc;
    if (doc === null) return;
    const q = clampToBoard(doc.lines, p);
    const d = this.drawing ?? { points: [], corners: [] };
    const first = d.points[0];
    if (first !== undefined && d.points.length >= 3) {
      const dx = (first[0] - q[0]) * this.view.zoom;
      const dy = (first[1] - q[1]) * this.view.zoom;
      if (Math.sqrt(dx * dx + dy * dy) < 8) {
        this.finishDrawing(true);
        return;
      }
    }
    const last = d.points[d.points.length - 1];
    if (last !== undefined && Math.abs(last[0] - q[0]) < 1 && Math.abs(last[1] - q[1]) < 1) return;
    this.drawing = {
      points: [...d.points, q],
      corners: corner ? [...d.corners, d.points.length] : d.corners,
    };
    this.renderAll();
  }

  private finishDrawing(closed = false): void {
    const doc = this.doc;
    const d = this.drawing;
    this.drawing = null;
    if (doc === null || d === null || d.points.length < 2 || (closed && d.points.length < 3)) {
      this.renderAll();
      return;
    }
    const id = freshId(doc);
    const line: Line = {
      id,
      mode: 'pegs',
      closed,
      points: d.points.map(([x, y]) => [x, y]),
      corners: d.corners,
    };
    this.commit(addLine(doc, line));
    this.selLine = id;
    this.selPoint = null;
    this.setTool('lines');
    this.say(`Added ${id}. Name it and pick bricks or pegs in the Selection panel.`);
  }

  // -------------------------------------------------------------------------------------------
  // Keyboard

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // The game's input and audio listen on the window; the editor keeps its keys to itself.
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.save();
      return;
    }
    if (isTyping(e.target)) return;
    if (this.doc === null) return;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'enter') {
      e.preventDefault();
      void this.runChecks();
      return;
    }
    if (mod) return;
    if (e.key === ' ') {
      e.preventDefault();
      this.spaceDown = true;
      this.canvas.style.cursor = 'grab';
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      this.nudgeSelection(dx, dy);
      return;
    }
    switch (key) {
      case 'escape':
        if (this.drawing !== null) this.drawing = null;
        else {
          this.selLine = null;
          this.selPoint = null;
          this.selObject = null;
        }
        this.renderAll();
        return;
      case 'enter':
        if (this.drawing !== null) this.finishDrawing();
        return;
      case 'v':
        this.setTool('lines');
        return;
      case 'n':
        this.setTool('draw');
        return;
      case 'e':
        this.setTool('objects');
        return;
      case 'delete':
      case 'backspace':
        e.preventDefault();
        this.deleteSelection();
        return;
      case 'tab':
        e.preventDefault();
        this.cycleLine(e.shiftKey ? -1 : 1);
        return;
      case 'f':
      case '0':
        this.fitBoard();
        this.renderAll();
        return;
      case '=':
      case '+':
      case '-': {
        const r = this.stage.getBoundingClientRect();
        this.view = zoomAt(this.view, r.width / 2, r.height / 2, key === '-' ? 1 / 1.25 : 1.25);
        this.renderAll();
        return;
      }
      case 'g':
        void this.runFit();
        return;
      case 'k':
        this.setPlaying(!this.playing);
        return;
      case ',':
      case '<':
      case '.':
      case '>':
        this.setPlaying(false);
        this.setTick(this.tick + (key === ',' || key === '<' ? -1 : 1) * (e.shiftKey ? 10 : 1));
        return;
      case 'h':
      case '?':
        this.open.set('keys', !(this.open.get('keys') ?? false));
        this.renderSide();
        return;
      default:
        break;
    }
    if (this.tool === 'draw' && key === 'c' && this.drawing !== null) {
      const last = this.drawing.points.length - 1;
      if (last >= 0) {
        const has = this.drawing.corners.includes(last);
        this.drawing = {
          ...this.drawing,
          corners: has
            ? this.drawing.corners.filter((c) => c !== last)
            : [...this.drawing.corners, last],
        };
        this.renderAll();
      }
      return;
    }
    if (this.tool === 'lines') this.lineKey(key);
    if (this.tool === 'objects') this.objectKey(key, e.shiftKey);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === ' ') {
      this.spaceDown = false;
      this.canvas.style.cursor = 'default';
    }
  };

  private readonly onFocusOut = (): void => {
    // A panel field left: show what changed while it was being typed in.
    setTimeout(() => {
      if (this.sideDirty && !isTyping(document.activeElement)) this.renderSide();
    }, 0);
  };

  private lineKey(key: string): void {
    const doc = this.doc;
    const id = this.selLine;
    if (doc === null || id === null) return;
    const line = findLine(doc, id);
    if (line === null) return;
    if (key === 'c' && this.selPoint !== null) this.commit(toggleCorner(doc, id, this.selPoint));
    if (key === 'o') this.commit(setClosed(doc, id, !line.closed));
    if (key === 'b') this.commit(setLineFields(doc, id, { mode: 'bricks' }));
    if (key === 'p') this.commit(setLineFields(doc, id, { mode: 'pegs' }));
  }

  private objectKey(key: string, shift: boolean): void {
    const doc = this.doc;
    const shown = this.shown;
    if (doc === null || shown === null) return;
    const edits = recipeEdits(doc);
    if ((key === 'a' || key === 'b') && this.cursor !== null) {
      const at = this.cursor;
      this.commit(setEdits(doc, addObject(edits, key === 'a' ? 'peg' : 'brick', at)));
      this.selObject = this.findMoved(at);
      this.renderAll();
      return;
    }
    const id = this.selObject;
    if (id === null) return;
    const origin = originOf(shown, id, this.tracks());
    const obj = this.levelToDraw()?.elements.find((x) => x.id === id);
    if (obj === undefined || !isScoringElement(obj)) return;
    if (key === 'o')
      this.commit(setEdits(doc, setFlag(edits, origin, 'canBeOrange', !obj.canBeOrange)));
    if (key === 'q') {
      this.commit(setEdits(doc, setFlag(edits, origin, 'quickDisappear', !obj.quickDisappear)));
    }
    if (key === 'r' && obj.kind !== 'peg') {
      if (isMoving(obj)) {
        this.say(MOVES_WITH_LINE);
        return;
      }
      const turn = ((shift ? -15 : 15) * Math.PI) / 180;
      this.commit(setEdits(doc, rotateObject(edits, origin, obj.rotation + turn)));
    }
  }

  /** True when an object of the shown level moves (edits can delete or flag it, not move it). */
  private movingObject(id: number): boolean {
    const e = this.levelToDraw()?.elements.find((x) => x.id === id);
    return e !== undefined && isMoving(e);
  }

  private nudgeSelection(dx: number, dy: number): void {
    const doc = this.doc;
    if (doc === null) return;
    if (this.tool === 'objects' && this.selObject !== null && this.shown !== null) {
      const obj = this.levelToDraw()?.elements.find((x) => x.id === this.selObject);
      if (obj === undefined) return;
      if (isMoving(obj)) {
        this.say(MOVES_WITH_LINE);
        return;
      }
      const to: Point = [obj.x + dx, obj.y + dy];
      this.commit(
        setEdits(
          doc,
          moveObject(recipeEdits(doc), originOf(this.shown, obj.id, this.tracks()), to),
        ),
      );
      this.selObject = this.findMoved(to) ?? this.selObject;
      this.renderAll();
      return;
    }
    const line = findLine(doc, this.selLine);
    if (line === null) return;
    if (this.selPoint !== null) {
      const p = line.points[this.selPoint];
      if (p !== undefined)
        this.commit(movePoint(doc, line.id, this.selPoint, [p[0] + dx, p[1] + dy]));
    } else {
      this.commit(translateLine(doc, line.id, dx, dy));
    }
  }

  private deleteSelection(): void {
    const doc = this.doc;
    if (doc === null) return;
    if (this.tool === 'objects') {
      if (this.selObject === null || this.shown === null) return;
      this.commit(
        setEdits(
          doc,
          deleteObject(recipeEdits(doc), originOf(this.shown, this.selObject, this.tracks())),
        ),
      );
      this.selObject = null;
      this.renderAll();
      return;
    }
    if (this.drawing !== null) {
      const pts = this.drawing.points.slice(0, -1);
      this.drawing = { points: pts, corners: this.drawing.corners.filter((c) => c < pts.length) };
      this.renderAll();
      return;
    }
    const id = this.selLine;
    if (id === null) return;
    if (this.selPoint !== null) {
      this.commit(deletePoint(doc, id, this.selPoint));
      this.selPoint = null;
    } else {
      this.commit(deleteLine(doc, id));
      this.selLine = null;
    }
    this.renderAll();
  }

  private cycleLine(delta: number): void {
    const doc = this.doc;
    if (doc === null || doc.lines.lines.length === 0) return;
    const ids = doc.lines.lines.map((l) => l.id);
    const i = this.selLine === null ? -1 : ids.indexOf(this.selLine);
    const next = ids[(i + delta + ids.length) % ids.length] ?? null;
    this.setTool('lines');
    this.selLine = next;
    this.selPoint = null;
    this.renderAll();
  }

  private setTool(tool: Tool): void {
    if (this.tool === tool) return;
    if (tool !== 'draw') this.drawing = null;
    this.tool = tool;
    if (tool !== 'objects') this.selObject = null;
    this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : 'default';
    this.renderAll();
  }

  private say(text: string): void {
    this.msg = text;
    this.renderStatus();
  }

  // -------------------------------------------------------------------------------------------
  // Rendering

  private renderAll(): void {
    this.render();
    this.renderBar();
    this.renderSide();
    this.renderStatus();
    this.renderHint();
  }

  private render(): void {
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const ctx = this.ctx;
    const doc = this.doc;
    if (ctx === null || doc === null) return;
    const r = this.stage.getBoundingClientRect();
    const level = this.levelToDraw();
    const lineOf = new Map<number, string | null>();
    const edited = new Set<number>();
    if (level !== null && this.shown !== null) {
      for (const e of level.elements) lineOf.set(e.id, this.lineOf(e.id));
      for (const id of this.shown.edits.entryOf.keys()) edited.add(id);
    }
    drawScene(ctx, {
      view: this.view,
      width: r.width,
      height: r.height,
      dpr: window.devicePixelRatio || 1,
      board: doc.lines.board,
      picture: this.picture,
      pictureOpacity: this.pictureOpacity,
      layers: this.layers,
      sweeps: flipperSweeps(doc.lines.board.width, doc.lines.board.height),
      lines: doc.lines.lines,
      smoothed: this.smoothed,
      selectedLine: this.tool === 'objects' ? null : this.selLine,
      selectedPoint: this.selPoint,
      hoverLine: this.hoverLine,
      drawing:
        this.drawing === null
          ? null
          : { points: this.drawing.points, corners: this.drawing.corners, cursor: this.cursor },
      level,
      pose: (e) => this.poseOf(e),
      motion: this.motionScene(),
      lineOf,
      rejected: this.shown?.rejected ?? [],
      selectedObject: this.tool === 'objects' ? this.selObject : null,
      hoverObject: this.hoverObject,
      edited,
      findings: this.findings(),
      objectsMode: this.tool === 'objects',
    });
  }

  private renderHint(): void {
    const c = this.composition;
    let hint = '';
    if (this.tool === 'draw') {
      hint =
        this.drawing === null || this.drawing.points.length === 0
          ? 'Click to place points. Shift-click places a sharp corner.'
          : 'Enter or double-click finishes; click the first point to close the line; Esc cancels; Backspace removes the last point.';
    } else if (this.tool === 'objects') {
      hint =
        'Drag pegs and bricks to move them. A adds a peg, B a brick at the cursor; O, Q and R change the selected one.';
    } else if (c !== null && !c.ok) {
      hint = c.error;
    }
    this.hintBar.textContent = hint;
  }

  private renderBar(): void {
    const doc = this.doc;
    if (doc === null) return;
    const s = this.shown;
    const fit = s?.fit ?? null;
    const target = doc.source.recipe.targetCount;
    const count = s === null ? null : s.level.elements.filter(isScoringElement).length;
    const countPill = el('span', {
      class: `ted-pill ${count === null ? '' : count === target ? 'ted-good' : 'ted-bad'}`,
      text: `${count ?? '-'} / ${target} objects${s !== null && !s.fitted ? ' ...' : ''}`,
      title:
        fit === null
          ? 'Fitting to the count...'
          : fit.ok
            ? 'The level hits its count.'
            : 'The fit could not reach the count.',
    });
    const issues = s?.issues ?? null;
    const validPill = el('span', {
      class: `ted-pill ${issues === null ? '' : issues.length === 0 ? 'ted-good' : 'ted-bad'}`,
      text:
        issues === null
          ? 'validity ...'
          : issues.length === 0
            ? 'valid'
            : `${issues.length} invalid`,
    });
    const chk = this.checked;
    const checkPill = el('span', {
      class: `ted-pill ${chk === null || chk.version !== this.version ? '' : chk.result.failures.length === 0 ? 'ted-good' : 'ted-bad'}`,
      text:
        this.checking !== null
          ? 'checking ...'
          : chk === null
            ? 'not checked'
            : chk.version !== this.version
              ? 'checks outdated'
              : chk.result.failures.length === 0
                ? 'checks pass'
                : 'checks fail',
    });
    const t = this.tool;
    this.bar.replaceChildren(
      el('span', { class: 'ted-title', text: `${doc.source.id}  ${doc.source.name}` }),
      button(
        'Lines',
        () => {
          this.setTool('lines');
        },
        { pressed: t === 'lines', title: 'Select and edit lines (V)' },
      ),
      button(
        'Draw',
        () => {
          this.setTool('draw');
        },
        { pressed: t === 'draw', title: 'Draw a new line (N)' },
      ),
      button(
        'Objects',
        () => {
          this.setTool('objects');
        },
        { pressed: t === 'objects', title: 'Edit single pegs and bricks (E)' },
      ),
      el('span', { class: 'ted-sep' }),
      button(
        'Undo',
        () => {
          this.undo();
        },
        { disabled: !this.history.canUndo, title: 'Undo (Ctrl+Z)' },
      ),
      button(
        'Redo',
        () => {
          this.redo();
        },
        { disabled: !this.history.canRedo, title: 'Redo (Shift+Ctrl+Z)' },
      ),
      el('span', { class: 'ted-sep' }),
      button(
        'Fit view',
        () => {
          this.fitBoard();
          this.renderAll();
        },
        { title: 'Show the whole board (F)' },
      ),
      el('span', { class: 'ted-spacer' }),
      countPill,
      validPill,
      checkPill,
      button(
        this.checking === null ? 'Run checks' : 'Stop',
        () => {
          if (this.checking === null) void this.runChecks();
          else this.stopChecks();
        },
        { title: 'Validity, gap, reachability and stuck checks (Ctrl+Enter)' },
      ),
      button(
        'Save',
        () => {
          void this.save();
        },
        { primary: true, title: 'Save (Ctrl+S)' },
      ),
    );
  }

  private renderStatus(): void {
    const c = this.cursor;
    const dirty = this.isDirty();
    this.status.replaceChildren(
      el('span', { text: c === null ? 'x -  y -' : `x ${c[0].toFixed(1)}  y ${c[1].toFixed(1)}` }),
      el('span', { text: `zoom ${Math.round(this.view.zoom * 100)}%` }),
      el('span', { text: dirty ? 'unsaved changes' : 'saved' }),
      el('span', { class: 'ted-msg', text: this.msg }),
    );
  }

  private isDirty(): boolean {
    const doc = this.doc;
    if (doc === null) return false;
    const saved = this.savedTexts;
    if (saved === null) return true;
    let lines: string;
    try {
      lines = linesJson(parseLines(doc.lines));
    } catch {
      return true;
    }
    return lines !== saved.lines || sourceJson(doc.source) !== saved.source;
  }

  private renderSide(): void {
    if (this.doc === null) return;
    if (this.side.contains(document.activeElement) && isTyping(document.activeElement)) {
      this.sideDirty = true;
      return;
    }
    this.sideDirty = false;
    const scroll = this.side.scrollTop;
    const setOpen = (key: string, v: boolean): void => {
      this.open.set(key, v);
    };
    this.side.replaceChildren(
      section('selection', this.selectionTitle(), this.open, setOpen, ...this.selectionPanel()),
      section(
        'lines',
        `Lines (${this.doc.lines.lines.length})`,
        this.open,
        setOpen,
        this.linesPanel(),
      ),
      section('motion', 'Motion', this.open, setOpen, ...this.motionPanel()),
      section('level', 'Level', this.open, setOpen, ...this.levelPanel()),
      section(
        'edits',
        `Manual edits (${recipeEdits(this.doc).length})`,
        this.open,
        setOpen,
        ...this.editsPanel(),
      ),
      section('checks', 'Checks', this.open, setOpen, ...this.checksPanel()),
      section('files', 'Save', this.open, setOpen, ...this.filesPanel()),
      section('view', 'View', this.open, setOpen, ...this.viewPanel()),
      section('keys', 'Keys', this.open, setOpen, this.keysPanel()),
    );
    this.side.scrollTop = scroll;
  }

  private selectionTitle(): string {
    if (this.tool === 'draw') return 'Drawing';
    if (this.tool === 'objects')
      return this.selObject === null ? 'Object' : `Object ${this.selObject}`;
    return this.selLine === null ? 'Line' : `Line ${this.selLine}`;
  }

  private selectionPanel(): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    if (this.tool === 'draw') {
      return [
        el('div', {
          class: 'ted-note',
          text: 'Click on the board to place control points; shift-click or C marks a sharp corner. Enter finishes the line, a click on its first point closes it.',
        }),
      ];
    }
    if (this.tool === 'objects') return this.objectPanel();
    const line = findLine(doc, this.selLine);
    if (line === null) {
      return [
        el('div', {
          class: 'ted-note',
          text: 'Click a line to select it, or press N to draw one. Double-click a line to add a point.',
        }),
      ];
    }
    const id = line.id;
    const stats = this.perLine().get(id);
    const nudge = this.nudgeFor(id);
    const point = this.selPoint === null ? undefined : line.points[this.selPoint];
    const out: (Node | null)[] = [
      row(
        'Id',
        textInput(id, (v) => {
          const problem = idProblem(doc, id, v);
          if (problem !== null) {
            this.say(`Line id "${v}": ${problem}.`);
            this.renderSide();
            return;
          }
          this.selLine = v;
          this.commit(renameLine(doc, id, v));
        }),
      ),
      row(
        'Note',
        textArea(
          line.note ?? '',
          (v) => {
            this.commit(setLineFields(doc, id, { note: v === '' ? undefined : v }));
          },
          2,
        ),
      ),
      row(
        'Places',
        select(
          line.mode,
          [
            ['pegs', 'Round pegs'],
            ['bricks', 'Bricks'],
          ],
          (v) => {
            this.commit(setLineFields(doc, id, { mode: v }));
          },
        ),
      ),
      row(
        'Closed',
        checkbox(line.closed, (v) => {
          this.commit(setClosed(doc, id, v));
        }),
      ),
    ];
    if (line.mode === 'pegs') {
      // Pegs that travel may be spaced wider, to pass where their line crosses itself.
      const max = line.travel === undefined ? LINE_SPACING_MAX : TRAVEL_SPACING_MAX;
      out.push(
        row(
          'Spacing',
          numberInput(
            line.spacing ?? null,
            (v) => {
              this.commit(
                setLineFields(doc, id, {
                  spacing: v === null ? undefined : Math.min(max, Math.max(34, v)),
                }),
              );
            },
            { min: 34, max, step: 0.5, placeholder: '41' },
          ),
          nudge?.kind === 'spacing'
            ? `fitted to ${nudge.to} (${nudge.pegsTo - nudge.pegsFrom > 0 ? '+' : ''}${nudge.pegsTo - nudge.pegsFrom} peg)`
            : `34 to ${max} px; empty is 41`,
        ),
        row(
          'Keep spacing',
          checkbox(line.keepSpacing === true, (v) => {
            this.commit(setLineFields(doc, id, { keepSpacing: v }));
          }),
          'count fitting leaves this line alone',
        ),
      );
    }
    out.push(...this.lineMotionPanel(line));
    out.push(
      el('div', {
        class: 'ted-note',
        text: `${line.points.length} points, ${line.corners.length} corners. Placed ${stats?.placed ?? 0}${(stats?.left ?? 0) > 0 ? `, left out ${stats?.left ?? 0}: ${stats?.reason ?? ''}` : ''}.`,
      }),
    );
    if (point !== undefined && this.selPoint !== null) {
      const index = this.selPoint;
      out.push(
        el('div', { class: 'ted-note', text: `Point ${index}` }),
        row(
          'x',
          numberInput(
            point[0],
            (v) => {
              if (v !== null) this.commit(movePoint(doc, id, index, [v, point[1]]));
            },
            { step: 0.1 },
          ),
        ),
        row(
          'y',
          numberInput(
            point[1],
            (v) => {
              if (v !== null) this.commit(movePoint(doc, id, index, [point[0], v]));
            },
            { step: 0.1 },
          ),
        ),
        row(
          'Sharp corner',
          checkbox(line.corners.includes(index), () => {
            this.commit(toggleCorner(doc, id, index));
          }),
        ),
        el(
          'div',
          { class: 'ted-buttons' },
          button(
            'Delete point',
            () => {
              this.commit(deletePoint(doc, id, index));
              this.selPoint = null;
              this.renderAll();
            },
            { disabled: line.points.length <= (line.closed ? 3 : 2) },
          ),
        ),
      );
    }
    out.push(
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          'Earlier',
          () => {
            this.commit(reorderLine(doc, id, -1));
          },
          { title: 'Place this line earlier' },
        ),
        button(
          'Later',
          () => {
            this.commit(reorderLine(doc, id, 1));
          },
          { title: 'Place this line later' },
        ),
        button('Delete line', () => {
          this.commit(deleteLine(doc, id));
          this.selLine = null;
          this.renderAll();
        }),
      ),
    );
    return out;
  }

  /** How a line moves: the group it moves with, or its objects traveling along it. */
  private lineMotionPanel(line: Line): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    const id = line.id;
    const groups = doc.lines.groups ?? [];
    const out: (Node | null)[] = [
      el('div', { class: 'ted-subhead', text: 'Motion' }),
      row(
        'Group',
        select<string>(
          line.group ?? '',
          [
            ['', 'None: stands still'] as const,
            ...groups.map((g) => [g.id, g.id] as const),
            ['+new', 'New group...'] as const,
          ],
          (v) => {
            if (v === '+new') {
              const gid = freshGroupId(doc, id);
              this.commit(
                setLineGroup(putGroup(doc, { id: gid, movement: NEW_GROUP_MOVEMENT }), id, gid),
              );
              this.say(
                `New group ${gid}: set its movement below; drag its cross to move its pivot.`,
              );
              return;
            }
            this.commit(setLineGroup(doc, id, v === '' ? undefined : v));
          },
        ),
        'the line moves as one with the group',
      ),
      row(
        'Travels',
        checkbox(line.travel !== undefined, (v) => {
          this.commit(setLineTravel(doc, id, v ? NEW_TRAVEL : undefined));
        }),
        'its objects run along the line',
      ),
    ];
    const t = line.travel;
    if (t !== undefined) {
      const setT = (patch: Partial<Travel>): void => {
        this.commit(setLineTravel(doc, id, compact<Travel>({ ...t, ...patch })));
      };
      out.push(
        row(
          'Lap',
          numberInput(t.period, (v) => {
            if (v !== null) setT({ period: Math.max(1, Math.round(v)) });
          }),
          `ticks ${line.closed ? 'around the line' : 'from start to end, then back to the start'}`,
        ),
        row(
          'Reverse',
          checkbox(t.reverse === true, (v) => {
            setT({ reverse: v ? true : undefined });
          }),
          line.closed ? 'the other way round' : 'from the end to the start',
        ),
        row(
          'Phase',
          numberInput(
            t.phase ?? null,
            (v) => {
              setT({ phase: v === null || v === 0 ? undefined : wrap01(v) });
            },
            { step: 0.05, placeholder: '0' },
          ),
          'start, a fraction of the lap',
        ),
      );
    }
    const group = findGroup(doc, line.group);
    if (group !== null) out.push(...this.groupPanel(group));
    return out;
  }

  /** A group's settings: its movement, pivot and the group it rides on. */
  private groupPanel(group: LineGroup): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    const m = group.movement;
    const put = (g: LineGroup): void => {
      this.commit(putGroup(doc, g));
    };
    const setM = (patch: Partial<GroupMovement>): void => {
      if (m === undefined) return;
      put({ ...group, movement: compact<GroupMovement>({ ...m, ...patch }) });
    };
    const others = (doc.lines.groups ?? []).filter((g) => g.id !== group.id);
    // A group cannot ride on one that rides on it.
    const below = new Set([group.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const g of others) {
        if (g.parent !== undefined && below.has(g.parent) && !below.has(g.id)) {
          below.add(g.id);
          grew = true;
        }
      }
    }
    const pivot = groupPivot(doc.lines, this.smoothed, group);
    const out: (Node | null)[] = [
      el('div', { class: 'ted-subhead', text: `Group ${group.id}` }),
      row(
        'Id',
        textInput(group.id, (v) => {
          if (!SLUG.test(v) || (v !== group.id && findGroup(doc, v) !== null)) {
            this.say(`Group id "${v}": lowercase words joined by hyphens, not taken yet.`);
            this.renderSide();
            return;
          }
          this.commit(renameGroup(doc, group.id, v));
        }),
      ),
      row(
        'Moves',
        select<string>(
          m?.type ?? '',
          [
            ['', 'Only rides on its parent'] as const,
            ...GROUP_MOVEMENT_TYPES.map((t) => [t, MOVEMENT_LABELS[t]] as const),
          ],
          (v) => {
            if (v === '') {
              const rest: LineGroup = { ...group };
              Reflect.deleteProperty(rest, 'movement');
              put(rest);
              return;
            }
            const type = v as GroupMovementType;
            const base = m ?? NEW_GROUP_MOVEMENT;
            const next: GroupMovement = { ...base, type };
            if (type === 'followPath') {
              next.line =
                base.line ??
                doc.lines.lines.find((l) => l.group !== group.id)?.id ??
                doc.lines.lines[0]?.id;
            } else {
              Reflect.deleteProperty(next, 'line');
            }
            if (type === 'rotateBackAndForth')
              next.period = 4 * Math.max(1, Math.round(base.period / 4));
            put({ ...group, movement: compact(next) });
          },
        ),
      ),
    ];
    if (m !== undefined) {
      const t = m.type;
      const num = (
        label: string,
        value: number | undefined,
        commit: (v: number | null) => void,
        hint?: string,
        step = 1,
      ): HTMLElement =>
        row(label, numberInput(value ?? null, commit, { step, placeholder: '0' }), hint);
      const deg1 = (rad: number | undefined): number | undefined =>
        rad === undefined ? undefined : deg(rad);
      const rad = (v: number | null): number | undefined =>
        v === null || v === 0 ? undefined : Math.round(((v * Math.PI) / 180) * 1e4) / 1e4;
      out.push(
        num(
          'Period',
          m.period,
          (v) => {
            if (v === null) return;
            const p = Math.max(1, Math.round(v));
            setM({ period: t === 'rotateBackAndForth' ? 4 * Math.max(1, Math.round(p / 4)) : p });
          },
          t === 'rotateBackAndForth' ? 'ticks per cycle, a multiple of 4' : 'ticks per cycle',
        ),
      );
      if (t === 'followPath') {
        out.push(
          row(
            'Along',
            select<string>(
              m.line ?? '',
              doc.lines.lines.map((l) => [l.id, l.id] as const),
              (v) => {
                setM({ line: v });
              },
            ),
            'the line it glides along, from where it passes nearest the pivot',
          ),
        );
      }
      if (RADIUS_TYPES.has(t)) {
        out.push(
          num(
            'Radius',
            m.radius,
            (v) => {
              setM({ radius: v === null || v === 0 ? undefined : Math.max(0, v) });
            },
            t === 'horizontalWrap' || t === 'verticalWrap' ? 'travel before it starts over' : 'px',
          ),
        );
      }
      if (RADIUS2_TYPES.has(t)) {
        out.push(
          num(
            'Radius 2',
            m.radius2,
            (v) => {
              setM({ radius2: v === null || v === 0 ? undefined : Math.max(0, v) });
            },
            'vertical; empty is the same as radius',
          ),
        );
      }
      if (ANGLE_TYPES.has(t)) {
        out.push(
          num(
            'Angle',
            deg1(m.maxAngle),
            (v) => {
              setM({ maxAngle: rad(v === null ? null : Math.max(0, v)) });
            },
            t === 'rotateBackAndForth'
              ? 'degrees each way; empty is 180'
              : 'degrees of arc; empty is 180',
            5,
          ),
        );
      }
      if (t !== 'rotate' && t !== 'followPath') {
        out.push(
          num(
            'Rotation',
            deg1(m.pathRotation),
            (v) => {
              setM({ pathRotation: rad(v) });
            },
            t === 'rotateBackAndForth'
              ? 'degrees added to the swing'
              : 'degrees the path is turned',
            5,
          ),
        );
      }
      out.push(
        row(
          'Reverse',
          checkbox(m.reverse === true, (v) => {
            setM({ reverse: v ? true : undefined });
          }),
        ),
        num(
          'Phase',
          m.phase,
          (v) => {
            setM({ phase: v === null || v === 0 ? undefined : wrap01(v) });
          },
          'start, a fraction of the cycle',
          0.05,
        ),
        num(
          'Offset',
          m.offset,
          (v) => {
            setM({ offset: v === null || v === 0 ? undefined : Math.round(v) });
          },
          'ticks added to the clock',
        ),
        num(
          'Pause 1',
          m.pause1,
          (v) => {
            setM({ pause1: v === null || v <= 0 ? undefined : Math.round(v) });
          },
          'ticks',
        ),
      );
      if ((m.pause1 ?? 0) > 0) {
        out.push(
          num(
            'Pause 1 at',
            m.pause1At,
            (v) => {
              setM({ pause1At: v === null || v <= 0 ? undefined : Math.min(100, Math.round(v)) });
            },
            'percent of the period',
          ),
          num(
            'Pause 2',
            m.pause2,
            (v) => {
              setM({ pause2: v === null || v <= 0 ? undefined : Math.round(v) });
            },
            'ticks',
          ),
          num(
            'Pause 2 at',
            m.pause2At,
            (v) => {
              setM({ pause2At: v === null || v <= 0 ? undefined : Math.min(100, Math.round(v)) });
            },
            'percent of the period',
          ),
        );
      }
    }
    out.push(
      row(
        'Pivot',
        el(
          'span',
          {},
          numberInput(
            pivot === null ? null : round1(pivot[0]),
            (v) => {
              if (v !== null) put({ ...group, pivot: [round1(v), round1(pivot?.[1] ?? 0)] });
            },
            { step: 0.5 },
          ),
          numberInput(
            pivot === null ? null : round1(pivot[1]),
            (v) => {
              if (v !== null) put({ ...group, pivot: [round1(pivot?.[0] ?? 0), round1(v)] });
            },
            { step: 0.5 },
          ),
        ),
        !pivotMatters(group)
          ? 'used when the group turns, glides along a line or rides on another'
          : group.pivot === undefined
            ? 'the middle of its lines; drag the cross'
            : 'drag the cross',
      ),
      row(
        'Rides on',
        select<string>(
          group.parent ?? '',
          [
            ['', 'Nothing'] as const,
            ...others.filter((g) => !below.has(g.id)).map((g) => [g.id, g.id] as const),
          ],
          (v) => {
            const next: LineGroup = { ...group };
            if (v === '') Reflect.deleteProperty(next, 'parent');
            else next.parent = v;
            put(next);
          },
        ),
        'it moves on the other group, carried at its pivot',
      ),
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          'Default pivot',
          () => {
            const next: LineGroup = { ...group };
            Reflect.deleteProperty(next, 'pivot');
            put(next);
          },
          { disabled: group.pivot === undefined },
        ),
        button('Delete group', () => {
          this.commit(deleteGroup(doc, group.id));
        }),
      ),
    );
    return out;
  }

  /** The motion preview: play, pause and scrub through the level's cycle. */
  private motionPanel(): (Node | null)[] {
    const preview = this.previewOf();
    const doc = this.doc;
    this.clock.slider = null;
    this.clock.label = null;
    if (preview === null || doc === null || !preview.moving) {
      return [
        el('div', {
          class: 'ted-note',
          text: 'Nothing moves. Put a line in a group or let its objects travel (Selection panel), then play the motion here.',
        }),
      ];
    }
    const slider = el('input', {
      class: 'ted-input',
      attrs: { type: 'range', min: '0', max: String(preview.cycle - 1), step: '1' },
    });
    slider.value = String(this.tick);
    slider.addEventListener('input', () => {
      this.setPlaying(false);
      this.setTick(Number(slider.value));
    });
    const label = el('div', { class: 'ted-note' });
    this.clock.slider = slider;
    this.clock.label = label;
    this.renderClock();
    const groups = doc.lines.groups ?? [];
    return [
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          this.playing ? 'Pause' : 'Play',
          () => {
            this.setPlaying(!this.playing);
          },
          { primary: !this.playing, title: 'Play or pause (K)' },
        ),
        button(
          'Start',
          () => {
            this.setPlaying(false);
            this.setTick(0);
          },
          { title: 'Tick 0, the layout the level starts with' },
        ),
        button(
          '-1',
          () => {
            this.setPlaying(false);
            this.setTick(this.tick - 1);
          },
          { title: 'One tick back (,)' },
        ),
        button(
          '+1',
          () => {
            this.setPlaying(false);
            this.setTick(this.tick + 1);
          },
          { title: 'One tick forward (.)' },
        ),
      ),
      slider,
      label,
      row(
        'Swept area',
        checkbox(this.layers.sweeps, (v) => {
          this.layers = { ...this.layers, sweeps: v };
          this.render();
        }),
        "where the selected line's moving unit goes over its cycle",
      ),
      groups.length === 0
        ? null
        : el(
            'ul',
            { class: 'ted-list' },
            ...groups.map((g) => {
              const first = doc.lines.lines.find((l) => l.group === g.id);
              return el(
                'li',
                {
                  class: first !== undefined && first.id === this.selLine ? 'ted-selected' : '',
                  on: {
                    click: () => {
                      if (first === undefined) return;
                      this.setTool('lines');
                      this.selLine = first.id;
                      this.selPoint = null;
                      this.renderAll();
                    },
                  },
                },
                el('span', { class: 'ted-grow', text: g.id }),
                el('span', {
                  class: 'ted-count',
                  text: `${g.movement === undefined ? 'rides' : g.movement.type}${g.parent === undefined ? '' : ` on ${g.parent}`}`,
                }),
              );
            }),
          ),
      el('div', {
        class: 'ted-note',
        text: 'The board shows the level at the tick above; the lines stay where they were traced. Moving objects are checked against everything at every tick of the cycle.',
      }),
    ];
  }

  private objectPanel(): (Node | null)[] {
    const doc = this.doc;
    const shown = this.shown;
    const id = this.selObject;
    const obj = id === null ? undefined : this.levelToDraw()?.elements.find((x) => x.id === id);
    if (
      doc === null ||
      shown === null ||
      id === null ||
      obj === undefined ||
      !isScoringElement(obj)
    ) {
      return [
        el('div', {
          class: 'ted-note',
          text: 'Click a peg or brick of the generated level. Moves, deletions, additions and flags are kept as manual edits in the recipe and survive a rebuild.',
        }),
      ];
    }
    const edits = recipeEdits(doc);
    const origin = originOf(shown, id, this.tracks());
    const entry = origin.entry >= 0 ? edits[origin.entry] : undefined;
    const from =
      origin.generated === null
        ? `added by edit ${origin.entry + 1}`
        : (this.lineOf(id) ?? shown.partOf.get(id) ?? 'the generator');
    const kind = obj.kind === 'peg' ? 'Peg' : obj.kind === 'brick' ? 'Brick' : 'Curved brick';
    const out: (Node | null)[] = [el('div', { class: 'ted-note', text: `${kind} from ${from}.` })];
    if (isMoving(obj)) {
      out.push(
        el('div', {
          class: 'ted-note',
          text: `It moves with its line: delete it or change its flags here; move or turn the line to move it. At tick 0 it is at (${round1(origin.at[0])}, ${round1(origin.at[1])}).`,
        }),
      );
    } else {
      out.push(...this.objectPlacement(obj, edits, origin));
    }
    out.push(
      row(
        'Can be orange',
        checkbox(obj.canBeOrange, (v) => {
          this.commit(setEdits(doc, setFlag(edits, origin, 'canBeOrange', v)));
        }),
      ),
      row(
        'Quick disappear',
        checkbox(obj.quickDisappear, (v) => {
          this.commit(setEdits(doc, setFlag(edits, origin, 'quickDisappear', v)));
        }),
      ),
      entry === undefined
        ? null
        : el('div', {
            class: 'ted-note',
            text: `Edit ${origin.entry + 1}: ${describeEdit(entry)}`,
          }),
      el(
        'div',
        { class: 'ted-buttons' },
        button('Delete', () => {
          this.commit(setEdits(doc, deleteObject(edits, origin)));
          this.selObject = null;
          this.renderAll();
        }),
        button(
          'Undo its edits',
          () => {
            this.commit(setEdits(doc, removeEntry(edits, origin.entry)));
          },
          { disabled: entry === undefined },
        ),
      ),
    );
    return out;
  }

  /** Position and rotation fields of a static object. */
  private objectPlacement(
    obj: Extract<LevelElement, { kind: 'peg' | 'brick' | 'curvedBrick' }>,
    edits: ReturnType<typeof recipeEdits>,
    origin: ReturnType<typeof originOf>,
  ): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    const out: (Node | null)[] = [
      row(
        'x',
        numberInput(
          round1(obj.x),
          (v) => {
            if (v !== null) this.commit(setEdits(doc, moveObject(edits, origin, [v, obj.y])));
          },
          { step: 0.5 },
        ),
      ),
      row(
        'y',
        numberInput(
          round1(obj.y),
          (v) => {
            if (v !== null) this.commit(setEdits(doc, moveObject(edits, origin, [obj.x, v])));
          },
          { step: 0.5 },
        ),
      ),
    ];
    if (obj.kind !== 'peg') {
      out.push(
        row(
          'Rotation',
          numberInput(
            deg(obj.rotation),
            (v) => {
              if (v !== null)
                this.commit(setEdits(doc, rotateObject(edits, origin, (v * Math.PI) / 180)));
            },
            { step: 5 },
          ),
          'degrees, counterclockwise',
        ),
      );
    }
    return out;
  }

  private linesPanel(): HTMLElement {
    const doc = this.doc;
    if (doc === null) return el('div');
    const stats = this.perLine();
    const order = placementOrder(doc);
    const lines = order.map((id) => findLine(doc, id)).filter((l): l is Line => l !== null);
    const unplaced = doc.lines.lines.filter((l) => !order.includes(l.id));
    const item = (line: Line, placedInRecipe: boolean): HTMLElement => {
      const s = stats.get(line.id);
      const li = el(
        'li',
        {
          class: line.id === this.selLine ? 'ted-selected' : '',
          title: line.note ?? '',
          on: {
            click: () => {
              this.setTool('lines');
              this.selLine = line.id;
              this.selPoint = null;
              this.renderAll();
            },
          },
        },
        el('span', {
          class: 'ted-swatch',
          attrs: { style: `background: ${line.mode === 'bricks' ? '#c2571c' : '#14a294'}` },
        }),
        el('span', { class: 'ted-grow', text: line.id }),
        (s?.left ?? 0) > 0
          ? el('span', { class: 'ted-bad-text', text: `-${s?.left ?? 0}`, title: s?.reason ?? '' })
          : null,
        el('span', {
          class: 'ted-count',
          text: placedInRecipe ? String(s?.placed ?? 0) : 'not placed',
        }),
      );
      return li;
    };
    return el(
      'div',
      {},
      el(
        'ul',
        { class: 'ted-list' },
        ...lines.map((l) => item(l, true)),
        ...unplaced.map((l) => item(l, false)),
      ),
      el('div', {
        class: 'ted-note',
        text: 'In placement order: earlier lines get their objects first. Red counts were left out (hover for why).',
      }),
    );
  }

  private levelPanel(): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    const r = doc.source.recipe;
    const fit = this.shown?.fit ?? null;
    const c = this.composed();
    const fill = r.fill ?? 'none';
    const fillStyle = fill === 'none' ? 'none' : (fill.style ?? 'auto');
    const out: (Node | null)[] = [
      row(
        'Name',
        textInput(
          doc.source.name,
          (v) => {
            this.commit(setSourceFields(doc, { name: v }));
          },
          { invalid: doc.source.name === '' },
        ),
      ),
      row(
        'Seed',
        numberInput(r.seed, (v) => {
          if (v !== null) this.commit(setRecipeFields(doc, { seed: Math.max(0, Math.round(v)) }));
        }),
      ),
      row(
        'Objects',
        numberInput(r.targetCount, (v) => {
          if (v !== null)
            this.commit(
              setRecipeFields(doc, { targetCount: Math.min(260, Math.max(40, Math.round(v))) }),
            );
        }),
        'spec 15 count times 1.409, rounded',
      ),
    ];
    if (fit !== null) {
      const nudges = fit.nudges.map((n) =>
        n.kind === 'fill'
          ? `fill ${n.count} pegs`
          : `${c !== null && n.part === c.part ? (c.ids[n.path] ?? `path ${n.path}`) : `path ${n.path}`} ${n.from} to ${n.to} (${n.pegsTo - n.pegsFrom > 0 ? '+' : ''}${n.pegsTo - n.pegsFrom})`,
      );
      out.push(
        el('div', {
          class: `ted-note ${fit.ok ? '' : 'ted-bad-text'}`,
          text: fit.ok
            ? nudges.length === 0
              ? `Hits ${fit.target} objects as drawn.`
              : `Fitted to ${fit.target}: ${nudges.join(', ')}.`
            : `The fit reaches ${fit.count} of ${fit.target}; ${nudges.length > 0 ? `tried ${nudges.join(', ')}; ` : ''}add or lengthen peg lines, or free up crowded ones.`,
        }),
      );
      if (nudges.length > 0 && fit.nudges.some((n) => n.kind === 'spacing')) {
        out.push(
          el(
            'div',
            { class: 'ted-buttons' },
            button('Write fitted spacing into the lines', () => {
              this.keepFitted();
            }),
          ),
        );
      }
    }
    if (this.fitError !== null)
      out.push(el('div', { class: 'ted-note ted-bad-text', text: `Fit failed: ${this.fitError}` }));
    const lineIds = doc.lines.lines.map((l) => [l.id, l.id] as const);
    out.push(
      row(
        'Fill',
        select(
          fillStyle,
          [
            ['none', 'None'],
            ['auto', 'Pattern from the seed'],
            ['lattice', 'Lattice'],
            ['arcs', 'Arcs'],
          ],
          (v) => {
            const base: FillDraft = fill === 'none' ? {} : fill;
            if (v === 'none') this.commit(setRecipeFields(doc, { fill: 'none' }));
            else if (v === 'auto')
              this.commit(setRecipeFields(doc, { fill: withField(base, 'style', undefined) }));
            else this.commit(setRecipeFields(doc, { fill: { ...base, style: v } }));
          },
        ),
      ),
    );
    if (fill !== 'none') {
      out.push(
        row(
          'Fill spacing',
          numberInput(
            fill.spacing ?? null,
            (v) => {
              this.commit(
                setRecipeFields(doc, {
                  fill: withField(
                    fill,
                    'spacing',
                    v === null ? undefined : Math.min(120, Math.max(34, v)),
                  ),
                }),
              );
            },
            { min: 34, max: 120, step: 0.5, placeholder: 'sparsest that reaches the count' },
          ),
        ),
        row(
          'Clearance',
          numberInput(
            fill.clearance ?? null,
            (v) => {
              this.commit(
                setRecipeFields(doc, {
                  fill: withField(
                    fill,
                    'clearance',
                    v === null ? undefined : Math.min(80, Math.max(12.5, v)),
                  ),
                }),
              );
            },
            { min: 12.5, max: 80, step: 0.5, placeholder: '30' },
          ),
        ),
        row(
          'Inside line',
          select<string>(fill.within ?? '', [['', 'Anywhere'] as const, ...lineIds], (v) => {
            this.commit(
              setRecipeFields(doc, { fill: withField(fill, 'within', v === '' ? undefined : v) }),
            );
          }),
        ),
      );
    }
    out.push(
      row('Picture', el('span', { text: doc.lines.background })),
      this.pictureNote === '' ? null : el('div', { class: 'ted-note', text: this.pictureNote }),
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          'Trace a local picture...',
          () => {
            this.pickLocalPicture();
          },
          { title: 'Shows an image file under the lines; it is not saved' },
        ),
      ),
      section(
        'concept',
        'Concept and picture prompt',
        this.open,
        (key, v) => {
          this.open.set(key, v);
        },
        row(
          'Subject',
          textArea(doc.source.concept.subject, (v) => {
            this.commit(setSourceFields(doc, { subject: v }));
          }),
        ),
        row(
          'Composition',
          textArea(doc.source.concept.composition, (v) => {
            this.commit(setSourceFields(doc, { composition: v }));
          }),
        ),
        row(
          'Layout',
          textArea(doc.source.concept.layout, (v) => {
            this.commit(setSourceFields(doc, { layout: v }));
          }),
        ),
        row(
          'Prompt',
          textArea(
            doc.source.background.prompt,
            (v) => {
              this.commit(setSourceFields(doc, { prompt: v }));
            },
            6,
          ),
        ),
      ),
    );
    return out;
  }

  private keepFitted(): void {
    const doc = this.doc;
    const c = this.composed();
    const fit = this.shown?.fit;
    if (doc === null || c === null || fit === null || fit === undefined) return;
    let next = doc;
    for (const n of fit.nudges) {
      if (n.kind !== 'spacing' || n.part !== c.part) continue;
      const id = c.ids[n.path];
      if (id !== undefined) next = setLineFields(next, id, { spacing: n.to });
    }
    this.commit(next);
    this.say("The fitted spacings are now the lines' own.");
  }

  private pickLocalPicture(): void {
    const input = el('input', { attrs: { type: 'file', accept: 'image/*' } });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f !== undefined) this.setPicture(URL.createObjectURL(f), true);
    });
    input.click();
  }

  private editsPanel(): (Node | null)[] {
    const doc = this.doc;
    const shown = this.shown;
    if (doc === null) return [];
    const edits = recipeEdits(doc);
    if (edits.length === 0) {
      return [
        el('div', {
          class: 'ted-note',
          text: 'None. Use the Objects tool (E) to move, delete or add single pegs and bricks after generating.',
        }),
      ];
    }
    const errors = shown?.edits.errors ?? [];
    return [
      el(
        'ul',
        { class: 'ted-list' },
        ...edits.map((e, i) => {
          const bad = errors.find((m) => m.startsWith(`edit ${i + 1}:`));
          const target = shown?.edits.target.get(i);
          return el(
            'li',
            {
              title: bad ?? '',
              class: target !== undefined && target === this.selObject ? 'ted-selected' : '',
              on: {
                click: () => {
                  if (target === undefined) return;
                  this.setTool('objects');
                  this.selObject = target;
                  this.renderAll();
                },
              },
            },
            el('span', { class: 'ted-count', text: String(i + 1) }),
            el('span', {
              class: `ted-grow ${bad === undefined ? '' : 'ted-bad-text'}`,
              text: describeEdit(e),
            }),
            el('span', {
              class: 'ted-x',
              text: 'x',
              title: 'Remove this edit',
              on: {
                click: (ev) => {
                  ev.stopPropagation();
                  this.commit(setEdits(doc, removeEntry(edits, i)));
                },
              },
            }),
          );
        }),
      ),
      errors.length === 0
        ? null
        : el('div', {
            class: 'ted-note ted-bad-text',
            text: `${errors.length} edit(s) find nothing to change: their object moved or is gone. Remove them or move the line back.`,
          }),
    ];
  }

  private checksPanel(): (Node | null)[] {
    const out: (Node | null)[] = [];
    const p = this.checking;
    if (p !== null) {
      out.push(
        el('div', {
          class: 'ted-note',
          text: `Round ${p.round}: ${p.done} of ${p.total} board states swept`,
        }),
        el(
          'div',
          { class: 'ted-progress' },
          el('div', {
            attrs: { style: `width: ${p.total === 0 ? 0 : Math.round((100 * p.done) / p.total)}%` },
          }),
        ),
      );
    }
    if (this.checkError !== null)
      out.push(el('div', { class: 'ted-note ted-bad-text', text: this.checkError }));
    const chk = this.checked;
    if (chk === null) {
      out.push(
        el('div', {
          class: 'ted-note',
          text: 'The validity, gap, reachability and stuck checks run on worker threads, like the build. Ctrl+Enter runs them.',
        }),
      );
      return out;
    }
    const r = chk.result;
    const report = r.check?.report;
    if (chk.version !== this.version)
      out.push(
        el('div', {
          class: 'ted-note',
          text: 'These findings are from an earlier version; run the checks again.',
        }),
      );
    const lines: string[] = [
      `Validity: ${r.issues.length === 0 ? 'pass' : `${r.issues.length} issue(s)`}`,
      ...(report === undefined
        ? []
        : [
            `Shots: ${report.shots.toLocaleString('en-US')} in ${report.rounds} round(s)`,
            `Reached: ${(report.coverage * 100).toFixed(1)}% of can-be-orange objects; ${report.unflagged.length} never hit lose the flag`,
            `Stuck spots: ${report.spotsFixed} fixed with quick disappear on ${report.quickDisappear.length}; ${report.remainingSpots} remain; ${report.unfixable.length} touch no peg`,
          ]),
      `Can be orange: ${r.stats.canBeOrange}`,
    ];
    out.push(el('div', {}, ...lines.map((t) => el('div', { class: 'ted-note', text: t }))));
    if (r.failures.length > 0) {
      out.push(
        el('div', {
          class: 'ted-note ted-bad-text',
          text: `Not writable: ${r.failures.join('; ')}.`,
        }),
      );
    } else {
      out.push(
        el('div', {
          class: 'ted-note ted-good-text',
          text: 'The level passes and can be written.',
        }),
      );
    }
    const items: { text: string; at: Point | null; id: number | null }[] = [];
    const level = r.level;
    const byId = new Map(level.elements.map((e) => [e.id, e]));
    for (const issue of r.issues) {
      const e = byId.get(issue.a);
      items.push({
        text: `${issue.kind}: ${issue.a}${issue.b === undefined ? '' : ` and ${issue.b}`}${issue.gap === undefined ? '' : ` (${issue.gap.toFixed(2)} px)`}`,
        at: e === undefined ? null : [e.x, e.y],
        id: issue.a,
      });
    }
    for (const s of report?.fixed ?? []) {
      items.push({
        text: `stuck at (${s.x.toFixed(0)}, ${s.y.toFixed(0)}), ${s.count}x: fixed, quick disappear on ${s.scoring.join(', ')}`,
        at: [s.x, s.y],
        id: s.scoring[0] ?? null,
      });
    }
    for (const s of r.check?.result.spots ?? []) {
      items.push({
        text: `stuck ${s.kind} at (${s.x.toFixed(0)}, ${s.y.toFixed(0)}), ${s.count}x${s.scoring.length === 0 ? ', touches no peg' : ''}`,
        at: [s.x, s.y],
        id: null,
      });
    }
    for (const id of report?.unflagged ?? []) {
      const e = byId.get(id);
      items.push({ text: `never hit: ${id}`, at: e === undefined ? null : [e.x, e.y], id });
    }
    if (items.length > 0) {
      out.push(
        el(
          'ul',
          { class: 'ted-list' },
          ...items.slice(0, 80).map((it) =>
            el(
              'li',
              {
                on: {
                  click: () => {
                    if (it.at === null) return;
                    const rect = this.stage.getBoundingClientRect();
                    this.view = centerOn(
                      { ...this.view, zoom: Math.max(this.view.zoom, 2.5) },
                      rect.width,
                      rect.height,
                      it.at[0],
                      it.at[1],
                    );
                    if (it.id !== null) {
                      this.setTool('objects');
                      this.selObject = it.id;
                    }
                    this.renderAll();
                  },
                },
              },
              el('span', { class: 'ted-grow', text: it.text }),
            ),
          ),
        ),
      );
    }
    return out;
  }

  private filesPanel(): (Node | null)[] {
    const doc = this.doc;
    if (doc === null) return [];
    const id = doc.source.id;
    const out = this.outputs();
    const level = this.checked?.version === this.version ? this.checked.result.text : null;
    return [
      this.repoControls(() => {
        this.renderAll();
      }),
      el('div', {
        class: 'ted-note',
        text: 'Save writes the lines, the recipe and, after passing checks, the level file and the manifest. npm run campaign:build makes the same level file from them.',
      }),
      ...this.saveReport.map((t) => el('div', { class: 'ted-note', text: t })),
      ...(out?.problems ?? []).map((t) => el('div', { class: 'ted-note ted-bad-text', text: t })),
      el('div', { class: 'ted-note', text: 'Downloads' }),
      el(
        'div',
        { class: 'ted-buttons' },
        button(
          `${id}.lines.json`,
          () => {
            if (out !== null && out.lines !== '') download(`${id}.lines.json`, out.lines);
          },
          { disabled: out === null || out.lines === '', title: paths.lines(id) },
        ),
        button(
          `${id}.json (recipe)`,
          () => {
            if (out !== null) download(`${id}.json`, out.source);
          },
          { disabled: out === null || out.problems.length > 0, title: paths.source(id) },
        ),
        button(
          `${id}.json (level)`,
          () => {
            if (level !== null) download(`${id}.json`, level);
          },
          {
            disabled: level === null,
            title: `${paths.level(id)}; needs passing checks of this version`,
          },
        ),
      ),
    ];
  }

  private repoControls(after: () => void): HTMLElement {
    const repo = this.repo;
    const wrap = el('div', {});
    const state = repo.state;
    const run = (f: () => Promise<unknown>): void => {
      f()
        .then(after)
        .catch((err: unknown) => {
          this.say(message(err));
          after();
        });
    };
    if (state === 'unsupported') {
      wrap.append(
        el('div', {
          class: 'ted-note',
          text: 'This browser cannot write to a folder (Chromium can); saving uses downloads.',
        }),
      );
    } else if (state === 'connected') {
      wrap.append(
        el('div', {
          class: 'ted-note ted-good-text',
          text: `Repository folder: ${repo.name ?? ''}`,
        }),
        el(
          'div',
          { class: 'ted-buttons' },
          button('Forget folder', () => {
            run(() => repo.forget());
          }),
        ),
      );
    } else if (state === 'needs-permission') {
      wrap.append(
        el('div', {
          class: 'ted-note',
          text: `Repository folder ${repo.name ?? ''} needs permission again.`,
        }),
        el(
          'div',
          { class: 'ted-buttons' },
          button(
            'Allow access',
            () => {
              run(() => repo.reconnect());
            },
            { primary: true },
          ),
          button('Pick another', () => {
            run(() => repo.pick());
          }),
        ),
      );
    } else {
      wrap.append(
        el('div', {
          class: 'ted-note',
          text: 'Pick the repository folder once to save straight into it.',
        }),
        el(
          'div',
          { class: 'ted-buttons' },
          button('Pick repository folder...', () => {
            run(() => repo.pick());
          }),
        ),
      );
    }
    return wrap;
  }

  private viewPanel(): (Node | null)[] {
    const layer = (key: keyof Layers, label: string): HTMLElement =>
      row(
        label,
        checkbox(this.layers[key], (v) => {
          this.layers = { ...this.layers, [key]: v };
          this.render();
        }),
      );
    const opacity = el('input', {
      class: 'ted-input',
      attrs: { type: 'range', min: '0', max: '1', step: '0.05' },
    });
    opacity.value = String(this.pictureOpacity);
    opacity.addEventListener('input', () => {
      this.pictureOpacity = Number(opacity.value);
      this.render();
    });
    return [
      layer('picture', 'Picture'),
      row('Picture opacity', opacity),
      layer('zones', 'Keep-out zones'),
      layer('objects', 'Level'),
      layer('lines', 'Lines'),
      layer('findings', 'Findings'),
      el('div', {
        class: 'ted-note',
        text: `The picture covers the playfield opening, x ${PICTURE.x} to ${(PICTURE.x + PICTURE.w).toFixed(2)}, y ${PICTURE.y} to ${PICTURE.y + PICTURE.h}. Red areas keep everything out: the board's margins, the cannon, the bucket's strip and the flippers' swing plus the minimum gap.`,
      }),
    ];
  }

  private keysPanel(): HTMLElement {
    const keys: [string, string][] = [
      ['V  N  E', 'lines, draw, objects'],
      ['Click, drag', 'select and move a point or a whole line'],
      ['Double-click', 'add a point to a line'],
      ['Shift-click, C', 'sharp corner (drawing, or the selected point)'],
      ['Enter, Esc', 'finish or cancel a line'],
      ['O', 'open or closed line; can be orange (objects)'],
      ['P  B', 'line places pegs or bricks'],
      ['A  B', 'add a peg or a brick at the cursor (objects)'],
      ['Q, R', 'quick disappear, turn a brick 15 degrees (objects)'],
      ['Delete', 'the selected point, line or object'],
      ['Arrows', 'move the selection 1 px (Shift: 10)'],
      ['Tab', 'next line'],
      ['Wheel, Space-drag', 'zoom, pan (also right or middle drag)'],
      ['F', 'fit the board'],
      ['G', 'fit the count now'],
      ['K', 'play or pause the motion'],
      [',  .', 'one tick back, forward (Shift: 10)'],
      ['Drag the cross', "move a moving group's pivot"],
      ['Ctrl+Z, Shift+Ctrl+Z', 'undo, redo'],
      ['Ctrl+Enter', 'run the checks'],
      ['Ctrl+S', 'save'],
    ];
    return el(
      'div',
      { class: 'ted-keys' },
      ...keys.flatMap(([k, v]) => [el('kbd', { text: k }), el('span', { text: v })]),
    );
  }
}

/** The movement types as the group panel lists them. */
const MOVEMENT_LABELS: Record<GroupMovementType, string> = {
  verticalCycle: 'Up and down (verticalCycle)',
  horizontalCycle: 'Left and right (horizontalCycle)',
  circle: 'Around a circle (circle)',
  horizontalInfinity: 'Figure eight, lying (horizontalInfinity)',
  verticalInfinity: 'Figure eight, standing (verticalInfinity)',
  horizontalArc: 'Along an arc (horizontalArc)',
  verticalArc: 'Along an upright arc (verticalArc)',
  rotate: 'Turn about the pivot (rotate)',
  rotateBackAndForth: 'Swing about the pivot (rotateBackAndForth)',
  verticalWrap: 'Rise and start over (verticalWrap)',
  horizontalWrap: 'Slide right and start over (horizontalWrap)',
  rotateAroundCircle: 'Orbit, turning like a spoke (rotateAroundCircle)',
  followPath: 'Glide along a line (followPath)',
};
const RADIUS_TYPES: ReadonlySet<GroupMovementType> = new Set([
  'verticalCycle',
  'horizontalCycle',
  'circle',
  'horizontalInfinity',
  'verticalInfinity',
  'horizontalArc',
  'verticalArc',
  'verticalWrap',
  'horizontalWrap',
  'rotateAroundCircle',
]);
const RADIUS2_TYPES: ReadonlySet<GroupMovementType> = new Set([
  'circle',
  'horizontalInfinity',
  'verticalInfinity',
  'horizontalArc',
  'verticalArc',
]);
const ANGLE_TYPES: ReadonlySet<GroupMovementType> = new Set([
  'horizontalArc',
  'verticalArc',
  'rotateBackAndForth',
]);

/**
 * Whether a group's pivot changes anything: it is the point a group turns about, where it starts
 * along a line it glides on, and where it rides on its parent; a sliding group ignores it.
 */
function pivotMatters(g: LineGroup): boolean {
  const t = g.movement?.type;
  return (
    g.parent !== undefined ||
    t === 'rotate' ||
    t === 'rotateAroundCircle' ||
    t === 'rotateBackAndForth' ||
    t === 'followPath'
  );
}

/** An object without its undefined fields. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** A phase wrapped into [0, 1). */
function wrap01(v: number): number {
  const r = v - Math.floor(v);
  return r === 1 ? 0 : r;
}

function emptyLines(background: string): LinesFile {
  return { formatVersion: 1, background, board: { width: 916, height: 560 }, lines: [] };
}

function emptyDoc(): Doc {
  return {
    lines: emptyLines('none'),
    source: {
      id: '1-1',
      name: '',
      concept: { subject: '', composition: '', layout: '' },
      background: { id: 'none', prompt: '' },
      recipe: { seed: 0, targetCount: 40 },
    },
  };
}

type FillDraft = Exclude<NonNullable<LevelSourceInput['recipe']['fill']>, 'none'>;

/** A fill with one field set, or removed when the value is undefined. */
function withField<K extends keyof FillDraft>(
  fill: FillDraft,
  key: K,
  value: FillDraft[K] | undefined,
): FillDraft {
  const out: FillDraft = { ...fill };
  if (value === undefined) Reflect.deleteProperty(out, key);
  else out[key] = value;
  return out;
}
