import type { EngineState } from '../simulation/engine';
import { deserializeEngineState, serializeEngineState } from '../simulation/enginePersistence';

export const BROWSER_WORLD_SAVE_KEY = 'origins.engine-save.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveBrowserWorld(storage: StorageLike, state: EngineState): void {
  storage.setItem(BROWSER_WORLD_SAVE_KEY, serializeEngineState(state));
}

export function loadBrowserWorld(storage: StorageLike): EngineState | null {
  const payload = storage.getItem(BROWSER_WORLD_SAVE_KEY);
  if (!payload) return null;
  try {
    return deserializeEngineState(payload);
  } catch {
    storage.removeItem(BROWSER_WORLD_SAVE_KEY);
    return null;
  }
}

export function clearBrowserWorld(storage: StorageLike): void {
  storage.removeItem(BROWSER_WORLD_SAVE_KEY);
}
