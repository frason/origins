import type { SimulationConstants } from '../utils/constants';
import type { SimEvent } from './events';

export interface AdaptiveReproductionTiming {
  evidenceDeaths: number;
  expectedLifespan: number | null;
  maturityAge: number;
  energyThreshold: number;
  costMultiplier: number;
  urgency: number;
}

export type SpeciesLifespanEvidence = ReadonlyMap<string, readonly number[]>;

export function buildSpeciesLifespanEvidence(events: SimEvent[]): SpeciesLifespanEvidence {
  const evidence = new Map<string, number[]>();
  for (const event of events) {
    if (
      event.type !== 'death' || !event.speciesId ||
      typeof event.ageAtDeath !== 'number' || event.ageAtDeath <= 0
    ) continue;
    const ages = evidence.get(event.speciesId) ?? [];
    ages.push(event.ageAtDeath);
    evidence.set(event.speciesId, ages);
  }
  return evidence;
}

/** Derive bounded timing from durable species death history without consuming RNG. */
export function getAdaptiveReproductionTiming(
  speciesId: string,
  age: number,
  events: SimEvent[],
  constants: SimulationConstants,
  lifespanEvidence: SpeciesLifespanEvidence = buildSpeciesLifespanEvidence(events)
): AdaptiveReproductionTiming {
  const ages = lifespanEvidence.get(speciesId) ?? [];
  const minimumEvidence = Math.max(1, Math.round(constants.adaptiveReproductionMinDeaths));
  if (ages.length < minimumEvidence) {
    return {
      evidenceDeaths: ages.length,
      expectedLifespan: null,
      maturityAge: constants.reproductionMaturityAgeTicks,
      energyThreshold: constants.reproductionEnergyThreshold,
      costMultiplier: 1,
      urgency: 0,
    };
  }

  const observedMean = ages.reduce((sum, value) => sum + value, 0) / ages.length;
  const expectedLifespan = Math.max(1, Math.min(constants.maxCreatureAgeTicks, observedMean));
  const maturityAge = Math.min(
    constants.reproductionMaturityAgeTicks,
    Math.max(1, Math.round(expectedLifespan * constants.adaptiveMaturityLifespanShare))
  );
  const urgencyStart = expectedLifespan * constants.reproductiveUrgencyAgeShare;
  const urgency = age <= urgencyStart
    ? 0
    : Math.max(0, Math.min(1, (age - urgencyStart) / Math.max(1, expectedLifespan - urgencyStart)));
  const discount = Math.max(0, Math.min(0.75, constants.reproductiveUrgencyThresholdDiscount));
  const energyThreshold = constants.reproductionEnergyThreshold * (1 - urgency * discount);
  const adapted = maturityAge < constants.reproductionMaturityAgeTicks || urgency > 0;

  return {
    evidenceDeaths: ages.length,
    expectedLifespan,
    maturityAge,
    energyThreshold,
    costMultiplier: adapted ? Math.max(1, constants.earlyReproductionCostMultiplier) : 1,
    urgency,
  };
}
