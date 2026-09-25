import type { SubstrateType } from './world';

/**
 * Substrate traits define how different soil types interact with water, nutrients, toxicity, and producers.
 * Used as a data-driven table rather than branching on substrate names throughout the codebase.
 */
export interface SubstrateTraits {
  nutrientRetention: number;    // 0-1: how well substrate holds nutrients
  waterRetention: number;       // 0-1: how well substrate holds water
  drainage: number;             // 0-1: drainage speed (inverse of retention)
  toxicityRetention: number;    // 0-1: how well substrate holds toxicity
  energyAffinity: Record<string, number>; // energy type -> growth multiplier
}

/**
 * Substrate generation tendency: scoring coefficients that determine likelihood of placement
 * based on environmental conditions.
 */
export interface SubstrateTendency {
  baseBias: number;           // baseline score
  elevationCoeff: number;     // multiplier for elevation condition
  slopeCoeff: number;         // multiplier for slope condition
  waterCoeff: number;         // multiplier for water depth condition
  temperatureCoeff: number;   // multiplier for temperature condition
  salinityCoeff: number;      // multiplier for salinity condition
  waterTableCoeff: number;    // multiplier for water table condition
  noiseCoeff: number;         // multiplier for noise/randomness
}

/**
 * Substrate generation rule: a conditional scoring bonus applied when environmental
 * conditions match specified ranges. Rules-based approach replaces hardcoded if/else
 * with a data-driven table of condition → substrate bonus mappings.
 */
export interface SubstrateGenerationRule {
  substrate: SubstrateType;
  // All specified conditions must be true for this rule to apply (AND logic)
  elevation?: [min: number, max: number];     // if specified, rule applies when elev in range
  slope?: [min: number, max: number];         // if specified, rule applies when slope in range
  waterDepth?: [min: number, max: number];    // if specified, rule applies when water in range
  temperature?: [min: number, max: number];   // if specified, rule applies when temp in range
  salinity?: [min: number, max: number];      // if specified, rule applies when salinity in range
  waterTable?: [min: number, max: number];    // if specified, rule applies when waterTable in range
  // Score bonus and scaling when all conditions match
  score: (condition: { elev: number; slope: number; water: number; temp: number; salinity: number; waterTable: number; }) => number;
}

/**
 * Data-driven substrate trait definitions.
 * Values represent tendency, not hardcoded rules.
 * Producers adjust growth rates based on substrate affinity.
 */
export const SUBSTRATE_TRAITS: Record<SubstrateType, SubstrateTraits> = {
  sand: {
    nutrientRetention: 0.2,
    waterRetention: 0.1,
    drainage: 0.9,
    toxicityRetention: 0.1,
    energyAffinity: {
      solar: 1.0,      // neutral
      chemical: 0.6,   // low affinity for chemical
      geothermal: 0.8,
      radioactive: 0.8,
      mixed: 0.8,
    },
  },
  loam: {
    nutrientRetention: 0.7,
    waterRetention: 0.5,
    drainage: 0.5,
    toxicityRetention: 0.6,
    energyAffinity: {
      solar: 1.0,      // broadly neutral
      chemical: 1.0,
      geothermal: 1.0,
      radioactive: 1.0,
      mixed: 1.0,
    },
  },
  clay: {
    nutrientRetention: 0.85,
    waterRetention: 0.8,
    drainage: 0.2,
    toxicityRetention: 0.8,
    energyAffinity: {
      solar: 1.0,      // neutral
      chemical: 1.3,   // high affinity for chemical
      geothermal: 0.8,
      radioactive: 0.8,
      mixed: 1.1,
    },
  },
  peat: {
    nutrientRetention: 0.95,
    waterRetention: 0.95,
    drainage: 0.1,
    toxicityRetention: 0.9,
    energyAffinity: {
      solar: 0.7,
      chemical: 1.2,   // high affinity for chemical
      geothermal: 0.6, // low affinity for geothermal
      radioactive: 0.7,
      mixed: 1.0,
    },
  },
  rock: {
    nutrientRetention: 0.0,
    waterRetention: 0.0,
    drainage: 1.0,
    toxicityRetention: 0.1,
    energyAffinity: {
      solar: 0.8,
      chemical: 0.8,
      geothermal: 1.3,  // high affinity for geothermal
      radioactive: 1.2, // high affinity for radioactive
      mixed: 1.1,
    },
  },
  sediment: {
    nutrientRetention: 0.75,
    waterRetention: 0.7,
    drainage: 0.3,
    toxicityRetention: 0.7,
    energyAffinity: {
      solar: 0.9,
      chemical: 1.2,   // high affinity for chemical
      geothermal: 1.0,
      radioactive: 1.0,
      mixed: 1.3,      // high affinity for mixed
    },
  },
};

