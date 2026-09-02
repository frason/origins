import type { Creature } from './creature';
import type { SimEvent } from './events';
import type { World } from './world';
import type { SimulationConstants } from '../utils/constants';
import { measureBiomass, type BiomassMetrics } from './biomassMetrics';
import { calculateDecomposerActivity } from './decomposition';

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
  biomass?: BiomassMetrics;
  reproductionPressure?: ReproductionPressureHistory;
  dispersal?: DispersalHistory;
  decomposition?: DecompositionMetrics;
}

export interface ReproductionPressureHistory {
  restrainedCandidates: number;
  averagePressure: number;
  maximumPressure: number;
}

export interface DispersalHistory {
  activeCreatures: number;
  moves: number;
  energySpent: number;
  biomeTransitions: number;
}

export interface DecompositionMetrics {
  totalCorpseBiomass: number;
  cellsWithCorpses: number;
  averageDecomposerActivity: number;
  maxDecomposerActivity: number;
}

export const BASE_HISTORY_INTERVAL = 10;
export const MAX_HISTORY_SAMPLES = 600;

/**
 * Measure ecosystem-wide decomposition metrics across all cells.
 * @param world - the world to measure
 * @param constants - simulation constants for decomposer activity calculation
 * @returns decomposition metrics including total corpse biomass and activity levels
 */
export function measureDecomposition(
  world: World,
  constants?: Partial<SimulationConstants>
): DecompositionMetrics {
  let totalCorpseBiomass = 0;
  let cellsWithCorpses = 0;
  let totalDecomposerActivity = 0;
  let maxDecomposerActivity = 0;
  let cellsAnalyzed = 0;

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      if (cell.corpseBiomass && cell.corpseBiomass > 0) {
        totalCorpseBiomass += cell.corpseBiomass;
        cellsWithCorpses++;
      }

      // Calculate decomposer activity for this cell
      const activity = calculateDecomposerActivity(
        cell.temperature,
        cell.moisture,
        cell.toxicity,
        cell.corpseBiomass || 0,
        constants
      );
      totalDecomposerActivity += activity;
      maxDecomposerActivity = Math.max(maxDecomposerActivity, activity);
      cellsAnalyzed++;
    }
  }

  return {
    totalCorpseBiomass,
    cellsWithCorpses,
    averageDecomposerActivity: cellsAnalyzed > 0 ? totalDecomposerActivity / cellsAnalyzed : 0,
    maxDecomposerActivity,
  };
}

export function createEcosystemHistorySample(
  tick: number,
  creatures: Pick<Creature, 'speciesId' | 'lineageId' | 'lifecycleState' | 'x' | 'y'>[],
  events: SimEvent[],
  world?: World,
  reproductionPressure?: ReproductionPressureHistory,
  dispersal?: DispersalHistory,
  constants?: Partial<SimulationConstants>
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
    ...(world ? { biomass: measureBiomass(world, creatures) } : {}),
    ...(reproductionPressure ? { reproductionPressure } : {}),
    ...(dispersal ? { dispersal } : {}),
    ...(world ? { decomposition: measureDecomposition(world, constants) } : {}),
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
