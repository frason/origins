import { Creature } from './creature';
import { Cell, World } from './world';
import {
  BASE_METABOLISM,
  FEEDING_EFFICIENCY,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
  SCAVENGING_RATE,
  MAX_ENERGY_MULTIPLIER,
} from '../utils/constants';
import { getProducerTraits } from './producerTypes';

/** Size-based energy storage limit used by decisions and all feeding paths. */
export function getEnergyCapacity(creature: Creature): number {
  return Math.max(200, creature.traits.size * MAX_ENERGY_MULTIPLIER);
}

/**
 * Apply metabolism cost to a creature.
 * Deducts energy based on: BASE_METABOLISM × size × metabolism multiplier
 * If energy drops to 0 or below, marks creature as dead.
 *
 * @param creature - the creature to apply metabolism to
 */
export function applyMetabolism(
  creature: Creature,
  baseMetabolism: number = BASE_METABOLISM
): void {
  // Calculate metabolic cost: BASE_METABOLISM × size × metabolism multiplier
  const metabolicCost = baseMetabolism * creature.traits.size * creature.traits.metabolism;

  // Deduct energy
  creature.energy -= metabolicCost;

  // Mark creature as dead if energy depleted
  if (creature.energy <= 0) {
    creature.energy = 0;
    creature.lifecycleState = 'dead';
  }
}

/**
 * Herbivore/omnivore feeds on producer biomass in a cell.
 * Transfers biomass from cell to creature, applying feeding efficiency.
 * The creature can consume up to all available biomass in the cell.
 *
 * @param creature - the creature consuming producer biomass
 * @param cell - the cell to consume from (for read-only reference)
 * @param world - the world object to update cell state
 * @param x - x-coordinate of the cell
 * @param y - y-coordinate of the cell
 * @returns the amount of energy transferred to the creature
 */
export function feedOnProducer(
  creature: Creature,
  cell: Cell,
  world: World,
  x: number,
  y: number,
  feedingEfficiency: number = FEEDING_EFFICIENCY,
  useArchetypeTraits: boolean = false
): number {
  // Determine how much biomass is available
  const availableBiomass = cell.producerBiomass;

  if (availableBiomass <= 0) {
    return 0;
  }

  const traits = getProducerTraits(cell.producerArchetype);
  const edibleBiomass = useArchetypeTraits
    ? availableBiomass * (1 - traits.defense)
    : availableBiomass;

  // Calculate energy gained with feeding efficiency
  const energyDensity = useArchetypeTraits ? traits.energyDensity : 1;
  const transferRate = feedingEfficiency * energyDensity;
  const biomassConsumed = transferRate > 0 ? edibleBiomass : 0;
  const energyGained = biomassConsumed * transferRate;

  // Transfer energy to creature
  creature.energy += energyGained;

  // Remove biomass from cell
  world.setCell(x, y, { producerBiomass: availableBiomass - biomassConsumed });

  return energyGained;
}

/**
 * Carnivore/omnivore feeds on another creature (prey).
 * Transfers prey energy to predator with feeding efficiency.
 * Marks the prey creature as dead.
 *
 * @param predator - the creature doing the hunting
 * @param prey - the creature being hunted
 * @returns the amount of energy transferred to the predator
 */
export function feedOnCreature(
  predator: Creature,
  prey: Creature,
  feedingEfficiency: number = FEEDING_EFFICIENCY
): number {
  // Mark prey as dead, then transfer only energy the predator can store.
  prey.lifecycleState = 'dead';
  const efficiency = Math.max(0, Math.min(1, feedingEfficiency));
  const energyTransferred = prey.energy * efficiency;
  const preyEnergyConsumed = efficiency > 0 ? energyTransferred / efficiency : 0;
  prey.energy = Math.max(0, prey.energy - preyEnergyConsumed);

  // Transfer energy to predator
  predator.energy += energyTransferred;

  return energyTransferred;
}

/** Consume part of a corpse, reducing its toxic lifetime and transferring energy. */
export function feedOnCorpse(
  scavenger: Creature,
  corpse: Creature,
  feedingEfficiency: number = FEEDING_EFFICIENCY,
  scavengingRate: number = SCAVENGING_RATE
): number {
  if (corpse.lifecycleState === 'alive' || corpse.energy <= 0) return 0;

  const efficiency = Math.max(0, Math.min(1, feedingEfficiency));
  const energyHeadroom = Math.max(0, getEnergyCapacity(scavenger) - scavenger.energy);
  const availableEnergy = corpse.energy * Math.max(0, Math.min(1, scavengingRate));
  const consumedEnergy = efficiency > 0
    ? Math.min(availableEnergy, energyHeadroom / efficiency)
    : 0;
  corpse.energy -= consumedEnergy;
  corpse.corpseDecayTicks = Math.max(0, corpse.corpseDecayTicks - 3);
  const energyTransferred = consumedEnergy * efficiency;
  scavenger.energy += energyTransferred;
  return energyTransferred;
}

/**
 * Check if a creature can reproduce.
 * Returns true if creature has sufficient energy and is alive.
 *
 * @param creature - the creature to check
 * @returns true if creature can reproduce, false otherwise
 */
export function canReproduce(
  creature: Creature,
  threshold: number = REPRODUCTION_ENERGY_THRESHOLD
): boolean {
  return creature.energy >= threshold && creature.lifecycleState === 'alive';
}

/**
 * Deduct the reproduction cost from a creature's energy.
 * Assumes the creature has already passed canReproduce() check.
 *
 * @param creature - the creature paying the reproduction cost
 */
export function payReproductionCost(
  creature: Creature,
  cost: number = REPRODUCTION_ENERGY_COST
): number {
  const energyPaid = Math.min(creature.energy, Math.max(0, cost));
  creature.energy -= energyPaid;
  return energyPaid;
}
