// Element drafts: level elements before the builder gives them an id.

import type { LevelElementInput, MovementInput } from '../level/schema';

export type Draft = LevelElementInput extends infer E
  ? E extends LevelElementInput
    ? Omit<E, 'id'>
    : never
  : never;

export type PegDraft = Extract<Draft, { kind: 'peg' }>;
export type BrickDraft = Extract<Draft, { kind: 'brick' }>;
export type CurvedBrickDraft = Extract<Draft, { kind: 'curvedBrick' }>;
export type ScoringDraft = PegDraft | BrickDraft | CurvedBrickDraft;

/** Fields a template may add to any scoring draft. */
export interface Extra {
  readonly movement?: MovementInput;
  readonly parent?: number;
  readonly canBeOrange?: boolean;
  readonly quickDisappear?: boolean;
}

export function withExtra<T extends ScoringDraft>(d: T, extra: Extra | undefined): T {
  return extra === undefined ? d : { ...d, ...extra };
}
