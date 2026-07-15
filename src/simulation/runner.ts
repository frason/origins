/**
 * Simulation Runner: Initialization and Startup
 *
 * Provides entry points to initialize and start a simulation.
 * Replaces the stub that previously started with seed 42 and no creatures.
 */

import { createEngine, EngineState } from './engine';
import { createDemoWorld } from './demoWorld';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../utils/constants';

/**
 * World seed for the demo world.
 * Using seed 42 for reproducibility (as mentioned in task requirements).
 */
export const DEMO_WORLD_SEED = 42;

/**
 * Initialize and return an EngineState for the demo world.
 * Creates a fresh engine, seeds it with the demo world scenario,
 * and returns it ready for simulation.
 *
 * The demo world includes:
 * - ~40% producer biomass seeded across the grid
 * - 80 herbivores (Grazeling)
 * - 15 carnivores (Swiftclaw)
 * - 30 decomposers (Rotweave)
 *
 * The ecosystem is balanced but fragile — expected to collapse
 * within ~200 ticks without player intervention.
 *
 * @returns EngineState ready to begin simulation
 */
export function start(): EngineState {
  // Create a fresh engine with no initial creatures
  const engine = createEngine(DEMO_WORLD_SEED, [], WORLD_WIDTH, WORLD_HEIGHT);

  // Populate the world with the demo scenario
  createDemoWorld(engine);

  return engine;
}

/**
 * Initialize with a custom seed for testing/reproducibility.
 * All else is identical to start().
 *
 * @param seed - deterministic RNG seed
 * @returns EngineState ready to begin simulation
 */
export function startWithSeed(seed: number): EngineState {
  const engine = createEngine(seed, [], WORLD_WIDTH, WORLD_HEIGHT);
  createDemoWorld(engine);
  return engine;
}
