/**
 * Demo World: Barely-Sustainable Starter Scenario
 *
 * A pre-built ecosystem spanning the full ecological spectrum (producers,
 * herbivores, carnivores, decomposers) that will collapse within ~200 ticks
 * without player intervention.
 *
 * Initial Setup:
 * - Producers (Solarbulb): ~40% biomass seeded across grid, higher near center
 * - Herbivores (Grazeling): 80 creatures, small/slow, high reproduction
 * - Carnivores (Swiftclaw): 15 creatures, medium/fast, low reproduction
 * - Decomposers (Rotweave): 30 creatures, slow, scavenger diet
 *
 * Expected Collapse Timeline:
 * - Ticks 0-50: Stable, populations hold steady
 * - Ticks 50-150: Swiftclaw overhunt Grazeling, predator boom
 * - Ticks 150-200: Grazeling crash → Swiftclaw starvation → ecosystem collapse
 *   (Unless player intervenes with God Mode or future species editor)
 */

import { Creature } from './creature';
import { EngineState } from './engine';
import { createRng } from './rng';
import { DEFAULT_TRAITS } from '../utils/traits';
import { MAX_PRODUCER_BIOMASS } from './producer';

/**
 * Populate the demo world with producers (biomass) and initial creatures.
 * Called after createEngine to seed the world with a balanced-but-fragile ecosystem.
 *
 * @param state - engine state to populate (mutated in-place)
 */
export function createDemoWorld(state: EngineState): void {
  const rng = createRng(state.seed);

  // Step 1: Seed producer biomass at ~40% of max, radial falloff from center
  seedProducerBiomass(state, rng);

  // Step 2: Create and place initial creatures (herbivores, carnivores, decomposers)
  const creatures = createInitialCreatures(state, rng);
  state.creatures.push(...creatures);
}

/**
 * Seed producer biomass across the world.
 * Initializes cells with ~40% of MAX_PRODUCER_BIOMASS as a baseline,
 * scaled by solar energy (higher near center, lower at edges).
 *
 * @param state - engine state whose world will be seeded
 * @param rng - deterministic RNG for variation
 */
function seedProducerBiomass(state: EngineState, rng: any): void {
  const { world } = state;
  const centerX = world.width / 2;
  const centerY = world.height / 2;

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      // Base biomass: proportional to solar energy available in the cell
      // The solar energy grid is already computed and stored in cell.energy
      // Scale: ~40% of MAX at peak solar (center), ~20% at edges
      const baseBiomass = cell.energy * 4; // Approx 40% at center where energy=10

      // Add slight randomness (±10%) for natural variation
      const variance = 0.9 + rng() * 0.2; // Random factor in [0.9, 1.1]
      const finalBiomass = Math.min(baseBiomass * variance, MAX_PRODUCER_BIOMASS);

      world.setCell(x, y, { producerBiomass: finalBiomass });
    }
  }
}

/**
 * Create initial creatures (herbivores, carnivores, decomposers).
 * Placement uses seeded RNG for determinism:
 * - Grazeling (herbivores): spread across center region
 * - Swiftclaw (carnivores): clustered near herbivore concentrations
 * - Rotweave (decomposers): scattered throughout
 *
 * @param state - engine state (used for world dimensions)
 * @param rng - deterministic RNG for placement
 * @returns array of creatures ready to add to engine state
 */
function createInitialCreatures(state: EngineState, rng: any): Creature[] {
  const creatures: Creature[] = [];
  const { world } = state;

  // Lineage IDs (same as speciesId for initial creatures)
  const lineageIdGrazeling = 'lineage_grazeling';
  const lineageIdSwiftclaw = 'lineage_swiftclaw';
  const lineageIdRotweave = 'lineage_rotweave';

  // Create 80 Grazeling (herbivores)
  const grazelingTraits = {
    ...DEFAULT_TRAITS,
    size: 0.5, // Small
    speed: 0.8, // Slow
    visionRange: 4,
    metabolism: 0.8,
    reproductionRate: 1.5, // High reproduction
    energyStrategy: 'herbivore' as const,
  };

  for (let i = 0; i < 80; i++) {
    const x = Math.floor(rng() * world.width * 0.6) + world.width * 0.2; // Cluster in center 60%
    const y = Math.floor(rng() * world.height * 0.6) + world.height * 0.2;
    const creature = new Creature({
      speciesId: 'grazeling',
      lineageId: lineageIdGrazeling,
      parentId: null,
      traits: grazelingTraits,
      x,
      y,
      energy: 120,
    });
    creatures.push(creature);
  }

  // Create 15 Swiftclaw (carnivores)
  const swiftclawTraits = {
    ...DEFAULT_TRAITS,
    size: 1.2, // Medium
    speed: 2.0, // Fast
    visionRange: 6,
    metabolism: 1.2,
    reproductionRate: 0.6, // Low reproduction
    armor: 1,
    energyStrategy: 'carnivore' as const,
  };

  for (let i = 0; i < 15; i++) {
    // Place near center (where herbivores cluster)
    const angle = (i / 15) * Math.PI * 2;
    const radius = 15 + rng() * 10;
    const x = Math.round(world.width / 2 + Math.cos(angle) * radius);
    const y = Math.round(world.height / 2 + Math.sin(angle) * radius);
    const creature = new Creature({
      speciesId: 'swiftclaw',
      lineageId: lineageIdSwiftclaw,
      parentId: null,
      traits: swiftclawTraits,
      x: Math.max(0, Math.min(world.width - 1, x)),
      y: Math.max(0, Math.min(world.height - 1, y)),
      energy: 150,
    });
    creatures.push(creature);
  }

  // Create 30 Rotweave (decomposers / scavengers)
  const rotweaveTraits = {
    ...DEFAULT_TRAITS,
    size: 0.7,
    speed: 0.6, // Slow
    visionRange: 3,
    metabolism: 0.7,
    reproductionRate: 0.8,
    energyStrategy: 'scavenger' as const,
  };

  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * world.width);
    const y = Math.floor(rng() * world.height);
    const creature = new Creature({
      speciesId: 'rotweave',
      lineageId: lineageIdRotweave,
      parentId: null,
      traits: rotweaveTraits,
      x,
      y,
      energy: 100,
    });
    creatures.push(creature);
  }

  return creatures;
}
