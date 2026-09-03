import type { Creature } from './creature';
import type { Biome } from './world';
import type { RngFn } from './rng';
import { chebyshevDistance } from './creature';

/**
 * Sound event types categorize the source and behavior of acoustic signals
 */
export type SoundType =
  | 'movement-slow'
  | 'movement-fast'
  | 'feeding'
  | 'scavenging'
  | 'attack'
  | 'struggle'
  | 'distress'
  | 'mating-call'
  | 'social-call';

/**
 * A bounded sound event with source, intensity, and tick
 */
export interface SoundEvent {
  /** Unique identifier for tracking and replay */
  id: string;
  /** Tick when the sound was created */
  tick: number;
  /** Sound type determines propagation and reaction */
  type: SoundType;
  /** Source position x-coordinate */
  x: number;
  /** Source position y-coordinate */
  y: number;
  /** Source creature ID (or null if environmental) */
  creatureId: string | null;
  /** Base signal intensity (0-1, where 1 is loudest) */
  intensity: number;
  /** Biome where the sound originated (affects propagation) */
  biome: Biome;
}

/**
 * Detected sound with approximate direction and threat assessment
 */
export interface DetectedSound {
  type: SoundType;
  intensity: number;
  distance: number;
  /** Approximate direction: 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW' */
  direction: string;
  /** True if this is likely a predator threat */
  isThreat: boolean;
  /** True if this signals food opportunity (feeding/scavenging) */
  isOpportunity: boolean;
}

/**
 * Sound propagation rules by biome.
 * Multipliers > 1 amplify range; < 1 attenuate.
 */
export const BIOME_SOUND_ATTENUATION: Record<Biome, number> = {
  ocean: 2.0, // sound travels far in water
  grassland: 1.0, // reference/neutral
  forest: 0.5, // dense vegetation dampens sound
  wetland: 0.7, // water-vegetation hybrid
  tundra: 0.6, // sparse vegetation, but wind patterns vary
  desert: 1.2, // sound carries in open space
  mountain: 0.4, // valleys echo but peaks block sound
};

/**
 * Base hearing range multiplier for sound detection.
 * Creatures with hearingRange trait can detect sounds proportionally.
 */
export const BASE_HEARING_RANGE = 20;

/**
 * Energy cost per unit of auditory stealth (quiet movement).
 * A creature with auditorySteal = 0.5 pays 50% more energy to reduce noise.
 */
export const AUDITORY_STEALTH_ENERGY_COST = 0.1;

/**
 * Intensity decay per unit distance.
 * Intensity = max(0, intensity - distance * SOUND_FALLOFF)
 */
export const SOUND_FALLOFF = 0.05;

/**
 * Minimum intensity threshold for detection.
 * Sounds below this are imperceptible.
 */
export const HEARING_THRESHOLD = 0.1;

/**
 * Number of ticks a sound event persists before expiring.
 */
export const SOUND_PERSISTENCE_TICKS = 3;

/**
 * Calculate sound intensity from a creature action.
 * Factors in body size, speed, and auditory stealth.
 *
 * @param soundType - action type determining base intensity
 * @param creature - the acting creature
 * @param isStealthy - if true, apply auditory stealth reduction
 * @returns sound intensity (0-1)
 */
export function calculateSoundIntensity(
  soundType: SoundType,
  creature: Creature,
  isStealthy: boolean = false
): number {
  // Base intensity by sound type
  const baseIntensity: Record<SoundType, number> = {
    'movement-slow': 0.2,
    'movement-fast': 0.5,
    feeding: 0.4,
    scavenging: 0.3,
    attack: 0.8,
    struggle: 0.7,
    distress: 0.9,
    'mating-call': 0.6,
    'social-call': 0.5,
  };

  let intensity = baseIntensity[soundType];

  // Size factor: larger creatures make more noise
  intensity *= Math.min(1, 0.5 + creature.traits.size * 0.1);

  // Speed factor for movement sounds
  if (soundType === 'movement-slow' || soundType === 'movement-fast') {
    intensity *= Math.min(1, 0.5 + creature.traits.speed * 0.1);
  }

  // Apply auditory stealth reduction if active
  if (isStealthy) {
    const auditoryStealthReduction = 1 - creature.traits.auditorySteal * 0.8;
    intensity *= auditoryStealthReduction;
  }

  return Math.min(1, Math.max(0, intensity));
}

