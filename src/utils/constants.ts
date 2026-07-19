/**
 * World Configuration Constants
 * Client-confirmed energy budget and simulation parameters
 */

// ============================================================================
// World Grid Dimensions
// ============================================================================
export const WORLD_WIDTH = 100;
export const WORLD_HEIGHT = 100;

// ============================================================================
// Energy and Metabolic Constants (per tick)
// ============================================================================

/** Peak solar energy at grid center (radial dissipation applied per-cell) */
export const BASE_SOLAR_ENERGY = 10;

/** Solar energy falloff factor: controls how much energy drops at the edge (0-1) */
export const SOLAR_EDGE_FALLOFF_FACTOR = 0.85;

/** Shape of radial falloff; values above 1 preserve a broad core and steep outer rim */
export const SOLAR_FALLOFF_EXPONENT = 1.5;

/** Producer growth rate: 0.1 × available energy per tick */
export const PRODUCER_GROWTH_RATE = 0.1;

/** Base metabolism for size=1 creature: 2 units/tick */
export const BASE_METABOLISM = 2;

// ============================================================================
// Feeding Constants
// ============================================================================

/** Feeding efficiency: 80% of consumed biomass transfers as energy */
export const FEEDING_EFFICIENCY = 0.8;

// ============================================================================
// Reproduction Constants
// ============================================================================

/** Energy threshold required for a creature to reproduce */
export const REPRODUCTION_ENERGY_THRESHOLD = 150;

/** Energy cost to produce one offspring */
export const REPRODUCTION_ENERGY_COST = 75;

/** Minimum age before an individual can reproduce */
export const REPRODUCTION_MATURITY_AGE_TICKS = 8;

/** Minimum ticks between two births from the same parent */
export const REPRODUCTION_COOLDOWN_TICKS = 6;

// ============================================================================
// Lifecycle Constants
// ============================================================================

/** Maximum creature age before natural death: 500 ticks */
export const MAX_CREATURE_AGE_TICKS = 500;

/** Corpse decay rate: 10% of biomass/tick converts to nutrients */
export const CORPSE_DECAY_RATE = 0.1;

/** Number of ticks a newly dead creature remains in the world */
export const CORPSE_DECAY_DURATION_TICKS = 30;

/** Toxicity deposited at a corpse's tile per decay tick */
export const CORPSE_TOXICITY_PER_TICK = 1;

/** Radius, in cells, affected by a decaying corpse */
export const CORPSE_TOXICITY_RADIUS = 3;

/** Fraction of existing cell toxicity retained each tick */
export const TOXICITY_RETENTION = 0.9;

/** Fraction of corpse energy consumed in one scavenging action */
export const SCAVENGING_RATE = 0.25;

// ============================================================================
// Creature Energy Constants
// ============================================================================

/** Maximum energy multiplier: creature reaches full energy at size * this value */
export const MAX_ENERGY_MULTIPLIER = 100;

// ============================================================================
// Mutation Constants
// ============================================================================

/** Default chance that an offspring starts a mutated lineage */
export const DEFAULT_MUTATION_RATE = 0.12;

/** Mutation drift: ±10% value change per trait mutation */
export const MUTATION_DRIFT = 0.1;

// ============================================================================
// Biodiversity Pressure Constants
// ============================================================================

/** Monoculture dominance threshold: species with >80% of population incurs penalty */
export const MONOCULTURE_DOMINANCE_THRESHOLD = 0.80;

/** Extra mortality rate for creatures in dominant species (applied when >threshold) */
export const MONOCULTURE_MORTALITY_PENALTY = 0.05;

/** Population a dominant species must reach before its reproduction is suppressed */
export const MONOCULTURE_REPRODUCTION_LIMIT = 2;

/** Hard maximum sustainable global creature population */
export const MAX_GLOBAL_POPULATION = 500;

/** Overcrowding mortality rate when population exceeds max (additional probability of death per tick) */
export const OVERCROWDING_MORTALITY_RATE = 0.05;

