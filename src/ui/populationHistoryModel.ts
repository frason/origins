import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { lineageDisplayName, speciesDisplayName } from '../simulation/speciesNames';
import type { CreatureSnapshot } from '../state/store';

export type PopulationHistoryMode = 'species' | 'lineage';

export interface PopulationHistorySeries {
  id: string;
  name: string;
  color: string;
  populations: number[];
  peak: number;
}

export interface PopulationHistoryChart {
  ticks: number[];
  series: PopulationHistorySeries[];
  maxPopulation: number;
}

const colors = ['#d3b38c', '#7fa889', '#8ba6bd', '#bb91a8', '#b9a85f', '#8f87bd', '#c28168', '#79a9a4'];

function colorFor(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return colors[(hash >>> 0) % colors.length];
}

function endpoint(
  tick: number,
  creatures: CreatureSnapshot[]
): EcosystemHistorySample {
  const species = new Map<string, number>();
  const lineages = new Map<string, { speciesId: string; lineageId: string; population: number }>();
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    species.set(creature.speciesId, (species.get(creature.speciesId) ?? 0) + 1);
    const key = `${creature.speciesId}:${creature.lineageId}`;
    const existing = lineages.get(key);
    if (existing) existing.population++;
    else lineages.set(key, { speciesId: creature.speciesId, lineageId: creature.lineageId, population: 1 });
  }
  return {
    tick,
    population: [...species.values()].reduce((sum, value) => sum + value, 0),
    speciesPopulations: [...species].map(([speciesId, population]) => ({ speciesId, population })),
    lineagePopulations: [...lineages.values()],
    lineageCount: lineages.size,
    births: 0,
    deaths: 0,
    mutations: 0,
  };
}

/** Build deterministic, zero-filled series so extinct groups remain in the full timeline. */
export function buildPopulationHistoryChart(
  history: EcosystemHistorySample[],
  creatures: CreatureSnapshot[],
  finalTick: number,
  mode: PopulationHistoryMode
): PopulationHistoryChart {
  const samples = [...history].sort((a, b) => a.tick - b.tick);
  const current = endpoint(finalTick, creatures);
  const finalIndex = samples.findIndex((sample) => sample.tick === finalTick);
  if (finalIndex >= 0) samples[finalIndex] = current;
  else samples.push(current);

  const identities = new Map<string, { speciesId: string; lineageId?: string; first: number }>();
  samples.forEach((sample, index) => {
    const populations = mode === 'species'
      ? sample.speciesPopulations.map((item) => ({ ...item, lineageId: undefined }))
      : (sample.lineagePopulations ?? []);
    for (const item of populations) {
      const id = mode === 'species' ? item.speciesId : `${item.speciesId}:${item.lineageId}`;
      if (!identities.has(id)) identities.set(id, {
        speciesId: item.speciesId,
        lineageId: item.lineageId,
        first: index,
      });
    }
  });

  const ordered = [...identities.entries()].sort(
    ([a, left], [b, right]) => left.first - right.first || a.localeCompare(b)
  );
  const series = ordered.map(([id, identity]) => {
    const populations = samples.map((sample) => {
      if (mode === 'species') {
        return sample.speciesPopulations.find((item) => item.speciesId === id)?.population ?? 0;
      }
      return sample.lineagePopulations?.find(
        (item) => item.speciesId === identity.speciesId && item.lineageId === identity.lineageId
      )?.population ?? 0;
    });
    return {
      id,
      name: mode === 'species'
        ? speciesDisplayName(identity.speciesId)
        : lineageDisplayName(identity.speciesId, identity.lineageId!),
      color: colorFor(id),
      populations,
      peak: Math.max(0, ...populations),
    };
  });

  return {
    ticks: samples.map((sample) => sample.tick),
    series,
    maxPopulation: Math.max(1, ...samples.map((sample) => sample.population)),
  };
}
