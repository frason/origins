/**
 * Tests for Phase A save slot system: 8 auto + 2 manual slots with eviction warnings.
 *
 * Tests checkpoint round-trip serialization, rotation logic, eviction detection,
 * protect-action promotion, and manual-save overwrite picker.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import {
  autoSave,
  manualSave,
  manualSaveWithOverwrite,
  protectAutoSave,
  willAutoSaveEvict,
  getSaveStatus,
  loadSaveById,
  clearAllSaves,
  AUTO_SAVE_SLOTS,
  MANUAL_SAVE_SLOTS,
} from '../state/saveSlotManager';
import {
  listAutoSaves,
  listManualSaves,
  loadSlotById,
  clearAllSlots,
} from '../state/indexedDbSaveSystem';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import type { PersistedEngineState } from '../simulation/enginePersistence';

/** Create a minimal, deterministic test checkpoint. */
function createTestCheckpoint(tick: number, seed: number = 12345): PersistedEngineState {
  return {
    version: 1,
    state: {
      tick,
      seed,
      creatures: [],
      world: {
        width: 100,
        height: 100,
        cells: Array(10000).fill({
          energy: 1,
          nutrients: 0,
          producerBiomass: 0,
          toxicity: 0,
          elevation: 0,
          moisture: 0,
          temperature: 0,
          biome: 'temperate',
          producerArchetype: 'grass',
        }),
      },
      events: [],
      constants: SIMULATION_CONSTANTS,
      history: [],
      historyInterval: 10,
      speciesProfiles: [],
      incipientSpecies: [],
      creatureIdCounter: 0,
    },
  };
}

