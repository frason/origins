/**
 * Watch Persistence Tests
 *
 * Covers:
 * - Watch save/load functionality
 * - Storage format and compatibility
 * - Watch persistence through pause/replay
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadWatches, saveWatches, BROWSER_WATCH_SAVE_KEY } from '../state/watchPersistence';
import type { EcosystemWatch } from '../simulation/watches';

// Mock localStorage
class MockStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe('Watch Persistence - Save/Load', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('should save watches to storage', () => {
    const watches: EcosystemWatch[] = [
      {
        id: 'save-test-1',
        createdAtTick: 0,
        name: 'Population Monitor',
        type: 'species-population',
        enabled: true,
        speciesId: 'species-1',
        thresholdType: 'below',
        thresholdValue: 10,
        minTicksBetweenAlerts: 5,
        lastAlertTick: 50,
        lastAlertValue: 5,
      },
    ];

    saveWatches(storage as any, watches);

    const saved = storage.getItem(BROWSER_WATCH_SAVE_KEY);
    expect(saved).toBeDefined();
    expect(saved).not.toBeNull();
  });

  it('should load watches from storage', () => {
    const originalWatches: EcosystemWatch[] = [
      {
        id: 'load-test-1',
        createdAtTick: 0,
        name: 'Energy Monitor',
        type: 'species-energy',
        enabled: true,
        speciesId: 'species-1',
        thresholdType: 'above',
        thresholdValue: 100,
        minTicksBetweenAlerts: 10,
      },
      {
        id: 'load-test-2',
        createdAtTick: 5,
        name: 'Regional Watch',
        type: 'regional-pressure',
        enabled: false,
        x: 50,
        y: 50,
        regionRadius: 5,
        thresholdType: 'below',
        thresholdValue: 20,
        minTicksBetweenAlerts: 15,
      },
    ];

    saveWatches(storage as any, originalWatches);
    const loaded = loadWatches(storage as any);

    expect(loaded.length).toBe(2);
    expect(loaded[0].id).toBe('load-test-1');
    expect(loaded[1].id).toBe('load-test-2');
    expect(loaded[0].name).toBe('Energy Monitor');
    expect(loaded[1].enabled).toBe(false);
  });

  it('should preserve watch rate-limiting state through save/load', () => {
    const watches: EcosystemWatch[] = [
      {
        id: 'rate-limit-test',
        createdAtTick: 0,
        name: 'Rate Limited Watch',
        type: 'extinction-risk',
        enabled: true,
        speciesId: 'species-1',
        thresholdType: 'above',
        thresholdValue: 50,
        minTicksBetweenAlerts: 20,
        lastAlertTick: 100,
        lastAlertValue: 75,
      },
    ];

    saveWatches(storage as any, watches);
    const loaded = loadWatches(storage as any);

    expect(loaded[0].lastAlertTick).toBe(100);
    expect(loaded[0].lastAlertValue).toBe(75);
  });

  it('should handle empty watch list', () => {
    const watches: EcosystemWatch[] = [];

    saveWatches(storage as any, watches);
    const loaded = loadWatches(storage as any);

    expect(loaded).toEqual([]);
  });

  it('should return empty array when no watches stored', () => {
    const loaded = loadWatches(storage as any);
    expect(loaded).toEqual([]);
  });

  it('should handle corrupted storage gracefully', () => {
    storage.setItem('origins-watches', 'invalid json {{{');

    // Should not throw and return empty array
    expect(() => {
      loadWatches(storage as any);
    }).not.toThrow();

    const loaded = loadWatches(storage as any);
    expect(Array.isArray(loaded)).toBe(true);
  });
});

describe('Watch Persistence - Format Compatibility', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('should support all watch types', () => {
    const watches: EcosystemWatch[] = [
      {
        id: 'pop-watch',
        createdAtTick: 0,
        name: 'Population',
        type: 'species-population',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'below',
        thresholdValue: 10,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'energy-watch',
        createdAtTick: 0,
        name: 'Energy',
        type: 'species-energy',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'above',
        thresholdValue: 100,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'biomass-watch',
        createdAtTick: 0,
        name: 'Biomass',
        type: 'species-biomass',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'below',
        thresholdValue: 50,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'trait-watch',
        createdAtTick: 0,
        name: 'Trait Frequency',
        type: 'trait-frequency',
        enabled: true,
        speciesId: 'sp-1',
        trait: 'speed',
        thresholdType: 'above',
        thresholdValue: 5,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'risk-watch',
        createdAtTick: 0,
        name: 'Extinction Risk',
        type: 'extinction-risk',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'above',
        thresholdValue: 50,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'region-watch',
        createdAtTick: 0,
        name: 'Regional Pressure',
        type: 'regional-pressure',
        enabled: true,
        x: 25,
        y: 25,
        regionRadius: 5,
        thresholdType: 'below',
        thresholdValue: 10,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'depletion-watch',
        createdAtTick: 0,
        name: 'Energy Depletion',
        type: 'energy-depletion',
        enabled: true,
        thresholdType: 'below',
        thresholdValue: 500,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'collapse-watch',
        createdAtTick: 0,
        name: 'Biomass Collapse',
        type: 'biomass-collapse',
        enabled: true,
        thresholdType: 'below',
        thresholdValue: 100,
        minTicksBetweenAlerts: 1,
      },
    ];

    saveWatches(storage as any, watches);
    const loaded = loadWatches(storage as any);

    expect(loaded.length).toBe(8);
    expect(loaded.map((w) => w.type)).toEqual(watches.map((w) => w.type));
  });

  it('should preserve all watch properties', () => {
    const watch: EcosystemWatch = {
      id: 'full-watch',
      createdAtTick: 123,
      name: 'Complete Watch',
      type: 'species-population',
      enabled: true,
      speciesId: 'species-abc',
      thresholdType: 'change-by',
      thresholdValue: 25,
      changeWindow: 50,
      minTicksBetweenAlerts: 10,
      lastAlertTick: 200,
      lastAlertValue: 42,
    };

    saveWatches(storage as any, [watch]);
    const loaded = loadWatches(storage as any);

    expect(loaded[0]).toEqual(watch);
  });

  it('should handle watches with partial optional properties', () => {
    const watches: EcosystemWatch[] = [
      {
        id: 'minimal-watch',
        createdAtTick: 0,
        name: 'Minimal',
        type: 'energy-depletion',
        enabled: false,
        thresholdType: 'below',
        thresholdValue: 100,
        minTicksBetweenAlerts: 5,
        // No optional properties set
      },
    ];

    saveWatches(storage as any, watches);
    const loaded = loadWatches(storage as any);

    expect(loaded[0].id).toBe('minimal-watch');
    expect(loaded[0].lastAlertTick).toBeUndefined();
    expect(loaded[0].speciesId).toBeUndefined();
  });
});

describe('Watch Persistence - Multiple Saves', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('should overwrite previous watches on save', () => {
    const watches1: EcosystemWatch[] = [
      {
        id: 'watch-1',
        createdAtTick: 0,
        name: 'First',
        type: 'species-population',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'below',
        thresholdValue: 10,
        minTicksBetweenAlerts: 1,
      },
    ];

    saveWatches(storage as any, watches1);

    const watches2: EcosystemWatch[] = [
      {
        id: 'watch-2',
        createdAtTick: 0,
        name: 'Second',
        type: 'species-energy',
        enabled: true,
        speciesId: 'sp-2',
        thresholdType: 'above',
        thresholdValue: 50,
        minTicksBetweenAlerts: 1,
      },
      {
        id: 'watch-3',
        createdAtTick: 0,
        name: 'Third',
        type: 'extinction-risk',
        enabled: false,
        speciesId: 'sp-3',
        thresholdType: 'above',
        thresholdValue: 75,
        minTicksBetweenAlerts: 1,
      },
    ];

    saveWatches(storage as any, watches2);

    const loaded = loadWatches(storage as any);
    expect(loaded.length).toBe(2);
    expect(loaded.map((w) => w.id)).toEqual(['watch-2', 'watch-3']);
  });

  it('should support clearing all watches', () => {
    const watches: EcosystemWatch[] = [
      {
        id: 'watch-1',
        createdAtTick: 0,
        name: 'To Delete',
        type: 'species-population',
        enabled: true,
        speciesId: 'sp-1',
        thresholdType: 'below',
        thresholdValue: 10,
        minTicksBetweenAlerts: 1,
      },
    ];

    saveWatches(storage as any, watches);
    saveWatches(storage as any, []); // Clear

    const loaded = loadWatches(storage as any);
    expect(loaded.length).toBe(0);
  });
});
