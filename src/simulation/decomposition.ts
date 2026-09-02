import { Creature } from './creature';
import { World, wrapCoordinate, type Cell } from './world';
import type { SimulationConstants } from '../utils/constants';
import {
  MAX_CREATURE_AGE_TICKS,
  CORPSE_DECAY_RATE,
  CORPSE_DECAY_DURATION_TICKS,
  CORPSE_TOXICITY_PER_TICK,
  CORPSE_TOXICITY_RADIUS,
  TOXICITY_RETENTION,
  MAX_CORPSE_BIOMASS_PER_CELL,
  DECOMPOSER_TEMP_OPTIMUM,
  DECOMPOSER_TEMP_SENSITIVITY,
  DECOMPOSER_MOISTURE_OPTIMUM,
  DECOMPOSER_MOISTURE_SENSITIVITY,
  DECOMPOSER_TOXICITY_INHIBITION,
  DECOMPOSER_BIOMASS_SATURATION_SCALE,
} from '../utils/constants';
import { getNutrientCapacity } from './producer';
import { getCorpseDecayStage } from './toxicity';

/**
 * Check if a creature should die from age or starvation.
 * If creature age >= MAX_CREATURE_AGE_TICKS or energy <= 0:
 * - Set lifecycleState to 'dead'
 * - Start the corpse persistence timer
 *
 * @param creature - the creature to check
 */
export function checkAgeAndStarvation(
  creature: Creature,
  maxAge: number = MAX_CREATURE_AGE_TICKS,
  corpseDuration: number = CORPSE_DECAY_DURATION_TICKS
): void {
  if (creature.age >= maxAge || creature.energy <= 0) {
    creature.lifecycleState = 'dead';
    creature.corpseDecayTicks = corpseDuration;
  }
}

/**
 * Decay a dead creature's corpse over multiple ticks.
 * Each tick:
 * - Decrement corpseDecayTicks
 * - Convert CORPSE_DECAY_RATE of remaining corpse energy into nutrients
 *
 * When corpseDecayTicks reaches 0 or below, the corpse has fully decomposed
 * and the creature can be removed from the simulation.
 *
 * @param creature - the dead creature whose corpse is decaying
 * @param world - the world to add nutrients to
 */
export function decayCorpse(
  creature: Creature,
  world: World,
  decayRate: number = CORPSE_DECAY_RATE,
  toxicityPerTick: number = CORPSE_TOXICITY_PER_TICK,
  toxicityRadius: number = CORPSE_TOXICITY_RADIUS,
  decayDuration: number = CORPSE_DECAY_DURATION_TICKS
): void {
  // Decrement decay ticks
  creature.corpseDecayTicks--;

  // Add nutrients to the cell based on remaining energy
  const nutrientsToAdd = Math.min(creature.energy, creature.energy * Math.max(0, decayRate));
  creature.energy -= nutrientsToAdd;
  const cell = world.getCell(creature.x, creature.y);
  world.setCell(creature.x, creature.y, {
    nutrients: Math.min(getNutrientCapacity(cell), cell.nutrients + nutrientsToAdd),
  });

  const radius = Math.max(0, Math.floor(toxicityRadius));
  const stageMultiplier = getCorpseDecayStage(
    creature.corpseDecayTicks, decayDuration
  ).hazardMultiplier;
  for (let y = Math.max(0, creature.y - radius); y <= Math.min(world.height - 1, creature.y + radius); y++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      const x = wrapCoordinate(creature.x + offsetX, world.width);
      const distance = Math.hypot(offsetX, y - creature.y);
      if (distance > radius) continue;
      const falloff = radius === 0 ? 1 : 1 - distance / (radius + 1);
      const affectedCell = world.getCell(x, y);
      world.setCell(x, y, {
        toxicity: affectedCell.toxicity + toxicityPerTick * stageMultiplier * falloff,
      });
    }
  }
}

/**
 * Calculate decomposer activity for a cell based on environmental conditions and available corpse matter.
 * Decomposer activity is deterministic and driven by:
 * - Temperature (optimal range configurable, minimal at extremes)
 * - Moisture (optimal range configurable, minimal when dry)
 * - Toxicity (inhibits decomposition exponentially)
 * - Available corpse biomass
 *
 * @param temperature - cell temperature (0-1)
 * @param moisture - cell moisture (0-1)
 * @param toxicity - cell toxicity level (0-1+)
 * @param corpseBiomass - available corpse biomass to decompose
 * @param constants - simulation constants (optional, uses defaults if not provided)
 * @returns decomposer activity rate (0-1)
 */
