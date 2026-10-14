// Typed simulation events. The world appends them in the order they happen; the rules layer
// scores from them without touching physics internals.
//
// Event objects are pooled: they are valid until the next World.step() and must not be kept.
// Copy the fields you need. `tick` is the world tick the event belongs to; positions are board
// px. Contact events carry the ball's center at the moment of contact, the contact normal
// (pointing from the surface to the ball) and `impact`, the speed at which the ball approached
// the surface along that normal (px/tick, negative when it was already separating).

export type WallSide = 'left' | 'right' | 'ceiling';
export type BucketPart = 'rim' | 'pyramid' | 'cover' | 'feverDivider';
export type FlipperSide = 'left' | 'right';
export type BallOutReason = 'bottom' | 'teleport' | 'removed';
export type PegRemovedReason = 'shotEnd' | 'quickDisappear' | 'stuck' | 'power';
export type PegLitCause = 'contact' | 'power';

interface ContactFields {
  readonly tick: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly impact: number;
  /** The contact took the slide branch instead of bouncing (research 4.3). */
  readonly slide: boolean;
}

export interface BallSpawnedEvent {
  readonly type: 'ballSpawned';
  readonly tick: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly cause: 'launch' | 'spawn';
}

/** Contact with a peg or brick (a scoring element). */
export interface PegContactEvent extends ContactFields {
  readonly type: 'pegContact';
  readonly element: number;
  /** First contact with this element during the current shot: this contact lit it. */
  readonly first: boolean;
}

/** Contact with a solid circle, polygon or rod of the level. */
export interface SolidContactEvent extends ContactFields {
  readonly type: 'solidContact';
  readonly element: number;
}

export interface WallContactEvent extends ContactFields {
  readonly type: 'wallContact';
  readonly side: WallSide;
}

export interface BucketContactEvent extends ContactFields {
  readonly type: 'bucketContact';
  readonly part: BucketPart;
}

export interface FlipperContactEvent extends ContactFields {
  readonly type: 'flipperContact';
  readonly side: FlipperSide;
}

export interface BallContactEvent {
  readonly type: 'ballContact';
  readonly tick: number;
  readonly ball: number;
  readonly other: number;
  readonly x: number;
  readonly y: number;
}

/** The ball landed in the free ball bucket and left play. */
export interface BucketCatchEvent {
  readonly type: 'bucketCatch';
  readonly tick: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
}

/** The ball landed in Fever bucket `bucket` (0 = leftmost) and left play. */
export interface FeverCatchEvent {
  readonly type: 'feverCatch';
  readonly tick: number;
  readonly ball: number;
  readonly bucket: number;
  readonly x: number;
  readonly y: number;
}

export interface BallOutEvent {
  readonly type: 'ballOut';
  readonly tick: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  readonly reason: BallOutReason;
}

/** The ball fell out of the bottom and came back in at the top (Spooky Ball). */
export interface BallReturnedEvent {
  readonly type: 'ballReturned';
  readonly tick: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
}

/** `enter` when the ball's center enters the trigger, `exit` when it reappears. */
export interface TeleportEvent {
  readonly type: 'teleport';
  readonly tick: number;
  readonly ball: number;
  readonly element: number;
  readonly stage: 'enter' | 'exit';
  readonly x: number;
  readonly y: number;
}

/** A scoring element lit up. `ball` is -1 when a power lit it. */
export interface PegLitEvent {
  readonly type: 'pegLit';
  readonly tick: number;
  readonly element: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  readonly cause: PegLitCause;
}

export interface PegRemovedEvent {
  readonly type: 'pegRemoved';
  readonly tick: number;
  readonly element: number;
  readonly x: number;
  readonly y: number;
  readonly reason: PegRemovedReason;
}

export type SimEvent =
  | BallSpawnedEvent
  | PegContactEvent
  | SolidContactEvent
  | WallContactEvent
  | BucketContactEvent
  | FlipperContactEvent
  | BallContactEvent
  | BucketCatchEvent
  | FeverCatchEvent
  | BallOutEvent
  | BallReturnedEvent
  | TeleportEvent
  | PegLitEvent
  | PegRemovedEvent;