/**
 * Create a sound event from a creature action.
 *
 * @param soundType - action type
 * @param creature - acting creature
 * @param tick - current simulation tick
 * @param biome - biome at the source location
 * @param isStealthy - if true, apply auditory stealth
 * @param eventCounter - counter for unique event IDs
 * @returns a new sound event
 */
export function createSoundEvent(
  soundType: SoundType,
  creature: Creature,
  tick: number,
  biome: Biome,
  isStealthy: boolean = false,
  eventCounter: number = 0
): SoundEvent {
  const intensity = calculateSoundIntensity(soundType, creature, isStealthy);

  return {
    id: `sound_${creature.id}_${tick}_${eventCounter}`,
    tick,
    type: soundType,
    x: creature.x,
    y: creature.y,
    creatureId: creature.id,
    intensity,
    biome,
  };
}

/**
 * Calculate the effective hearing range for a creature detecting a sound.
 *
 * @param hearingRange - creature's hearing range trait
 * @param listener - the listening creature (for trait consideration)
 * @returns maximum distance at which sound can be detected
 */
export function getEffectiveHearingRange(hearingRange: number, listener?: Creature): number {
  // Hearing range trait is [0, 50]; map to effective range
  const baseRange = BASE_HEARING_RANGE * (hearingRange / 10);

  // Brain size increases awareness and sensitivity
  if (listener) {
    const brainBonus = 1 + listener.traits.brainSize * 0.1;
    return baseRange * brainBonus;
  }

  return baseRange;
}

/**
 * Determine if a creature detects a sound event.
 * Accounts for distance, intensity, biome attenuation, and the listener's hearing.
 *
 * @param sound - the sound event
 * @param listener - the listening creature
 * @param rng - random number generator for probabilistic detection
 * @returns true if the creature detects the sound
 */
export function detectsSound(
  sound: SoundEvent,
  listener: Creature,
  rng: RngFn
): boolean {
  // Dead creatures cannot hear
  if (listener.lifecycleState !== 'alive') {
    return false;
  }

  // Calculate distance
  const distance = chebyshevDistance(sound.x, sound.y, listener.x, listener.y);

  // Apply biome attenuation to sound propagation
  const sourceAttenuationFactor = BIOME_SOUND_ATTENUATION[sound.biome];
  const listenerAttenuationFactor = BIOME_SOUND_ATTENUATION[listener.traits.aquaticAffinity > 0.5 ? 'ocean' : 'grassland'];

  // Average attenuation between source and listener biomes
  const avgAttenuation = (sourceAttenuationFactor + listenerAttenuationFactor) / 2;

  // Calculate intensity at listener's location
  const attenuatedIntensity = Math.max(
    0,
    sound.intensity * avgAttenuation - distance * SOUND_FALLOFF
  );

  // Check if intensity exceeds hearing threshold
  if (attenuatedIntensity < HEARING_THRESHOLD) {
    return false;
  }

  // Effective hearing range
  const hearingRange = getEffectiveHearingRange(listener.traits.hearingRange, listener);

  // Probability of detection based on intensity and distance
  // High intensity + close distance = high probability
  // Low intensity + far distance = low probability
  const detectionDifficulty = Math.max(0, distance - hearingRange * avgAttenuation);
  const detectionProbability = Math.max(0, attenuatedIntensity - detectionDifficulty * 0.01);

  return rng() < detectionProbability;
}

/**
 * Get the approximate direction from listener to sound source.
 * Returns one of 8 cardinal/intercardinal directions.
 *
 * @param soundX - sound source x
 * @param soundY - sound source y
 * @param listenerX - listener x
 * @param listenerY - listener y
 * @returns direction string ('N', 'NE', 'E', etc.)
 */
export function getApproximateDirection(
  soundX: number,
  soundY: number,
  listenerX: number,
  listenerY: number
): string {
  const dx = soundX - listenerX;
  const dy = soundY - listenerY;

  // Determine primary and secondary directions
  let direction = '';

  if (dy < -2) direction += 'N';
  else if (dy > 2) direction += 'S';

  if (dx > 2) direction += 'E';
  else if (dx < -2) direction += 'W';

  if (direction === '') direction = 'C'; // Center (too close to determine)

  return direction;
}

/**
 * Build a detected sound representation from an event and listener state.
 *
 * @param sound - the sound event
 * @param listener - the listening creature
 * @param attenuatedIntensity - intensity at listener location
 * @returns a detected sound with direction and threat assessment
 */
