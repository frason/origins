import type { EngineState } from '../simulation/engine';
import { getEnergyCapacity } from '../simulation/energy';
import type { Biome } from '../simulation/world';
import { toRenderSnapshot } from './renderSnapshot';

// Re-export compact, layer-based rendering snapshot and utilities
// This makes worldSnapshot.ts the single truth source for all render data formats
export {
  type RenderSnapshot,
  type RenderLayerKey,
  type TerrainLayer,
  type BiomassLayer,
  type EnergyLayer,
  type ToxicityLayer,
  type Organism,
  type OrganismLayer,
  type Corpse,
  type CorpseLayer,
  type MutationPressureLayer,
  type LineageLayer,
  type RenderEvent,
  RENDER_SNAPSHOT_VERSION,
  MAX_RENDER_EVENTS,
  toRenderSnapshot,
  validateRenderSnapshot,
  serializeRenderSnapshot,
  deserializeRenderSnapshot,
} from './renderSnapshot';

export const PROTOTYPE_SNAPSHOT_VERSION = 1;
export const MAX_PROTOTYPE_EVENTS = 24;

export interface PrototypeCell {
  x: number;
  y: number;
  biome: Biome;
  elevation: number;
  moisture: number;
  temperature: number;
  producerBiomass: number;
  toxicity: number;
  energy: number;
}

export interface PrototypeCreature {
  id: string;
  x: number;
  y: number;
  speciesId: string;
  lineageId: string;
  strategy: string;
  lifecycleState: string;
  relativeEnergy: number;
  colorKey: string;
}

export interface PrototypeWorldSnapshot {
  version: number;
  source: { seed: number; tick: number };
  world: { width: number; height: number; cells: PrototypeCell[] };
  creatures: PrototypeCreature[];
  events: Array<{ type: string; tick: number; detail?: string }>;
}

const BIOMES: readonly Biome[] = [
  'ocean', 'desert', 'grassland', 'forest', 'wetland', 'tundra', 'mountain',
];

const BIOME_ENUM: readonly Biome[] = [
  'ocean', 'desert', 'grassland', 'forest', 'wetland', 'tundra', 'mountain',
] as const;

const BIOME_ID_TO_BIOME: Record<number, Biome> = {
  0: 'ocean', 1: 'desert', 2: 'grassland', 3: 'forest', 4: 'wetland', 5: 'tundra', 6: 'mountain',
};

const finite = (value: number) => Number.isFinite(value);
const bounded = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Convert a compact RenderSnapshot to PrototypeWorldSnapshot for legacy renderers.
 * This is the adapter that makes RenderSnapshot the single truth source.
 */
export function fromRenderSnapshot(renderSnapshot: ReturnType<typeof toRenderSnapshot>): PrototypeWorldSnapshot {
  const cells: PrototypeCell[] = [];
  const { width, height } = renderSnapshot.world;
  const terrain = renderSnapshot.layers.terrain;
  const biomass = renderSnapshot.layers.biomass;
  const energy = renderSnapshot.layers.energy;
  const toxicity = renderSnapshot.layers.toxicity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const biomeId = terrain.biomes[idx];
      const biome = BIOME_ID_TO_BIOME[biomeId] || 'grassland';

      cells.push({
        x,
        y,
        biome,
        elevation: terrain.elevation[idx],
        moisture: terrain.moisture[idx],
        temperature: terrain.temperature[idx],
        producerBiomass: biomass.values[idx],
        toxicity: toxicity.values[idx],
        energy: energy.values[idx],
      });
    }
  }

  // Combine living creatures and corpses into unified creature list with lifecycle state
  const creatures: PrototypeCreature[] = [];

  // Add living organisms
  for (const org of renderSnapshot.layers.organisms.creatures) {
    creatures.push({
      id: org.id,
      x: org.x,
      y: org.y,
      speciesId: org.speciesId,
      lineageId: org.lineageId,
      strategy: org.strategy,
      lifecycleState: 'alive',
      relativeEnergy: org.relativeEnergy,
      colorKey: `${org.speciesId}:${org.lineageId}`,
    });
  }

  // Add corpses
  for (const corpse of renderSnapshot.layers.corpses.creatures) {
    creatures.push({
      id: corpse.id,
      x: corpse.x,
      y: corpse.y,
      speciesId: '', // Corpses don't track species anymore
      lineageId: corpse.lineageId,
      strategy: '', // Corpses don't have strategy
      lifecycleState: corpse.decayState === 'fresh' ? 'dead' : 'corpse',
      relativeEnergy: 0, // Corpses have no energy
      colorKey: `corpse:${corpse.lineageId}`,
    });
  }

  const snapshot: PrototypeWorldSnapshot = {
    version: PROTOTYPE_SNAPSHOT_VERSION,
    source: renderSnapshot.source,
    world: { width, height, cells },
    creatures,
    events: renderSnapshot.events,
  };

  validatePrototypeWorldSnapshot(snapshot);
  return snapshot;
}

/** Extract only renderer-relevant facts; this is never an authoritative save format.
 * Builds from toRenderSnapshot to ensure a single truth source walking the engine state.
 */
export function toPrototypeWorldSnapshot(state: EngineState): PrototypeWorldSnapshot {
  const renderSnapshot = toRenderSnapshot(state);
  return fromRenderSnapshot(renderSnapshot);
}

/** Reject malformed data early so a visual prototype cannot invent world facts. */
export function validatePrototypeWorldSnapshot(snapshot: PrototypeWorldSnapshot): void {
  if (!Number.isInteger(snapshot.world.width) || snapshot.world.width <= 0 ||
      !Number.isInteger(snapshot.world.height) || snapshot.world.height <= 0) {
    throw new Error('Prototype snapshot requires positive world dimensions');
  }
  if (snapshot.world.cells.length !== snapshot.world.width * snapshot.world.height) {
    throw new Error('Prototype snapshot cell count must match world dimensions');
  }
  for (const cell of snapshot.world.cells) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
        cell.x < 0 || cell.x >= snapshot.world.width || cell.y < 0 || cell.y >= snapshot.world.height ||
        !BIOMES.includes(cell.biome) || !finite(cell.elevation) || !finite(cell.moisture) ||
        !finite(cell.temperature) || !finite(cell.producerBiomass) || !finite(cell.toxicity) ||
        !finite(cell.energy)) {
      throw new Error('Prototype snapshot contains an invalid cell');
    }
  }
  for (const creature of snapshot.creatures) {
    if (!Number.isInteger(creature.x) || !Number.isInteger(creature.y) ||
        creature.x < 0 || creature.x >= snapshot.world.width || creature.y < 0 || creature.y >= snapshot.world.height ||
        !finite(creature.relativeEnergy) || creature.relativeEnergy < 0 || creature.relativeEnergy > 1) {
      throw new Error('Prototype snapshot contains an invalid creature');
    }
  }
}
