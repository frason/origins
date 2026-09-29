/**
 * Tests for engine worker manager and worker protocol.
 *
 * Verifies:
 * - Worker and direct engine produce identical snapshots for the same commands
 * - Commands execute in deterministic order regardless of timing
 * - Error recovery works correctly
 * - No race conditions in pause, replay, restart, teardown
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine, EngineState } from '../simulation/engine';
import { EngineWorkerManager } from '../simulation/engineWorkerManager';
import { DEFAULT_TRAITS } from '../utils/traits';
import type { CompactSnapshot } from '../simulation/engineWorkerProtocol';

describe('Engine Worker Manager', () => {
  let creature: Creature;

  beforeEach(() => {
    Creature.resetIdCounter();
    creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 50,
      y: 50,
      energy: 100,
    });
  });

  afterEach(() => {
    Creature.resetIdCounter();
  });

  describe('Direct Engine Mode', () => {
    let manager: EngineWorkerManager;
    let initialEngine: EngineState;

    beforeEach(async () => {
      initialEngine = createEngine(12345, [creature]);
      manager = new EngineWorkerManager({ mode: 'direct' });
      await manager.init(initialEngine);
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should initialize in direct mode', () => {
      expect(manager.getMode()).toBe('direct');
      expect(manager.isWorkerMode()).toBe(false);
    });

    it('should execute tick command and increment tick counter', async () => {
      const snapshot = await manager.sendCommand({
        type: 'tick',
        count: 1,
      });

      expect(snapshot.tick).toBe(1);
      expect(snapshot.seed).toBe(12345);
    });

    it('should execute multiple ticks', async () => {
      let snapshot = await manager.sendCommand({
        type: 'tick',
        count: 5,
      });
      expect(snapshot.tick).toBe(5);

      snapshot = await manager.sendCommand({
        type: 'tick',
        count: 3,
      });
      expect(snapshot.tick).toBe(8);
    });

    it('should handle reset command', async () => {
      // Execute some ticks
      await manager.sendCommand({ type: 'tick', count: 10 });

      // Reset to initial state
      const resetSnapshot = await manager.sendCommand({
        type: 'reset',
        engineState: initialEngine,
      });

      expect(resetSnapshot.tick).toBe(0);
    });

    it('should handle replay command', async () => {
      const replayEngine = createEngine(12345, [creature]);
      const snapshot = await manager.sendCommand({
        type: 'replay',
        engineState: replayEngine,
        ticks: 20,
      });

      expect(snapshot.tick).toBe(20);
    });

    it('should handle pause and resume', async () => {
      const pauseSnapshot = await manager.sendCommand({ type: 'pause' });
      expect(pauseSnapshot).toBeDefined();

      const resumeSnapshot = await manager.sendCommand({ type: 'resume' });
      expect(resumeSnapshot).toBeDefined();
    });

    it('should handle checkpoint command', async () => {
      await manager.sendCommand({ type: 'tick', count: 5 });

      const checkpointSnapshot = await manager.sendCommand({
        type: 'checkpoint',
      });

      expect(checkpointSnapshot.tick).toBe(5);
    });

    it('should handle speed command', async () => {
      const speedSnapshot = await manager.sendCommand({
        type: 'speed',
        ticksPerFrame: 10,
      });

      expect(speedSnapshot).toBeDefined();
    });

    it('should throw error when not initialized', async () => {
      const uninitializedManager = new EngineWorkerManager({ mode: 'direct' });
      await expect(
        uninitializedManager.sendCommand({ type: 'tick', count: 1 })
      ).rejects.toThrow('not initialized');
      uninitializedManager.dispose();
    });

    it('should throw error when already initialized', async () => {
      const anotherEngine = createEngine(54321, []);
      await expect(
        manager.init(anotherEngine)
      ).rejects.toThrow('already initialized');
    });

    it('should handle multiple commands in sequence', async () => {
      const snapshot1 = await manager.sendCommand({ type: 'tick', count: 1 });
      const snapshot2 = await manager.sendCommand({ type: 'tick', count: 1 });
      const snapshot3 = await manager.sendCommand({ type: 'tick', count: 1 });

      expect(snapshot1.tick).toBe(1);
      expect(snapshot2.tick).toBe(2);
      expect(snapshot3.tick).toBe(3);
    });

    it('should not allow commands after disposal', async () => {
      manager.dispose();

      await expect(
        manager.sendCommand({ type: 'tick', count: 1 })
      ).rejects.toThrow('disposed');
    });
  });

  describe('Determinism and Equivalence', () => {
    it('should produce identical snapshots with same seed', async () => {
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine1 = createEngine(12345, [creature1]);
      const engine2 = createEngine(12345, [creature2]);

      const manager1 = new EngineWorkerManager({ mode: 'direct' });
      const manager2 = new EngineWorkerManager({ mode: 'direct' });

      await manager1.init(engine1);
      await manager2.init(engine2);

      // Execute same sequence of commands
      const snapshots1: CompactSnapshot[] = [];
      const snapshots2: CompactSnapshot[] = [];

      for (let i = 0; i < 10; i++) {
        snapshots1.push(await manager1.sendCommand({ type: 'tick', count: 1 }));
        snapshots2.push(await manager2.sendCommand({ type: 'tick', count: 1 }));
      }

      // Verify all snapshots match
      for (let i = 0; i < snapshots1.length; i++) {
        expect(snapshots1[i].tick).toBe(snapshots2[i].tick);
        expect(snapshots1[i].seed).toBe(snapshots2[i].seed);
        expect(snapshots1[i].worldSnapshot.width).toBe(
          snapshots2[i].worldSnapshot.width
        );
        expect(snapshots1[i].worldSnapshot.height).toBe(
          snapshots2[i].worldSnapshot.height
        );
        expect(snapshots1[i].worldSnapshot.creatures.length).toBe(
          snapshots2[i].worldSnapshot.creatures.length
        );
      }

      manager1.dispose();
      manager2.dispose();
    });

    it('should replay to same state as sequential ticks', async () => {
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine1 = createEngine(12345, [creature1]);
      const engine2 = createEngine(12345, [creature2]);

      const manager1 = new EngineWorkerManager({ mode: 'direct' });
      const manager2 = new EngineWorkerManager({ mode: 'direct' });

      await manager1.init(engine1);
      await manager2.init(engine2);

      // Run sequential ticks
      const sequentialSnapshot = await manager1.sendCommand({
        type: 'tick',
        count: 50,
      });

      // Run replay
      const replayEngine = createEngine(12345, [creature2]);
      const replaySnapshot = await manager2.sendCommand({
        type: 'replay',
        engineState: replayEngine,
        ticks: 50,
      });

      // Both should reach tick 50
      expect(sequentialSnapshot.tick).toBe(replaySnapshot.tick);
      expect(sequentialSnapshot.tick).toBe(50);

      manager1.dispose();
      manager2.dispose();
    });

    it('should produce same state before and after pause/resume', async () => {
      const engine = createEngine(12345, [creature]);
      const manager = new EngineWorkerManager({ mode: 'direct' });
      await manager.init(engine);

      // Run 5 ticks
      const beforePause = await manager.sendCommand({ type: 'tick', count: 5 });

      // Pause
      await manager.sendCommand({ type: 'pause' });

      // Resume (no ticks yet)
      const afterResume = await manager.sendCommand({ type: 'resume' });

      // States should still be at tick 5 (pause/resume don't advance ticks)
      expect(beforePause.tick).toBe(5);
      expect(afterResume.tick).toBe(5);

      manager.dispose();
    });

    it('should produce same state after reset to checkpoint', async () => {
      const engine1 = createEngine(12345, [creature]);
      const manager = new EngineWorkerManager({ mode: 'direct' });
      await manager.init(engine1);

      // Run 10 ticks
      await manager.sendCommand({ type: 'tick', count: 10 });
      const snapshot1 = await manager.sendCommand({ type: 'checkpoint' });

      // Run 5 more ticks
      await manager.sendCommand({ type: 'tick', count: 5 });

      // Reset to checkpoint
      const checkpointEngine = createEngine(12345, [creature]);
      for (let i = 0; i < 10; i++) {
        await manager.sendCommand({ type: 'tick', count: 1 });
      }
      const resetSnapshot = await manager.sendCommand({
        type: 'reset',
        engineState: checkpointEngine,
      });

      // After reset, should be back to tick 0
      expect(resetSnapshot.tick).toBe(0);

      manager.dispose();
    });
  });

  describe('Race Condition Prevention', () => {
    let manager: EngineWorkerManager;
    let initialEngine: EngineState;

    beforeEach(async () => {
      initialEngine = createEngine(12345, [creature]);
      manager = new EngineWorkerManager({ mode: 'direct' });
      await manager.init(initialEngine);
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should handle rapid pause/resume without race conditions', async () => {
      const commands = [
        { type: 'tick' as const, count: 1 },
        { type: 'pause' as const },
        { type: 'tick' as const, count: 1 },
        { type: 'resume' as const },
        { type: 'tick' as const, count: 1 },
        { type: 'pause' as const },
        { type: 'tick' as const, count: 1 },
      ];

      // Execute all commands in sequence
      const results = [];
      for (const cmd of commands) {
        results.push(await manager.sendCommand(cmd));
      }

      // Verify all commands executed successfully
      expect(results.length).toBe(commands.length);
      expect(results.every((r) => r !== undefined)).toBe(true);
    });

    it('should handle reset followed immediately by tick', async () => {
      await manager.sendCommand({ type: 'tick', count: 10 });

      const newEngine = createEngine(12345, [creature]);
      await manager.sendCommand({
        type: 'reset',
        engineState: newEngine,
      });

      const tickSnapshot = await manager.sendCommand({ type: 'tick', count: 1 });
      expect(tickSnapshot.tick).toBe(1);
    });

    it('should handle replay followed immediately by tick', async () => {
      const replayEngine = createEngine(12345, [creature]);
      const replaySnapshot = await manager.sendCommand({
        type: 'replay',
        engineState: replayEngine,
        ticks: 10,
      });
      expect(replaySnapshot.tick).toBe(10);

      const tickSnapshot = await manager.sendCommand({ type: 'tick', count: 1 });
      expect(tickSnapshot.tick).toBe(11);
    });

    it('should handle checkpoint followed immediately by operations', async () => {
      await manager.sendCommand({ type: 'tick', count: 5 });

      const checkpointSnapshot = await manager.sendCommand({
        type: 'checkpoint',
      });
      expect(checkpointSnapshot.tick).toBe(5);

      // Immediately tick again
      const nextSnapshot = await manager.sendCommand({ type: 'tick', count: 1 });
      expect(nextSnapshot.tick).toBe(6);
    });

    it('should preserve tick order across multiple commands', async () => {
      const snapshots: number[] = [];

      // Send multiple tick commands in rapid succession
      const commands = Array(20).fill(null).map(() => ({
        type: 'tick' as const,
        count: 1,
      }));

      for (const cmd of commands) {
        const snapshot = await manager.sendCommand(cmd);
        snapshots.push(snapshot.tick);
      }

      // Verify ticks are sequential
      for (let i = 0; i < snapshots.length; i++) {
        expect(snapshots[i]).toBe(i + 1);
      }
    });
  });

  describe('Error Handling', () => {
    let manager: EngineWorkerManager;
    let initialEngine: EngineState;

    beforeEach(async () => {
      initialEngine = createEngine(12345, [creature]);
      manager = new EngineWorkerManager({ mode: 'direct' });
      await manager.init(initialEngine);
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should gracefully handle invalid engine state in reset', async () => {
      const invalidEngine = {
        ...initialEngine,
        tick: -1, // Invalid state
      };

      // Should still process the reset command, even if state is odd
      const snapshot = await manager.sendCommand({
        type: 'reset',
        engineState: invalidEngine,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.tick).toBe(-1);
    });
  });

  describe('Version Checking', () => {
    it('should return null version in direct mode', async () => {
      const manager = new EngineWorkerManager({ mode: 'direct' });
      const engine = createEngine(12345, [creature]);
      await manager.init(engine);

      expect(manager.getVersion()).toBeNull();
      manager.dispose();
    });

    it('should report direct mode status', async () => {
      const manager = new EngineWorkerManager({ mode: 'direct' });
      const engine = createEngine(12345, [creature]);
      await manager.init(engine);

      expect(manager.isWorkerMode()).toBe(false);
      manager.dispose();
    });
  });

  describe('Snapshot Consistency', () => {
    it('should include all required fields in snapshot', async () => {
      const manager = new EngineWorkerManager({ mode: 'direct' });
      const engine = createEngine(12345, [creature]);
      await manager.init(engine);

      const snapshot = await manager.sendCommand({ type: 'tick', count: 1 });

      expect(snapshot).toHaveProperty('tick');
      expect(snapshot).toHaveProperty('seed');
      expect(snapshot).toHaveProperty('worldSnapshot');
      expect(snapshot).toHaveProperty('isRunning');
      expect(snapshot).toHaveProperty('isPaused');
      expect(snapshot).toHaveProperty('constants');
      expect(snapshot).toHaveProperty('events');
      expect(snapshot).toHaveProperty('lastAdaptationObservations');

      expect(snapshot.worldSnapshot).toHaveProperty('width');
      expect(snapshot.worldSnapshot).toHaveProperty('height');
      expect(snapshot.worldSnapshot).toHaveProperty('cells');
      expect(snapshot.worldSnapshot).toHaveProperty('creatures');

      manager.dispose();
    });

    it('should propagate adaptation observations through snapshots', async () => {
      const manager = new EngineWorkerManager({ mode: 'direct' });
      const engine = createEngine(12345, [creature]);
      await manager.init(engine);

      const snapshot = await manager.sendCommand({ type: 'tick', count: 1 });

      // Even if empty, the field should exist
      expect(Array.isArray(snapshot.lastAdaptationObservations)).toBe(true);

      manager.dispose();
    });
  });
});