export function calculateDecomposerActivity(
  temperature: number,
  moisture: number,
  toxicity: number,
  corpseBiomass: number,
  constants?: Partial<SimulationConstants>
): number {
  // Early exit if no corpses to decompose
  if (corpseBiomass <= 0) return 0;

  // Use default or provided constants
  const tempOptimum = constants?.decomposerTempOptimum ?? DECOMPOSER_TEMP_OPTIMUM;
  const tempSensitivity = constants?.decomposerTempSensitivity ?? DECOMPOSER_TEMP_SENSITIVITY;
  const moistureOptimum = constants?.decomposerMoistureOptimum ?? DECOMPOSER_MOISTURE_OPTIMUM;
  const moistureSensitivity = constants?.decomposerMoistureSensitivity ?? DECOMPOSER_MOISTURE_SENSITIVITY;
  const toxicityInhibitionRate = constants?.decomposerToxicityInhibition ?? DECOMPOSER_TOXICITY_INHIBITION;
  const biomassSaturationScale = constants?.decomposerBiomassSaturationScale ?? DECOMPOSER_BIOMASS_SATURATION_SCALE;

  // Temperature bell curve: optimal at tempOptimum, falls off at extremes
  const tempCurve = Math.max(0, 1 - Math.pow((temperature - tempOptimum) * tempSensitivity, 2));

  // Moisture curve: optimal at moistureOptimum, minimal when dry or saturated
  const moistureCurve = Math.max(0, 1 - Math.pow((moisture - moistureOptimum) * moistureSensitivity, 2));

  // Toxicity inhibition: exponential falloff as toxicity rises
  const toxicityInhibition = Math.max(0, Math.exp(-Math.max(0, toxicity) * toxicityInhibitionRate));

  // Base activity is a product of environmental factors (0-1)
  // Add a small baseline (0.001) to ensure some minimum decomposition even at extreme conditions
  const baseActivity = Math.max(0.001, tempCurve * moistureCurve * toxicityInhibition);

  // Availability factor: more biomass increases activity slightly, but with diminishing returns
  // Use log scale to avoid saturation
  const availabilityFactor = Math.min(1, Math.log(1 + corpseBiomass) / Math.log(biomassSaturationScale));

  // Combined activity: base conditions × availability (both 0-1, result is 0-1)
  return baseActivity * availabilityFactor;
}

/**
 * Process decomposition for a single cell: consume corpse biomass and return nutrients.
 * Mutates the cell in place. Caller is responsible for persisting changes via world.setCell().
 * Returns the amount of biomass consumed for tracking creature energy depletion.
 *
 * @param cell - cell to process decomposition for (mutated)
 * @param decomposerActivity - (0-1) rate at which decomposition occurs
 * @param baseDecompositionRate - baseline proportion of corpse consumed per tick
 * @returns amount of corpse biomass consumed (for syncing with creature.energy)
 */
export function processDecomposition(
  cell: Cell,
  decomposerActivity: number,
  baseDecompositionRate: number = CORPSE_DECAY_RATE
): number {
  if (!cell.corpseBiomass || cell.corpseBiomass <= 0 || decomposerActivity <= 0) {
    return 0;
  }

  // Scale decay rate by decomposer activity
  const scaledDecayRate = baseDecompositionRate * decomposerActivity;

  // Consume corpse biomass
  const biomassConsumed = Math.min(
    cell.corpseBiomass,
    cell.corpseBiomass * scaledDecayRate
  );

  // Convert consumed biomass to nutrients (100% recovery)
  const nutrientsRecovered = biomassConsumed;

  // Update cell state (in-place mutation)
  cell.corpseBiomass -= biomassConsumed;
  cell.nutrients = Math.min(getNutrientCapacity(cell), cell.nutrients + nutrientsRecovered);

  return biomassConsumed;
}

/**
 * Aggregate corpse biomass from dead creatures to their tiles.
 * This function resets all cells' corpseBiomass to 0 at the start, then sums the energy
 * of all dead creatures to their respective tiles. This ensures a fresh aggregation each
 * tick without stale biomass carryover.
 *
 * After aggregation, corpseDecayTicks is set to corpseDuration to mark creatures as processed.
 * Capped per cell at MAX_CORPSE_BIOMASS_PER_CELL to prevent unlimited accumulation.
 *
 * @param creatures - all creatures in the world
 * @param world - the world to update
 * @param corpseDuration - the configured corpse decay duration (for marking as processed)
 */
export function aggregateCorpseBiomass(
  creatures: Creature[],
  world: World,
  corpseDuration: number = CORPSE_DECAY_DURATION_TICKS
): void {
  // Reset all cells' corpseBiomass to 0 to start fresh aggregation
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      world.setCell(x, y, { corpseBiomass: 0 });
    }
  }

  // Aggregate dead creatures' energy to their tiles
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.energy > 0) {
      const cell = world.getCell(creature.x, creature.y);
      const newBiomass = Math.min(
        MAX_CORPSE_BIOMASS_PER_CELL,
        (cell.corpseBiomass || 0) + creature.energy
      );
      world.setCell(creature.x, creature.y, { corpseBiomass: newBiomass });
    }
  }
}

