import type { Creature } from './creature';
import type { SimEvent } from './events';

export interface SpeciesPopulationSample {
  speciesId: string;
  population: number;
}

export interface LineagePopulationSample {
  speciesId: string;
  lineageId: string;
  population: number;
}

export interface EcosystemHistorySample {
  tick: number;
  population: number;
  speciesPopulations: SpeciesPopulationSample[];
  lineagePopulations?: LineagePopulationSample[];
  lineageCount: number;
  births: number;
  deaths: number;
  mutations: number;
}

export const BASE_HISTORY_INTERVAL = 10;
export const MAX_HISTORY_SAMPLES = 600;

export function createEcosystemHistorySample(
  tick: number,
  creatures: Pick<Creature, 'speciesId' | 'lineageId' | 'lifecycleState'>[],
  events: SimEvent[]
): EcosystemHistorySample {
  const species = new Map<string, number>();
  const lineages = new Set<string>();
  const lineagePopulations = new Map<string, LineagePopulationSample>();
  let population = 0;
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    population++;
    species.set(creature.speciesId, (species.get(creature.speciesId) ?? 0) + 1);
    lineages.add(`${creature.speciesId}:${creature.lineageId}`);
    const lineageKey = `${creature.speciesId}:${creature.lineageId}`;
    const lineage = lineagePopulations.get(lineageKey);
    if (lineage) lineage.population++;
    else lineagePopulations.set(lineageKey, {
      speciesId: creature.speciesId,
      lineageId: creature.lineageId,
      population: 1,
    });
  }
  return {
    tick,
    population,
    speciesPopulations: [...species.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([speciesId, count]) => ({ speciesId, population: count })),
    lineagePopulations: [...lineagePopulations.values()].sort(
      (a, b) => a.speciesId.localeCompare(b.speciesId) || a.lineageId.localeCompare(b.lineageId)
    ),
    lineageCount: lineages.size,
    births: events.filter((event) => event.type === 'birth').length,
    deaths: events.filter((event) => event.type === 'death').length,
    mutations: events.filter((event) => event.type === 'mutation').length,
  };
}

export interface HistoryAppendResult {
  history: EcosystemHistorySample[];
  interval: number;
}

/** Append interval samples and progressively thin old history at a fixed memory bound. */
export function appendEcosystemHistory(
  history: EcosystemHistorySample[],
  interval: number,
  sample: EcosystemHistorySample
): HistoryAppendResult {
  if (sample.tick % interval !== 0) return { history, interval };
  let next = [...history.filter((item) => item.tick !== sample.tick), sample];
  let nextInterval = interval;
  while (next.length > MAX_HISTORY_SAMPLES) {
    nextInterval *= 2;
    const latestTick = next[next.length - 1].tick;
    next = next.filter(
      (item) => item.tick === 0 || item.tick === latestTick || item.tick % nextInterval === 0
    );
  }
  return { history: next, interval: nextInterval };
}
