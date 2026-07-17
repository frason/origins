import type { WorldSnapshot } from '../state/store';

export type HealthTone = 'danger' | 'warning' | 'stable' | 'healthy';

export interface BadgeState {
  label: string;
  tone: HealthTone;
}

export interface DynamicsMetric extends BadgeState {
  score: number;
  explanation: string;
}

export interface EcosystemDynamics {
  overall: BadgeState;
  order: DynamicsMetric;
  chaos: DynamicsMetric;
  exploration: DynamicsMetric;
}

const WINDOW_TICKS = 100;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toneForScore(score: number): HealthTone {
  if (score < 25) return 'danger';
  if (score < 50) return 'warning';
  if (score < 75) return 'stable';
  return 'healthy';
}

export function getBiodiversityState(speciesCount: number): BadgeState {
  if (speciesCount >= 5) return { label: `${speciesCount} species`, tone: 'healthy' };
  if (speciesCount >= 2) return { label: `${speciesCount} species`, tone: 'warning' };
  return { label: `${Math.max(0, speciesCount)} species`, tone: 'danger' };
}

/** Derive player-facing dynamic health entirely from reproducible snapshot state. */
export function getEcosystemDynamics(
  world: WorldSnapshot | null,
  tick: number,
  maxPopulation: number
): EcosystemDynamics {
  const living = world?.creatures.filter((creature) => creature.lifecycleState === 'alive') ?? [];
  const population = living.length;
  const speciesCounts = new Map<string, number>();
  const lineages = new Set<string>();
  const strategies = new Set<string>();
  for (const creature of living) {
    speciesCounts.set(creature.speciesId, (speciesCounts.get(creature.speciesId) ?? 0) + 1);
    lineages.add(creature.lineageId);
    strategies.add(creature.traits.energyStrategy);
  }

  const biomass = world?.cells.reduce((sum, cell) => sum + cell.producerBiomass, 0) ?? 0;
  const dominantCount = Math.max(0, ...speciesCounts.values());
  const dominantShare = population > 0 ? dominantCount / population : 1;
  const speciesCount = speciesCounts.size;
  const survival = population > 0 && biomass > 0 ? 1 : 0;
  const populationBound = population <= maxPopulation
    ? 1
    : clamp(1 - (population - maxPopulation) / Math.max(1, maxPopulation));
  const diversity = clamp(speciesCount / 4);
  const balance = speciesCount > 1 ? clamp((1 - dominantShare) / 0.5) : 0;
  const resourceSupport = population > 0 ? clamp(biomass / population / 20) : 0;
  const orderScore = Math.round(
    25 * survival + 20 * populationBound + 25 * diversity + 15 * balance + 15 * resourceSupport
  );
  const order: DynamicsMetric = {
    score: orderScore,
    label: orderScore >= 75 ? 'Coherent' : orderScore >= 50 ? 'Fragile' : 'Unraveling',
    tone: toneForScore(orderScore),
    explanation:
      population === 0
        ? 'No living population remains.'
        : `${speciesCount} species; largest holds ${Math.round(dominantShare * 100)}% of ${population} creatures.`,
  };

  const windowStart = Math.max(0, tick - WINDOW_TICKS);
  const windowLength = Math.max(1, Math.min(WINDOW_TICKS, tick));
  let births = 0;
  let deaths = 0;
  let extinctions = 0;
  let mutations = 0;
  const events = world?.events ?? [];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.tick < windowStart) break;
    if (event.type === 'birth') births++;
    else if (event.type === 'death') deaths++;
    else if (event.type === 'extinction') extinctions++;
    else if (event.type === 'mutation') mutations++;
  }
  const turnoverIntensity =
    (births + deaths + extinctions * 3) / (windowLength * Math.max(10, population));
  const idealTurnover = 0.015;
  const chaosScore = Math.round(
    turnoverIntensity <= idealTurnover
      ? clamp(turnoverIntensity / idealTurnover) * 100
      : clamp(1 - (turnoverIntensity - idealTurnover) / 0.06) * 100
  );
  const chaosLabel = turnoverIntensity === 0
    ? 'Dormant'
    : turnoverIntensity > idealTurnover * 3
      ? 'Turbulent'
      : chaosScore >= 50 ? 'Dynamic' : 'Quiet';
  const chaos: DynamicsMetric = {
    score: chaosScore,
    label: chaosLabel,
    tone: toneForScore(chaosScore),
    explanation: `${births} births, ${deaths} deaths, and ${extinctions} extinctions in the last ${windowLength} ticks.`,
  };

  const extraLineages = Math.max(0, lineages.size - speciesCount);
  const explorationScore = Math.round(
    45 * clamp(mutations / 3) +
    35 * clamp(extraLineages / 4) +
    20 * clamp(strategies.size / 4)
  );
  const exploration: DynamicsMetric = {
    score: explorationScore,
    label: explorationScore >= 75 ? 'Branching' : explorationScore >= 40 ? 'Adapting' : 'Stagnant',
    tone: toneForScore(explorationScore),
    explanation: `${mutations} recent mutations; ${lineages.size} active lineages across ${strategies.size} ecological strategies.`,
  };

  let overall: BadgeState;
  if (population === 0 || biomass === 0) overall = { label: 'Collapsing', tone: 'danger' };
  else if (orderScore < 35) overall = { label: 'At Risk', tone: 'warning' };
  else if (chaosLabel === 'Turbulent') overall = { label: 'Turbulent', tone: 'warning' };
  else if (tick >= WINDOW_TICKS && chaosScore < 20 && explorationScore <= 20) {
    overall = { label: 'Stagnant', tone: 'warning' };
  } else if (tick < 50) overall = { label: 'Emerging', tone: 'stable' };
  else if (orderScore >= 50 && chaosScore >= 40 && explorationScore >= 40) {
    overall = { label: 'Balanced', tone: 'healthy' };
  } else overall = { label: 'Evolving', tone: 'stable' };

  return { overall, order, chaos, exploration };
}
