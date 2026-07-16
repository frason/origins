import { World } from './world';
import { Creature } from './creature';
import { createRng, RngFn } from './rng';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SIMULATION_CONSTANTS,
  SimulationConstants,
} from '../utils/constants';
import { growProducers } from './producer';
import { reproduceCreature } from './species';
import {
  decideTick,
  applyMovement,
  DecisionType,
} from './creature';
import {
  feedOnProducer,
  feedOnCreature,
  applyMetabolism,
  canReproduce,
  payReproductionCost,
} from './energy';
import {
  checkAgeAndStarvation,
  decayCorpse,
  recycleNutrients,
} from './decomposition';

/**
 * Event type for significant events during simulation
 */
export type SimEventType = 'birth' | 'death' | 'mutation' | 'extinction';

/**
 * Event object logged during simulation
 * Tracks births, deaths, mutations, and extinctions with metadata
 */
export interface SimEvent {
  type: SimEventType;
  tick: number;
  creatureId?: string;
  speciesId?: string;
  detail?: string;
}

/**
 * Complete engine state snapshot
 * Contains world, creatures, tick counter, seed, and event log
 */
export interface EngineState {
  world: World;
  creatures: Creature[];
  tick: number;
  seed: number;
  events: SimEvent[];
  constants: SimulationConstants;
}

/**
 * Create a new engine state with initial creatures
 * Initializes world, seeds RNG, and prepares simulation state
 *
 * @param seed - deterministic RNG seed for reproducibility
 * @param initialCreatures - array of creatures to start with
 * @param worldWidth - optional world width (default: WORLD_WIDTH)
 * @param worldHeight - optional world height (default: WORLD_HEIGHT)
 * @returns initial EngineState ready for simulation
 */
export function createEngine(
  seed: number,
  initialCreatures: Creature[],
  worldWidth: number = WORLD_WIDTH,
  worldHeight: number = WORLD_HEIGHT,
  constantOverrides: Partial<SimulationConstants> = {}
): EngineState {
  // Create constants with proper world dimensions
  const constants = {
    ...SIMULATION_CONSTANTS,
    ...constantOverrides,
    worldWidth,
    worldHeight,
  };

  const world = new World(worldWidth, worldHeight, constants);

  // Deep copy initial creatures
  const creatures = initialCreatures.map(
    (c) =>
      new Creature({
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age ?? 0,
        lifecycleState: c.lifecycleState ?? 'alive',
        corpseDecayTicks: c.corpseDecayTicks ?? 0,
      })
  );

  return {
    world,
    creatures,
    tick: 0,
    seed,
    events: [],
    constants,
  };
}

/**
 * Execute one simulation tick
 * Applies all 10 simulation steps in sequence, returning a new immutable state
 *
 * Steps:
 * 1. Energy Generation (already done via solar grid initialization)
 * 2. Producer Growth
 * 3. Creature Decisions
 * 4. Movement
 * 5. Feeding
 * 6. Energy Updates (Metabolism)
 * 7. Reproduction
 * 8. Death (Age and Starvation)
 * 9. Decomposition
 * 10. Nutrient Recycling
 * 11. Event Generation
 *
 * @param state - current engine state (unchanged)
 * @returns new engine state after one tick (immutable)
 */
