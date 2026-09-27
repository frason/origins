import { World, type Biome, type Cell, type SubstrateType } from './world';
import { getProducerArchetype, getProducerTraits, type ProducerArchetype } from './producerTypes';
import { getSubstrateTraits } from './substrates';

import { PRODUCER_GROWTH_RATE } from '../utils/constants';
import { getToxicityHazard } from './toxicity';

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

/** Minimal bounded soil stock used by the Phase 4 nutrient cycle. */
export const NUTRIENT_CAPACITY_SHARE = 0.5;
export const NATURAL_NUTRIENT_RECOVERY_RATE = 0.003;
export const NUTRIENT_COST_PER_BIOMASS = 0.01;
export const PRODUCER_MAINTENANCE_RATE = 0.0006;

export function getNutrientCapacity(cell: Cell): number {
  return getProducerTraits(cell.producerArchetype).carryingCapacity * NUTRIENT_CAPACITY_SHARE;
}

/**
 * Calculate a suitability multiplier based on how well a value matches a preference range.
 * Within [min, max]: multiplier = 1.0
 * Outside range: multiplier decreases linearly with distance, asymptoting to ~0 at 2x distance.
 *
 * Formula: 1.0 / (1.0 + (distance / range_width)^2)
 * This creates smooth degradation without hard zeros.
 */
export function calculateSuitabilityMultiplier(value: number, min: number, max: number): number {
  if (value >= min && value <= max) {
    return 1.0; // Optimal range
  }

  const rangeWidth = Math.max(0.01, max - min);
  const distance = value < min ? min - value : value - max;
  // Quadratic falloff: multiplier = 1 / (1 + (distance/rangeWidth)^2)
  const falloff = Math.pow(distance / rangeWidth, 2);
  return 1.0 / (1.0 + falloff);
}

/**
 * Calculate the substrate affinity multiplier for a producer archetype.
 * Based on the archetype's substrate affinity table and the cell's substrate type.
 * Also considers energy type affinity from substrate traits.
 *
 * Formula: archetype substrate affinity × energy affinity for substrate
 */
export function calculateSubstrateAffinityMultiplier(
  archetype: ProducerArchetype,
  substrate: SubstrateType,
  energyType: EnergyType
): number {
  const archetypeTraits = getProducerTraits(archetype);
  const substrateTraits = getSubstrateTraits(substrate);

  const archetypeAffinity = archetypeTraits.substrateAffinity[substrate] || 1.0;
  const energyAffinity = substrateTraits.energyAffinity[energyType] || 1.0;

  return archetypeAffinity * energyAffinity;
}

/**
 * Calculate water suitability multiplier based on water depth preference.
 */
export function calculateWaterSuitabilityMultiplier(
  archetype: ProducerArchetype,
  waterDepth: number
): number {
  const traits = getProducerTraits(archetype);
  return calculateSuitabilityMultiplier(
    waterDepth,
    traits.waterDepthPreference.min,
    traits.waterDepthPreference.max
  );
}

/**
 * Calculate salinity suitability multiplier based on salinity preference.
 */
export function calculateSalinitySuitabilityMultiplier(
  archetype: ProducerArchetype,
  salinity: number
): number {
  const traits = getProducerTraits(archetype);
  return calculateSuitabilityMultiplier(
    salinity,
    traits.salinityPreference.min,
    traits.salinityPreference.max
  );
}

/**
 * Calculate moisture suitability multiplier based on moisture preference.
 */
export function calculateMoistureSuitabilityMultiplier(
  archetype: ProducerArchetype,
  moisture: number
): number {
  const traits = getProducerTraits(archetype);
  return calculateSuitabilityMultiplier(
    moisture,
    traits.moisturePreference.min,
    traits.moisturePreference.max
  );
}

/**
 * Calculate one cell's bounded growth without mutating it. Producer growth is
 * fastest after depletion and slows continuously as local biomass approaches
 * the relevant carrying capacity.
 */
