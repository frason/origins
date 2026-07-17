import { Creature } from './creature';
import { createEngine, type EngineState } from './engine';
import { getBiomeProductivity } from './producer';
import { buildStarterCreatures } from './starterWorld';
import type { SimulationConstants } from '../utils/constants';

/** Build the playable demo world from an explicit seed so players can replay it exactly. */
export function buildDemoEngine(seed: number, constants: SimulationConstants): EngineState {
  Creature.resetIdCounter();
  const engine = createEngine(
    seed,
    buildStarterCreatures(seed, constants.worldWidth, constants.worldHeight),
    constants.worldWidth,
    constants.worldHeight,
    constants
  );
  for (let y = 0; y < engine.world.height; y++) {
    for (let x = 0; x < engine.world.width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, {
        producerBiomass: cell.energy * 2 * getBiomeProductivity(cell.biome),
      });
    }
  }
  return engine;
}
