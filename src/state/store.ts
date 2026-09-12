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
import type { Biome, SubstrateType } from '../simulation/world';
import type { ProducerArchetype } from '../simulation/producerTypes';
import type { SimEvent } from '../simulation/events';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { IncipientSpecies, SpeciesProfile } from '../simulation/speciation';
import type { PendingEviction } from './saveSlotManager';
import type { AdaptationObservation } from '../simulation/adaptationMetrics';
import type { EcosystemWatch, EcosystemAlert } from '../simulation/watches';
import type { ObservatoryState } from '../ui/observatoryObjectives';
import type { FieldJournal, FieldJournalEntry } from '../simulation/fieldJournal';
import { saveFieldJournal } from './fieldJournalPersistence';
import type { WorldBranch, BranchCollection } from '../simulation/worldBranch';
import { tickEngineWithDisaster } from '../simulation/applyDisasterCommand';
import type { DisasterCommand } from '../simulation/disasterCommand';
import type { EngineState } from '../simulation/engine';

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
  corpseBiomass?: number; // Aggregated biomass from decaying corpses
  decompserActivity?: number; // Decomposer activity rate (0-1)
  substrate: SubstrateType;
  waterDepth: number;
  waterTable: number;
  dissolvedNutrients: number;
  salinity: number;
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
  lastReproductionAge?: number | null;
  generation?: number;
  incipientSpeciesId?: string | null;
  offspringCount?: number;
  toxinExposure?: number;
  localResourcePressure?: number;
  reproductionPressureMultiplier?: number;
  dispersalTargetX?: number | null;
  dispersalTargetY?: number | null;
  lastDispersalTick?: number | null;
  dispersalMoves?: number;
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
  speciesProfiles?: SpeciesProfile[];
  incipientSpecies?: IncipientSpecies[];

  // Evolution truth: trait frequencies and adaptation evidence
  lastAdaptationObservations?: AdaptationObservation[];

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

export interface SaveSlotStatus {
  autoCount: number;
  autoCapacity: number;
  manualCount: number;
  manualCapacity: number;
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
  saveSlotStatus: SaveSlotStatus;
  pendingEviction: PendingEviction | null;
  show2dView: boolean;
  observatoryState: ObservatoryState | null;
  ecosystemWatches: EcosystemWatch[];
  ecosystemAlerts: EcosystemAlert[];
  fieldJournal: FieldJournal | null;
  branchCollection: BranchCollection | null;
  activeBranchId: string | null; // ID of currently active branch (null = main)
  showBranchComparison: boolean;

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
  updateSaveSlotStatus: (status: SaveSlotStatus) => void;
  setPendingEviction: (eviction: PendingEviction | null) => void;
  setShow2dView: (show: boolean) => void;
  setObservatoryState: (state: ObservatoryState) => void;
  addWatch: (watch: EcosystemWatch) => void;
  updateWatch: (id: string, updates: Partial<EcosystemWatch>) => void;
  removeWatch: (id: string) => void;
  dismissAlert: (alertId: string) => void;
  addAlerts: (alerts: EcosystemAlert[]) => void;
  clearAlerts: () => void;
  setFieldJournal: (journal: FieldJournal) => void;
  addJournalEntry: (entry: FieldJournalEntry) => void;
  updateJournalEntryNotes: (entryId: string, notes: string) => void;
  clearFieldJournal: () => void;
  // Branch management actions
  setBranchCollection: (collection: BranchCollection) => void;
  createBranch: (branch: WorldBranch) => void;
  activateBranch: (branchId: string | null) => void;
  removeBranch: (branchId: string) => void;
  updateBranch: (branchId: string, updates: Partial<WorldBranch>) => void;
  setShowBranchComparison: (show: boolean) => void;
  // Disaster management
  triggerDisaster: (command: DisasterCommand, engineState: EngineState) => EngineState | null;
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
  saveSlotStatus: {
    autoCount: 0,
    autoCapacity: 8,
    manualCount: 0,
    manualCapacity: 2,
  },
  pendingEviction: null,
  show2dView: false,
  observatoryState: null,
  ecosystemWatches: [],
  ecosystemAlerts: [],
  fieldJournal: null,
  branchCollection: null,
  activeBranchId: null,
  showBranchComparison: false,

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

  updateSaveSlotStatus: (status: SaveSlotStatus) => {
    set({ saveSlotStatus: status });
  },

  setPendingEviction: (eviction: PendingEviction | null) => {
    set({ pendingEviction: eviction });
  },

  setShow2dView: (show: boolean) => {
    set({ show2dView: show });
  },

  setObservatoryState: (state: ObservatoryState) => {
    set({ observatoryState: state });
  },

  addWatch: (watch: EcosystemWatch) => {
    set((state) => ({
      ecosystemWatches: [...state.ecosystemWatches, { ...watch, createdAtTick: state.tick }],
    }));
  },

