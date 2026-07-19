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
  lifespanEvidence: SpeciesLifespanEvidence = buildSpeciesLifespanEvidence(events),
  energyRatio: number = 1
): AdaptiveReproductionTiming {
  const ages = lifespanEvidence.get(speciesId) ?? [];
  const minimumEvidence = Math.max(1, Math.round(constants.adaptiveReproductionMinDeaths));
  const urgencyEnergyStart = Math.max(0.05, Math.min(1, constants.lowEnergyUrgencyStartShare));
  const energyUrgency = energyRatio >= urgencyEnergyStart
    ? 0
    : Math.max(0, Math.min(1, (urgencyEnergyStart - energyRatio) / urgencyEnergyStart));
  const discount = Math.max(0, Math.min(0.75, constants.reproductiveUrgencyThresholdDiscount));
  if (ages.length < minimumEvidence) {
    const energyThreshold = constants.reproductionEnergyThreshold * (1 - energyUrgency * discount);
    return {
      evidenceDeaths: ages.length,
      expectedLifespan: null,
      maturityAge: constants.reproductionMaturityAgeTicks,
      energyThreshold,
      costMultiplier: energyUrgency > 0
        ? Math.max(1, constants.earlyReproductionCostMultiplier)
        : 1,
      urgency: energyUrgency,
    };
  }

  const observedMean = ages.reduce((sum, value) => sum + value, 0) / ages.length;
  const expectedLifespan = Math.max(1, Math.min(constants.maxCreatureAgeTicks, observedMean));
  const maturityAge = Math.min(
    constants.reproductionMaturityAgeTicks,
    Math.max(1, Math.round(expectedLifespan * constants.adaptiveMaturityLifespanShare))
  );
  const urgencyStart = expectedLifespan * constants.reproductiveUrgencyAgeShare;
  const lifespanUrgency = age <= urgencyStart
    ? 0
    : Math.max(0, Math.min(1, (age - urgencyStart) / Math.max(1, expectedLifespan - urgencyStart)));
  const urgency = Math.max(lifespanUrgency, energyUrgency);
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
