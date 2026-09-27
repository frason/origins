/**
 * Creature Trait Definitions and Constants
 * MVP trait system for Project Origins
 */

/**
 * Trait activity status indicating whether a trait has observable simulation consequences.
 * Per issue #167: "Evolution truth" audit
 * - active: has observable ecological consequence (benefit, cost, effect)
 * - partial: has some effects but implementation incomplete
 * - placeholder: reserved for future features, no current effect
 * - inert: currently unused in simulation
 */
export type TraitStatus = 'active' | 'partial' | 'placeholder' | 'inert';

/**
 * Mapping of each trait to its implementation status.
 * Used to determine UI visibility and test coverage requirements.
 */
export const TRAIT_STATUS: Record<keyof Omit<Traits, 'energyStrategy'>, TraitStatus> = {
  // Physical traits - ACTIVE
  size: 'active',           // affects capacity, metabolism, sound, bite capacity
  speed: 'active',          // affects bite capacity, sound intensity, movement
  visionRange: 'active',    // affects food detection radius
  hearingRange: 'active',   // affects sound detection range + energy cost (2% per point)
  camouflage: 'active',     // reduces predator detection probability
  metabolism: 'active',     // affects per-tick energy cost and food processing speed

  // Cognitive traits - ACTIVE (with energy cost)
  brainSize: 'active',      // amplifies hearing range (benefit) + energy cost (5% per point)
  consciousnessLevel: 'inert', // reserved for learning/memory (V3+)

  // Social traits - PLACEHOLDER
  communication: 'placeholder',      // no group coordination mechanics
  collectiveConnection: 'placeholder', // no herd/symbiosis mechanics

  // Combat/defense - PLACEHOLDER
  armor: 'placeholder',     // no damage model implemented

  // Reproduction - PLACEHOLDER
  reproductionRate: 'placeholder', // offspring always = 1, trait unused

  // Structural - PARTIAL
  boneDensity: 'partial',   // only in mutation co-evolution, no direct effect

  // Sensory/behavioral - ACTIVE
  auditorySteal: 'active',  // reduces sound production, energy cost (10% per point)

  // Habitat adaptations - ACTIVE
  thermalTolerance: 'active',  // reduces tundra traversal penalty
  waterRetention: 'active',    // reduces desert traversal penalty
  aquaticAffinity: 'active',   // improves wetland/ocean movement
  terrainGrip: 'active',       // improves mountain/tundra movement
  toxinResistance: 'active',   // reduces toxicity damage
};

/**
 * Energy acquisition strategy for creatures
 */
export type EnergyStrategy = 'herbivore' | 'carnivore' | 'omnivore' | 'scavenger';

/**
 * Complete trait interface for all MVP creatures
 */
export interface Traits {
  // Physical traits
  size: number; // affects energy needs, speed, vision range, reproduction cost
  speed: number; // movement per tick, hunting/fleeing effectiveness
  visionRange: number; // search radius for food
  hearingRange: number; // detect nearby threats/food
  camouflage: number; // avoid predator detection (0-1)
  armor: number; // reduce damage from predators
  boneDensity: number; // affects size-to-strength ratio
  metabolism: number; // base energy consumption multiplier
  reproductionRate: number; // offspring per breeding event

  // Cognitive traits
  brainSize: number; // affects decision complexity, energy cost
  consciousnessLevel: number; // enables learning/memory (0-1, for future versions)

  // Social traits
  communication: number; // coordinate with same species (0-1)
  collectiveConnection: number; // herd behavior, symbiosis (0-1)

  // Habitat adaptations (0-1); specialization reduces local penalties but costs energy
  thermalTolerance: number;
  waterRetention: number;
  aquaticAffinity: number;
  terrainGrip: number;
  toxinResistance: number;

  // Sensory/behavioral traits
  auditorySteal: number; // auditory stealth (0-1) reduces sound production

  // Ecological trait
  energyStrategy: EnergyStrategy; // herbivore, carnivore, omnivore, or scavenger
}

/**
 * Default trait values for a balanced, mid-range creature
 */
export const DEFAULT_TRAITS: Traits = {
  // Physical - mid-range defaults
  size: 1,
  speed: 1,
  visionRange: 5,
  hearingRange: 3,
  camouflage: 0.5,
  armor: 0,
  boneDensity: 1,
  metabolism: 1,
  reproductionRate: 1,

  // Cognitive
  brainSize: 0.5,
  consciousnessLevel: 0.1,

  // Social
  communication: 0,
  collectiveConnection: 0,

  thermalTolerance: 0,
  waterRetention: 0,
  aquaticAffinity: 0,
  terrainGrip: 0,
  toxinResistance: 0,

  // Sensory/behavioral
  auditorySteal: 0,

  // Ecological
  energyStrategy: 'omnivore',
};

/**
 * Metabolic throughput converts food into sustained activity. The neutral
 * value (1) preserves the original simulation; lower values save energy but
 * process food and traverse terrain more slowly, while higher values do both
 * faster at a correspondingly higher per-tick cost.
 */
export function metabolicPerformanceMultiplier(metabolism: number): number {
  return Math.max(0.6, Math.min(1.4, 0.6 + Math.max(0, metabolism) * 0.4));
}

/**
 * Relative per-trait mutation weights reserved for differentiated genetics.
 * The engine's overall per-birth chance is DEFAULT_MUTATION_RATE.
 */
export const TRAIT_MUTATION_RATES: Record<
  keyof Omit<Traits, 'energyStrategy'>,
  number
> = {
  size: 0.05,
  speed: 0.05,
  visionRange: 0.05,
  hearingRange: 0.05,
  camouflage: 0.05,
  armor: 0.05,
  boneDensity: 0.05,
  metabolism: 0.05,
  reproductionRate: 0.05,
  brainSize: 0.05,
  consciousnessLevel: 0.05,
  communication: 0.05,
  collectiveConnection: 0.05,
  thermalTolerance: 0.05,
  waterRetention: 0.05,
  aquaticAffinity: 0.05,
  terrainGrip: 0.05,
  toxinResistance: 0.05,
  auditorySteal: 0.05,
};

/**
 * Minimum values for each trait (prevents negative or invalid values)
 */
export const TRAIT_MIN: Partial<Traits> = {
  size: 0.1,
  speed: 0.1,
  visionRange: 1,
  hearingRange: 0,
  camouflage: 0,
  armor: 0,
  boneDensity: 0.5,
  metabolism: 0.1,
  reproductionRate: 0.1,
  brainSize: 0,
  consciousnessLevel: 0,
  communication: 0,
  collectiveConnection: 0,
  thermalTolerance: 0,
  waterRetention: 0,
  aquaticAffinity: 0,
  terrainGrip: 0,
  toxinResistance: 0,
  auditorySteal: 0,
};

/**
 * Maximum values for each trait (prevents excessive trait values)
 */
export const TRAIT_MAX: Partial<Traits> = {
  size: 10,
  speed: 10,
  visionRange: 50,
  hearingRange: 50,
  camouflage: 1,
  armor: 10,
  boneDensity: 5,
  metabolism: 10,
  reproductionRate: 10,
  brainSize: 10,
  consciousnessLevel: 1,
  communication: 1,
  collectiveConnection: 1,
  thermalTolerance: 1,
  waterRetention: 1,
  aquaticAffinity: 1,
  terrainGrip: 1,
  toxinResistance: 1,
  auditorySteal: 1,
};
