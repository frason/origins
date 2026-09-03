/**
 * Integration test: Phase 0 Harness save/load via new save slot system.
 *
 * Tests that:
 * 1. A Phase 0 state can be written to the new save slot system
 * 2. The Phase0Harness loadSaveSlot handler can restore it
 * 3. Full Phase 0 state (scout, building, crises, ledger, equilibrium) survives round-trip
 * 4. The UI-path restoration logic (World.fromJSON, EquilibriumTracker.setState, etc.)
 *    is correctly exercised when loading a save
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { autoSave, loadSaveById } from '../state/saveSlotManager';
import { listAutoSaves, clearAllSlots } from '../state/indexedDbSaveSystem';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import type { PersistedEngineState } from '../simulation/enginePersistence';
import { World } from '../simulation/world';
import { EquilibriumTracker } from '../simulation/pivot/equilibrium';
import { ResourceLedger } from '../simulation/pivot/economy';
import {
  restorePhase0FromPersistedState,
  restorePhase0LedgerFromState,
  type Phase0HarnessStateForRestore,
} from '../state/phase0Restore';

/** Create a realistic Phase 0 test payload with full state. */
function createPhase0TestPayload(tick: number): PersistedEngineState {
  return {
    version: 1,
    state: {
      tick,
      seed: 12345,
      creatures: [],
      world: {
        width: 100,
        height: 100,
        cells: Array(10000).fill({
          energy: 1,
          nutrients: 0,
          producerBiomass: 0,
          toxicity: 0.5,
          elevation: 0,
          moisture: 0,
          temperature: 0,
          biome: 'temperate' as const,
          producerArchetype: 'grass' as const,
        }),
      },
      events: [],
      constants: SIMULATION_CONSTANTS,
      history: [],
      historyInterval: 10,
      speciesProfiles: [],
      incipientSpecies: [],
      creatureIdCounter: 0,
      activeSounds: [],
      soundEventCounter: 0,
    },
    // Full Phase 0 state as persisted by Phase0Harness
    phase0: {
      ledger: {
        energy: 250,
        biomass: 100,
      },
      scout: {
        id: 'scout_0',
        x: 50,
        y: 50,
        waypoint: { x: 75, y: 75 },
        battery: 85,
        inBubble: true,
        status: 'active',
        onboardDiscoveries: [],
      },
      buildings: [
        {
          id: 'harvester_0',
          x: 51,
          y: 51,
          state: 'operational',
          decayTicks: 5,
          builtAtTick: 10,
        },
      ],
      crises: [
        {
          id: 'crisis_0',
          x: 30,
          y: 30,
          type: 'toxicity_spike',
          status: 'active',
          tick: 35,
        },
      ],
      worldGrid: {
        width: 100,
        height: 100,
        cells: Array(10000).fill({
          energy: 1,
          nutrients: 0,
          producerBiomass: 0,
          toxicity: 0.5,
          elevation: 0,
          moisture: 0,
          temperature: 0,
          biome: 'temperate' as const,
          producerArchetype: 'grass' as const,
        }),
      },
      equilibrium: {
        streakLength: 100,
        replacementWindow: [],
        lastConditionsState: false,
      },
    },
  };
}

