/**
 * Watch Persistence
 *
 * Handles saving and loading ecosystem watches from browser storage.
 * Watches are stored separately from the engine state to keep them independent.
 */

import type { EcosystemWatch } from '../simulation/watches';

export const BROWSER_WATCH_SAVE_KEY = 'origins.ecosystem-watches.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Save watches to browser storage
 */
export function saveWatches(storage: StorageLike, watches: EcosystemWatch[]): void {
  try {
    storage.setItem(BROWSER_WATCH_SAVE_KEY, JSON.stringify(watches));
  } catch (error) {
    console.error('Failed to save watches:', error);
  }
}

/**
 * Load watches from browser storage
 */
export function loadWatches(storage: StorageLike): EcosystemWatch[] {
  const payload = storage.getItem(BROWSER_WATCH_SAVE_KEY);
  if (!payload) return [];
  try {
    return JSON.parse(payload) as EcosystemWatch[];
  } catch (error) {
    console.error('Failed to load watches:', error);
    return [];
  }
}

/**
 * Clear watches from browser storage
 */
export function clearWatches(storage: StorageLike): void {
  storage.removeItem(BROWSER_WATCH_SAVE_KEY);
}
