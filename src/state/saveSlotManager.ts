/**
 * Save slot manager: handles rotation, eviction warnings, and manual saves.
 *
 * Rules:
 * - 8 rotating auto-save slots (0-7): oldest evicted first when full
 * - 2 fixed manual-save slots (0-1): separate pool
 * - Before eviction: show non-blocking warning banner with "protect" action
 * - "Protect" promotes an auto-save to manual pool
 * - Manual save overwrite picker when both manual slots are full
 * - No silent loss: ambient slot counter always visible
 */

import type { PersistedEngineState } from '../simulation/enginePersistence';
import {
  saveSlot,
  deleteSlot,
  listAutoSaves,
  listManualSaves,
  loadSlotById,
  SaveSlotMetadata,
  SaveSlot,
  clearAllSlots,
} from './indexedDbSaveSystem';

export const AUTO_SAVE_SLOTS = 8;
export const MANUAL_SAVE_SLOTS = 2;

/**
 * Represents a pending eviction that needs user action/warning.
 */
export interface PendingEviction {
  slotId: string;
  slotIndex: number;
  tick: number;
  worldName?: string;
  timestamp: number;
}

/**
 * Auto-save with rotation. If auto-save pool is full (8 slots), evict the oldest.
 * Returns metadata about the save.
 */
export async function autoSave(
  payload: PersistedEngineState,
  worldName?: string
): Promise<SaveSlotMetadata> {
  const autoSaves = await listAutoSaves();
  const slotIndex = autoSaves.length % AUTO_SAVE_SLOTS;
  const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // If we're at capacity, evict the oldest (lowest timestamp)
  if (autoSaves.length >= AUTO_SAVE_SLOTS) {
    const oldest = autoSaves[0]; // Already sorted by timestamp
    await deleteSlot(oldest.metadata.id);
  }

  const metadata: SaveSlotMetadata = {
    id,
    type: 'auto',
    slot: slotIndex,
    timestamp: Date.now(),
    tick: payload.state.tick,
    worldName,
  };

  await saveSlot({ metadata, payload });
  return metadata;
}

/**
 * Check if the next auto-save would trigger an eviction.
 * This is called *before* auto-save completes to show a warning banner.
 */
export async function willAutoSaveEvict(): Promise<PendingEviction | null> {
  const autoSaves = await listAutoSaves();

  // If we're already at capacity, next auto-save will trigger eviction
  if (autoSaves.length >= AUTO_SAVE_SLOTS) {
    const oldest = autoSaves[0]; // Lowest timestamp
    return {
      slotId: oldest.metadata.id,
      slotIndex: oldest.metadata.slot,
      tick: oldest.metadata.tick,
      worldName: oldest.metadata.worldName,
      timestamp: oldest.metadata.timestamp,
    };
  }

  return null;
}

/**
 * Promote an auto-save to the manual pool.
 * If manual pool is full, caller must use `manualSaveWithOverwrite`.
 * Throws if the slot doesn't exist or is not auto.
 */
export async function protectAutoSave(autoSaveId: string): Promise<SaveSlotMetadata> {
  const autoSave = await loadSlotById(autoSaveId);
  if (!autoSave || autoSave.metadata.type !== 'auto') {
    throw new Error(`Auto-save slot ${autoSaveId} not found`);
  }

  const manualSaves = await listManualSaves();

  // Check if manual pool is full
  if (manualSaves.length >= MANUAL_SAVE_SLOTS) {
    throw new Error('Manual save pool is full. Use manualSaveWithOverwrite to pick a slot to replace.');
  }

  // Delete from auto pool
  await deleteSlot(autoSaveId);

  // Create new manual slot
  const slotIndex = manualSaves.length % MANUAL_SAVE_SLOTS;
  const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newMetadata: SaveSlotMetadata = {
    id: newId,
    type: 'manual',
    slot: slotIndex,
    timestamp: Date.now(),
    tick: autoSave.metadata.tick,
    worldName: autoSave.metadata.worldName,
  };

  await saveSlot({ metadata: newMetadata, payload: autoSave.payload });
  return newMetadata;
}