export function tickEngine(
  state: EngineState,
  constantOverrides: Partial<SimulationConstants> = {}
): EngineState {
  const constants: SimulationConstants = {
    ...SIMULATION_CONSTANTS,
    ...state.constants,
    ...constantOverrides,
    worldWidth: state.world.width,
    worldHeight: state.world.height,
  };
  // Deep copy world state from JSON
  const newWorld = World.fromJSON(state.world.toJSON());

  // Deep copy creatures
  const creatures: Creature[] = state.creatures.map(
    (c) =>
      new Creature({
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age,
        lifecycleState: c.lifecycleState,
        corpseDecayTicks: c.corpseDecayTicks,
      })
  );

  // Restore original creature IDs
  for (let i = 0; i < creatures.length; i++) {
    creatures[i].id = state.creatures[i].id;
  }

  const newEvents: SimEvent[] = [];

  // Create deterministic RNG from seed and tick
  const rng = createRng(state.seed ^ state.tick);

  // Step 2: Producer Growth
  growProducers(newWorld, 'solar', constants.producerGrowthRate);

  // Step 3 & 4: Creature Decisions and Movement
  const decisions = new Map<string, DecisionType>();
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      const decision = decideTick(creature, newWorld, creatures, rng);
      decisions.set(creature.id, decision);
      applyMovement(creature, decision, newWorld, creatures, rng);
    }
  }

  // Step 5: Feeding
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      const cell = newWorld.getCell(creature.x, creature.y);

      // Herbivores and omnivores feed on producer biomass
      if (
        (creature.traits.energyStrategy === 'herbivore' ||
          creature.traits.energyStrategy === 'omnivore') &&
        cell.producerBiomass > 0
      ) {
        feedOnProducer(
          creature,
          cell,
          newWorld,
          creature.x,
          creature.y,
          constants.feedingEfficiency
        );
      }

      // Carnivores and omnivores feed on other creatures
      if (
        creature.traits.energyStrategy === 'carnivore' ||
        creature.traits.energyStrategy === 'omnivore'
      ) {
        for (const prey of creatures) {
          if (
            prey.id !== creature.id &&
            prey.lifecycleState === 'alive' &&
            prey.x === creature.x &&
            prey.y === creature.y
          ) {
            feedOnCreature(creature, prey, constants.feedingEfficiency);
            break; // Only eat one prey per tick
          }
        }
      }
    }
  }

  // Snapshot alive set before metabolism so starvation deaths are captured as events
  const aliveBeforeDeath = new Set<string>(
    creatures.filter((c) => c.lifecycleState === 'alive').map((c) => c.id)
  );

  // Step 6: Energy Updates (Metabolism)
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      applyMetabolism(creature, constants.baseMetabolism);
    }
  }

  // Step 7: Reproduction (with mutation and lineage branching via species.ts)
  const offspring: Creature[] = [];
  for (const creature of creatures) {
    if (canReproduce(creature, constants.reproductionEnergyThreshold)) {
      payReproductionCost(creature, constants.reproductionEnergyCost);

      const child = reproduceCreature(
        creature,
        rng,
        constants.mutationDrift,
        constants.defaultMutationRate
      );

      offspring.push(child);
      newEvents.push({
        type: 'birth',
        tick: state.tick,
        creatureId: child.id,
        speciesId: child.speciesId,
      });
      if (child.lineageId !== creature.lineageId) {
        newEvents.push({
          type: 'mutation',
          tick: state.tick,
          creatureId: child.id,
          speciesId: child.speciesId,
          detail: `lineage branch: ${creature.lineageId} → ${child.lineageId}`,
        });
      }
    }
  }

  // Add offspring to creature list
  creatures.push(...offspring);

  // Step 8: Death (Age and Starvation)
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    creature.age++;
    checkAgeAndStarvation(creature, constants.maxCreatureAgeTicks);
  }

  // Step 8.5: Biodiversity Pressure (density-dependent mortality and monoculture penalties)
  applyBiodiversityPressure(creatures, rng, constants);

  // Log death events for creatures that just died
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && aliveBeforeDeath.has(creature.id)) {
      newEvents.push({
        type: 'death',
        tick: state.tick,
        creatureId: creature.id,
        speciesId: creature.speciesId,
      });
    }
  }

  // Step 9: Decomposition
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks > 0) {
      decayCorpse(creature, newWorld, constants.corpseDecayRate);
    }
  }

  // Step 10: Nutrient Recycling
  recycleNutrients(newWorld);

  // Count living creatures per species (for extinction detection)
  const speciesLivingCount = new Map<string, number>();
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      speciesLivingCount.set(
        creature.speciesId,
        (speciesLivingCount.get(creature.speciesId) || 0) + 1
      );
    }
  }

  // Remove fully decomposed creatures and detect extinctions
  const creaturesAfterDecomposition: Creature[] = [];
  const extinctSpecies = new Set<string>();

  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks <= 0) {
      // Fully decomposed; remove from simulation
      if (speciesLivingCount.get(creature.speciesId) === 0) {
        extinctSpecies.add(creature.speciesId);
      }
    } else {
      creaturesAfterDecomposition.push(creature);
    }
  }

  // Log extinction events (once per species)
  for (const speciesId of extinctSpecies) {
    newEvents.push({
      type: 'extinction',
      tick: state.tick,
      speciesId,
    });
  }

  return {
    world: newWorld,
    creatures: creaturesAfterDecomposition,
    tick: state.tick + 1,
    seed: state.seed,
    events: state.events.concat(newEvents),
    constants,
  };
}

/**
 * Apply biodiversity pressure penalties to prevent monoculture and overcrowding.
 * Increases mortality risk for:
 * 1. Creatures in dominant species (>80% of population)
 * 2. Random creatures when global population exceeds carrying capacity
 *
 * @param creatures - all creatures in the simulation (mutated in-place)
 * @param rng - deterministic RNG for stochastic mortality
 */
function applyBiodiversityPressure(
  creatures: Creature[],
  rng: RngFn,
  constants: SimulationConstants
): void {
  // Count creatures per species (alive only)
  const aliveCreatures = creatures.filter((c) => c.lifecycleState === 'alive');
  if (aliveCreatures.length === 0) {
    return;
  }

  const speciesCounts = new Map<string, number>();
  for (const creature of aliveCreatures) {
    speciesCounts.set(
      creature.speciesId,
      (speciesCounts.get(creature.speciesId) || 0) + 1
    );
  }

  // Find dominant species
  let dominantSpecies: string | null = null;
  let dominantCount = 0;
  for (const [speciesId, count] of speciesCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantSpecies = speciesId;
    }
  }

  // Check if a species is monopolizing (>80% of population)
  const isDominanceMonopoly =
    dominantSpecies &&
    dominantCount / aliveCreatures.length > constants.monocultureDominanceThreshold;

  // Check if population exceeds carrying capacity
  const isOvercrowded = aliveCreatures.length > constants.maxGlobalPopulation;

  // Apply penalties
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;

    let mortalityBonus = 0;

    // Penalty for creatures in the dominant species during monopoly
    if (isDominanceMonopoly && creature.speciesId === dominantSpecies) {
      mortalityBonus += constants.monocultureMortalityPenalty;
    }

    // Penalty for all creatures during overcrowding
    if (isOvercrowded) {
      mortalityBonus += constants.overcrowdingMortalityRate;
    }

    // Apply stochastic mortality if any penalty was incurred
    if (mortalityBonus > 0 && rng() < mortalityBonus) {
      creature.lifecycleState = 'dead';
    }
  }
}

/**
 * Convenience function to run N ticks sequentially
 * Equivalent to calling tickEngine N times
 *
 * @param state - initial engine state
 * @param ticks - number of ticks to run
 * @returns engine state after N ticks
 */
export function runEngine(state: EngineState, ticks: number): EngineState {
  let currentState = state;
  for (let i = 0; i < ticks; i++) {
    currentState = tickEngine(currentState);
  }
  return currentState;
}