describe('Phase A: Save Slot System', () => {
  beforeEach(async () => {
    // Clear IndexedDB before each test
    await clearAllSlots();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearAllSlots();
  });

  describe('Auto-save rotation (8 slots, oldest evicted first)', () => {
    it('fills auto-save slots 0-7 in order', async () => {
      for (let i = 0; i < AUTO_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint(i * 10, 100 + i);
        const result = await autoSave(checkpoint, `test-auto-${i}`);
        expect(result.type).toBe('auto');
        expect(result.slot).toBe(i);
        expect(result.tick).toBe(i * 10);
      }

      const saves = await listAutoSaves();
      expect(saves).toHaveLength(AUTO_SAVE_SLOTS);
      saves.forEach((s, i) => {
        expect(s.metadata.slot).toBe(i);
      });
    });

    it('evicts oldest auto-save when pool is full', async () => {
      const checkpoints = [];
      for (let i = 0; i < AUTO_SAVE_SLOTS + 2; i++) {
        const checkpoint = createTestCheckpoint(i * 10, 100 + i);
        checkpoints.push(checkpoint);
        await autoSave(checkpoint, `test-auto-${i}`);
      }

      const saves = await listAutoSaves();
      expect(saves).toHaveLength(AUTO_SAVE_SLOTS);

      // First two checkpoints should be evicted
      const ticks = saves.map((s) => s.metadata.tick).sort();
      expect(ticks[0]).toBe(20); // First checkpoint (tick 0) was evicted
      expect(ticks[ticks.length - 1]).toBe((AUTO_SAVE_SLOTS + 1) * 10);
    });

    it('willAutoSaveEvict returns null when pool has space', async () => {
      for (let i = 0; i < AUTO_SAVE_SLOTS - 1; i++) {
        const checkpoint = createTestCheckpoint(i * 10);
        await autoSave(checkpoint, `test-${i}`);
      }

      const eviction = await willAutoSaveEvict();
      expect(eviction).toBeNull();
    });

    it('willAutoSaveEvict returns pending eviction when pool is full', async () => {
      for (let i = 0; i < AUTO_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint(i * 10, 100 + i);
        await autoSave(checkpoint, `test-auto-${i}`);
      }

      const eviction = await willAutoSaveEvict();
      expect(eviction).not.toBeNull();
      expect(eviction!.tick).toBe(0); // Oldest save's tick
      expect(eviction!.worldName).toBe('test-auto-0');
    });
  });

  describe('Manual-save pool (2 fixed slots, separate from auto)', () => {
    it('creates manual saves in slots 0-1', async () => {
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint((i + 100) * 10);
        const result = await manualSave(checkpoint, `test-manual-${i}`);
        expect(result.type).toBe('manual');
        expect(result.slot).toBe(i);
      }

      const saves = await listManualSaves();
      expect(saves).toHaveLength(MANUAL_SAVE_SLOTS);
    });

    it('throws when both manual slots are full and trying to save without overwrite', async () => {
      // Fill both slots
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint((i + 100) * 10);
        await manualSave(checkpoint, `test-manual-${i}`);
      }

      // Third manual save should fail
      const checkpoint = createTestCheckpoint(999 * 10);
      await expect(manualSave(checkpoint)).rejects.toThrow(/Manual save pool is full/);
    });

    it('allows manualSaveWithOverwrite when pool is full', async () => {
      // Fill both slots
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint((i + 100) * 10);
        await manualSave(checkpoint, `test-manual-${i}`);
      }

      const saves = await listManualSaves();
      const slotToOverwrite = saves[0].metadata.id;

      // Overwrite the first slot
      const newCheckpoint = createTestCheckpoint(999 * 10);
      const result = await manualSaveWithOverwrite(newCheckpoint, slotToOverwrite, 'overwritten');
      expect(result.type).toBe('manual');
      expect(result.worldName).toBe('overwritten');
      expect(result.tick).toBe(9990);

      // Still only 2 slots occupied
      const updatedSaves = await listManualSaves();
      expect(updatedSaves).toHaveLength(MANUAL_SAVE_SLOTS);
    });

    it('throws when trying to overwrite a non-existent manual slot', async () => {
      const checkpoint = createTestCheckpoint(999 * 10);
      await expect(
        manualSaveWithOverwrite(checkpoint, 'non-existent-id')
      ).rejects.toThrow(/not found or is not a manual slot/);
    });
  });

  describe('Protect auto-save action (promote to manual pool)', () => {
    it('promotes an auto-save to manual pool when space available', async () => {
      // Fill auto pool
      const autoCheckpoints = [];
      for (let i = 0; i < AUTO_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint(i * 10);
        autoCheckpoints.push(checkpoint);
        await autoSave(checkpoint, `auto-${i}`);
      }

      const autoSavesBefore = await listAutoSaves();
      expect(autoSavesBefore).toHaveLength(AUTO_SAVE_SLOTS);

      // Protect the first auto-save
      const toProtect = autoSavesBefore[0].metadata.id;
      const result = await protectAutoSave(toProtect);
      expect(result.type).toBe('manual');
      expect(result.tick).toBe(0);

      // Auto pool should have 7, manual pool should have 1
      const autoSavesAfter = await listAutoSaves();
      const manualSaves = await listManualSaves();
      expect(autoSavesAfter).toHaveLength(AUTO_SAVE_SLOTS - 1);
      expect(manualSaves).toHaveLength(1);
    });

    it('throws when protecting auto-save into a full manual pool', async () => {
      // Fill manual pool
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        const checkpoint = createTestCheckpoint((i + 100) * 10);
        await manualSave(checkpoint, `manual-${i}`);
      }

      // Create an auto-save to protect
      const autoCheckpoint = createTestCheckpoint(0);
      await autoSave(autoCheckpoint, 'auto-to-protect');
      const autoSaves = await listAutoSaves();
      const toProtect = autoSaves[0].metadata.id;

      // Should fail because manual pool is full
      await expect(protectAutoSave(toProtect)).rejects.toThrow(/Manual save pool is full/);
    });

    it('throws when protecting a non-existent auto-save', async () => {
      await expect(protectAutoSave('non-existent-id')).rejects.toThrow(
        /Auto-save slot.*not found/
      );
    });
  });

  describe('Checkpoint round-trip: save and load', () => {
    it('round-trips auto-save checkpoint without corruption', async () => {
      const originalCheckpoint = createTestCheckpoint(42, 54321);
      originalCheckpoint.state.creatures = [
        {
          id: 'creature-1',
          x: 50,
          y: 50,
          energy: 100,
          age: 10,
          alive: true,
        } as any,
      ];

      const metadata = await autoSave(originalCheckpoint, 'test-save');
      const loaded = await loadSaveById(metadata.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.state.tick).toBe(42);
      expect(loaded!.state.seed).toBe(54321);
      expect(loaded!.state.creatures).toHaveLength(1);
      expect((loaded!.state.creatures[0] as any).id).toBe('creature-1');
      expect(loaded!.version).toBe(1);
    });

    it('round-trips manual-save checkpoint without corruption', async () => {
      const originalCheckpoint = createTestCheckpoint(123, 99999);
      originalCheckpoint.state.constants.baseSolarEnergy = 16;

      const metadata = await manualSave(originalCheckpoint, 'manual-save-test');
      const loaded = await loadSaveById(metadata.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.state.tick).toBe(123);
      expect(loaded!.state.seed).toBe(99999);
      expect(loaded!.state.constants.baseSolarEnergy).toBe(16);
    });

    it('preserves checkpoint version field on round-trip', async () => {
      const checkpoint = createTestCheckpoint(50);
      const metadata = await autoSave(checkpoint);
      const loaded = await loadSaveById(metadata.id);

      expect(loaded!.version).toBe(1);
    });
  });

  describe('Save slot status and metadata', () => {
    it('reports accurate slot counts and capacity', async () => {
      // Fill auto and manual pools partially
      for (let i = 0; i < AUTO_SAVE_SLOTS - 2; i++) {
        await autoSave(createTestCheckpoint(i * 10), `auto-${i}`);
      }
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        await manualSave(createTestCheckpoint((i + 100) * 10), `manual-${i}`);
      }

      const status = await getSaveStatus();
      expect(status.autoCount).toBe(AUTO_SAVE_SLOTS - 2);
      expect(status.autoCapacity).toBe(AUTO_SAVE_SLOTS);
      expect(status.manualCount).toBe(MANUAL_SAVE_SLOTS);
      expect(status.manualCapacity).toBe(MANUAL_SAVE_SLOTS);
    });

    it('includes metadata in save slots (tick, timestamp, worldName)', async () => {
      const checkpoint = createTestCheckpoint(77);
      const before = Date.now();
      await autoSave(checkpoint, 'my-world');
      const after = Date.now();

      const saves = await listAutoSaves();
      const save = saves[0];
      expect(save.metadata.tick).toBe(77);
      expect(save.metadata.worldName).toBe('my-world');
      expect(save.metadata.timestamp).toBeGreaterThanOrEqual(before);
      expect(save.metadata.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Isolation: auto and manual pools are separate', () => {
    it('does not mix auto and manual saves', async () => {
      // Fill auto pool
      for (let i = 0; i < AUTO_SAVE_SLOTS; i++) {
        await autoSave(createTestCheckpoint(i * 10), `auto-${i}`);
      }

      // Fill manual pool
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        await manualSave(createTestCheckpoint((i + 100) * 10), `manual-${i}`);
      }

      const autoSaves = await listAutoSaves();
      const manualSaves = await listManualSaves();

      expect(autoSaves).toHaveLength(AUTO_SAVE_SLOTS);
      expect(manualSaves).toHaveLength(MANUAL_SAVE_SLOTS);
      expect(autoSaves.every((s) => s.metadata.type === 'auto')).toBe(true);
      expect(manualSaves.every((s) => s.metadata.type === 'manual')).toBe(true);
    });

    it('auto-save eviction does not affect manual pool', async () => {
      // Fill manual pool
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        await manualSave(createTestCheckpoint((i + 100) * 10), `manual-${i}`);
      }

      // Trigger auto-save eviction by filling and overfilling auto pool
      for (let i = 0; i < AUTO_SAVE_SLOTS + 3; i++) {
        await autoSave(createTestCheckpoint(i * 10), `auto-${i}`);
      }

      // Manual pool should still be intact
      const manualSaves = await listManualSaves();
      expect(manualSaves).toHaveLength(MANUAL_SAVE_SLOTS);
    });
  });

  describe('Clear all saves (test cleanup)', () => {
    it('clears all auto and manual saves', async () => {
      // Populate both pools
      for (let i = 0; i < AUTO_SAVE_SLOTS; i++) {
        await autoSave(createTestCheckpoint(i * 10));
      }
      for (let i = 0; i < MANUAL_SAVE_SLOTS; i++) {
        await manualSave(createTestCheckpoint((i + 100) * 10));
      }

      const statusBefore = await getSaveStatus();
      expect(statusBefore.autoCount + statusBefore.manualCount).toBeGreaterThan(0);

      await clearAllSaves();

      const statusAfter = await getSaveStatus();
      expect(statusAfter.autoCount).toBe(0);
      expect(statusAfter.manualCount).toBe(0);
    });
  });

  describe('Phase 0 state round-trip: scout, building, crises, ledger, equilibrium', () => {
    it('preserves full Phase0State (scout, building, crises, ledger, equilibrium) on save-restore', async () => {
      // Create a PersistedEngineState with phase0 data
      const phase0Payload: PersistedEngineState = {
        version: 1,
        state: {
          tick: 42,
          seed: 54321,
          creatures: [],
          world: {
            width: 100,
            height: 100,
            cells: Array(10000).fill({
              energy: 1,
              nutrients: 0,
              producerBiomass: 0,
              toxicity: 0,
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
        },
        // Include full Phase 0 state with all fields
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

      // Save with auto-save
      const metadata = await autoSave(phase0Payload, 'Phase0-Test-World');
      expect(metadata.id).toBeTruthy();
      expect(metadata.type).toBe('auto');
      expect(metadata.tick).toBe(42);

      // Load and verify
      const restored = await loadSaveById(metadata.id);
      expect(restored).not.toBeNull();
      expect(restored!.phase0).toBeDefined();

      // Verify each Phase 0 field survived intact
      const phase0 = restored!.phase0!;

      // Ledger
      expect(phase0.ledger).toEqual({ energy: 250, biomass: 100 });

      // Scout
      expect(phase0.scout).toEqual({
        id: 'scout_0',
        x: 50,
        y: 50,
        waypoint: { x: 75, y: 75 },
        battery: 85,
        inBubble: true,
        status: 'active',
        onboardDiscoveries: [],
      });

      // Buildings
      expect(phase0.buildings).toBeDefined();
      expect(phase0.buildings!).toHaveLength(1);
      expect(phase0.buildings![0]).toEqual({
        id: 'harvester_0',
        x: 51,
        y: 51,
        state: 'operational',
        decayTicks: 5,
        builtAtTick: 10,
      } as any);

      // Crises
      expect(phase0.crises).toBeDefined();
      expect(phase0.crises!).toHaveLength(1);
      expect(phase0.crises![0]).toEqual({
        id: 'crisis_0',
        x: 30,
        y: 30,
        type: 'toxicity_spike',
        status: 'active',
        tick: 35,
      });

      // Equilibrium
      expect(phase0.equilibrium).toEqual({
        streakLength: 100,
        replacementWindow: [],
        lastConditionsState: false,
      });

      // World grid (spot check a few cells)
      expect(phase0.worldGrid).toBeDefined();
      const grid = phase0.worldGrid as { width: number; height: number; cells: Array<{ toxicity: number }> };
      expect(grid.width).toBe(100);
      expect(grid.height).toBe(100);
      expect(grid.cells).toHaveLength(10000);
      expect(grid.cells[0].toxicity).toBe(0.5);
    });

    it('round-trips Phase 0 state through manual save as well', async () => {
      const phase0Payload: PersistedEngineState = {
        version: 1,
        state: {
          tick: 99,
          seed: 11111,
          creatures: [],
          world: {
            width: 100,
            height: 100,
            cells: Array(10000).fill({
              energy: 2,
              nutrients: 1,
              producerBiomass: 0,
              toxicity: 0,
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
        },
        phase0: {
          ledger: { energy: 500, biomass: 200 },
          scout: {
            id: 'scout_1',
            x: 60,
            y: 40,
            waypoint: null,
            battery: 50,
            inBubble: false,
            status: 'active',
            onboardDiscoveries: [],
          },
          buildings: [],
          crises: [],
          worldGrid: {
            width: 100,
            height: 100,
            cells: Array(10000).fill({
              energy: 2,
              nutrients: 1,
              producerBiomass: 0,
              toxicity: 0,
              elevation: 0,
              moisture: 0,
              temperature: 0,
              biome: 'temperate' as const,
              producerArchetype: 'grass' as const,
            }),
          },
          equilibrium: {
            streakLength: 0,
            replacementWindow: [],
            lastConditionsState: false,
          },
        },
      };

      // Manual save
      const metadata = await manualSave(phase0Payload, 'Phase0-Manual-Test');
      const restored = await loadSaveById(metadata.id);

      expect(restored!.phase0).toBeDefined();
      expect(restored!.phase0!.ledger).toEqual({ energy: 500, biomass: 200 });
      expect(restored!.phase0!.scout).toBeDefined();
      expect(restored!.phase0!.scout!.x).toBe(60);
      expect(restored!.phase0!.scout!.y).toBe(40);
      expect(restored!.phase0!.scout!.status).toBe('active');
      expect(restored!.phase0!.buildings).toBeDefined();
      expect(restored!.phase0!.buildings!).toHaveLength(0);
      expect(restored!.phase0!.crises).toBeDefined();
      expect(restored!.phase0!.crises!).toHaveLength(0);
    });
  });
});