export function calculateProducerGrowth(
  cell: Cell,
  energyType: EnergyType,
  growthRate: number = PRODUCER_GROWTH_RATE,
  useBiomeProductivity: boolean = false,
  useNutrientCycle: boolean = false
): {
  growth: number;
  carryingCapacity: number;
  nextBiomass: number;
  nextNutrients: number;
  maintenanceLoss: number;
} {
  const energyMultiplier = ENERGY_TYPE_MULTIPLIERS[energyType];
  const biomeMultiplier = useBiomeProductivity ? getBiomeProductivity(cell.biome) : 1;
  const toxicityMultiplier = getToxicityHazard(cell.toxicity).producerGrowthMultiplier;

  // Substrate, water, salinity, and moisture suitability multipliers
  const substrateAffinityMultiplier = calculateSubstrateAffinityMultiplier(
    cell.producerArchetype,
    cell.substrate,
    energyType
  );
  const waterSuitabilityMultiplier = calculateWaterSuitabilityMultiplier(
    cell.producerArchetype,
    cell.waterDepth
  );
  const salinitySuitabilityMultiplier = calculateSalinitySuitabilityMultiplier(
    cell.producerArchetype,
    cell.salinity
  );
  const moistureSuitabilityMultiplier = calculateMoistureSuitabilityMultiplier(
    cell.producerArchetype,
    cell.moisture
  );

  const carryingCapacity = useBiomeProductivity
    ? getProducerTraits(cell.producerArchetype).carryingCapacity
    : MAX_PRODUCER_BIOMASS;
  const capacityRemaining = Math.max(
    0,
    1 - Math.max(0, cell.producerBiomass) / carryingCapacity
  );

  // Combined growth formula:
  // base growth × energy type efficiency × biome productivity × substrate affinity ×
  // water suitability × salinity suitability × moisture suitability ×
  // toxicity penalty × capacity remaining
  let potentialGrowth = growthRate * cell.energy * energyMultiplier
    * biomeMultiplier * toxicityMultiplier
    * substrateAffinityMultiplier * waterSuitabilityMultiplier
    * salinitySuitabilityMultiplier * moistureSuitabilityMultiplier
    * capacityRemaining;

  let nextNutrients = Math.max(0, cell.nutrients);
  let maintenanceLoss = 0;
  if (useNutrientCycle) {
    const nutrientCapacity = getNutrientCapacity(cell);
    nextNutrients = Math.min(
      nutrientCapacity,
      nextNutrients
        + nutrientCapacity * NATURAL_NUTRIENT_RECOVERY_RATE * toxicityMultiplier
    );
    const fertilityMultiplier = nutrientCapacity > 0
      ? 1 + nextNutrients / nutrientCapacity
      : 1;
    potentialGrowth *= fertilityMultiplier;
    const maintenanceNeed = Math.max(0, cell.producerBiomass) * PRODUCER_MAINTENANCE_RATE;
    const maintenancePaid = Math.min(nextNutrients, maintenanceNeed);
    nextNutrients -= maintenancePaid;
    maintenanceLoss = maintenanceNeed - maintenancePaid;
    potentialGrowth = Math.min(
      potentialGrowth,
      nextNutrients / NUTRIENT_COST_PER_BIOMASS
    );
    nextNutrients -= potentialGrowth * NUTRIENT_COST_PER_BIOMASS;
  }
  const nextBiomass = Math.max(
    0,
    Math.min(carryingCapacity, cell.producerBiomass - maintenanceLoss + potentialGrowth)
  );
  return {
    growth: nextBiomass - cell.producerBiomass,
    carryingCapacity,
    nextBiomass,
    nextNutrients,
    maintenanceLoss,
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
  useBiomeProductivity: boolean = false,
  useNutrientCycle: boolean = false
): void {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      const growth = calculateProducerGrowth(
        cell, energyType, growthRate, useBiomeProductivity, useNutrientCycle
      );
      world.setCell(x, y, {
        producerBiomass: growth.nextBiomass,
        nutrients: growth.nextNutrients,
      });
    }
  }
}
