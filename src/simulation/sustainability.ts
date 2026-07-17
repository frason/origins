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

  for (let tick = 1; tick <= tickHorizon; tick++) {
    state = tickEngine(state);
    const species = livingSpecies(state);
    const population = state.creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
    ).length;

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
      b.finalSpeciesCount - a.finalSpeciesCount ||
      b.finalPopulation - a.finalPopulation ||
      a.preset.localeCompare(b.preset)
  );
}
