import type { Biome, SubstrateType } from './world';

export type ProducerArchetype =
  | 'photic-algae'
  | 'xerophyte-mat'
  | 'ground-cover'
  | 'canopy-colony'
  | 'marsh-biofilm'
  | 'frost-lichen'
  | 'lithotroph';

/**
 * Preference range for an environmental parameter.
 * Growth multiplier is 1.0 within [min, max], then degrades linearly as distance increases.
 */
export interface PreferenceRange {
  min: number;
  max: number;
}

export interface ProducerTraits {
  growthMultiplier: number;
  carryingCapacity: number;
  defense: number;
  energyDensity: number;
  // Environmental preferences (0-1 ranges)
  waterDepthPreference: PreferenceRange;   // 0 = dry, 1 = deep water
  salinityPreference: PreferenceRange;     // 0 = fresh, 1 = hypersaline
  moisturePreference: PreferenceRange;     // 0 = very dry, 1 = saturated
  // Substrate affinities for each substrate type (0-2 range, 1.0 = neutral)
  substrateAffinity: Record<SubstrateType, number>;
}

export const PRODUCER_TRAITS: Record<ProducerArchetype, ProducerTraits> = {
  'photic-algae': {
    growthMultiplier: 0.65,
    carryingCapacity: 85,
    defense: 0.05,
    energyDensity: 1.1,
    waterDepthPreference: { min: 0.2, max: 1.0 },   // prefers water
    salinityPreference: { min: 0.0, max: 0.2 },     // prefers fresh
    moisturePreference: { min: 0.4, max: 1.0 },     // prefers wet
    substrateAffinity: {
      sand: 0.8,
      loam: 1.0,
      clay: 0.9,
      peat: 0.7,
      rock: 0.6,
      sediment: 1.1,
    },
  },
  'xerophyte-mat': {
    growthMultiplier: 0.2,
    carryingCapacity: 35,
    defense: 0.4,
    energyDensity: 0.75,
    waterDepthPreference: { min: 0.0, max: 0.1 },   // prefers dry
    salinityPreference: { min: 0.0, max: 1.0 },     // tolerates all salinity
    moisturePreference: { min: 0.0, max: 0.3 },     // prefers very dry
    substrateAffinity: {
      sand: 1.3,
      loam: 0.8,
      clay: 0.6,
      peat: 0.3,
      rock: 0.9,
      sediment: 0.7,
    },
  },
  'ground-cover': {
    growthMultiplier: 1,
    carryingCapacity: 100,
    defense: 0.1,
    energyDensity: 1,
    waterDepthPreference: { min: 0.0, max: 0.2 },   // prefers dry to shallow
    salinityPreference: { min: 0.0, max: 0.1 },     // prefers fresh
    moisturePreference: { min: 0.3, max: 0.7 },     // prefers moderate
    substrateAffinity: {
      sand: 0.9,
      loam: 1.2,
      clay: 1.0,
      peat: 0.8,
      rock: 0.7,
      sediment: 1.0,
    },
  },
  'canopy-colony': {
    growthMultiplier: 1.2,
    carryingCapacity: 140,
    defense: 0.3,
    energyDensity: 1.15,
    waterDepthPreference: { min: 0.0, max: 0.15 },  // prefers dry land
    salinityPreference: { min: 0.0, max: 0.1 },     // prefers fresh
    moisturePreference: { min: 0.4, max: 0.8 },     // prefers moderate-wet
    substrateAffinity: {
      sand: 0.8,
      loam: 1.3,
      clay: 1.1,
      peat: 0.9,
      rock: 0.7,
      sediment: 0.9,
    },
  },
  'marsh-biofilm': {
    growthMultiplier: 1.15,
    carryingCapacity: 120,
    defense: 0.15,
    energyDensity: 0.95,
    waterDepthPreference: { min: 0.1, max: 0.4 },   // prefers shallow water
    salinityPreference: { min: 0.0, max: 0.15 },    // prefers fresh
    moisturePreference: { min: 0.7, max: 1.0 },     // prefers very wet
    substrateAffinity: {
      sand: 0.7,
      loam: 1.0,
      clay: 1.2,
      peat: 1.3,
      rock: 0.5,
      sediment: 1.1,
    },
  },
  'frost-lichen': {
    growthMultiplier: 0.35,
    carryingCapacity: 45,
    defense: 0.25,
    energyDensity: 0.8,
    waterDepthPreference: { min: 0.0, max: 0.05 },  // prefers dry
    salinityPreference: { min: 0.0, max: 0.05 },    // prefers fresh
    moisturePreference: { min: 0.1, max: 0.4 },     // prefers low moisture
    substrateAffinity: {
      sand: 0.6,
      loam: 0.7,
      clay: 0.5,
      peat: 0.4,
      rock: 1.4,
      sediment: 0.6,
    },
  },
  lithotroph: {
    growthMultiplier: 0.15,
    carryingCapacity: 30,
    defense: 0.5,
    energyDensity: 0.7,
    waterDepthPreference: { min: 0.0, max: 0.3 },   // tolerates some water
    salinityPreference: { min: 0.0, max: 1.0 },     // tolerates all salinity
    moisturePreference: { min: 0.0, max: 0.5 },     // tolerates dry to moderate
    substrateAffinity: {
      sand: 0.7,
      loam: 0.8,
      clay: 0.8,
      peat: 0.5,
      rock: 1.3,
      sediment: 1.2,
    },
  },
};

export const PRODUCER_ARCHETYPE_BY_BIOME: Record<Biome, ProducerArchetype> = {
  ocean: 'photic-algae',
  desert: 'xerophyte-mat',
  grassland: 'ground-cover',
  forest: 'canopy-colony',
  wetland: 'marsh-biofilm',
  tundra: 'frost-lichen',
  mountain: 'lithotroph',
};

export function getProducerArchetype(biome: Biome): ProducerArchetype {
  return PRODUCER_ARCHETYPE_BY_BIOME[biome];
}

export function getProducerTraits(archetype: ProducerArchetype): ProducerTraits {
  return PRODUCER_TRAITS[archetype];
}
