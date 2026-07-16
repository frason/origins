import type { Biome } from './world';

export type ProducerArchetype =
  | 'photic-algae'
  | 'xerophyte-mat'
  | 'ground-cover'
  | 'canopy-colony'
  | 'marsh-biofilm'
  | 'frost-lichen'
  | 'lithotroph';

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