export function buildDetectedSound(
  sound: SoundEvent,
  listener: Creature,
  attenuatedIntensity: number
): DetectedSound {
  const distance = chebyshevDistance(sound.x, sound.y, listener.x, listener.y);
  const direction = getApproximateDirection(sound.x, sound.y, listener.x, listener.y);

  // Threat assessment: attacks, struggles, distress from carnivores/omnivores
  const isThreat =
    (sound.type === 'attack' || sound.type === 'struggle' || sound.type === 'distress') &&
    listener.traits.energyStrategy !== 'carnivore' &&
    listener.traits.energyStrategy !== 'omnivore';

  // Opportunity: feeding/scavenging sounds for scavengers/carnivores
  const isOpportunity =
    (sound.type === 'feeding' || sound.type === 'scavenging') &&
    (listener.traits.energyStrategy === 'scavenger' || listener.traits.energyStrategy === 'carnivore');

  return {
    type: sound.type,
    intensity: attenuatedIntensity,
    distance,
    direction,
    isThreat,
    isOpportunity,
  };
}

/**
 * Process all active sounds and determine which ones a creature detects.
 *
 * @param listener - the creature listening
 * @param activeSounds - all unexpired sound events
 * @param currentTick - current simulation tick
 * @param rng - random number generator
 * @returns array of detected sounds, sorted by distance (nearest first)
 */
export function detectActiveSounds(
  listener: Creature,
  activeSounds: SoundEvent[],
  currentTick: number,
  rng: RngFn
): DetectedSound[] {
  const detected: DetectedSound[] = [];

  for (const sound of activeSounds) {
    // Only consider sounds from the current tick
    if (sound.tick > currentTick) continue;

    // Skip expired sounds
    if (currentTick - sound.tick >= SOUND_PERSISTENCE_TICKS) continue;

    // Check if this creature detects the sound
    if (!detectsSound(sound, listener, rng)) continue;

    // Calculate attenuated intensity for detected sound report
    const sourceAttenuationFactor = BIOME_SOUND_ATTENUATION[sound.biome];
    const distance = chebyshevDistance(sound.x, sound.y, listener.x, listener.y);
    const attenuatedIntensity = Math.max(
      0,
      sound.intensity * sourceAttenuationFactor - distance * SOUND_FALLOFF
    );

    // Build and add to detected list
    const detectedSound = buildDetectedSound(sound, listener, attenuatedIntensity);
    detected.push(detectedSound);
  }

  // Sort by distance (nearest first)
  detected.sort((a, b) => a.distance - b.distance);

  return detected;
}

/**
 * Calculate the energy cost of stalking (quiet, slow movement).
 * Stalking reduces movement speed but also reduces noise.
 *
 * @param creature - the stalking creature
 * @returns multiplier applied to base speed (< 1 means slower)
 */
export function getStalkingSpeedMultiplier(creature: Creature): number {
  // Auditory stealth reduces the speed penalty of stalking
  const basePenalty = 0.6; // Stalking reduces speed to 60% of normal
  const stealthBonus = creature.traits.auditorySteal * 0.2; // Up to +20% bonus
  return Math.max(0.2, basePenalty + stealthBonus);
}

/**
 * Calculate energy cost multiplier for stalking behavior.
 * Stalking is energy-expensive due to careful placement and reduced efficiency.
 *
 * @param creature - the stalking creature
 * @returns multiplier applied to base energy cost (> 1 means more expensive)
 */
export function getStalkingEnergyCostMultiplier(creature: Creature): number {
  // Base stalking cost is 20% more than normal movement
  const baseCost = 1.2;
  // Auditory stealth reduces the energy penalty
  const stealthDiscount = creature.traits.auditorySteal * 0.3; // Up to -30% discount
  return Math.max(0.8, baseCost - stealthDiscount);
}

/**
 * Determine whether a predator should attempt stalking based on proximity to prey.
 * Returns true if prey is visible and within a stalking-advantageous range.
 *
 * @param predator - the predator creature
 * @param preyX - target prey x position
 * @param preyY - target prey y position
 * @returns true if stalking is tactically advantageous
 */
export function shouldStalk(predator: Creature, preyX: number, preyY: number): boolean {
  const distance = chebyshevDistance(predator.x, predator.y, preyX, preyY);
  // Stalk when prey is in visual range and reasonably close (not too far to chase down)
  const stalkingRange = Math.min(predator.traits.visionRange, 15);
  return distance <= stalkingRange && distance > 1; // Within range but not adjacent
}
