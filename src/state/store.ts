/**
 * Global State Store using Zustand
 *
 * Manages:
 * - Current world state (grid, creatures, energy, nutrients)
 * - Simulation tick counter
 * - Play/pause state and simulation speed
 * - Species list summary
 * - Configurable simulation constants
 *
 * The engine interface is stubbed here; actual types will be imported
 * from src/simulation when the engine is finalized.
 */

import { create } from 'zustand';
import { SimulationConstants, SIMULATION_CONSTANTS } from '../utils/constants';
import type { Traits } from '../utils/traits';
import type { Biome } from '../simulation/world';
import type { ProducerArchetype } from '../simulation/producerTypes';
import type { SimEvent } from '../simulation/events';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';

// Cell interface for world state
export interface CellSnapshot {
  energy: number;
  nutrients: number;
  producerBiomass: number;
  toxicity: number;
  elevation: number;
  moisture: number;
  temperature: number;
  biome: Biome;
  producerArchetype: ProducerArchetype;
}

// Creature interface for world state
export interface CreatureSnapshot {
  id: string;
  speciesId: string;
  lineageId: string;
  parentId: string | null;
  traits: Traits;
  x: number;
  y: number;
  energy: number;
  age: number;
  lifecycleState: 'alive' | 'dead' | 'corpse';
  corpseDecayTicks: number;
}

export type EventSnapshot = SimEvent;

// TODO: Import these from engine when types are finalized (issues #5–#13)
/**
 * WorldSnapshot represents the complete world state at a moment in time.
 * Can be serialized from the World class (World.toJSON()) and includes creatures.
 */
export interface WorldSnapshot {
  // World grid dimensions
  width: number;
  height: number;

  // Cells array (1D, indexed as y * width + x)
  cells: CellSnapshot[];

  // All creatures in the world
  creatures: CreatureSnapshot[];

  // Significant engine events up to this snapshot.
  events: EventSnapshot[];

  // Replay metadata for preserving the exact world recipe.
  seed?: number;
  tick?: number;
  constants?: SimulationConstants;
  history?: EcosystemHistorySample[];

  // Allow additional fields for forward compatibility
  [key: string]: unknown;
}

/**
 * Placeholder: SpeciesSummary will contain aggregated species data
 * for the SpeciesPanel (population count, traits, lineage info, etc.)
 */
export interface SpeciesSummary {
  // TODO: Filled in when engine types are imported
  // Expected fields: speciesId, name, population, traits, lineageDepth, etc.
  [key: string]: unknown;
}

/**
 * Represents a selected tile in the world grid
 */
export interface SelectedTile {
  x: number;
  y: number;
}

export interface FollowedLineage {
  speciesId: string;
  lineageId: string;
}

/**
 * Global state shape for the store
 */
export interface StoreState {
  worldState: WorldSnapshot | null;
  tick: number;
  isRunning: boolean;
  speed: number;
  speciesList: SpeciesSummary[];
  constants: SimulationConstants;
  selectedTile: SelectedTile | null;
  followedLineages: FollowedLineage[];

  // Actions
  setWorldState: (state: WorldSnapshot) => void;
  setTick: (tick: number) => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  updateConstants: (partial: Partial<SimulationConstants>) => void;
  resetConstants: () => void;
  setSelectedTile: (tile: SelectedTile | null) => void;
  toggleFollowedLineage: (lineage: FollowedLineage) => void;
  clearFollowedLineages: () => void;
}

/**
 * Zustand store for global application state
 */
export const useStore = create<StoreState>((set) => ({
  worldState: null,
  tick: 0,
  isRunning: false,
  speed: 1,
  speciesList: [],
  constants: { ...SIMULATION_CONSTANTS },
  selectedTile: null,
  followedLineages: [],

  setWorldState: (state: WorldSnapshot) => {
    set({ worldState: state });
  },

  setTick: (tick: number) => {
    set({ tick });
  },

  setRunning: (running: boolean) => {
    set({ isRunning: running });
  },

  setSpeed: (speed: number) => {
    set({ speed: Math.max(0.1, speed) }); // Ensure speed > 0
  },

  updateConstants: (partial: Partial<SimulationConstants>) => {
    set((state) => ({
      constants: {
        ...state.constants,
        ...partial,
      },
    }));
  },

  resetConstants: () => {
    set({ constants: { ...SIMULATION_CONSTANTS } });
  },

  setSelectedTile: (tile: SelectedTile | null) => {
    set({ selectedTile: tile });
  },

  toggleFollowedLineage: (lineage: FollowedLineage) => {
    set((state) => {
      const exists = state.followedLineages.some(
        (item) => item.speciesId === lineage.speciesId && item.lineageId === lineage.lineageId
      );
      return {
        followedLineages: exists
          ? state.followedLineages.filter(
              (item) =>
                item.speciesId !== lineage.speciesId || item.lineageId !== lineage.lineageId
            )
          : [...state.followedLineages, { ...lineage }],
      };
    });
  },

  clearFollowedLineages: () => set({ followedLineages: [] }),
}));
