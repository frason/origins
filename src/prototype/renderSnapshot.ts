/**
 * Compact, deterministic render snapshot with prepared layer buffers.
 *
 * Provides a renderer-neutral representation of the world suitable for:
 * - Three.js and Canvas 2D rendering without walking engine state every frame
 * - Worker-to-renderer transfer via shared buffer copies
 * - Incremental updates preserving stable entity identifiers
 * - Byte-for-byte determinism (identical engine states → identical snapshots)
 */

import type { EngineState } from '../simulation/engine';
import type { Creature } from '../simulation/creature';
import { getEnergyCapacity } from '../simulation/energy';
import type { Biome } from '../simulation/world';

/**
 * Render snapshot version for future compatibility
 */
export const RENDER_SNAPSHOT_VERSION = 1;

/**
 * Maximum recent events to retain in snapshot
 */
export const MAX_RENDER_EVENTS = 32;

/**
 * Layer types available in the render snapshot
 */
export type RenderLayerKey =
  | 'terrain'
  | 'elevation'
  | 'biomass'
  | 'energy'
  | 'toxicity'
  | 'organisms'
  | 'corpses'
  | 'mutation-pressure'
  | 'lineage';

/**
 * Terrain layer: biome classification per cell
 */
export interface TerrainLayer {
  type: 'terrain';
  biomes: Uint8Array; // Encoded biome ID per cell
  elevation: Float32Array;
  moisture: Float32Array;
  temperature: Float32Array;
}

/**
 * Biomass layer: producer biomass per cell
 */
export interface BiomassLayer {
  type: 'biomass';
  values: Float32Array; // Producer biomass per cell
}

/**
 * Energy layer: available energy per cell
 */
export interface EnergyLayer {
  type: 'energy';
  values: Float32Array; // Energy per cell
}

/**
 * Toxicity layer: toxin concentration per cell
 */
export interface ToxicityLayer {
  type: 'toxicity';
  values: Float32Array; // Toxicity per cell
}

/**
 * Organism layer: living creatures with stable ordering
 */
export interface Organism {
  id: string;
  x: number;
  y: number;
  speciesId: string;
  lineageId: string;
  strategy: string;
  relativeEnergy: number; // [0, 1] normalized energy
}

export interface OrganismLayer {
  type: 'organisms';
  creatures: Organism[];
}

/**
 * Corpse layer: dead creatures with stable ordering
 */
export interface Corpse {
  id: string;
  x: number;
  y: number;
  lineageId: string;
  decayState: 'fresh' | 'decomposing' | 'skeleton';
}

export interface CorpseLayer {
  type: 'corpses';
  creatures: Corpse[];
}

/**
 * Mutation pressure layer: derived overlay for mutation hotspots
 */
export interface MutationPressureLayer {
  type: 'mutation-pressure';
  values: Float32Array; // Mutation pressure [0, 1] per cell
}

/**
 * Lineage layer: lineage IDs for highlighting and tracking
 */
export interface LineageLayer {
  type: 'lineage';
  lineageIds: Set<string>; // All active lineage IDs in snapshot
  creatureLineages: Map<string, string>; // creature ID → lineage ID
}

/**
 * Recent simulation event for UI feedback
 */
export interface RenderEvent {
  type: string;
  tick: number;
  detail?: string;
}

/**
 * Complete render snapshot with all prepared layers
 */
export interface RenderSnapshot {
  version: number;
  source: {
    seed: number;
    tick: number;
  };
  world: {
    width: number;
    height: number;
  };
  layers: {
    terrain: TerrainLayer;
    biomass: BiomassLayer;
    energy: EnergyLayer;
    toxicity: ToxicityLayer;
    organisms: OrganismLayer;
    corpses: CorpseLayer;
    mutationPressure: MutationPressureLayer;
    lineage: LineageLayer;
  };
  events: RenderEvent[];
  metadata: {
    buildTimeMs: number;
  };
}

/**
 * Biome enumeration for compact storage
 */
const BIOME_ENUM: readonly Biome[] = [
  'ocean',
  'desert',
  'grassland',
  'forest',
  'wetland',
  'tundra',
  'mountain',
] as const;

const BIOME_TO_ID: Record<Biome, number> = {
  ocean: 0,
  desert: 1,
  grassland: 2,
  forest: 3,
  wetland: 4,
  tundra: 5,
  mountain: 6,
};

/**
 * Sort creatures deterministically by ID to ensure consistent ordering
 */