describe('Phase 0 Save/Load Integration', () => {
  beforeEach(async () => {
    await clearAllSlots();
  });

  afterEach(async () => {
    await clearAllSlots();
  });

  it('writes a Phase 0 state to auto-save slot and loads it back', async () => {
    const originalPayload = createPhase0TestPayload(100);

    // Write to auto-save slot (as Phase0Harness does)
    const metadata = await autoSave(originalPayload, 'Test Phase 0 World');
    expect(metadata.id).toBeTruthy();
    expect(metadata.type).toBe('auto');
    expect(metadata.tick).toBe(100);

    // Verify save was created
    const saves = await listAutoSaves();
    expect(saves).toHaveLength(1);
    expect(saves[0].metadata.id).toBe(metadata.id);

    // Load the save (simulating Phase0Harness.loadSaveSlot)
    const loaded = await loadSaveById(metadata.id);
    expect(loaded).not.toBeNull();

    // Verify full Phase 0 state survived round-trip
    expect(loaded!.phase0).toBeDefined();
    const phase0 = loaded!.phase0!;

    // Ledger
    expect(phase0.ledger).toEqual({ energy: 250, biomass: 100 });

    // Scout
    expect(phase0.scout).toBeDefined();
    expect(phase0.scout!.x).toBe(50);
    expect(phase0.scout!.y).toBe(50);
    expect(phase0.scout!.waypoint).toEqual({ x: 75, y: 75 });
    expect(phase0.scout!.battery).toBe(85);

    // Building
    expect(phase0.buildings).toBeDefined();
    expect(phase0.buildings).toHaveLength(1);
    expect(phase0.buildings![0].state).toBe('operational');
    expect(phase0.buildings![0].x).toBe(51);

    // Crisis
    expect(phase0.crises).toBeDefined();
    expect(phase0.crises).toHaveLength(1);
    expect(phase0.crises![0].type).toBe('toxicity_spike');
    expect(phase0.crises![0].status).toBe('active');

    // Equilibrium
    expect(phase0.equilibrium).toBeDefined();
    expect(phase0.equilibrium!.streakLength).toBe(100);

    // World grid
    expect(phase0.worldGrid).toBeDefined();
    const grid = phase0.worldGrid as { width: number; height: number; cells: Array<{ toxicity: number }> };
    expect(grid.width).toBe(100);
    expect(grid.height).toBe(100);
    expect(grid.cells[0].toxicity).toBe(0.5);

    // Main state
    expect(loaded!.state.tick).toBe(100);
    expect(loaded!.state.seed).toBe(12345);
  });

  it('preserves all Phase 0 fields through multiple saves', async () => {
    const payloads = [
      createPhase0TestPayload(50),
      createPhase0TestPayload(100),
      createPhase0TestPayload(150),
    ];

    const saveIds: string[] = [];
    for (const payload of payloads) {
      const metadata = await autoSave(payload, 'Sequential Save');
      saveIds.push(metadata.id);
    }

    // Load all and verify
    for (let i = 0; i < saveIds.length; i++) {
      const loaded = await loadSaveById(saveIds[i]);
      expect(loaded).not.toBeNull();
      expect(loaded!.state.tick).toBe(50 + i * 50);
      expect(loaded!.phase0).toBeDefined();
      expect(loaded!.phase0!.scout).toBeDefined();
      expect(loaded!.phase0!.scout!.x).toBe(50);
      expect(loaded!.phase0!.ledger).toEqual({ energy: 250, biomass: 100 });
    }
  });

  it('maintains Phase 0 state integrity through full auto-save rotation', async () => {
    // Fill all 8 auto-save slots with unique Phase 0 state
    const saveIds: string[] = [];
    for (let slot = 0; slot < 8; slot++) {
      const payload = createPhase0TestPayload(slot * 100);
      // Modify scout position to make each unique
      if (payload.phase0 && payload.phase0.scout) {
        payload.phase0.scout.x = 50 + slot;
      }
      const metadata = await autoSave(payload, `Slot ${slot}`);
      saveIds.push(metadata.id);
    }

    // Verify all 8 exist and have unique scout positions
    const saves = await listAutoSaves();
    expect(saves).toHaveLength(8);

    const scoutPositions = new Set<number>();
    for (const slot of saves) {
      const loaded = await loadSaveById(slot.metadata.id);
      expect(loaded!.phase0).toBeDefined();
      expect(loaded!.phase0!.scout).toBeDefined();
      scoutPositions.add(loaded!.phase0!.scout!.x);
    }

    // All positions should be unique (50-57)
    expect(scoutPositions.size).toBe(8);
  });
});

