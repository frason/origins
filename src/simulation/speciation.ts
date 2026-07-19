import type { Creature } from './creature';
import type { Traits } from '../utils/traits';

export const SPECIATION_DIVERGENCE_THRESHOLD = 0.3;
export const SPECIATION_MIN_POPULATION = 3;
export const SPECIATION_MIN_GENERATIONS = 2;

export interface SpeciesProfile {
  id: string;
  ancestorSpeciesId: string | null;
  founderTraits: Traits;
  establishedTick: number;
}

export interface IncipientSpecies {
  id: string;
  ancestorSpeciesId: string;
  founderLineageId: string;
  founderTraits: Traits;
  founderGeneration: number;
  firstSeenTick: number;
  divergence: number;
}

const relativeDifference = (value: number, founder: number) =>
  Math.min(1, Math.abs(value - founder) / Math.max(0.1, Math.abs(founder)));

/** Stable ecological distance from a species founder in the range [0, 1]. */
export function traitDivergence(traits: Traits, founder: Traits): number {
  const weighted = [
    relativeDifference(traits.size, founder.size) * 0.12,
    relativeDifference(traits.speed, founder.speed) * 0.08,
    relativeDifference(traits.visionRange, founder.visionRange) * 0.05,
    relativeDifference(traits.hearingRange, founder.hearingRange) * 0.04,
    relativeDifference(traits.camouflage, founder.camouflage) * 0.05,
    relativeDifference(traits.armor, founder.armor) * 0.04,
    relativeDifference(traits.boneDensity, founder.boneDensity) * 0.04,
    relativeDifference(traits.metabolism, founder.metabolism) * 0.1,
    relativeDifference(traits.reproductionRate, founder.reproductionRate) * 0.07,
    relativeDifference(traits.brainSize, founder.brainSize) * 0.04,
    relativeDifference(traits.thermalTolerance, founder.thermalTolerance) * 0.03,
    relativeDifference(traits.waterRetention, founder.waterRetention) * 0.03,
    relativeDifference(traits.aquaticAffinity, founder.aquaticAffinity) * 0.03,
    relativeDifference(traits.terrainGrip, founder.terrainGrip) * 0.03,
    traits.energyStrategy === founder.energyStrategy ? 0 : 0.35,
  ];
  return Math.min(1, weighted.reduce((sum, value) => sum + value, 0));
}

/** ID derivation never consumes the simulation RNG stream. */
export function incipientSpeciesId(ancestorSpeciesId: string, lineageId: string): string {
  return `evolved:${encodeURIComponent(ancestorSpeciesId)}:${lineageId}`;
}

export function createIncipientSpecies(
  ancestorSpeciesId: string,
  lineageId: string,
  traits: Traits,
  founderTraits: Traits,
  generation: number,
  tick: number
): IncipientSpecies | null {
  const divergence = traitDivergence(traits, founderTraits);
  if (divergence < SPECIATION_DIVERGENCE_THRESHOLD) return null;
  return {
    id: incipientSpeciesId(ancestorSpeciesId, lineageId),
    ancestorSpeciesId,
    founderLineageId: lineageId,
    founderTraits: { ...traits },
    founderGeneration: generation,
    firstSeenTick: tick,
    divergence,
  };
}

export function establishableCandidates(
  creatures: Creature[],
  candidates: IncipientSpecies[]
): IncipientSpecies[] {
  return candidates.filter((candidate) => {
    const living = creatures.filter((creature) =>
      creature.lifecycleState === 'alive' && creature.incipientSpeciesId === candidate.id
    );
    const generations = living.length === 0
      ? 0
      : Math.max(...living.map((creature) => creature.generation)) - candidate.founderGeneration;
    return living.length >= SPECIATION_MIN_POPULATION
      && generations >= SPECIATION_MIN_GENERATIONS;
  });
}

export function livingCandidateIds(creatures: Creature[]): Set<string> {
  return new Set(creatures
    .filter((creature) => creature.lifecycleState === 'alive' && creature.incipientSpeciesId)
    .map((creature) => creature.incipientSpeciesId as string));
}