function sortCreaturesByIdDeterministically(creatures: Creature[]): Creature[] {
  return [...creatures].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Compute mutation pressure grid from corpse positions
 * Represents the "miasma" of decay that triggers mutations
 */
function computeMutationPressure(
  state: EngineState,
  width: number,
  height: number
): Float32Array {
  const pressure = new Float32Array(width * height);
  const corpses = state.creatures.filter((c) => c.lifecycleState !== 'alive');

  for (const corpse of corpses) {
    // Gaussian falloff from corpse position
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - corpse.x;
        const dy = y - corpse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 9) {
          // Only compute within 3-cell radius
          const dist = Math.sqrt(distSq);
          const contribution = Math.max(0, 1 - dist / 3);
          const idx = y * width + x;
          pressure[idx] = Math.max(pressure[idx], contribution);
        }
      }
    }
  }

  return pressure;
}

/**
 * Build terrain layer with encoded biomes and environmental parameters
 */
function buildTerrainLayer(state: EngineState): TerrainLayer {
  const { width, height } = state.world;
  const biomes = new Uint8Array(width * height);
  const elevation = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = state.world.getCell(x, y);
      biomes[idx] = BIOME_TO_ID[cell.biome];
      elevation[idx] = cell.elevation;
      moisture[idx] = cell.moisture;
      temperature[idx] = cell.temperature;
    }
  }

  return { type: 'terrain', biomes, elevation, moisture, temperature };
}

/**
 * Build biomass layer
 */
function buildBiomassLayer(state: EngineState): BiomassLayer {
  const { width, height } = state.world;
  const values = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = state.world.getCell(x, y);
      values[idx] = cell.producerBiomass;
    }
  }

  return { type: 'biomass', values };
}

/**
 * Build energy layer
 */
function buildEnergyLayer(state: EngineState): EnergyLayer {
  const { width, height } = state.world;
  const values = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = state.world.getCell(x, y);
      values[idx] = cell.energy;
    }
  }

  return { type: 'energy', values };
}

/**
 * Build toxicity layer
 */
function buildToxicityLayer(state: EngineState): ToxicityLayer {
  const { width, height } = state.world;
  const values = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = state.world.getCell(x, y);
      values[idx] = cell.toxicity;
    }
  }

  return { type: 'toxicity', values };
}

/**
 * Build organism layer with deterministically sorted creatures
 */
function buildOrganismLayer(state: EngineState): OrganismLayer {
  const living = state.creatures.filter((c) => c.lifecycleState === 'alive');
  const sorted = sortCreaturesByIdDeterministically(living);

  const creatures: Organism[] = sorted.map((creature) => ({
    id: creature.id,
    x: creature.x,
    y: creature.y,
    speciesId: creature.speciesId,
    lineageId: creature.lineageId,
    strategy: creature.traits.energyStrategy,
    relativeEnergy: Math.max(0, Math.min(1, creature.energy / getEnergyCapacity(creature))),
  }));

  return { type: 'organisms', creatures };
}

/**
 * Build corpse layer with deterministically sorted corpses
 */
function buildCorpseLayer(state: EngineState): CorpseLayer {
  const corpses = state.creatures.filter((c) => c.lifecycleState !== 'alive');
  const sorted = sortCreaturesByIdDeterministically(corpses);

  const creatures: Corpse[] = sorted.map((creature) => {
    // Estimate decay state based on lifecycle
    let decayState: 'fresh' | 'decomposing' | 'skeleton' = 'decomposing';
    if (creature.lifecycleState === 'dead') {
      decayState = 'fresh';
    } else if (creature.lifecycleState === 'corpse') {
      decayState = 'decomposing';
    }

    return {
      id: creature.id,
      x: creature.x,
      y: creature.y,
      lineageId: creature.lineageId,
      decayState,
    };
  });

  return { type: 'corpses', creatures };
}

/**
 * Build lineage layer with all active lineage tracking
 */
function buildLineageLayer(state: EngineState): LineageLayer {
  const lineageIds = new Set<string>();
  const creatureLineages = new Map<string, string>();

  for (const creature of state.creatures) {
    lineageIds.add(creature.lineageId);
    creatureLineages.set(creature.id, creature.lineageId);
  }

  return { type: 'lineage', lineageIds, creatureLineages };
}

/**
 * Build mutation pressure layer
 */
function buildMutationPressureLayer(
  state: EngineState,
  width: number,
  height: number
): MutationPressureLayer {
  return {
    type: 'mutation-pressure',
    values: computeMutationPressure(state, width, height),
  };
}

/**
 * Extract recent events for UI feedback
 */
