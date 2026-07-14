import { World } from './world';
import { Creature } from './creature';
import { createRng } from './rng';
import { WORLD_WIDTH, WORLD_HEIGHT, SIMULATION_CONSTANTS } from '../utils/constants';
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
  worldHeight: number = WORLD_HEIGHT
): EngineState {
  // Create constants with proper world dimensions
  const constants = {
    ...SIMULATION_CONSTANTS,
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
export function tickEngine(state: EngineState): EngineState {
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
  growProducers(newWorld, 'solar');

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
        feedOnProducer(creature, cell, newWorld, creature.x, creature.y);
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
            feedOnCreature(creature, prey);
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
      applyMetabolism(creature);
    }
  }

  // Step 7: Reproduction (with mutation and lineage branching via species.ts)
  const offspring: Creature[] = [];
  for (const creature of creatures) {
    if (canReproduce(creature)) {
      payReproductionCost(creature);

      const child = reproduceCreature(creature, rng);

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
    checkAgeAndStarvation(creature);
  }

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
      decayCorpse(creature, newWorld);
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
  };
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
