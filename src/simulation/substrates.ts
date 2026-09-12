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
