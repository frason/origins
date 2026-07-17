import { computeSolarEnergyGrid, World } from './world';
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
import { lineageDisplayName } from './speciesNames';
import {
  decideTick,
  applyMovement,
  DecisionType,
} from './creature';
import {
  feedOnProducer,
  feedOnCreature,
  feedOnCorpse,
  applyMetabolism,
  canReproduce,
  payReproductionCost,
  getEnergyCapacity,
} from './energy';
import {
  checkAgeAndStarvation,
  decayCorpse,
  recycleNutrients,
  dissipateToxicity,
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

  const world = new World(worldWidth, worldHeight, constants, seed);

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
  applyLiveSolarConstants(newWorld, state.constants, constants);

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

  // Capture every creature alive at the start of the tick. Feeding can kill
  // prey before the metabolism/death phase, so this snapshot must come first.
  const aliveBeforeDeath = new Set<string>(
    creatures.filter((c) => c.lifecycleState === 'alive').map((c) => c.id)
  );

  // Create deterministic RNG from seed and tick
  const rng = createRng(state.seed ^ state.tick);

  // Step 2: Producer Growth
  growProducers(newWorld, 'solar', constants.producerGrowthRate, true);

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
          constants.feedingEfficiency,
          true
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

      // Omnivores and dedicated scavengers consume corpses on their tile.
      if (
        creature.traits.energyStrategy === 'omnivore' ||
        creature.traits.energyStrategy === 'scavenger'
      ) {
        const corpse = creatures.find(
          (candidate) =>
            candidate.lifecycleState !== 'alive' &&
            candidate.corpseDecayTicks > 0 &&
            candidate.x === creature.x &&
            candidate.y === creature.y
        );
        if (corpse) {
          feedOnCorpse(
            creature,
            corpse,
            constants.feedingEfficiency,
            constants.scavengingRate
          );
        }
      }
    }
  }

  // Keep malformed inputs or extreme God Mode settings from propagating
  // unbounded/invalid values into rendering and reproduction.
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const capacity = getEnergyCapacity(creature);
    creature.energy = Number.isFinite(creature.energy)
      ? Math.max(0, Math.min(capacity, creature.energy))
      : 0;
  }

  // Step 6: Energy Updates (Metabolism)
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      applyMetabolism(creature, constants.baseMetabolism);
    }
  }

  // Step 7: Reproduction (with mutation and lineage branching via species.ts)
  const offspring: Creature[] = [];
  const livingBeforeBirths = creatures.filter((creature) => creature.lifecycleState === 'alive');
  const birthPressure = getPopulationPressure(livingBeforeBirths, constants);
  let birthSlots = Math.max(0, constants.maxGlobalPopulation - livingBeforeBirths.length);
  for (const creature of creatures) {
    const dominantReproductionSuppressed =
      birthPressure.isMonopoly &&
      birthPressure.dominantCount >= constants.monocultureReproductionLimit &&
      creature.speciesId === birthPressure.dominantSpecies;
    if (
      birthSlots > 0 &&
      !dominantReproductionSuppressed &&
      canReproduce(creature, constants.reproductionEnergyThreshold)
    ) {
      const offspringEnergy = payReproductionCost(
        creature,
        constants.reproductionEnergyCost
      );

      const child = reproduceCreature(
        creature,
        rng,
        constants.mutationDrift,
        constants.defaultMutationRate,
        offspringEnergy
      );

      offspring.push(child);
      birthSlots--;
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
          detail: `${lineageDisplayName(
            creature.speciesId,
            creature.lineageId
          )} → ${lineageDisplayName(child.speciesId, child.lineageId)}`,
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
    checkAgeAndStarvation(
      creature,
      constants.maxCreatureAgeTicks,
      constants.corpseDecayDurationTicks
    );
  }

  // Step 8.5: Biodiversity Pressure (density-dependent mortality and monoculture penalties)
  applyBiodiversityPressure(creatures, rng, constants);

  // Log death events for creatures that just died
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && aliveBeforeDeath.has(creature.id)) {
      // Deaths caused by feeding, metabolism, or biodiversity pressure do not
      // pass through checkAgeAndStarvation. Give every new corpse the same
      // configurable persistence window before decomposition removes it.
      if (creature.corpseDecayTicks <= 0) {
        creature.corpseDecayTicks = constants.corpseDecayDurationTicks;
      }
      newEvents.push({
        type: 'death',
        tick: state.tick,
        creatureId: creature.id,
        speciesId: creature.speciesId,
      });
    }
  }

  // Step 9: Decomposition
  dissipateToxicity(newWorld, constants.toxicityRetention);
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks > 0) {
      decayCorpse(
        creature,
        newWorld,
        constants.corpseDecayRate,
        constants.corpseToxicityPerTick,
        constants.corpseToxicityRadius
      );
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
 * Apply a changed solar baseline without discarding energy added by nutrient recycling.
 * The world stores solar and recycled energy together, so each cell receives only the
 * difference between its previous and next deterministic solar grids.
 */
function applyLiveSolarConstants(
  world: World,
  previous: SimulationConstants,
  next: SimulationConstants
): void {
  if (
    previous.baseSolarEnergy === next.baseSolarEnergy &&
    previous.solarEdgeFalloffFactor === next.solarEdgeFalloffFactor &&
    previous.solarFalloffExponent === next.solarFalloffExponent
  ) {
    return;
  }

  const previousSolar = computeSolarEnergyGrid({
    ...previous,
    worldWidth: world.width,
    worldHeight: world.height,
  });
  const nextSolar = computeSolarEnergyGrid(next);

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        energy: Math.max(0, cell.energy + nextSolar[y][x] - previousSolar[y][x]),
      });
    }
  }
}

interface PopulationPressure {
  dominantSpecies: string | null;
  dominantCount: number;
  isMonopoly: boolean;
}

function getPopulationPressure(
  aliveCreatures: Creature[],
  constants: SimulationConstants
): PopulationPressure {
  const speciesCounts = new Map<string, number>();
  for (const creature of aliveCreatures) {
    speciesCounts.set(creature.speciesId, (speciesCounts.get(creature.speciesId) || 0) + 1);
  }

  let dominantSpecies: string | null = null;
  let dominantCount = 0;
  for (const [speciesId, count] of speciesCounts) {
    if (count > dominantCount) {
      dominantSpecies = speciesId;
      dominantCount = count;
    }
  }

  return {
    dominantSpecies,
    dominantCount,
    isMonopoly:
      aliveCreatures.length > 0 &&
      dominantCount / aliveCreatures.length > constants.monocultureDominanceThreshold,
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

  const pressure = getPopulationPressure(aliveCreatures, constants);

  // Check if population exceeds carrying capacity
  const isOvercrowded = aliveCreatures.length > constants.maxGlobalPopulation;

  // Apply penalties
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;

    let mortalityBonus = 0;

    // Penalty for creatures in the dominant species during monopoly
    if (pressure.isMonopoly && creature.speciesId === pressure.dominantSpecies) {
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

  // Hard carrying capacity: deterministic partial Fisher-Yates selection avoids
  // stable array-order bias while guaranteeing oversized inputs return to cap.
  const survivors = creatures.filter((creature) => creature.lifecycleState === 'alive');
  const excess = Math.max(0, survivors.length - constants.maxGlobalPopulation);
  for (let index = 0; index < excess; index++) {
    const selected = index + Math.floor(rng() * (survivors.length - index));
    [survivors[index], survivors[selected]] = [survivors[selected], survivors[index]];
    survivors[index].lifecycleState = 'dead';
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
