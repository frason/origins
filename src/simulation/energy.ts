import { Creature } from './creature';
import { Cell, World } from './world';
import {
  BASE_METABOLISM,
  FEEDING_EFFICIENCY,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
  SCAVENGING_RATE,
  MAX_ENERGY_MULTIPLIER,
  type SimulationConstants,
} from '../utils/constants';
import { getProducerTraits } from './producerTypes';
import { metabolicPerformanceMultiplier, DEFAULT_TRAITS } from '../utils/traits';

/** Size-based energy storage limit used by decisions and all feeding paths. */
export function getEnergyCapacity(creature: Creature): number {
  return Math.max(200, creature.traits.size * MAX_ENERGY_MULTIPLIER);
}

/** Physical producer biomass a creature can harvest in one tick. */
export function getProducerBiteCapacity(creature: Pick<Creature, 'traits'>): number {
  const size = Math.max(0.1, creature.traits.size);
  const speed = Math.max(0.1, creature.traits.speed);
  return Math.max(
    1,
    Math.min(100, size * (16 + speed * 4) * metabolicPerformanceMultiplier(creature.traits.metabolism))
  );
}

/**
 * Apply metabolism cost to a creature.
 * Deducts energy based on:
 * - BASE_METABOLISM × size × metabolism multiplier (core cost)
 * - Brain size cost: +5% per point ABOVE default (neural tissue maintenance)
 * - Hearing range cost: +2% per point ABOVE default (auditory organ maintenance)
 * - Auditory stealth cost: +10% per point (precise motor control)
 *
 * Surcharges only apply to trait values ABOVE defaults, so DEFAULT_TRAITS
 * creatures don't incur the added costs—preserving existing test expectations.
 *
 * If energy drops to 0 or below, marks creature as dead.
 *
 * @param creature - the creature to apply metabolism to
 * @param baseMetabolism - base metabolism constant (for testing)
 */
export function applyMetabolism(
  creature: Creature,
  baseMetabolism: number = BASE_METABOLISM
): void {
  // Core metabolic cost: BASE_METABOLISM × size × metabolism multiplier × stalking multiplier
  const baseCost =
    baseMetabolism *
    creature.traits.size *
    creature.traits.metabolism *
    creature.stalkingMetabolismMultiplier;

  // Additional costs for sensory/cognitive traits
  // Brain size: +5% per point ABOVE default (neural tissue is metabolically expensive)
  const brainSizeAboveDefault = Math.max(0, creature.traits.brainSize - DEFAULT_TRAITS.brainSize);
  const brainSizeCost = baseCost * brainSizeAboveDefault * 0.05;

  // Hearing range: +2% per point ABOVE default (auditory organs require maintenance)
  const hearingRangeAboveDefault = Math.max(0, creature.traits.hearingRange - DEFAULT_TRAITS.hearingRange);
  const hearingCost = baseCost * hearingRangeAboveDefault * 0.02;

  // Auditory stealth: +10% per point (requires precise muscular control)
  const auditoryStealthCost = baseCost * creature.traits.auditorySteal * 0.1;

  // Total metabolic deduction
  const totalCost = baseCost + brainSizeCost + hearingCost + auditoryStealthCost;

  // Deduct energy
  creature.energy -= totalCost;

  // Mark creature as dead if energy depleted
  if (creature.energy <= 0) {
    creature.energy = 0;
    creature.lifecycleState = 'dead';
  }
}

/**
 * Herbivore/omnivore feeds on producer biomass in a cell.
 * Transfers biomass from cell to creature, applying feeding efficiency.
 * Consumption is limited by available edible biomass, energy headroom, and
 * the creature's size/speed-derived harvesting capacity.
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
  const transferRate = Math.max(0, Math.min(1, feedingEfficiency)) * energyDensity;
  const energyHeadroom = Math.max(0, getEnergyCapacity(creature) - creature.energy);
  const biomassConsumed = transferRate > 0
    ? Math.min(
        edibleBiomass,
        energyHeadroom / transferRate,
        getProducerBiteCapacity(creature)
      )
    : 0;
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
  threshold: number = REPRODUCTION_ENERGY_THRESHOLD,
  maturityAge: number = 0,
  cooldownTicks: number = 0
): boolean {
  const cooldownComplete = creature.lastReproductionAge === null
    || creature.age - creature.lastReproductionAge >= cooldownTicks;
  return creature.energy >= threshold
    && creature.lifecycleState === 'alive'
    && creature.age >= maturityAge
    && cooldownComplete;
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

/**
 * Determine if a creature is adjacent to water suitable for drinking.
 * Fresh water (waterDepth > 0, low salinity) is always drinkable.
 * Saline water (salinity > 0) is drinkable only if creature has saltTolerance.
 *
 * @param creature - the creature to check
 * @param world - the world grid
 * @returns true if adjacent to drinkable water
 */