  updateWatch: (id: string, updates: Partial<EcosystemWatch>) => {
    set((state) => ({
      ecosystemWatches: state.ecosystemWatches.map((w) =>
        w.id === id ? { ...w, ...updates } : w
      ),
    }));
  },

  removeWatch: (id: string) => {
    set((state) => ({
      ecosystemWatches: state.ecosystemWatches.filter((w) => w.id !== id),
    }));
  },

  dismissAlert: (alertId: string) => {
    set((state) => ({
      ecosystemAlerts: state.ecosystemAlerts.map((a) =>
        a.id === alertId ? { ...a, dismissed: true } : a
      ),
    }));
  },

  addAlerts: (alerts: EcosystemAlert[]) => {
    set((state) => {
      const existingIds = new Set(state.ecosystemAlerts.map((a) => a.id));
      const newAlerts = alerts.filter((a) => !existingIds.has(a.id));
      return {
        ecosystemAlerts: [...state.ecosystemAlerts, ...newAlerts],
      };
    });
  },

  clearAlerts: () => {
    set({ ecosystemAlerts: [] });
  },

  setFieldJournal: (journal: FieldJournal) => {
    set({ fieldJournal: journal });
  },

  addJournalEntry: (entry: FieldJournalEntry) => {
    set((state) => {
      if (!state.fieldJournal) return state;
      const updated = { ...state.fieldJournal };
      if (!updated.entryIndex.has(entry.id)) {
        updated.entries = [...updated.entries, entry];
        updated.entryIndex.set(entry.id, entry);
        updated.lastUpdatedTick = Math.max(updated.lastUpdatedTick, entry.tick);
      }
      return { fieldJournal: updated };
    });
  },

  updateJournalEntryNotes: (entryId: string, notes: string) => {
    set((state) => {
      if (!state.fieldJournal) return state;
      const entry = state.fieldJournal.entryIndex.get(entryId);
      if (!entry) return state;
      const updated = { ...state.fieldJournal };
      updated.entries = updated.entries.map((e) =>
        e.id === entryId ? { ...e, playerNotes: notes } : e
      );
      updated.entryIndex.set(entryId, { ...entry, playerNotes: notes });

      // Persist to storage
      if (typeof window !== 'undefined' && window.localStorage) {
        saveFieldJournal(window.localStorage, updated);
      }

      return { fieldJournal: updated };
    });
  },

  clearFieldJournal: () => {
    set({ fieldJournal: null });
  },

  // Branch management
  setBranchCollection: (collection: BranchCollection) => {
    set({ branchCollection: collection });
  },

  createBranch: (branch: WorldBranch) => {
    set((state) => {
      if (!state.branchCollection) {
        // Initialize if no collection exists - branch becomes the main branch
        return { branchCollection: { main: branch, alternatives: [] } };
      }
      return {
        branchCollection: {
          main: state.branchCollection.main,
          alternatives: [...state.branchCollection.alternatives, branch],
        },
      };
    });
  },

  activateBranch: (branchId: string | null) => {
    set((state) => {
      if (!state.branchCollection) return state;
      let branchToActivate: WorldBranch | null = null;

      if (branchId === null) {
        branchToActivate = state.branchCollection.main;
      } else {
        branchToActivate = state.branchCollection.alternatives.find((b) => b.id === branchId) || null;
      }

      if (branchToActivate) {
        return {
          activeBranchId: branchId,
          branchCollection: {
            main: state.branchCollection.main,
            alternatives: state.branchCollection.alternatives.map((b) => ({
              ...b,
              active: b.id === branchId,
            })),
          },
        };
      }
      return state;
    });
  },

  removeBranch: (branchId: string) => {
    set((state) => {
      if (!state.branchCollection) return state;
      // Cannot remove main branch
      if (branchId === state.branchCollection.main.id) return state;

      return {
        branchCollection: {
          main: state.branchCollection.main,
          alternatives: state.branchCollection.alternatives.filter((b) => b.id !== branchId),
        },
        activeBranchId: state.activeBranchId === branchId ? null : state.activeBranchId,
      };
    });
  },

  updateBranch: (branchId: string, updates: Partial<WorldBranch>) => {
    set((state) => {
      if (!state.branchCollection) return state;

      let updated = false;
      const main = state.branchCollection.main.id === branchId
        ? { ...state.branchCollection.main, ...updates }
        : state.branchCollection.main;

      const alternatives = state.branchCollection.alternatives.map((b) => {
        if (b.id === branchId) {
          updated = true;
          return { ...b, ...updates };
        }
        return b;
      });

      if (!updated && main.id !== branchId) return state;

      return {
        branchCollection: {
          main,
          alternatives,
        },
      };
    });
  },

  setShowBranchComparison: (show: boolean) => {
    set({ showBranchComparison: show });
  },

  triggerDisaster: (command: DisasterCommand, engineState: EngineState): EngineState | null => {
    try {
      const newState = tickEngineWithDisaster(engineState, command);
      return newState;
    } catch (error) {
      console.error('Failed to apply disaster:', error);
      return null;
    }
  },
}));
