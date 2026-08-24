/**
 * IndexedDB-backed save system for Phase A: 8-slot auto-save + 2-slot manual-save.
 *
 * Uses IndexedDB for storage (recommended in #248 for payload size ~160-230KB gzip).
 * Versioned checkpoint format supports future migration.
 */

import type { EngineState } from '../simulation/engine';
import { PersistedEngineState } from '../simulation/enginePersistence';

const DB_NAME = 'origins-saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export interface SaveSlotMetadata {
  id: string; // Unique slot ID
  type: 'auto' | 'manual'; // Auto or manual save
  slot: number; // 0-7 for auto, 0-1 for manual
  timestamp: number; // When saved (ms)
  tick: number; // Simulation tick
  worldName?: string; // Optional custom name (e.g., scenario name)
}

export interface SaveSlot {
  metadata: SaveSlotMetadata;
  payload: PersistedEngineState; // Versioned checkpoint
}

/**
 * Initialize IndexedDB and return a database connection.
 */
function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'metadata.id' });
        store.createIndex('type-slot', ['metadata.type', 'metadata.slot']);
        store.createIndex('timestamp', 'metadata.timestamp');
      }
    };
  });
}

/**
 * Save a slot to IndexedDB.
 */
export async function saveSlot(slot: SaveSlot): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(slot);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Load a specific slot by ID.
 */
export async function loadSlotById(id: string): Promise<SaveSlot | null> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * List all slots of a given type (auto or manual), ordered by timestamp.
 */
export async function listSlotsByType(type: 'auto' | 'manual'): Promise<SaveSlot[]> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('type-slot');
    const range = IDBKeyRange.bound([type, 0], [type, 255]);
    const request = index.getAll(range);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);
      resolve(results);
    };
  });
}

/**
 * Get all auto-save slots (0-7) ordered by timestamp.
 */
export async function listAutoSaves(): Promise<SaveSlot[]> {
  return listSlotsByType('auto');
}

/**
 * Get all manual-save slots (0-1) ordered by timestamp.
 */
export async function listManualSaves(): Promise<SaveSlot[]> {
  return listSlotsByType('manual');
}

/**
 * Delete a slot by ID.
 */
export async function deleteSlot(id: string): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Clear all slots (used for testing or reset).
 */
export async function clearAllSlots(): Promise<void> {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get total number of auto-save slots currently occupied.
 */
export async function countAutoSaves(): Promise<number> {
  const saves = await listAutoSaves();
  return saves.length;
}

/**
 * Get total number of manual-save slots currently occupied.
 */
export async function countManualSaves(): Promise<number> {
  const saves = await listManualSaves();
  return saves.length;
}
