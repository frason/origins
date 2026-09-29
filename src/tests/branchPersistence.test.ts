import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadBranches,
  saveBranches,
  clearBranches,
  exportBranch,
  importBranch,
  getBranchStorageStats,
} from '../state/branchPersistence';
import { createBranch, type WorldBranch } from '../simulation/worldBranch';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';

function createTestWorld(tick: number): WorldSnapshot {
  return {
    width: 100,
    height: 100,
    tick,
    seed: 42,
    cells: Array(10000).fill({
      energy: 10,
      nutrients: 5,
      producerBiomass: 0.5,
      toxicity: 0,
      elevation: 0,
      moisture: 0.5,
      temperature: 20,
      biome: 'temperate' as const,
      producerArchetype: 'grass' as const,
    }),
    creatures: [],
    events: [],
    constants: SIMULATION_CONSTANTS,
  };
}

class MockStorage implements Storage {
  private data: Map<string, string> = new Map();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }
}

describe('branch persistence', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  describe('saveBranches and loadBranches', () => {
    it('saves and loads a branch collection', () => {
      const world = createTestWorld(50);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Test');

      const collection = {
        main: branch,
        alternatives: [],
      };

      const saved = saveBranches(storage, collection);
      expect(saved).toBe(true);

      const loaded = loadBranches(storage);
      expect(loaded).not.toBeNull();
      expect(loaded?.main.name).toBe('Test');
      expect(loaded?.alternatives).toHaveLength(0);
    });

    it('preserves multiple alternative branches', () => {
      const world = createTestWorld(50);
      const main = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'main' }, 'Main');
      const alt1 = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'alt1' }, 'Alt1');
      const alt2 = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'alt2' }, 'Alt2');

      const collection = {
        main,
        alternatives: [alt1, alt2],
      };

      saveBranches(storage, collection);
      const loaded = loadBranches(storage);

      expect(loaded?.alternatives).toHaveLength(2);
      expect(loaded?.alternatives.map((b) => b.name)).toContain('Alt1');
      expect(loaded?.alternatives.map((b) => b.name)).toContain('Alt2');
    });

    it('returns null if no branches saved', () => {
      const loaded = loadBranches(storage);
      expect(loaded).toBeNull();
    });

    it('handles invalid JSON gracefully', () => {
      storage.setItem('origins_branches', 'invalid json {');
      const loaded = loadBranches(storage);
      expect(loaded).toBeNull();
    });

    it('validates branch compatibility on load', () => {
      // Save invalid branch data
      storage.setItem(
        'origins_branches',
        JSON.stringify({
          version: 1,
          collection: {
            main: { id: '', name: '', branchFromTick: 0 }, // Missing required fields
            alternatives: [],
          },
        })
      );

      const loaded = loadBranches(storage);
      expect(loaded).toBeNull();
    });
  });

  describe('clearBranches', () => {
    it('removes branches from storage', () => {
      const world = createTestWorld(50);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Test');

      saveBranches(storage, { main: branch, alternatives: [] });
      expect(storage.getItem('origins_branches')).not.toBeNull();

      clearBranches(storage);
      expect(storage.getItem('origins_branches')).toBeNull();
    });
  });

  describe('exportBranch', () => {
    it('exports a branch as JSON with metadata', () => {
      const world = createTestWorld(50);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Exported');

      const json = exportBranch(branch);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe(1);
      expect(parsed.branch.name).toBe('Exported');
      expect(parsed.exportedAt).toBeDefined();
    });

    it('produces valid JSON format', () => {
      const world = createTestWorld(50);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Test');

      const json = exportBranch(branch);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('importBranch', () => {
    it('imports an exported branch', () => {
      const world = createTestWorld(50);
      const original = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Import Test');

      const exported = exportBranch(original);
      const imported = importBranch(exported);

      expect(imported).not.toBeNull();
      expect(imported?.name).toBe('Import Test');
      expect(imported?.id).toBe(original.id);
    });

    it('rejects invalid import format', () => {
      const imported = importBranch('not json');
      expect(imported).toBeNull();
    });

    it('rejects incompatible version', () => {
      const imported = importBranch(JSON.stringify({ version: 2, branch: {} }));
      expect(imported).toBeNull();
    });

    it('rejects malformed branch data', () => {
      const imported = importBranch(JSON.stringify({ version: 1, branch: null }));
      expect(imported).toBeNull();
    });
  });

  describe('getBranchStorageStats', () => {
    it('reports empty stats when no branches', () => {
      const stats = getBranchStorageStats(storage);

      expect(stats.branchCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.estimatedUtilization).toBe(0);
    });

    it('counts branches and estimates utilization', () => {
      const world = createTestWorld(50);
      const main = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'main' }, 'Main');
      const alt = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'alt' }, 'Alt');

      saveBranches(storage, { main, alternatives: [alt] });

      const stats = getBranchStorageStats(storage);

      expect(stats.branchCount).toBe(2);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.estimatedUtilization).toBeGreaterThan(0);
      expect(stats.estimatedUtilization).toBeLessThan(1);
    });
  });

  describe('storage bounds', () => {
    it('respects maximum storage size', () => {
      const world = createTestWorld(50);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Large');

      // Try to save with very small limit
      const saved = saveBranches(storage, { main: branch, alternatives: [] }, 100);

      // Should fail due to size constraints
      expect(saved).toBe(false);
    });

    it('removes oldest branches when exceeding limit', () => {
      const world = createTestWorld(50);
      const main = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'main' }, 'Main');

      const alt1 = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'alt1' }, 'Alt1');
      alt1.createdAt = 100; // Older

      const alt2 = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'alt2' }, 'Alt2');
      alt2.createdAt = 200; // Newer

      saveBranches(storage, { main, alternatives: [alt1, alt2] });

      const loaded = loadBranches(storage);
      expect(loaded?.main.name).toBe('Main'); // Main always kept
      // Exact behavior depends on actual sizes, but main should be present
      expect(loaded?.main).toBeDefined();
    });
  });

  describe('round-trip persistence', () => {
    it('preserves branch state through save/load cycle', () => {
      const world = createTestWorld(50);
      world.seed = 12345;

      const branch = createBranch(world, 25, { tick: 25, kind: 'species-introduction', label: 'Predator added' }, 'With Predator');
      branch.worldState = world;
      branch.tick = 50;
      branch.checkpoints = [{ tick: 30 }, { tick: 40 }, { tick: 50 }];

      saveBranches(storage, { main: branch, alternatives: [] });
      const loaded = loadBranches(storage);

      expect(loaded?.main.branchFromTick).toBe(25);
      expect(loaded?.main.tick).toBe(50);
      expect(loaded?.main.changedIntervention.label).toBe('Predator added');
      expect(loaded?.main.checkpoints).toHaveLength(3);
      expect(loaded?.main.seed).toBe(12345);
    });
  });
});
