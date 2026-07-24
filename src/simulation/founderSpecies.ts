import type { Biome } from './world';
import type { EnergyStrategy, Traits } from '../utils/traits';

export interface FounderSpeciesDefinition {
  id: string;
  name: string;
  strategy: EnergyStrategy;
  /** Ordered from primary habitat to overlapping secondary habitat. */
  viableBiomes: readonly [Biome, Biome];
  population: number;
  startingEnergy: number;
  traits: Partial<Traits>;
  foodAnchor?: string;
}

/**
 * The default world's eight founders. Their pairs deliberately overlap so a
 * biome creates competition and migration pressure rather than isolated pens.
 */
export const FOUNDER_SPECIES: readonly FounderSpeciesDefinition[] = [
  {
    id: 'meadow_grazer', name: 'Meadow Grazer', strategy: 'herbivore',
    viableBiomes: ['grassland', 'forest'], population: 6, startingEnergy: 135,
    traits: { speed: 1.05, metabolism: 1, visionRange: 6 },
  },
  {
    id: 'dune_browser', name: 'Dune Browser', strategy: 'herbivore',
    viableBiomes: ['desert', 'grassland'], population: 3, startingEnergy: 135,
    traits: { size: 0.85, metabolism: 1.05, waterRetention: 1, visionRange: 6 },
  },
  {
    id: 'frost_brower', name: 'Frost Brower', strategy: 'herbivore',
    viableBiomes: ['tundra', 'forest'], population: 3, startingEnergy: 145,
    traits: { size: 0.9, metabolism: 1.1, thermalTolerance: 1, terrainGrip: 0.8 },
  },
  {
    id: 'marsh_forager', name: 'Marsh Forager', strategy: 'omnivore',
    viableBiomes: ['wetland', 'forest'], population: 2, startingEnergy: 155,
    traits: { metabolism: 1, aquaticAffinity: 1, visionRange: 7 },
    foodAnchor: 'meadow_grazer',
  },
  {
    id: 'ridge_forager', name: 'Ridge Forager', strategy: 'omnivore',
    viableBiomes: ['mountain', 'tundra'], population: 1, startingEnergy: 160,
    traits: { metabolism: 1.1, terrainGrip: 1, thermalTolerance: 0.8, speed: 1.1 },
    foodAnchor: 'frost_brower',
  },
  {
    id: 'woodland_stalker', name: 'Woodland Stalker', strategy: 'carnivore',
    viableBiomes: ['forest', 'grassland'], population: 2, startingEnergy: 180,
    traits: { metabolism: 1, speed: 1.2, visionRange: 7, camouflage: 0.7 },
    foodAnchor: 'meadow_grazer',
  },
  {
    id: 'frost_stalker', name: 'Frost Stalker', strategy: 'carnivore',
    viableBiomes: ['tundra', 'mountain'], population: 1, startingEnergy: 180,
    traits: { metabolism: 1.05, speed: 1.1, terrainGrip: 1, thermalTolerance: 1 },
    foodAnchor: 'frost_brower',
  },
  {
    id: 'shore_scavenger', name: 'Shore Scavenger', strategy: 'scavenger',
    viableBiomes: ['wetland', 'ocean'], population: 2, startingEnergy: 140,
    traits: { metabolism: 0.8, aquaticAffinity: 1, visionRange: 8 },
    foodAnchor: 'marsh_forager',
  },
];

export function founderSpeciesDefinition(speciesId: string): FounderSpeciesDefinition | undefined {
  return FOUNDER_SPECIES.find((species) => species.id === speciesId);
}

export function founderSpeciesName(speciesId: string): string | undefined {
  return founderSpeciesDefinition(speciesId)?.name;
}
