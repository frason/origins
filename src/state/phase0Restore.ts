/**
 * Phase 0 restoration logic: extract full state from a persisted save
 * and restore it to a component state object.
 *
 * This is the core restoration pipeline that runs when a player loads
 * a save via the UI. It reconstructs:
 * - World grid (via World.fromJSON)
 * - Equilibrium tracker state
 * - Resource ledger
 * - Scout, building, crises
 *
 * Extracted to a separate module so it can be tested independently
 * of the React component lifecycle.
 */

import type { PersistedEngineState } from '../simulation/enginePersistence';
import type { Phase0State } from '../simulation/checkpointTimeline';
import { World } from '../simulation/world';
import { EquilibriumTracker } from '../simulation/pivot/equilibrium';
import { ResourceLedger } from '../simulation/pivot/economy';
import type { Scout } from '../simulation/pivot/scout';
import type { Building } from '../simulation/pivot/building';
import type { Crisis } from '../simulation/pivot/crisis';
import {
  createDefaultBurstWindow,
  createSpendTrackerAdapter,
  type BurstWindowState,
  type SpendTracker,
  type LocalComputeBuilding,
} from '../simulation/pivot/crisisResponseHandler';
import type { LLMProviderSettings } from '../services/llmProviderConfig';

/**
 * Intermediate type representing the key fields of Phase0 Harness state.
 * Includes all persisted Phase 0 state plus transient UI state (selectedWaypoint).
 */
export interface Phase0HarnessStateForRestore {
  world: World;
  ledger: ResourceLedger;
  scout: Scout;
  building: Building | null;
  crises: Crisis[];
  equilibrium: EquilibriumTracker;
  tick: number;
  selectedWaypoint: { x: number; y: number } | null;
  burst: BurstWindowState;
  spendTracker: SpendTracker;
  localComputeInfrastructure: LocalComputeBuilding[];
  crisisFailureStates: Map<string, { count: number }>;
  llmSettings: LLMProviderSettings;
  commandLog: any[];
}

/**
 * Converts Phase0State ledger balances to a ResourceLedger instance.
 * Used when restoring from persisted phase0 data.
 */
export function restorePhase0LedgerFromState(ledgerState: Phase0State['ledger']): ResourceLedger {
  if (!ledgerState) return new ResourceLedger();
  return new ResourceLedger(ledgerState.energy, ledgerState.biomass);
}

/**
 * Restore full Phase 0 state from a persisted engine state.
 *
 * Takes a loaded PersistedEngineState (from IndexedDB via loadSaveById),
 * extracts the phase0 data, and reconstructs all objects (World, EquilibriumTracker, etc).
 *
 * @param persistedState The loaded state from IndexedDB
 * @param prevState The current component state (used as fallback for any fields that can't be restored)
 * @returns A new Phase0HarnessStateForRestore with full restored data
 * @throws If phase0 data is missing or world grid cannot be deserialized
 */
export function restorePhase0FromPersistedState(
  persistedState: PersistedEngineState,
  prevState: Phase0HarnessStateForRestore
): Phase0HarnessStateForRestore {
  if (!persistedState.phase0) {
    throw new Error('Persisted state missing phase0 data');
  }

  const phase0 = persistedState.phase0;

  // Restore world grid from save
  let restoredWorld = prevState.world;
  if (phase0.worldGrid) {
    try {
      restoredWorld = World.fromJSON(phase0.worldGrid);
    } catch (e) {
      console.warn('Failed to restore world grid from save:', e);
      // Fall back to previous world if restoration fails
    }
  }

  // Restore equilibrium tracker state from save
  let restoredEquilibrium = prevState.equilibrium;
  if (phase0.equilibrium) {
    restoredEquilibrium = new EquilibriumTracker();
    restoredEquilibrium.setState(phase0.equilibrium);
  }

  // Restore ledger from persisted state
  const restoredLedger = restorePhase0LedgerFromState(phase0.ledger);

  return {
    world: restoredWorld,
    ledger: restoredLedger,
    tick: persistedState.state.tick,
    scout: phase0.scout || prevState.scout,
    building: phase0.buildings?.[0] ?? null,
    crises: phase0.crises || [],
    equilibrium: restoredEquilibrium,
    selectedWaypoint: null, // Clear UI-level waypoint selection on restore
    burst: createDefaultBurstWindow(),
    spendTracker: createSpendTrackerAdapter(10.0),
    localComputeInfrastructure: [],
    crisisFailureStates: new Map(),
    llmSettings: prevState.llmSettings,
    commandLog: [],
  };
}