describe('Phase 0 Restoration Logic (UI Path)', () => {
  beforeEach(async () => {
    await clearAllSlots();
  });

  afterEach(async () => {
    await clearAllSlots();
  });

  /**
   * Helper: Create a minimal Phase 0 harness state for testing.
   */
  function createMinimalPrevState(): Phase0HarnessStateForRestore {
    return {
      world: new World(100, 100, SIMULATION_CONSTANTS, 12345),
      ledger: new ResourceLedger(50, 25), // minimal initial resources
      scout: {
        id: 'scout_fallback',
        x: 0,
        y: 0,
        waypoint: null,
        battery: 50,
        inBubble: false,
        status: 'stranded',
        onboardDiscoveries: [],
      },
      building: null,
      crises: [],
      equilibrium: new EquilibriumTracker(),
      tick: 0,
      selectedWaypoint: null,
      burst: { isCharged: true, chargePercentage: 100, rechargeRatePerTick: 1 },
      spendTracker: { canAfford: () => true, recordSpend: () => {} },
      localComputeInfrastructure: [],
      crisisFailureStates: new Map(),
      llmSettings: {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      },
      commandLog: [],
    };
  }

  it('restores World grid via World.fromJSON when phase0.worldGrid exists', async () => {
    const payload = createPhase0TestPayload(200);
    const loaded = await autoSave(payload, 'World Grid Test');
    const persistedState = await loadSaveById(loaded.id);
    expect(persistedState).not.toBeNull();

    const prevState = createMinimalPrevState();
    const restored = restorePhase0FromPersistedState(persistedState!, prevState);

    // Verify that world was restored (not the fallback)
    expect(restored.world).toBeDefined();
    expect(restored.world.width).toBe(100);
    expect(restored.world.height).toBe(100);
    // Check that a cell has the toxicity value from the test payload
    const cell = restored.world.getCell(0, 0);
    expect(cell.toxicity).toBe(0.5);
  });

  it('restores EquilibriumTracker state via setState', async () => {
    const payload = createPhase0TestPayload(300);
    const loaded = await autoSave(payload, 'Equilibrium Test');
    const persistedState = await loadSaveById(loaded.id);
    expect(persistedState).not.toBeNull();

    const prevState = createMinimalPrevState();
    const restored = restorePhase0FromPersistedState(persistedState!, prevState);

    // Verify equilibrium was restored
    expect(restored.equilibrium).toBeDefined();
    const progress = restored.equilibrium.getProgress();
    expect(progress.streakLength).toBe(100); // From test payload
    expect(progress.allConditionsMet).toBe(false);
  });

  it('restores ResourceLedger via restorePhase0LedgerFromState', async () => {
    const payload = createPhase0TestPayload(400);
    const loaded = await autoSave(payload, 'Ledger Test');
    const persistedState = await loadSaveById(loaded.id);
    expect(persistedState).not.toBeNull();

    const prevState = createMinimalPrevState();
    const restored = restorePhase0FromPersistedState(persistedState!, prevState);

    // Verify ledger was restored
    expect(restored.ledger).toBeDefined();
    expect(restored.ledger.getBalance('energy')).toBe(250); // From test payload
    expect(restored.ledger.getBalance('biomass')).toBe(100); // From test payload
  });

  it('restores Scout, Building, and Crisis data', async () => {
    const payload = createPhase0TestPayload(500);
    const loaded = await autoSave(payload, 'Full State Test');
    const persistedState = await loadSaveById(loaded.id);
    expect(persistedState).not.toBeNull();

    const prevState = createMinimalPrevState();
    const restored = restorePhase0FromPersistedState(persistedState!, prevState);

    // Verify scout
    expect(restored.scout).toBeDefined();
    expect(restored.scout.x).toBe(50);
    expect(restored.scout.y).toBe(50);
    expect(restored.scout.waypoint).toEqual({ x: 75, y: 75 });

    // Verify building
    expect(restored.building).toBeDefined();
    expect(restored.building!.x).toBe(51);
    expect(restored.building!.y).toBe(51);
    expect(restored.building!.state).toBe('operational');

    // Verify crises
    expect(restored.crises).toBeDefined();
    expect(restored.crises).toHaveLength(1);
    expect(restored.crises[0].type).toBe('toxicity_spike');
    expect(restored.crises[0].x).toBe(30);
    expect(restored.crises[0].y).toBe(30);
  });

  it('restores tick number from main state', async () => {
    const payload = createPhase0TestPayload(600);
    const loaded = await autoSave(payload, 'Tick Test');
    const persistedState = await loadSaveById(loaded.id);
    expect(persistedState).not.toBeNull();

    const prevState = createMinimalPrevState();
    const restored = restorePhase0FromPersistedState(persistedState!, prevState);

    expect(restored.tick).toBe(600);
  });

  it('uses fallback state when phase0 fields are missing', () => {
    const prevState = createMinimalPrevState();
    prevState.scout.id = 'scout_original';

    // Create a minimal persisted state with only tick and phase0 structure
    const persistedState: PersistedEngineState = {
      version: 1,
      state: {
        tick: 999,
        seed: 12345,
        creatures: [],
        world: { width: 100, height: 100, cells: [] },
        events: [],
        constants: SIMULATION_CONSTANTS,
        history: [],
        historyInterval: 10,
        speciesProfiles: [],
        incipientSpecies: [],
        creatureIdCounter: 0,
        activeSounds: [],
        soundEventCounter: 0,
      },
      phase0: {
        ledger: { energy: 100, biomass: 50 },
        scout: undefined as any, // Missing scout in phase0
        buildings: undefined as any, // Missing buildings
        crises: undefined as any, // Missing crises (defaults to empty array)
        worldGrid: undefined as any, // Missing worldGrid
        equilibrium: undefined as any, // Missing equilibrium
      },
    };

    const restored = restorePhase0FromPersistedState(persistedState, prevState);

    // Should use fallback scout from prevState
    expect(restored.scout.id).toBe('scout_original');
    // When crises is missing in phase0, defaults to empty array (not fallback)
    expect(restored.crises).toHaveLength(0);
    // But tick should be restored
    expect(restored.tick).toBe(999);
    // And ledger should be restored
    expect(restored.ledger.getBalance('energy')).toBe(100);
  });

  it('throws error if phase0 data is missing entirely', () => {
    const prevState = createMinimalPrevState();
    const persistedStateNoPhase0: PersistedEngineState = {
      version: 1,
      state: {
        tick: 100,
        seed: 12345,
        creatures: [],
        world: { width: 100, height: 100, cells: [] },
        events: [],
        constants: SIMULATION_CONSTANTS,
        history: [],
        historyInterval: 10,
        speciesProfiles: [],
        incipientSpecies: [],
        creatureIdCounter: 0,
        activeSounds: [],
        soundEventCounter: 0,
      },
      phase0: undefined as any,
    };

    expect(() => {
      restorePhase0FromPersistedState(persistedStateNoPhase0, prevState);
    }).toThrow('Persisted state missing phase0 data');
  });
});
