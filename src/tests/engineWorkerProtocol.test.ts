/**
 * Tests for engine worker protocol and direct worker execution equivalence.
 *
 * These tests verify that:
 * - The worker protocol correctly defines all command and response types
 * - Direct worker execution (without browser Worker) produces correct snapshots
 * - Worker command execution matches direct engine execution
 * - Error handling in the worker follows the protocol
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine, EngineState } from '../simulation/engine';
import { snapshotEngine } from '../state/snapshot';
import { executeCommand, workerState, createSnapshot as createWorkerSnapshot } from '../simulation/engineWorker';
import type {
  WorkerCommand,
  CompactSnapshot,
  WorkerVersionInfo,
} from '../simulation/engineWorkerProtocol';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('Engine Worker Protocol', () => {
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

  describe('Worker Command Execution (Direct Testing)', () => {
    it('should execute init command and update state', () => {
      const engine = createEngine(12345, [creature]);

      // Reset worker state before test
      (workerState as any).initialized = false;
      (workerState as any).engineState = null;

      const command: WorkerCommand = {
        type: 'init',
        engineState: engine,
        config: {
          workerVersion: '1.0.0',
          targetFps: 60,
        },
      };

      // Execute command
      const snapshot = executeCommand(command);

      // Verify state was updated
      expect(workerState.initialized).toBe(true);
      expect(workerState.engineState).not.toBeNull();
      expect(workerState.engineState?.tick).toBe(0);
      expect(snapshot.tick).toBe(0);
    });

    it('should execute tick command and increment counter', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;

      const command: WorkerCommand = {
        type: 'tick',
        count: 5,
      };

      const snapshot = executeCommand(command);

      expect(workerState.ticksProcessed).toBeGreaterThan(0);
      expect(workerState.engineState?.tick).toBe(5);
      expect(snapshot.tick).toBe(5);
    });

    it('should execute pause command', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;

      const command: WorkerCommand = {
        type: 'pause',
      };

      const snapshot = executeCommand(command);

      expect(workerState.paused).toBe(true);
      expect(workerState.isRunning).toBe(false);
      expect(snapshot).toBeDefined();
    });

    it('should execute resume command', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = true;
      (workerState as any).isRunning = false;

      const command: WorkerCommand = {
        type: 'resume',
      };

      const snapshot = executeCommand(command);

      expect(workerState.paused).toBe(false);
      expect(workerState.isRunning).toBe(true);
      expect(snapshot).toBeDefined();
    });

    it('should execute reset command', () => {
      const engine1 = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine1;

      // Advance a few ticks
      (workerState as any).engineState = tickEngine((workerState as any).engineState);
      (workerState as any).engineState = tickEngine((workerState as any).engineState);
      expect(workerState.engineState?.tick).toBe(2);

      // Create new engine and reset to it
      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });
      const engine2 = createEngine(54321, [creature2]);

      const command: WorkerCommand = {
        type: 'reset',
        engineState: engine2,
      };

      const snapshot = executeCommand(command);

      expect(workerState.engineState?.seed).toBe(54321);
      expect(workerState.engineState?.tick).toBe(0);
      expect(workerState.ticksProcessed).toBe(0);
      expect(snapshot.tick).toBe(0);
    });

    it('should execute replay command deterministically', () => {
      const engine = createEngine(12345, [creature]);

      // Create two snapshots before and after replay
      const beforeSnapshot = snapshotEngine(engine);

      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;

      const command: WorkerCommand = {
        type: 'replay',
        engineState: engine,
        ticks: 20,
      };

      const snapshot = executeCommand(command);

      // Verify ticks advanced
      expect(snapshot.tick).toBe(beforeSnapshot.tick + 20);
    });

    it('should execute speed command (no-op but acknowledged)', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;

      const initialTick = engine.tick;

      const command: WorkerCommand = {
        type: 'speed',
        ticksPerFrame: 10,
      };

      const snapshot = executeCommand(command);

      // Speed command should not change tick
      expect(workerState.engineState?.tick).toBe(initialTick);
      expect(snapshot.tick).toBe(initialTick);
    });

    it('should execute checkpoint command', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;

      const command: WorkerCommand = {
        type: 'checkpoint',
      };

      const snapshot = executeCommand(command);

      // Should succeed without error
      expect(workerState.engineState).toBeDefined();
      expect(snapshot).toBeDefined();
    });

    it('should throw error when executing command before init', () => {
      (workerState as any).initialized = false;
      (workerState as any).engineState = null;

      const command: WorkerCommand = {
        type: 'tick',
        count: 1,
      };

      expect(() => executeCommand(command)).toThrow('not initialized');
    });
  });

  describe('Worker Snapshot Generation', () => {
    it('should create snapshot with all required fields', () => {
      const engine = createEngine(12345, [creature]);

      const snapshot = createWorkerSnapshot(engine);

      expect(snapshot).toHaveProperty('tick');
      expect(snapshot).toHaveProperty('seed');
      expect(snapshot).toHaveProperty('worldSnapshot');
      expect(snapshot).toHaveProperty('isRunning');
      expect(snapshot).toHaveProperty('isPaused');
      expect(snapshot).toHaveProperty('constants');
      expect(snapshot).toHaveProperty('events');
      expect(snapshot).toHaveProperty('lastAdaptationObservations');

      expect(snapshot.tick).toBe(0);
      expect(snapshot.seed).toBe(12345);
    });

    it('should match snapshotEngine output structure', () => {
      const engine = createEngine(12345, [creature]);

      // Tick once
      const tickedEngine = tickEngine(engine);
      const directSnapshot = snapshotEngine(tickedEngine);

      // Create snapshot through worker function
      const workerSnapshot = createWorkerSnapshot(tickedEngine);

      expect(workerSnapshot.tick).toBe(directSnapshot.tick);
      expect(workerSnapshot.seed).toBe(directSnapshot.seed);
      expect(workerSnapshot.worldSnapshot.width).toBe(directSnapshot.width);
      expect(workerSnapshot.worldSnapshot.height).toBe(directSnapshot.height);
    });
  });

  describe('Worker Error Handling', () => {
    it('should handle command errors gracefully', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;

      // Create an invalid command
      const invalidCommand = {
        type: 'invalid-command-type',
      } as any;

      // Should throw or return error snapshot
      expect(() => executeCommand(invalidCommand)).toThrow();
    });
  });

  describe('Determinism and Equivalence', () => {
    it('should produce identical results for same seed and commands', () => {
      // First run
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });
      const engine1 = createEngine(99999, [creature1]);

      (workerState as any).initialized = true;
      (workerState as any).engineState = engine1;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;

      const command: WorkerCommand = {
        type: 'tick',
        count: 30,
      };

      const snapshot1 = executeCommand(command);

      // Second run
      Creature.resetIdCounter();
      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });
      const engine2 = createEngine(99999, [creature2]);

      // Reset worker state
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine2;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;
      (workerState as any).ticksProcessed = 0;

      const snapshot2 = executeCommand(command);

      // Verify snapshots match
      expect(snapshot1.tick).toBe(snapshot2.tick);
      expect(snapshot1.seed).toBe(snapshot2.seed);
      expect(snapshot1.worldSnapshot.width).toBe(snapshot2.worldSnapshot.width);
      expect(snapshot1.worldSnapshot.height).toBe(snapshot2.worldSnapshot.height);
      expect(snapshot1.worldSnapshot.creatures.length).toBe(
        snapshot2.worldSnapshot.creatures.length
      );
    });
  });

  describe('Command Sequence Ordering', () => {
    it('should handle sequential command execution', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;

      // Process a sequence of commands
      const ticks: number[] = [];

      for (let i = 0; i < 5; i++) {
        const command: WorkerCommand = {
          type: 'tick',
          count: 1,
        };
        const snapshot = executeCommand(command);
        ticks.push(snapshot.tick);
      }

      // Verify sequential ordering
      expect(ticks).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Paused State Handling', () => {
    it('should not advance ticks when paused', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = true;
      (workerState as any).isRunning = false;

      const command: WorkerCommand = {
        type: 'tick',
        count: 10,
      };

      const snapshot = executeCommand(command);

      // Tick should not have advanced because paused is true
      expect(workerState.engineState?.tick).toBe(0);
    });

    it('should advance ticks after resume', () => {
      const engine = createEngine(12345, [creature]);
      (workerState as any).initialized = true;
      (workerState as any).engineState = engine;
      (workerState as any).paused = false;
      (workerState as any).isRunning = true;

      const tickCommand: WorkerCommand = {
        type: 'tick',
        count: 10,
      };

      executeCommand(tickCommand);
      expect(workerState.engineState?.tick).toBe(10);

      // Pause
      const pauseCommand: WorkerCommand = { type: 'pause' };
      executeCommand(pauseCommand);

      // Try to tick while paused (should not advance)
      executeCommand(tickCommand);
      expect(workerState.engineState?.tick).toBe(10);

      // Resume
      const resumeCommand: WorkerCommand = { type: 'resume' };
      executeCommand(resumeCommand);

      // Now ticks should advance again
      executeCommand(tickCommand);
      expect(workerState.engineState?.tick).toBe(20);
    });
  });
});