// ============================================================================
// Simulation Constants Interface
// ============================================================================

/**
 * Typed interface for all simulation constants
 * Supports runtime override of values (e.g., God Mode sliders)
 */
export interface SimulationConstants {
  worldWidth: number;
  worldHeight: number;
  baseSolarEnergy: number;
  solarEdgeFalloffFactor: number;
  solarFalloffExponent: number;
  producerGrowthRate: number;
  baseMetabolism: number;
  feedingEfficiency: number;
  reproductionEnergyThreshold: number;
  reproductionEnergyCost: number;
  reproductionMaturityAgeTicks: number;
  reproductionCooldownTicks: number;
  maxCreatureAgeTicks: number;
  corpseDecayRate: number;
  corpseDecayDurationTicks: number;
  corpseToxicityPerTick: number;
  corpseToxicityRadius: number;
  toxicityRetention: number;
  scavengingRate: number;
  defaultMutationRate: number;
  mutationDrift: number;
  monocultureDominanceThreshold: number;
  monocultureMortalityPenalty: number;
  monocultureReproductionLimit: number;
  maxGlobalPopulation: number;
  overcrowdingMortalityRate: number;
}

/**
 * Default simulation constants object
 * Can be passed to simulation engine or used for runtime configuration
 */
export const SIMULATION_CONSTANTS: SimulationConstants = {
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  baseSolarEnergy: BASE_SOLAR_ENERGY,
  solarEdgeFalloffFactor: SOLAR_EDGE_FALLOFF_FACTOR,
  solarFalloffExponent: SOLAR_FALLOFF_EXPONENT,
  producerGrowthRate: PRODUCER_GROWTH_RATE,
  baseMetabolism: BASE_METABOLISM,
  feedingEfficiency: FEEDING_EFFICIENCY,
  reproductionEnergyThreshold: REPRODUCTION_ENERGY_THRESHOLD,
  reproductionEnergyCost: REPRODUCTION_ENERGY_COST,
  reproductionMaturityAgeTicks: REPRODUCTION_MATURITY_AGE_TICKS,
  reproductionCooldownTicks: REPRODUCTION_COOLDOWN_TICKS,
  maxCreatureAgeTicks: MAX_CREATURE_AGE_TICKS,
  corpseDecayRate: CORPSE_DECAY_RATE,
  corpseDecayDurationTicks: CORPSE_DECAY_DURATION_TICKS,
  corpseToxicityPerTick: CORPSE_TOXICITY_PER_TICK,
  corpseToxicityRadius: CORPSE_TOXICITY_RADIUS,
  toxicityRetention: TOXICITY_RETENTION,
  scavengingRate: SCAVENGING_RATE,
  defaultMutationRate: DEFAULT_MUTATION_RATE,
  mutationDrift: MUTATION_DRIFT,
  monocultureDominanceThreshold: MONOCULTURE_DOMINANCE_THRESHOLD,
  monocultureMortalityPenalty: MONOCULTURE_MORTALITY_PENALTY,
  monocultureReproductionLimit: MONOCULTURE_REPRODUCTION_LIMIT,
  maxGlobalPopulation: MAX_GLOBAL_POPULATION,
  overcrowdingMortalityRate: OVERCROWDING_MORTALITY_RATE,
};

/** Best bounded preset from the deterministic sustainability matrix in issue #62. */
export const BALANCED_LONGEVITY_PRESET: Readonly<Partial<SimulationConstants>> = {
  baseSolarEnergy: 20,
  producerGrowthRate: 0.2,
  baseMetabolism: 0.5,
  feedingEfficiency: 0.9,
  reproductionEnergyThreshold: 120,
  reproductionEnergyCost: 60,
  reproductionMaturityAgeTicks: 4,
  reproductionCooldownTicks: 3,
  maxCreatureAgeTicks: 2000,
};
