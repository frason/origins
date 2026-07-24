import type { EngineState } from '../simulation/engine';
import { getEnergyCapacity } from '../simulation/energy';
import type { Biome } from '../simulation/world';

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

const finite = (value: number) => Number.isFinite(value);
const bounded = (value: number) => Math.max(0, Math.min(1, value));

/** Extract only renderer-relevant facts; this is never an authoritative save format. */
export function toPrototypeWorldSnapshot(state: EngineState): PrototypeWorldSnapshot {
  const cells: PrototypeCell[] = [];
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const cell = state.world.getCell(x, y);
      cells.push({
        x, y, biome: cell.biome, elevation: cell.elevation, moisture: cell.moisture,
        temperature: cell.temperature, producerBiomass: cell.producerBiomass, toxicity: cell.toxicity,
      });
    }
  }
  const snapshot: PrototypeWorldSnapshot = {
    version: PROTOTYPE_SNAPSHOT_VERSION,
    source: { seed: state.seed, tick: state.tick },
    world: { width: state.world.width, height: state.world.height, cells },
    creatures: state.creatures.map((creature) => ({
      id: creature.id, x: creature.x, y: creature.y, speciesId: creature.speciesId,
      lineageId: creature.lineageId, strategy: creature.traits.energyStrategy,
      lifecycleState: creature.lifecycleState,
      relativeEnergy: bounded(creature.energy / getEnergyCapacity(creature)),
      colorKey: `${creature.speciesId}:${creature.lineageId}`,
    })),
    events: state.events.slice(-MAX_PROTOTYPE_EVENTS).map((event) => ({
      type: event.type, tick: event.tick, ...(event.detail ? { detail: event.detail } : {}),
    })),
  };
  validatePrototypeWorldSnapshot(snapshot);
  return snapshot;
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
        !finite(cell.temperature) || !finite(cell.producerBiomass) || !finite(cell.toxicity)) {
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