/**
 * Decrement corpse decay timers and spread toxicity from decaying corpses.
 * This replaces the "legacy corpse decay" loop, focusing only on the toxicity/timer aspect.
 * The actual nutrient conversion is handled by processDecomposition() via the aggregated field.
 *
 * @param creature - the dead creature whose corpse is decaying
 * @param world - the world to add toxicity to
 * @param toxicityPerTick - toxicity deposited per tick
 * @param toxicityRadius - radius of toxicity spread
 * @param decayDuration - total duration of corpse persistence
 */
export function applyCorpseToxicity(
  creature: Creature,
  world: World,
  toxicityPerTick: number = CORPSE_TOXICITY_PER_TICK,
  toxicityRadius: number = CORPSE_TOXICITY_RADIUS,
  decayDuration: number = CORPSE_DECAY_DURATION_TICKS
): void {
  const radius = Math.max(0, Math.floor(toxicityRadius));
  const stageMultiplier = getCorpseDecayStage(
    creature.corpseDecayTicks, decayDuration
  ).hazardMultiplier;
  for (let y = Math.max(0, creature.y - radius); y <= Math.min(world.height - 1, creature.y + radius); y++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      const x = wrapCoordinate(creature.x + offsetX, world.width);
      const distance = Math.hypot(offsetX, y - creature.y);
      if (distance > radius) continue;
      const falloff = radius === 0 ? 1 : 1 - distance / (radius + 1);
      const affectedCell = world.getCell(x, y);
      world.setCell(x, y, {
        toxicity: affectedCell.toxicity + toxicityPerTick * stageMultiplier * falloff,
      });
    }
  }
}

/**
 * Decrement creature corpse decay timers (should be called after taxicity is applied).
 * @param creatures - dead creatures in the world
 */
export function decrementCorpseDecayTimers(creatures: Creature[]): void {
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks > 0) {
      creature.corpseDecayTicks--;
    }
  }
}

/**
 * Sync creature energy with consumed corpse biomass.
 * When processDecomposition() consumes biomass from a cell, we need to decrement the
 * corresponding creatures' energy proportionally. This function proportionally distributes
 * the consumed biomass among all dead creatures on the cell.
 *
 * @param x - cell x coordinate
 * @param y - cell y coordinate
 * @param biomassConsumed - amount of biomass consumed from the cell
 * @param creatures - list of creatures to decrement energy from
 */
export function syncCreatureEnergyWithDecomposition(
  x: number,
  y: number,
  biomassConsumed: number,
  creatures: Creature[]
): void {
  if (biomassConsumed <= 0) return;

  // Find all dead creatures on this cell
  const deadOnCell = creatures.filter(
    (c) => c.lifecycleState === 'dead' && c.x === x && c.y === y && c.energy > 0
  );

  if (deadOnCell.length === 0) return;

  // Calculate total energy available on this cell
  const totalEnergy = deadOnCell.reduce((sum, c) => sum + c.energy, 0);
  if (totalEnergy <= 0) return;

  // Distribute consumed biomass proportionally among creatures
  let remainingToConsume = biomassConsumed;
  for (let i = 0; i < deadOnCell.length && remainingToConsume > 0; i++) {
    const creature = deadOnCell[i];
    const proportion = creature.energy / totalEnergy;
    const creatureConsumption = Math.min(
      creature.energy,
      biomassConsumed * proportion
    );
    creature.energy = Math.max(0, creature.energy - creatureConsumption);
    remainingToConsume -= creatureConsumption;
  }
}

/** Let old toxicity fade so die-offs leave a temporary ecological scar. */
export function dissipateToxicity(
  world: World,
  retention: number = TOXICITY_RETENTION
): void {
  const clampedRetention = Math.max(0, Math.min(1, retention));
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      if (cell.toxicity !== 0) {
        world.setCell(x, y, { toxicity: cell.toxicity * clampedRetention });
      }
    }
  }
}

/**
 * Keep recycled nutrients within each habitat's bounded soil stock. Solar
 * energy remains a renewable flux; producers consume this nutrient stock
 * directly during growth and maintenance.
 *
 * @param world - the world to process nutrient recycling for
 */
export function recycleNutrients(world: World): void {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      const boundedNutrients = Math.max(
        0,
        Math.min(getNutrientCapacity(cell), cell.nutrients)
      );
      if (boundedNutrients !== cell.nutrients) {
        world.setCell(x, y, {
          nutrients: boundedNutrients,
        });
      }
    }
  }
}
