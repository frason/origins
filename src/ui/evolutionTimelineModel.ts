import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { speciesDisplayName } from '../simulation/speciesNames';
import type { WorldSnapshot } from '../state/store';
import { getLiveEventTotals } from './liveEventMetrics';

export interface EvolutionTimelinePoint extends EcosystemHistorySample {
  speciesCount: number;
  dominantSpeciesId: string | null;
  x: number;
  populationY: number;
  speciesY: number;
  lineageY: number;
}

export interface EvolutionTimelineModel {
  points: EvolutionTimelinePoint[];
  populationPolyline: string;
  speciesPolyline: string;
  lineagePolyline: string;
  peakPopulation: number;
  dominanceChanges: number;
  currentDominantName: string | null;
  description: string;
}

function dominantSpecies(sample: EcosystemHistorySample): string | null {
  let dominant: string | null = null;
  let count = 0;
  for (const species of sample.speciesPopulations) {
    if (species.population > count) {
      dominant = species.speciesId;
      count = species.population;
    }
  }
  return dominant;
}

function currentSample(
  history: EcosystemHistorySample[] | undefined,
  world: WorldSnapshot,
  tick: number
): EcosystemHistorySample {
  const species = new Map<string, number>();
  const lineages = new Set<string>();
  let population = 0;
  for (const creature of world.creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    population++;
    species.set(creature.speciesId, (species.get(creature.speciesId) ?? 0) + 1);
    lineages.add(`${creature.speciesId}:${creature.lineageId}`);
  }
  const totals = getLiveEventTotals(history, world.events);
  return {
    tick,
    population,
    speciesPopulations: [...species.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([speciesId, count]) => ({ speciesId, population: count })),
    lineageCount: lineages.size,
    ...totals,
  };
}

/** Merge bounded engine history with the current unsampled tick and create chart coordinates. */
export function buildEvolutionTimeline(
  history: EcosystemHistorySample[] | undefined,
  world: WorldSnapshot | null,
  tick: number
): EvolutionTimelineModel | null {
  if (!world) return null;
  const samples = new Map<number, EcosystemHistorySample>();
  for (const sample of history ?? []) samples.set(sample.tick, sample);
  samples.set(tick, currentSample(history, world, tick));
  const ordered = [...samples.values()].sort((a, b) => a.tick - b.tick);
  const lastTick = Math.max(1, ordered[ordered.length - 1]?.tick ?? 1);
  const peakPopulation = Math.max(0, ...ordered.map((sample) => sample.population));
  const maxDiversity = Math.max(
    1,
    ...ordered.map((sample) => Math.max(sample.speciesPopulations.length, sample.lineageCount))
  );
  const populationScale = Math.max(1, peakPopulation);
  const points = ordered.map((sample): EvolutionTimelinePoint => ({
    ...sample,
    speciesCount: sample.speciesPopulations.length,
    dominantSpeciesId: dominantSpecies(sample),
    x: (sample.tick / lastTick) * 100,
    populationY: 92 - (sample.population / populationScale) * 82,
    speciesY: 92 - (sample.speciesPopulations.length / maxDiversity) * 82,
    lineageY: 92 - (sample.lineageCount / maxDiversity) * 82,
  }));
  let dominanceChanges = 0;
  let previousDominant: string | null = null;
  for (const point of points) {
    if (point.dominantSpeciesId && previousDominant && point.dominantSpeciesId !== previousDominant) {
      dominanceChanges++;
    }
    if (point.dominantSpeciesId) previousDominant = point.dominantSpeciesId;
  }
  const currentDominant = points[points.length - 1]?.dominantSpeciesId ?? null;
  const polyline = (key: 'populationY' | 'speciesY' | 'lineageY') =>
    points.map((point) => `${point.x.toFixed(2)},${point[key].toFixed(2)}`).join(' ');
  const currentDominantName = currentDominant ? speciesDisplayName(currentDominant) : null;

  return {
    points,
    populationPolyline: polyline('populationY'),
    speciesPolyline: polyline('speciesY'),
    lineagePolyline: polyline('lineageY'),
    peakPopulation,
    dominanceChanges,
    currentDominantName,
    description: `${points.length} samples through tick ${tick}. Peak population ${peakPopulation}. ${dominanceChanges} dominance ${dominanceChanges === 1 ? 'shift' : 'shifts'}. ${currentDominantName ? `${currentDominantName} currently leads.` : 'No living species currently leads.'}`,
  };
}
