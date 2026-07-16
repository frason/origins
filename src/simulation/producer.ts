import { World } from './world';
import type { Biome } from './world';

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
  return BIOME_PRODUCTIVITY[biome];
}

/**
 * Maximum biomass cap per cell.
 * Prevents unbounded producer accumulation and creates carrying capacity.
 */
export const MAX_PRODUCER_BIOMASS = 100;

/**
 * Update all cell producer biomass based on available energy and energy type.
 *
 * Per tick, each cell's producer biomass grows by:
 *   growth = PRODUCER_GROWTH_RATE × cell.energy × energyTypeMultiplier
 *
 * Growth is capped at MAX_PRODUCER_BIOMASS to prevent unbounded growth.
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
  const multiplier = ENERGY_TYPE_MULTIPLIERS[energyType];

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      // Calculate growth amount: rate × energy × multiplier
      const biomeMultiplier = useBiomeProductivity ? getBiomeProductivity(cell.biome) : 1;
      const growth = growthRate * cell.energy * multiplier * biomeMultiplier;

      // Update biomass and cap at maximum
      const newBiomass = Math.min(cell.producerBiomass + growth, MAX_PRODUCER_BIOMASS);

      world.setCell(x, y, { producerBiomass: newBiomass });
    }
  }
}
