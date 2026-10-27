import { Creature } from './creature';
import { createEngine, type EngineState } from './engine';
import { getBiomeProductivity, getNutrientCapacity } from './producer';
import { buildStarterCreatures } from './starterWorld';
import { StreamedRng } from './rng';
import type { SimulationConstants } from '../utils/constants';
import { createEcosystemHistorySample } from './ecosystemHistory';
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from './seasons';

/** Build the playable demo world from an explicit seed so players can replay it exactly. */
export function buildDemoEngine(
  seed: number,
  constants: SimulationConstants,
  seasonConfig?: SeasonConfig
): EngineState {
  Creature.resetIdCounter();
  const streamedRng = new StreamedRng(seed, 0);
  const engine = createEngine(
    seed,
    buildStarterCreatures(
      seed, constants.worldWidth, constants.worldHeight, constants.corpseDecayDurationTicks, streamedRng
    ),
    constants.worldWidth,
    constants.worldHeight,
    constants,
    seasonConfig
  );
  for (let y = 0; y < engine.world.height; y++) {
    for (let x = 0; x < engine.world.width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, {
        producerBiomass: cell.energy * 2 * getBiomeProductivity(cell.biome),
        nutrients: getNutrientCapacity(cell),
      });
    }
  }
  engine.history[0] = createEcosystemHistorySample(0, engine.creatures, [], engine.world);
  return engine;
}

/**
 * Seasons-enabled demo world (#357): the standard demo world with the default seasonal climate
 * cycle (960-tick year, 23.5° tilt, grid latitude ±45°). The same seed reproduces the same world.
 */
export function buildSeasonsDemoEngine(seed: number, constants: SimulationConstants): EngineState {
  return buildDemoEngine(seed, constants, { ...DEFAULT_SEASON_CONFIG });
}
