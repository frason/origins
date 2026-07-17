import { Creature } from './creature';
import { Cell, World } from './world';
import {
  BASE_METABOLISM,
  FEEDING_EFFICIENCY,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
  SCAVENGING_RATE,
} from '../utils/constants';
import { getProducerTraits } from './producerTypes';

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
  const biomassConsumed = useArchetypeTraits
    ? availableBiomass * (1 - traits.defense)
    : availableBiomass;

  // Calculate energy gained with feeding efficiency
  const energyDensity = useArchetypeTraits ? traits.energyDensity : 1;
  const energyGained = biomassConsumed * feedingEfficiency * energyDensity;

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
  // Mark prey as dead
  prey.lifecycleState = 'dead';

  // Calculate energy transfer with feeding efficiency
  const energyTransferred = prey.energy * feedingEfficiency;

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

  const consumedEnergy = corpse.energy * Math.max(0, Math.min(1, scavengingRate));
  corpse.energy -= consumedEnergy;
  corpse.corpseDecayTicks = Math.max(0, corpse.corpseDecayTicks - 3);
  const energyTransferred = consumedEnergy * feedingEfficiency;
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
): void {
  creature.energy -= cost;
}
