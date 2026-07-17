import type { Traits } from '../utils/traits';

export type SimEventType = 'birth' | 'death' | 'mutation' | 'extinction';

export interface TraitChange {
  trait: keyof Traits;
  before: number | string;
  after: number | string;
}

export interface SimEvent {
  type: SimEventType;
  tick: number;
  creatureId?: string;
  speciesId?: string;
  detail?: string;
  parentLineageId?: string;
  lineageId?: string;
  traitChanges?: TraitChange[];
}

/** Capture every changed trait in stable trait-key order for replay and presentation. */
export function compareTraits(before: Traits, after: Traits): TraitChange[] {
  return (Object.keys(before) as (keyof Traits)[])
    .filter((trait) => before[trait] !== after[trait])
    .map((trait) => ({
      trait,
      before: before[trait],
      after: after[trait],
    }));
}
