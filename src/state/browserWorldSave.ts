import type { EngineState } from '../simulation/engine';
import { deserializeEngineState, serializeEngineState } from '../simulation/enginePersistence';

export const BROWSER_WORLD_SAVE_KEY = 'origins.engine-save.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserWorldRestoreResult {
  state: EngineState | null;
  /** True when an unusable saved world was removed so startup can continue. */
  recoveredFromInvalidSave: boolean;
}

export function saveBrowserWorld(storage: StorageLike, state: EngineState): void {
  storage.setItem(BROWSER_WORLD_SAVE_KEY, serializeEngineState(state));
}

export function loadBrowserWorld(storage: StorageLike): EngineState | null {
  return restoreBrowserWorld(storage).state;
}

/**
 * Restore the latest browser-owned world without trapping the player on an
 * unsupported or corrupt payload. Callers can use the recovery flag to
 * explain that a fresh world was started and point to world import.
 */
export function restoreBrowserWorld(storage: StorageLike): BrowserWorldRestoreResult {
  const payload = storage.getItem(BROWSER_WORLD_SAVE_KEY);
  if (!payload) return { state: null, recoveredFromInvalidSave: false };
  try {
    return { state: deserializeEngineState(payload), recoveredFromInvalidSave: false };
  } catch {
    storage.removeItem(BROWSER_WORLD_SAVE_KEY);
    return { state: null, recoveredFromInvalidSave: true };
  }
}

export function clearBrowserWorld(storage: StorageLike): void {
  storage.removeItem(BROWSER_WORLD_SAVE_KEY);
}
