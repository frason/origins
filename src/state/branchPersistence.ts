/**
 * Branch Persistence
 *
 * Handles saving, loading, and managing branches in localStorage
 * with storage bounds and version compatibility
 */

import type { WorldBranch, BranchCollection } from '../simulation/worldBranch';
import { validateBranchCompatibility, boundBranchStorage, type BranchCollection as Branch } from '../simulation/worldBranch';

const BRANCH_STORAGE_KEY = 'origins_branches';
const BRANCH_VERSION = 1;

interface BranchStorageFormat {
  version: number;
  collection: BranchCollection;
}

/**
 * Check if a value is a valid stored branch collection format
 */
function isValidBranchStorage(value: unknown): value is BranchStorageFormat {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'number' || obj.version !== BRANCH_VERSION) return false;
  if (!obj.collection || typeof obj.collection !== 'object') return false;
  const collection = obj.collection as Record<string, unknown>;
  if (!collection.main || typeof collection.main !== 'object') return false;
  if (!Array.isArray(collection.alternatives)) return false;
  return true;
}

/**
 * Load branches from localStorage
 * @returns Loaded branch collection or null if none exist
 */
export function loadBranches(storage: Storage): BranchCollection | null {
  try {
    const json = storage.getItem(BRANCH_STORAGE_KEY);
    if (!json) return null;

    const parsed = JSON.parse(json);
    if (!isValidBranchStorage(parsed)) {
      console.warn('Invalid branch storage format, discarding');
      return null;
    }

    // Validate all branches for compatibility
    const { main, alternatives } = parsed.collection;
    if (!validateBranchCompatibility(main)) {
      console.warn('Main branch failed validation');
      return null;
    }

    const validAlternatives = alternatives.filter((branch) => validateBranchCompatibility(branch));

    return {
      main,
      alternatives: validAlternatives,
    };
  } catch (error) {
    console.error('Failed to load branches:', error);
    return null;
  }
}

/**
 * Save branches to localStorage
 * @param collection - The branch collection to save
 * @param maxBytes - Maximum storage size (default 10MB)
 * @returns true if save succeeded, false otherwise
 */
export function saveBranches(
  storage: Storage,
  collection: BranchCollection,
  maxBytes: number = 10 * 1024 * 1024
): boolean {
  try {
    // Bound storage to maximum size
    const bounded = boundBranchStorage(collection, maxBytes);

    const toSave: BranchStorageFormat = {
      version: BRANCH_VERSION,
      collection: bounded,
    };

    const json = JSON.stringify(toSave);

    // Check size before saving
    const sizeBytes = new Blob([json]).size;
    if (sizeBytes > maxBytes) {
      console.warn(`Branch storage too large (${sizeBytes} bytes), not saving`);
      return false;
    }

    storage.setItem(BRANCH_STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error('Failed to save branches:', error);
    return false;
  }
}

/**
 * Clear all branches from storage
 */
export function clearBranches(storage: Storage): void {
  try {
    storage.removeItem(BRANCH_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear branches:', error);
  }
}

/**
 * Export a branch as a portable JSON string
 * Useful for sharing or backup
 */
export function exportBranch(branch: WorldBranch): string {
  return JSON.stringify(
    {
      version: BRANCH_VERSION,
      branch,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Import a branch from exported JSON
 */
export function importBranch(json: string): WorldBranch | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.version !== 'number' || parsed.version !== BRANCH_VERSION) {
      console.warn('Imported branch has incompatible version');
      return null;
    }
    if (!parsed.branch || typeof parsed.branch !== 'object') {
      console.warn('Imported branch is malformed');
      return null;
    }
    if (!validateBranchCompatibility(parsed.branch)) {
      console.warn('Imported branch failed validation');
      return null;
    }
    return parsed.branch;
  } catch (error) {
    console.error('Failed to import branch:', error);
    return null;
  }
}

/**
 * Get storage statistics
 */
export function getBranchStorageStats(storage: Storage): {
  branchCount: number;
  totalBytes: number;
  estimatedUtilization: number; // 0-1
} {
  try {
    const json = storage.getItem(BRANCH_STORAGE_KEY);
    if (!json) {
      return {
        branchCount: 0,
        totalBytes: 0,
        estimatedUtilization: 0,
      };
    }

    const collection = JSON.parse(json).collection as BranchCollection;
    const branchCount = 1 + (collection.alternatives?.length ?? 0);
    const totalBytes = new Blob([json]).size;
    const maxBytes = 10 * 1024 * 1024; // 10MB

    return {
      branchCount,
      totalBytes,
      estimatedUtilization: totalBytes / maxBytes,
    };
  } catch {
    return {
      branchCount: 0,
      totalBytes: 0,
      estimatedUtilization: 0,
    };
  }
}