export type SimEventType = SimEvent['type'];

type Writable<T> = { -readonly [K in keyof T]: T[K] };

class Pool<T> {
  private readonly items: T[] = [];
  private used = 0;

  constructor(private readonly make: () => T) {}

  take(): T {
    let item = this.items[this.used];
    if (item === undefined) {
      item = this.make();
      this.items.push(item);
    }
    this.used++;
    return item;
  }

  reset(): void {
    this.used = 0;
  }
}

const contactDefaults = { tick: 0, ball: 0, x: 0, y: 0, nx: 0, ny: 0, impact: 0, slide: false };

/** Ordered event list with per-type object pools, so steady-state stepping never allocates. */
export class EventLog {
  readonly list: SimEvent[] = [];
  private readonly pools: Pool<unknown>[] = [];

  readonly ballSpawned = this.pool<Writable<BallSpawnedEvent>>(() => ({
    type: 'ballSpawned',
    tick: 0,
    ball: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    cause: 'launch',
  }));
  readonly pegContact = this.pool<Writable<PegContactEvent>>(() => ({
    type: 'pegContact',
    ...contactDefaults,
    element: 0,
    first: false,
  }));
  readonly solidContact = this.pool<Writable<SolidContactEvent>>(() => ({
    type: 'solidContact',
    ...contactDefaults,
    element: 0,
  }));
  readonly wallContact = this.pool<Writable<WallContactEvent>>(() => ({
    type: 'wallContact',
    ...contactDefaults,
    side: 'left',
  }));
  readonly bucketContact = this.pool<Writable<BucketContactEvent>>(() => ({
    type: 'bucketContact',
    ...contactDefaults,
    part: 'rim',
  }));
  readonly flipperContact = this.pool<Writable<FlipperContactEvent>>(() => ({
    type: 'flipperContact',
    ...contactDefaults,
    side: 'left',
  }));
  readonly ballContact = this.pool<Writable<BallContactEvent>>(() => ({
    type: 'ballContact',
    tick: 0,
    ball: 0,
    other: 0,
    x: 0,
    y: 0,
  }));
  readonly bucketCatch = this.pool<Writable<BucketCatchEvent>>(() => ({
    type: 'bucketCatch',
    tick: 0,
    ball: 0,
    x: 0,
    y: 0,
  }));
  readonly feverCatch = this.pool<Writable<FeverCatchEvent>>(() => ({
    type: 'feverCatch',
    tick: 0,
    ball: 0,
    bucket: 0,
    x: 0,
    y: 0,
  }));
  readonly ballOut = this.pool<Writable<BallOutEvent>>(() => ({
    type: 'ballOut',
    tick: 0,
    ball: 0,
    x: 0,
    y: 0,
    reason: 'bottom',
  }));
  readonly ballReturned = this.pool<Writable<BallReturnedEvent>>(() => ({
    type: 'ballReturned',
    tick: 0,
    ball: 0,
    x: 0,
    y: 0,
  }));
  readonly teleport = this.pool<Writable<TeleportEvent>>(() => ({
    type: 'teleport',
    tick: 0,
    ball: 0,
    element: 0,
    stage: 'enter',
    x: 0,
    y: 0,
  }));
  readonly pegLit = this.pool<Writable<PegLitEvent>>(() => ({
    type: 'pegLit',
    tick: 0,
    element: 0,
    ball: 0,
    x: 0,
    y: 0,
    cause: 'contact',
  }));
  readonly pegRemoved = this.pool<Writable<PegRemovedEvent>>(() => ({
    type: 'pegRemoved',
    tick: 0,
    element: 0,
    x: 0,
    y: 0,
    reason: 'shotEnd',
  }));

  /** Takes a pooled event of one type; fill it, then pass it to push(). */
  private pool<T extends SimEvent>(make: () => T): Pool<T> {
    const p = new Pool(make);
    this.pools.push(p);
    return p;
  }

  push(e: SimEvent): void {
    this.list.push(e);
  }

  clear(): void {
    // Popping keeps the array's storage; `length = 0` makes V8 allocate it again on the next push.
    while (this.list.length > 0) this.list.pop();
    for (const p of this.pools) p.reset();
  }
}
