import { Creature } from './creature';
import { createEngine, tickEngine, type EngineState } from './engine';
import { getBiomeProductivity } from './producer';
import { buildStarterCreatures } from './starterWorld';
import type { SimulationConstants } from '../utils/constants';

export interface SustainabilityPreset {
  name: string;
  constants: Partial<SimulationConstants>;
}

export interface SustainabilityResult {
  preset: string;
  seed: number;
  tickHorizon: number;
  allSpeciesSurvivalTicks: number;
  ecosystemSurvivalTicks: number;
  finalSpeciesCount: number;
  finalPopulation: number;
  mutationCount: number;
  strategyShiftCount: number;
  activeLineageCount: number;
  activeNicheCount: number;
  minimumDominantShare: number;
  maximumDominantShare: number;
  longestMonocultureTicks: number;
  longestMutationSilenceTicks: number;
  longestHighDominanceTicks: number;
  dominanceChangeCount: number;
  lineageDominanceChangeCount: number;
}

/** Build the same seeded, biomass-supported ecosystem used by the playable app. */
function buildEvaluationWorld(
  seed: number,
  constants: Partial<SimulationConstants>
): EngineState {
  Creature.resetIdCounter();
  const width = constants.worldWidth ?? 100;
  const height = constants.worldHeight ?? 100;
  const engine = createEngine(
    seed,
    buildStarterCreatures(seed, width, height),
    width,
    height,
    constants
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, {
        producerBiomass: cell.energy * 2 * getBiomeProductivity(cell.biome),
      });
    }
  }
  return engine;
}

function livingSpecies(state: EngineState): Set<string> {
  return new Set(
    state.creatures
      .filter((creature) => creature.lifecycleState === 'alive')
      .map((creature) => creature.speciesId)
  );
}

/**
 * Measure survival without optimizing during the run. The founding-species metric ends as
 * soon as any original species disappears; ecosystem lifespan continues until all life ends.
 */
export function evaluateSustainability(
  preset: SustainabilityPreset,
  seed: number,
  tickHorizon: number
): SustainabilityResult {
  let state = buildEvaluationWorld(seed, preset.constants);
  const foundingSpecies = livingSpecies(state);
  let allSpeciesSurvivalTicks = 0;
  let ecosystemSurvivalTicks = 0;
  let currentMonocultureTicks = 0;
  let longestMonocultureTicks = 0;
  let minimumDominantShare = 1;
  let maximumDominantShare = 0;
  let currentMutationSilenceTicks = 0;
  let longestMutationSilenceTicks = 0;
  let currentHighDominanceTicks = 0;
  let longestHighDominanceTicks = 0;
  let previousDominantSpecies: string | null = null;
  let dominanceChangeCount = 0;
  let previousDominantLineage: string | null = null;
  let lineageDominanceChangeCount = 0;

  for (let tick = 1; tick <= tickHorizon; tick++) {
    const previousEventCount = state.events.length;
    state = tickEngine(state);
    const species = livingSpecies(state);
    const population = state.creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
    ).length;

    const speciesCounts = new Map<string, number>();
    const lineageCounts = new Map<string, number>();
    for (const creature of state.creatures) {
      if (creature.lifecycleState !== 'alive') continue;
      speciesCounts.set(creature.speciesId, (speciesCounts.get(creature.speciesId) ?? 0) + 1);
      lineageCounts.set(creature.lineageId, (lineageCounts.get(creature.lineageId) ?? 0) + 1);
    }
    const dominantCount = Math.max(0, ...speciesCounts.values());
    const dominantSpecies = [...speciesCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    if (
      dominantSpecies && previousDominantSpecies &&
      dominantSpecies !== previousDominantSpecies
    ) dominanceChangeCount++;
    if (dominantSpecies) previousDominantSpecies = dominantSpecies;
    const dominantLineage = [...lineageCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    if (
      dominantLineage && previousDominantLineage &&
      dominantLineage !== previousDominantLineage
    ) lineageDominanceChangeCount++;
    if (dominantLineage) previousDominantLineage = dominantLineage;
    const dominantShare = population > 0 ? dominantCount / population : 0;
    if (population > 0) minimumDominantShare = Math.min(minimumDominantShare, dominantShare);
    maximumDominantShare = Math.max(
      maximumDominantShare,
      dominantShare
    );
    currentMonocultureTicks = speciesCounts.size === 1 ? currentMonocultureTicks + 1 : 0;
    longestMonocultureTicks = Math.max(longestMonocultureTicks, currentMonocultureTicks);
    currentHighDominanceTicks = dominantShare >= 0.8 ? currentHighDominanceTicks + 1 : 0;
    longestHighDominanceTicks = Math.max(longestHighDominanceTicks, currentHighDominanceTicks);
    const mutatedThisTick = state.events
      .slice(previousEventCount)
      .some((event) => event.type === 'mutation');
    currentMutationSilenceTicks = mutatedThisTick ? 0 : currentMutationSilenceTicks + 1;
    longestMutationSilenceTicks = Math.max(
      longestMutationSilenceTicks,
      currentMutationSilenceTicks
    );

    if (population === 0) break;
    ecosystemSurvivalTicks = tick;
    if (
      allSpeciesSurvivalTicks === tick - 1 &&
      [...foundingSpecies].every((speciesId) => species.has(speciesId))
    ) {
      allSpeciesSurvivalTicks = tick;
    }
  }

  const finalSpecies = livingSpecies(state);
  const activeLineages = new Set(
    state.creatures
      .filter((creature) => creature.lifecycleState === 'alive')
      .map((creature) => creature.lineageId)
  );
  const activeNiches = new Set(
    state.creatures
      .filter((creature) => creature.lifecycleState === 'alive')
      .map((creature) => `${creature.speciesId}:${creature.traits.energyStrategy}`)
  );
  const mutationEvents = state.events.filter((event) => event.type === 'mutation');
  return {
    preset: preset.name,
    seed,
    tickHorizon,
    allSpeciesSurvivalTicks,
    ecosystemSurvivalTicks,
    finalSpeciesCount: finalSpecies.size,
    finalPopulation: state.creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
    ).length,
    mutationCount: mutationEvents.length,
    strategyShiftCount: mutationEvents.filter((event) =>
      event.traitChanges?.some((change) => change.trait === 'energyStrategy')
    ).length,
    activeLineageCount: activeLineages.size,
    activeNicheCount: activeNiches.size,
    minimumDominantShare: ecosystemSurvivalTicks > 0 ? minimumDominantShare : 0,
    maximumDominantShare,
    longestMonocultureTicks,
    longestMutationSilenceTicks,
    longestHighDominanceTicks,
    dominanceChangeCount,
    lineageDominanceChangeCount,
  };
}

/** Rank diversity first, then total ecosystem survival and remaining population. */
export function rankSustainability(
  results: SustainabilityResult[]
): SustainabilityResult[] {
  return [...results].sort(
    (a, b) =>
      b.allSpeciesSurvivalTicks - a.allSpeciesSurvivalTicks ||
      b.ecosystemSurvivalTicks - a.ecosystemSurvivalTicks ||
      b.mutationCount - a.mutationCount ||
      a.longestMutationSilenceTicks - b.longestMutationSilenceTicks ||
      a.longestMonocultureTicks - b.longestMonocultureTicks ||
      b.finalSpeciesCount - a.finalSpeciesCount ||
      b.finalPopulation - a.finalPopulation ||
      a.preset.localeCompare(b.preset)
  );
}