function extractRecentEvents(state: EngineState): RenderEvent[] {
  return state.events.slice(-MAX_RENDER_EVENTS).map((event) => ({
    type: event.type,
    tick: event.tick,
    ...(event.detail ? { detail: event.detail } : {}),
  }));
}

/**
 * Build complete render snapshot from engine state
 * Ensures deterministic output: identical engine states produce identical snapshots
 */
export function toRenderSnapshot(state: EngineState): RenderSnapshot {
  const buildStart = performance.now();
  const { width, height } = state.world;

  const snapshot: RenderSnapshot = {
    version: RENDER_SNAPSHOT_VERSION,
    source: {
      seed: state.seed,
      tick: state.tick,
    },
    world: {
      width,
      height,
    },
    layers: {
      terrain: buildTerrainLayer(state),
      biomass: buildBiomassLayer(state),
      energy: buildEnergyLayer(state),
      toxicity: buildToxicityLayer(state),
      organisms: buildOrganismLayer(state),
      corpses: buildCorpseLayer(state),
      mutationPressure: buildMutationPressureLayer(state, width, height),
      lineage: buildLineageLayer(state),
    },
    events: extractRecentEvents(state),
    metadata: {
      buildTimeMs: performance.now() - buildStart,
    },
  };

  validateRenderSnapshot(snapshot);
  return snapshot;
}

/**
 * Validate snapshot structure and data integrity
 */
export function validateRenderSnapshot(snapshot: RenderSnapshot): void {
  // Validate version and source
  if (snapshot.version !== RENDER_SNAPSHOT_VERSION) {
    throw new Error(`Render snapshot version mismatch: expected ${RENDER_SNAPSHOT_VERSION}, got ${snapshot.version}`);
  }

  if (!Number.isInteger(snapshot.source.seed) || !Number.isInteger(snapshot.source.tick)) {
    throw new Error('Render snapshot source must have integer seed and tick');
  }

  // Validate world dimensions
  const { width, height } = snapshot.world;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Render snapshot requires positive world dimensions');
  }

  const cellCount = width * height;

  // Validate terrain layer
  if (snapshot.layers.terrain.biomes.length !== cellCount) {
    throw new Error('Terrain biome array size mismatch');
  }
  if (snapshot.layers.terrain.elevation.length !== cellCount ||
      snapshot.layers.terrain.moisture.length !== cellCount ||
      snapshot.layers.terrain.temperature.length !== cellCount) {
    throw new Error('Terrain attribute array size mismatch');
  }

  // Validate all cells in terrain
  for (let i = 0; i < cellCount; i++) {
    const biomeId = snapshot.layers.terrain.biomes[i];
    if (!Number.isInteger(biomeId) || biomeId < 0 || biomeId >= BIOME_ENUM.length) {
      throw new Error(`Invalid biome ID at index ${i}: ${biomeId}`);
    }
    if (!Number.isFinite(snapshot.layers.terrain.elevation[i]) ||
        !Number.isFinite(snapshot.layers.terrain.moisture[i]) ||
        !Number.isFinite(snapshot.layers.terrain.temperature[i])) {
      throw new Error(`Invalid terrain attribute at index ${i}`);
    }
  }

  // Validate biomass layer
  if (snapshot.layers.biomass.values.length !== cellCount) {
    throw new Error('Biomass array size mismatch');
  }
  for (let i = 0; i < cellCount; i++) {
    if (!Number.isFinite(snapshot.layers.biomass.values[i]) || snapshot.layers.biomass.values[i] < 0) {
      throw new Error(`Invalid biomass value at index ${i}`);
    }
  }

  // Validate energy layer
  if (snapshot.layers.energy.values.length !== cellCount) {
    throw new Error('Energy array size mismatch');
  }
  for (let i = 0; i < cellCount; i++) {
    if (!Number.isFinite(snapshot.layers.energy.values[i]) || snapshot.layers.energy.values[i] < 0) {
      throw new Error(`Invalid energy value at index ${i}`);
    }
  }

  // Validate toxicity layer
  if (snapshot.layers.toxicity.values.length !== cellCount) {
    throw new Error('Toxicity array size mismatch');
  }
  for (let i = 0; i < cellCount; i++) {
    if (!Number.isFinite(snapshot.layers.toxicity.values[i]) || snapshot.layers.toxicity.values[i] < 0) {
      throw new Error(`Invalid toxicity value at index ${i}`);
    }
  }

  // Validate mutation pressure layer
  if (snapshot.layers.mutationPressure.values.length !== cellCount) {
    throw new Error('Mutation pressure array size mismatch');
  }
  for (let i = 0; i < cellCount; i++) {
    if (!Number.isFinite(snapshot.layers.mutationPressure.values[i])) {
      throw new Error(`Invalid mutation pressure value at index ${i}`);
    }
  }

  // Validate organisms
  for (const org of snapshot.layers.organisms.creatures) {
    if (!org.id || !Number.isInteger(org.x) || !Number.isInteger(org.y)) {
      throw new Error('Invalid organism: missing or invalid id/coordinates');
    }
    if (org.x < 0 || org.x >= width || org.y < 0 || org.y >= height) {
      throw new Error(`Organism out of bounds: ${org.x},${org.y}`);
    }
    if (org.relativeEnergy < 0 || org.relativeEnergy > 1) {
      throw new Error(`Invalid organism relative energy: ${org.relativeEnergy}`);
    }
  }

  // Validate corpses
  for (const corpse of snapshot.layers.corpses.creatures) {
    if (!corpse.id || !Number.isInteger(corpse.x) || !Number.isInteger(corpse.y)) {
      throw new Error('Invalid corpse: missing or invalid id/coordinates');
    }
    if (corpse.x < 0 || corpse.x >= width || corpse.y < 0 || corpse.y >= height) {
      throw new Error(`Corpse out of bounds: ${corpse.x},${corpse.y}`);
    }
  }

  // Validate lineage layer
  if (snapshot.layers.lineage.creatureLineages.size !==
      (snapshot.layers.organisms.creatures.length + snapshot.layers.corpses.creatures.length)) {
    throw new Error('Lineage tracking incomplete');
  }
}

