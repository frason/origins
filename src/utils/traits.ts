/**
 * Creature Trait Definitions and Constants
 * MVP trait system for Project Origins
 */

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

  // Ecological
  energyStrategy: 'omnivore',
};

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
};