/**
 * Manual save. If manual pool is not full, pick the next available slot.
 * If full, caller must use `manualSaveWithOverwrite` to pick which slot to replace.
 */
export async function manualSave(
  payload: PersistedEngineState,
  worldName?: string
): Promise<SaveSlotMetadata> {
  const manualSaves = await listManualSaves();

  if (manualSaves.length >= MANUAL_SAVE_SLOTS) {
    throw new Error(
      `Manual save pool is full (${MANUAL_SAVE_SLOTS} slots). ` +
      `Use manualSaveWithOverwrite to pick which slot to replace.`
    );
  }

  const slotIndex = manualSaves.length % MANUAL_SAVE_SLOTS;
  const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const metadata: SaveSlotMetadata = {
    id,
    type: 'manual',
    slot: slotIndex,
    timestamp: Date.now(),
    tick: payload.state.tick,
    worldName,
  };

  await saveSlot({ metadata, payload });
  return metadata;
}

/**
 * Manual save with explicit slot overwrite.
 * Caller must provide the slot ID to overwrite (from listManualSaves).
 * Throws if slotId is not in the manual pool.
 */
export async function manualSaveWithOverwrite(
  payload: PersistedEngineState,
  slotIdToOverwrite: string,
  worldName?: string
): Promise<SaveSlotMetadata> {
  const manualSaves = await listManualSaves();
  const targetSlot = manualSaves.find((s) => s.metadata.id === slotIdToOverwrite);

  if (!targetSlot) {
    throw new Error(`Manual save slot ${slotIdToOverwrite} not found or is not a manual slot`);
  }

  // Delete the old slot
  await deleteSlot(slotIdToOverwrite);

  // Save to the same slot index
  const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newMetadata: SaveSlotMetadata = {
    id: newId,
    type: 'manual',
    slot: targetSlot.metadata.slot,
    timestamp: Date.now(),
    tick: payload.state.tick,
    worldName,
  };

  await saveSlot({ metadata: newMetadata, payload });
  return newMetadata;
}

/**
 * Load a save (auto or manual) by its ID.
 */
export async function loadSaveById(id: string): Promise<PersistedEngineState | null> {
  const slot = await loadSlotById(id);
  return slot ? slot.payload : null;
}

/**
 * Get current status: occupied slots for both pools.
 */
export async function getSaveStatus(): Promise<{
  autoSaves: SaveSlot[];
  manualSaves: SaveSlot[];
  autoCount: number;
  manualCount: number;
  autoCapacity: number;
  manualCapacity: number;
}> {
  const autoSaves = await listAutoSaves();
  const manualSaves = await listManualSaves();

  return {
    autoSaves,
    manualSaves,
    autoCount: autoSaves.length,
    manualCount: manualSaves.length,
    autoCapacity: AUTO_SAVE_SLOTS,
    manualCapacity: MANUAL_SAVE_SLOTS,
  };
}

/**
 * Clear all saves (for testing/reset).
 */
export async function clearAllSaves(): Promise<void> {
  await clearAllSlots();
}

/**
 * Helper: Auto-save with automatic store updates
 * Calls autoSave() and then updates the Zustand store with:
 * - pendingEviction status (if next save would evict)
 * - current save slot status
 * Used for integration with crisis-response scenarios.
 */
export async function autoSaveAndUpdateStore(
  payload: PersistedEngineState,
  worldName?: string,
  useStore?: (selector: (s: any) => any) => any
): Promise<SaveSlotMetadata> {
  const metadata = await autoSave(payload, worldName);

  // Optionally update store if provided
  if (useStore) {
    const store = useStore((s) => ({
      updateSaveSlotStatus: s.updateSaveSlotStatus,
      setPendingEviction: s.setPendingEviction,
    }));

    // Update slot status
    const status = await getSaveStatus();
    store.updateSaveSlotStatus({
      autoCount: status.autoCount,
      autoCapacity: status.autoCapacity,
      manualCount: status.manualCount,
      manualCapacity: status.manualCapacity,
    });

    // Check for pending eviction on next save
    const pending = await willAutoSaveEvict();
    store.setPendingEviction(pending);
  }

  return metadata;
}