/**
 * Get substrate traits for a given substrate type.
 * Provides safe access to the trait table.
 */
export function getSubstrateTraits(substrate: SubstrateType): SubstrateTraits {
  return SUBSTRATE_TRAITS[substrate];
}

/**
 * Data-driven substrate generation tendencies table.
 * Each substrate type has scoring coefficients that determine likelihood of placement
 * based on elevation, slope, water, temperature, salinity, water table, and noise.
 *
 * Coefficients are applied as: score = baseBias + coeff * condition, then normalized.
 * Values tuned to match design tendencies (e.g., rock on high elevation/slope,
 * sediment underwater, peat in cold/wet areas, sand in hot/dry areas).
 *
 * From design doc "Substrate distribution tendencies":
 * - rock: high elevation, high slope, low water
 * - sand: hot/dry, moderate elevation
 * - loam: broadly neutral conditions (fallback)
 * - clay: low elevation, low slope, wet conditions
 * - peat: very high water retention, cold + wet
 * - sediment: underwater, saline or chemical-rich
 */
export const SUBSTRATE_GENERATION_TENDENCIES: Record<SubstrateType, SubstrateTendency> = {
  rock: {
    baseBias: -9.0,             // strongly negative: rock only appears at high elevations
    elevationCoeff: 15.0,       // extremely strongly prefers high elevation (threshold ~0.6)
    slopeCoeff: 8.0,            // very strongly prefers steep slopes
    waterCoeff: -6.0,           // very strongly disfavors water
    temperatureCoeff: -0.5,     // slight preference for cooler
    salinityCoeff: -1.5,        // disfavors salinity
    waterTableCoeff: -5.0,      // very strongly disfavors water table
    noiseCoeff: 0.1,            // very low noise for determinism
  },
  sand: {
    baseBias: -1.0,             // reduced to de-emphasize at all elevations
    elevationCoeff: -0.8,       // prefers low-mid elevation
    slopeCoeff: -1.0,           // disfavors steep slopes (prefer flats)
    waterCoeff: -2.2,           // disfavors water
    temperatureCoeff: 1.8,      // strongly prefers heat
    salinityCoeff: 1.2,         // prefers saline (coastal)
    waterTableCoeff: -1.6,      // disfavors water table
    noiseCoeff: 0.7,            // high noise
  },
  loam: {
    baseBias: -0.5,             // reduced to de-emphasize
    elevationCoeff: 0.0,        // neutral on elevation
    slopeCoeff: -0.3,           // prefers gentle slopes
    waterCoeff: 0.2,            // neutral-slight preference
    temperatureCoeff: 0.0,      // neutral
    salinityCoeff: -1.0,        // disfavors salinity
    waterTableCoeff: 0.2,       // slight preference
    noiseCoeff: 0.5,            // moderate noise
  },
  clay: {
    baseBias: -0.2,
    elevationCoeff: -1.2,       // prefers low elevation
    slopeCoeff: -2.2,           // very strongly prefers flat
    waterCoeff: 1.8,            // prefers water (settles wet)
    temperatureCoeff: -0.3,     // slight cool preference
    salinityCoeff: 0.2,         // slight salinity tolerance
    waterTableCoeff: 1.8,       // prefers water table
    noiseCoeff: 0.3,            // low noise
  },
  peat: {
    baseBias: -1.2,             // requires special conditions
    elevationCoeff: -0.8,       // prefers mid-low
    slopeCoeff: -2.8,           // very strongly prefers flat
    waterCoeff: 2.8,            // very strongly prefers water
    temperatureCoeff: -3.0,     // very strongly prefers cold
    salinityCoeff: -3.0,        // very strongly disfavors salt
    waterTableCoeff: 2.8,       // very strongly prefers water table
    noiseCoeff: 0.2,            // low noise
  },
  sediment: {
    baseBias: -0.6,
    elevationCoeff: -1.8,       // strongly prefers low
    slopeCoeff: -1.8,           // strongly prefers flat
    waterCoeff: 2.8,            // very strongly prefers water
    temperatureCoeff: 0.1,      // neutral
    salinityCoeff: 1.8,         // strongly prefers salt
    waterTableCoeff: 1.6,       // prefers water table
    noiseCoeff: 0.4,            // moderate noise
  },
};
