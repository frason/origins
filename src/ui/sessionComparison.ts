import type { SessionSummary } from './sessionSummary';

export type SessionComparisonTone =
  | 'ended'
  | 'contraction'
  | 'expansion'
  | 'evolution'
  | 'mixed'
  | 'steady';

export interface SessionComparisonDeltas {
  population: number;
  activeSpecies: number;
  activeLineages: number;
  biomass: number;
  births: number;
  deaths: number;
  mutations: number;
  extinctions: number;
  interventions: number;
}

export interface SessionComparison {
  fromTick: number;
  toTick: number;
  ticksElapsed: number;
  tone: SessionComparisonTone;
  summary: string;
  deltas: SessionComparisonDeltas;
}

/** Compare two captured observations without claiming that every increase is healthier. */
export function compareSessionSummaries(
  from: SessionSummary,
  to: SessionSummary
): SessionComparison {
  if (to.ticksSurvived < from.ticksSurvived) {
    throw new RangeError('The comparison snapshot must not come before its baseline');
  }
  if (from.seed !== null && to.seed !== null && from.seed !== to.seed) {
    throw new RangeError('Session snapshots must come from the same world seed');
  }

  const deltas: SessionComparisonDeltas = {
    population: to.currentPopulation - from.currentPopulation,
    activeSpecies: to.activeSpecies - from.activeSpecies,
    activeLineages: to.activeLineages - from.activeLineages,
    biomass: to.remainingBiomass - from.remainingBiomass,
    births: to.births - from.births,
    deaths: to.deaths - from.deaths,
    mutations: to.mutations - from.mutations,
    extinctions: to.extinctions - from.extinctions,
    interventions: to.interventions - from.interventions,
  };
  const contractionThreshold = Math.max(2, Math.ceil(from.currentPopulation * 0.2));
  const expansionThreshold = Math.max(2, Math.ceil(from.currentPopulation * 0.2));

  let tone: SessionComparisonTone;
  let summary: string;
  if (from.status === 'living' && to.status === 'ended') {
    tone = 'ended';
    summary = 'Animal life ended during this interval';
  } else if (deltas.activeSpecies < 0 || deltas.population <= -contractionThreshold) {
    tone = 'contraction';
    summary = 'The living ecosystem contracted';
  } else if (deltas.activeSpecies > 0 || deltas.activeLineages > 0) {
    tone = 'evolution';
    summary = 'Evolutionary variety expanded';
  } else if (deltas.population >= expansionThreshold) {
    tone = 'expansion';
    summary = 'The living population expanded';
  } else if (deltas.mutations > 0) {
    tone = 'evolution';
    summary = 'Evolution continued within a similar community';
  } else if (
    deltas.births !== 0 || deltas.deaths !== 0 || deltas.biomass !== 0 ||
    deltas.interventions !== 0 || deltas.extinctions !== 0
  ) {
    tone = 'mixed';
    summary = 'The interval mixed turnover with relative structural stability';
  } else {
    tone = 'steady';
    summary = 'No recorded change separates these snapshots';
  }

  return {
    fromTick: from.ticksSurvived,
    toTick: to.ticksSurvived,
    ticksElapsed: to.ticksSurvived - from.ticksSurvived,
    tone,
    summary,
    deltas,
  };
}
