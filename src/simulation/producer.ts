import { World, type Biome, type Cell } from './world';
import { getProducerArchetype, getProducerTraits } from './producerTypes';

import { PRODUCER_GROWTH_RATE } from '../utils/constants';

/**
 * Enumeration of energy types available in the world.
 * Each energy type has different photosynthetic/chemosynthetic efficiency.
 */
export type EnergyType = 'solar' | 'geothermal' | 'chemical' | 'radioactive' | 'mixed';

/**
 * Growth multipliers for each energy type.
 * Represents efficiency of biomass production from available energy.
 *
 * - Solar (1.0): Standard photosynthesis, most efficient
 * - Mixed (0.8): Balanced mix of energy sources
 * - Geothermal (0.7): Chemosynthesis in volcanic regions
 * - Chemical (0.5): Limited nutrient availability
 * - Radioactive (0.3): Exotic radiochemical synthesis, least efficient
 */
export const ENERGY_TYPE_MULTIPLIERS: Record<EnergyType, number> = {
  solar: 1.0,
  mixed: 0.8,
  geothermal: 0.7,
  chemical: 0.5,
  radioactive: 0.3,
};

/** Relative producer productivity for each landscape niche. */
export const BIOME_PRODUCTIVITY: Record<Biome, number> = {
  ocean: 0.65,
  desert: 0.2,
  grassland: 1,
  forest: 1.2,
  wetland: 1.15,
  tundra: 0.35,
  mountain: 0.15,
};

export function getBiomeProductivity(biome: Biome): number {
  return getProducerTraits(getProducerArchetype(biome)).growthMultiplier;
}

/**
 * Maximum biomass cap per cell.
 * Prevents unbounded producer accumulation and creates carrying capacity.
 */
export const MAX_PRODUCER_BIOMASS = 100;

/**
 * Calculate one cell's bounded growth without mutating it. Producer growth is
 * fastest after depletion and slows continuously as local biomass approaches
 * the relevant carrying capacity.
 */
export function calculateProducerGrowth(
  cell: Cell,
  energyType: EnergyType,
  growthRate: number = PRODUCER_GROWTH_RATE,
  useBiomeProductivity: boolean = false
): { growth: number; carryingCapacity: number; nextBiomass: number } {
  const energyMultiplier = ENERGY_TYPE_MULTIPLIERS[energyType];
  const biomeMultiplier = useBiomeProductivity ? getBiomeProductivity(cell.biome) : 1;
  const toxicityMultiplier = 1 / (1 + Math.max(0, cell.toxicity));
  const carryingCapacity = useBiomeProductivity
    ? getProducerTraits(cell.producerArchetype).carryingCapacity
    : MAX_PRODUCER_BIOMASS;
  const capacityRemaining = Math.max(
    0,
    1 - Math.max(0, cell.producerBiomass) / carryingCapacity
  );
  const potentialGrowth = growthRate * cell.energy * energyMultiplier
    * biomeMultiplier * toxicityMultiplier * capacityRemaining;
  const nextBiomass = Math.max(
    0,
    Math.min(carryingCapacity, cell.producerBiomass + potentialGrowth)
  );
  return {
    growth: nextBiomass - cell.producerBiomass,
    carryingCapacity,
    nextBiomass,
  };
}

/**
 * Update all cell producer biomass based on available energy and energy type.
 *
 * Per tick, each cell's producer biomass grows by:
 *   growth = input × biome × toxicity × (1 - biomass / carryingCapacity)
 *
 * Growth is capped at the global or producer-archetype carrying capacity.
 * If a cell has zero energy, no biomass growth occurs.
 *
 * @param world - World instance to update
 * @param energyType - Type of energy driving producer growth
 */
export function growProducers(
  world: World,
  energyType: EnergyType,
  growthRate: number = PRODUCER_GROWTH_RATE,
  useBiomeProductivity: boolean = false
): void {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      const growth = calculateProducerGrowth(
        cell, energyType, growthRate, useBiomeProductivity
      );
      world.setCell(x, y, { producerBiomass: growth.nextBiomass });
    }
  }
}
