/**
 * Field Journal Persistence Layer
 *
 * Handles saving/loading the journal to/from storage (separate from deterministic simulation).
 * Stores per-world using the seed as key.
 */

import type { FieldJournal, FieldJournalEntry } from '../simulation/fieldJournal';
import { createFieldJournal } from '../simulation/fieldJournal';
import type { StorageLike } from './browserWorldSave';

export function getFieldJournalStorageKey(worldSeed?: number): string {
  if (worldSeed === undefined) {
    return 'origins.field-journal.default.v1';
  }
  return `origins.field-journal.seed-${worldSeed}.v1`;
}

/**
 * Serialize a field journal to JSON string for storage
 */
export function serializeFieldJournal(journal: FieldJournal): string {
  // Don't serialize the index map (it's derived from entries)
  const serializable = {
    worldSeed: journal.worldSeed,
    createdAtMs: journal.createdAtMs,
    entries: journal.entries,
    lastUpdatedTick: journal.lastUpdatedTick,
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize a field journal from JSON string
 */
export function deserializeFieldJournal(json: string, expectedSeed?: number): FieldJournal {
  try {
    const parsed = JSON.parse(json) as {
      worldSeed?: number;
      createdAtMs?: number;
      entries: FieldJournalEntry[];
      lastUpdatedTick: number;
    };

    // Reconstruct index
    const entryIndex = new Map<string, FieldJournalEntry>();
    for (const entry of parsed.entries) {
      entryIndex.set(entry.id, entry);
    }

    return {
      worldSeed: parsed.worldSeed,
      createdAtMs: parsed.createdAtMs,
      entries: parsed.entries,
      lastUpdatedTick: parsed.lastUpdatedTick,
      entryIndex,
    };
  } catch {
    // If deserialization fails, return empty journal
    return createFieldJournal(expectedSeed);
  }
}

/**
 * Load journal from storage for a specific world
 */
export function loadFieldJournal(storage: StorageLike, worldSeed?: number): FieldJournal {
  const key = getFieldJournalStorageKey(worldSeed);
  const payload = storage.getItem(key);

  if (!payload) {
    return createFieldJournal(worldSeed);
  }

  return deserializeFieldJournal(payload, worldSeed);
}

/**
 * Save journal to storage for a specific world
 */
export function saveFieldJournal(storage: StorageLike, journal: FieldJournal): void {
  const key = getFieldJournalStorageKey(journal.worldSeed);
  const serialized = serializeFieldJournal(journal);
  storage.setItem(key, serialized);
}

/**
 * Clear journal for a specific world
 */
export function clearFieldJournal(storage: StorageLike, worldSeed?: number): void {
  const key = getFieldJournalStorageKey(worldSeed);
  storage.removeItem(key);
}

/**
 * List all stored journals (seeds for which we have journal data)
 */
export function listStoredJournals(storage: StorageLike): number[] {
  const pattern = /^origins\.field-journal\.seed-(\d+)\.v1$/;
  const seeds: number[] = [];

  // Iterate through all storage keys (note: this is only reliable for localStorage)
  if (storage.length && storage.key) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;

      const match = key.match(pattern);
      if (match) {
        seeds.push(parseInt(match[1], 10));
      }
    }
  }

  return seeds.sort((a, b) => a - b);
}

/**
 * Estimate storage size used by all journals (bytes)
 */
export function estimateJournalStorageSize(storage: StorageLike): number {
  let totalBytes = 0;

  if (storage.length && storage.key) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (!key.startsWith('origins.field-journal.')) continue;

      const value = storage.getItem(key);
      if (value) {
        // Rough estimate: 2 bytes per character (UTF-16)
        totalBytes += (key.length + value.length) * 2;
      }
    }
  }

  return totalBytes;
}