export function isAdjacentToDrinkableWater(creature: Creature, world: World): boolean {
  const adjacentCells = [
    { x: creature.x - 1, y: creature.y },
    { x: creature.x + 1, y: creature.y },
    { x: creature.x, y: creature.y - 1 },
    { x: creature.x, y: creature.y + 1 },
  ];

  for (const { x, y } of adjacentCells) {
    // Boundary check
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) {
      continue;
    }

    const cell = world.getCell(x, y);

    // Fresh water is always drinkable
    if (cell.waterDepth > 0 && cell.salinity < 0.1) {
      return true;
    }

    // Saline water is drinkable only if creature has salt tolerance
    if (cell.waterDepth > 0 && cell.salinity >= 0.1 && creature.traits.saltTolerance > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Apply hydration decline per tick based on creature's waterNeed trait.
 * Hydration is a 0-1 meter, declining each tick.
 *
 * @param creature - the creature to dehydrate
 * @param depletionRate - base hydration loss per tick
 */
export function applyHydrationDecline(
  creature: Creature,
  depletionRate: number = 0.1
): void {
  const decline = depletionRate * creature.traits.waterNeed;
  creature.hydration = Math.max(0, creature.hydration - decline);
}

/**
 * Creature drinks drinkable water, restoring hydration.
 * For fresh water: full recovery based on hydrationRecoveryFresh constant.
 * For saline water: partial recovery based on saltTolerance and hydrationRecoverySalineMultiplier.
 *
 * @param creature - the creature drinking
 * @param world - the world grid
 * @param constants - simulation constants (for recovery rates)
 * @returns amount of hydration restored (0-1)
 */
export function drinkWater(
  creature: Creature,
  world: World,
  constants: Pick<SimulationConstants, 'hydrationRecoveryFresh' | 'hydrationRecoverySalineMultiplier'>
): number {
  const adjacentCells = [
    { x: creature.x - 1, y: creature.y },
    { x: creature.x + 1, y: creature.y },
    { x: creature.x, y: creature.y - 1 },
    { x: creature.x, y: creature.y + 1 },
  ];

  // Scan all adjacent cells to find the best water source
  let bestFreshWater: { x: number; y: number } | null = null;
  let bestSalineWater: { x: number; y: number; salinity: number } | null = null;

  for (const { x, y } of adjacentCells) {
    // Boundary check
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) {
      continue;
    }

    const cell = world.getCell(x, y);

    // Fresh water (salinity < 0.1): full recovery
    if (cell.waterDepth > 0 && cell.salinity < 0.1) {
      bestFreshWater = { x, y };
      break; // Found fresh water, prefer it and stop scanning
    }

    // Saline water (salinity >= 0.1): partial recovery based on salt tolerance
    if (cell.waterDepth > 0 && cell.salinity >= 0.1 && creature.traits.saltTolerance > 0) {
      // Keep the freshest (least salty) saline water as backup
      if (!bestSalineWater || cell.salinity < bestSalineWater.salinity) {
        bestSalineWater = { x, y, salinity: cell.salinity };
      }
    }
  }

  // Use fresh water if available
  if (bestFreshWater) {
    const restored = Math.min(1 - creature.hydration, constants.hydrationRecoveryFresh);
    creature.hydration = Math.min(1, creature.hydration + restored);
    return restored;
  }

  // Fall back to saline water
  if (bestSalineWater) {
    const recovery = constants.hydrationRecoverySalineMultiplier * creature.traits.saltTolerance;
    const restored = Math.min(1 - creature.hydration, recovery);
    creature.hydration = Math.min(1, creature.hydration + restored);

    // Low salt tolerance creatures accrue toxicity from saline water
    const salinity = Math.max(0, Math.min(1, bestSalineWater.salinity));
    const toxicityDamage = (1 - creature.traits.saltTolerance) * salinity * 0.5;
    creature.toxinExposure += toxicityDamage;
    return restored;
  }

  return 0;
}

/**
 * Apply metabolism penalty for low hydration.
 * Low hydration increases energy cost before causing death.
 * The penalty scales from 0 (full hydration) to maximum (zero hydration).
 *
 * @param creature - the creature to apply penalty to
 * @param baseCost - the base metabolic cost already calculated
 * @param threshold - hydration level below which penalty starts (0-1)
 * @param maxPenaltyMultiplier - maximum additional cost multiplier at zero hydration
 * @returns additional energy cost from hydration penalty
 */
export function getHydrationMetabolismPenalty(
  creature: Creature,
  baseCost: number,
  threshold: number = 0.3,
  maxPenaltyMultiplier: number = 1.5
): number {
  if (creature.hydration >= threshold) {
    return 0;
  }

  // Scale penalty from 0 (at threshold) to maxPenaltyMultiplier (at zero hydration)
  const deprivationRatio = (threshold - creature.hydration) / threshold;
  const penaltyMultiplier = deprivationRatio * (maxPenaltyMultiplier - 1);
  return baseCost * penaltyMultiplier;
}

/**
 * Check if hydration deprivation should cause death.
 * Death only occurs after prolonged deprivation (prolonged at zero hydration),
 * not from a single tick of low hydration.
 *
 * @param creature - the creature to check
 * @param deathThreshold - hydration level that triggers mortality (typically 0)
 * @param criticalMortalityRate - probability of death per tick at critical hydration
 * @param rng - random number generator for death chance
 * @returns true if the creature should die
 */
export function shouldDieFromHydration(
  creature: Creature,
  deathThreshold: number = 0.0,
  criticalMortalityRate: number = 0.02,
  rng: () => number = Math.random
): boolean {
  // Only check at critical hydration (zero or near-zero)
  if (creature.hydration > deathThreshold) {
    return false;
  }

  // Apply probabilistic death only at critical threshold
  return rng() < criticalMortalityRate;
}
