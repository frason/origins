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

// Cell interface for world state
export interface CellSnapshot {
  energy: number;
  nutrients: number;
  producerBiomass: number;
  toxicity: number;
}

// Creature interface for world state
export interface CreatureSnapshot {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  energy: number;
  age: number;
  lifecycleState: 'alive' | 'dead' | 'corpse';
  energyStrategy?: string; // 'herbivore' | 'carnivore' | 'omnivore' | 'scavenger'
}

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

  // Allow additional fields for forward compatibility
  [key: string]: unknown;
}

/**
 * SpeciesSummary: aggregated species data for the SpeciesPanel
 * Shows population, traits, and lineage info for each active species
 */
export interface SpeciesSummary {
  speciesId: string;
  name?: string; // User-assigned name, defaults to speciesId if not set
  population: number; // Number of living creatures in this species
  energyStrategy?: string; // 'herbivore' | 'carnivore' | 'omnivore' | 'scavenger'
  createdAtTick: number; // Tick when this species was first created
  [key: string]: unknown; // Allow forward compatibility
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

  // Actions
  setWorldState: (state: WorldSnapshot) => void;
  setTick: (tick: number) => void;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  setSpeciesList: (list: SpeciesSummary[]) => void;
  updateConstants: (partial: Partial<SimulationConstants>) => void;
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

  setSpeciesList: (list: SpeciesSummary[]) => {
    set({ speciesList: list });
  },

  updateConstants: (partial: Partial<SimulationConstants>) => {
    set((state) => ({
      constants: {
        ...state.constants,
        ...partial,
      },
    }));
  },
}));
