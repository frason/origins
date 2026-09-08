import type { Traits } from '../utils/traits';
import type { SimulationConstants } from '../utils/constants';

export type SimEventType = 'birth' | 'death' | 'mutation' | 'speciation' | 'extinction' | 'intervention' | 'environmental-shock';
export type DeathCause =
  | 'predation'
  | 'starvation'
  | 'age'
  | 'monoculture-pressure'
  | 'overcrowding'
  | 'environmental-stress'
  | 'dispersal-exhaustion'
  | 'unknown';

export interface TraitChange {
  trait: keyof Traits;
  before: number | string;
  after: number | string;
}

export interface ConstantChange {
  constant: keyof SimulationConstants;
  before: number;
  after: number;
}

export interface EcosystemCheckpoint {
  population: number;
  speciesCount: number;
  lineageCount: number;
  livingEnergy: number;
  producerBiomass: number;
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
  mutationPressure?: number;
  mutationRate?: number;
  constantChanges?: ConstantChange[];
  ecosystemBefore?: EcosystemCheckpoint;
  interventionKind?: 'settings-change' | 'species-introduction';
  interventionOrigin?: { x: number; y: number };
  introducedStrategy?: Traits['energyStrategy'];
  introducedTraits?: Traits;
  founderCount?: number;
  deathCause?: DeathCause;
  parentCreatureId?: string;
  offspringCountAtDeath?: number;
  prematureDeath?: boolean;
  ageAtDeath?: number;
  ancestralSpeciesId?: string;
  shockKind?: 'temperature-spike' | 'drought' | 'flooding' | 'radiation' | 'toxicity-surge' | 'nutrient-collapse';
  affectedRegion?: { x: number; y: number; radius: number };
  /** RNG stream used for this event (diagnostic information) */
  rngStream?: string;
}

/** Capture live setting changes in stable constant-key order. */
export function compareConstants(
  before: SimulationConstants,
  after: SimulationConstants
): ConstantChange[] {
  return (Object.keys(before) as (keyof SimulationConstants)[])
    .filter((constant) => before[constant] !== after[constant])
    .map((constant) => ({
      constant,
      before: before[constant],
      after: after[constant],
    }));
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
