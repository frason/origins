import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { clearBrowserWorld, loadBrowserWorld, saveBrowserWorld, type StorageLike } from '../state/browserWorldSave';
import { SIMULATION_CONSTANTS } from '../utils/constants';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('browser world save', () => {
  it('saves, restores, and clears the exact engine state', () => {
    const storage = new MemoryStorage();
    const state = tickEngine(buildDemoEngine(42, { ...SIMULATION_CONSTANTS }));
    saveBrowserWorld(storage, state);
    expect(JSON.stringify(loadBrowserWorld(storage))).toBe(JSON.stringify(state));
    clearBrowserWorld(storage);
    expect(loadBrowserWorld(storage)).toBeNull();
  });

  it('removes corrupt saves instead of trapping startup', () => {
    const storage = new MemoryStorage();
    storage.setItem('origins.engine-save.v1', 'bad save');
    expect(loadBrowserWorld(storage)).toBeNull();
    expect(storage.values.size).toBe(0);
  });
});