/**
 * Serialize render snapshot to compact JSON string
 * Suitable for storage or worker transfer
 */
export function serializeRenderSnapshot(snapshot: RenderSnapshot): string {
  return JSON.stringify({
    version: snapshot.version,
    source: snapshot.source,
    world: snapshot.world,
    layers: {
      terrain: {
        type: snapshot.layers.terrain.type,
        biomes: Array.from(snapshot.layers.terrain.biomes),
        elevation: Array.from(snapshot.layers.terrain.elevation),
        moisture: Array.from(snapshot.layers.terrain.moisture),
        temperature: Array.from(snapshot.layers.terrain.temperature),
      },
      biomass: {
        type: snapshot.layers.biomass.type,
        values: Array.from(snapshot.layers.biomass.values),
      },
      energy: {
        type: snapshot.layers.energy.type,
        values: Array.from(snapshot.layers.energy.values),
      },
      toxicity: {
        type: snapshot.layers.toxicity.type,
        values: Array.from(snapshot.layers.toxicity.values),
      },
      organisms: snapshot.layers.organisms,
      corpses: snapshot.layers.corpses,
      mutationPressure: {
        type: snapshot.layers.mutationPressure.type,
        values: Array.from(snapshot.layers.mutationPressure.values),
      },
      lineage: {
        type: snapshot.layers.lineage.type,
        lineageIds: Array.from(snapshot.layers.lineage.lineageIds),
        creatureLineages: Array.from(snapshot.layers.lineage.creatureLineages),
      },
    },
    events: snapshot.events,
    metadata: snapshot.metadata,
  });
}

/**
 * Deserialize render snapshot from JSON string
 */
export function deserializeRenderSnapshot(json: string): RenderSnapshot {
  const data = JSON.parse(json);

  const snapshot: RenderSnapshot = {
    version: data.version,
    source: data.source,
    world: data.world,
    layers: {
      terrain: {
        type: 'terrain',
        biomes: new Uint8Array(data.layers.terrain.biomes),
        elevation: new Float32Array(data.layers.terrain.elevation),
        moisture: new Float32Array(data.layers.terrain.moisture),
        temperature: new Float32Array(data.layers.terrain.temperature),
      },
      biomass: {
        type: 'biomass',
        values: new Float32Array(data.layers.biomass.values),
      },
      energy: {
        type: 'energy',
        values: new Float32Array(data.layers.energy.values),
      },
      toxicity: {
        type: 'toxicity',
        values: new Float32Array(data.layers.toxicity.values),
      },
      organisms: data.layers.organisms,
      corpses: data.layers.corpses,
      mutationPressure: {
        type: 'mutation-pressure',
        values: new Float32Array(data.layers.mutationPressure.values),
      },
      lineage: {
        type: 'lineage',
        lineageIds: new Set(data.layers.lineage.lineageIds),
        creatureLineages: new Map(data.layers.lineage.creatureLineages),
      },
    },
    events: data.events,
    metadata: data.metadata,
  };

  validateRenderSnapshot(snapshot);
  return snapshot;
}
