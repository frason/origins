import type { Biome } from './world';

export type ProducerArchetype =
  | 'photic-algae'
  | 'xerophyte-mat'
  | 'ground-cover'
  | 'canopy-colony'
  | 'marsh-biofilm'
  | 'frost-lichen'
  | 'lithotroph';

export interface ProducerTraits {
  growthMultiplier: number;
  carryingCapacity: number;
  defense: number;
  energyDensity: number;
}

export const PRODUCER_TRAITS: Record<ProducerArchetype, ProducerTraits> = {
  'photic-algae': {
    growthMultiplier: 0.65,
    carryingCapacity: 85,
    defense: 0.05,
    energyDensity: 1.1,
  },
  'xerophyte-mat': {
    growthMultiplier: 0.2,
    carryingCapacity: 35,
    defense: 0.4,
    energyDensity: 0.75,
  },
  'ground-cover': {
    growthMultiplier: 1,
    carryingCapacity: 100,
    defense: 0.1,
    energyDensity: 1,
  },
  'canopy-colony': {
    growthMultiplier: 1.2,
    carryingCapacity: 140,
    defense: 0.3,
    energyDensity: 1.15,
  },
  'marsh-biofilm': {
    growthMultiplier: 1.15,
    carryingCapacity: 120,
    defense: 0.15,
    energyDensity: 0.95,
  },
  'frost-lichen': {
    growthMultiplier: 0.35,
    carryingCapacity: 45,
    defense: 0.25,
    energyDensity: 0.8,
  },
  lithotroph: {
    growthMultiplier: 0.15,
    carryingCapacity: 30,
    defense: 0.5,
    energyDensity: 0.7,
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
