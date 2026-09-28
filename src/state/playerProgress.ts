/**
 * Player Progress Persistence — localStorage-based progression tracking
 *
 * Issue #177: Stores player's Knowledge Points, unlocked instruments, and evidence log.
 * Local beta (no accounts): stores in browser localStorage with optional export.
 */

import type { Evidence } from '../simulation/knowledge';
import { DEFAULT_KNOWLEDGE_CONSTANTS, type KnowledgeConstants } from '../constants/knowledge';

/**
 * Metadata for a world the player has played
 */
export interface WorldMetadata {
  world_seed: number;
  world_name: string;
  created_at: number; // timestamp
  last_played_at: number;
  final_tick: number;
  final_species_count: number;
  interventions_count: number;
  evidence_collected: string[]; // Evidence IDs from this world
}

/**
 * Field journal entry: persistent narrative of player observations
 */
export interface FieldJournalEntry {
  id: string;
  evidence_id: string; // Link to Evidence
  world_seed: number;
  tick: number;
  title: string;
  description: string;
  tags: string[]; // "adaptation", "extinction", "lineage", etc.
  created_at: number;
}

/**
 * Player progress state: all persistent data for knowledge progression
 */
export interface LocalPlayerProgress {
  session_id: string; // UUID, unique per browser/device
  created_at: number; // timestamp
  last_updated_at: number;
  total_knowledge_points: number;
  unlocked_instruments: Set<string>; // e.g., ["overlays", "branch_checkpoint"]
  evidence_log: Evidence[]; // All collected evidence records
  worlds_played: Map<number, WorldMetadata>; // seed → metadata
  field_journal: FieldJournalEntry[]; // Persistent across worlds
  settings: {
    show_knowledge_hints: boolean;
    auto_offer_evidence: boolean;
  };
}

/**
 * Serializable version of LocalPlayerProgress for localStorage
 */
interface SerializedPlayerProgress {
  session_id: string;
  created_at: number;
  last_updated_at: number;
  total_knowledge_points: number;
  unlocked_instruments: string[];
  evidence_log: Evidence[];
  worlds_played: Array<[number, WorldMetadata]>; // Serialize Map as array of tuples
  field_journal: FieldJournalEntry[];
  settings: {
    show_knowledge_hints: boolean;
    auto_offer_evidence: boolean;
  };
}

const STORAGE_KEY = 'origins_player_progress';

/**
 * Create a new player progress tracker
 */
export function createPlayerProgress(): LocalPlayerProgress {
  return {
    session_id: generateSessionId(),
    created_at: Date.now(),
    last_updated_at: Date.now(),
    total_knowledge_points: 0,
    unlocked_instruments: new Set(),
    evidence_log: [],
    worlds_played: new Map(),
    field_journal: [],
    settings: {
      show_knowledge_hints: true,
      auto_offer_evidence: true,
    },
  };
}

/**
 * Generate deterministic session ID (UUID v4 simulation)
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Save player progress to localStorage
 */
export function savePlayerProgress(progress: LocalPlayerProgress): boolean {
  try {
    const serialized: SerializedPlayerProgress = {
      session_id: progress.session_id,
      created_at: progress.created_at,
      last_updated_at: Date.now(), // Update timestamp on save
      total_knowledge_points: progress.total_knowledge_points,
      unlocked_instruments: Array.from(progress.unlocked_instruments),
      evidence_log: progress.evidence_log,
      worlds_played: Array.from(progress.worlds_played.entries()),
      field_journal: progress.field_journal,
      settings: progress.settings,
    };

    const json = JSON.stringify(serialized);
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error('Failed to save player progress to localStorage', error);
    return false;
  }
}

/**
 * Load player progress from localStorage
 * Returns null if no progress found
 */
export function loadPlayerProgress(): LocalPlayerProgress | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const serialized = JSON.parse(json) as SerializedPlayerProgress;

    return {
      session_id: serialized.session_id,
      created_at: serialized.created_at,
      last_updated_at: serialized.last_updated_at,
      total_knowledge_points: serialized.total_knowledge_points,
      unlocked_instruments: new Set(serialized.unlocked_instruments),
      evidence_log: serialized.evidence_log,
      worlds_played: new Map(serialized.worlds_played),
      field_journal: serialized.field_journal,
      settings: serialized.settings,
    };
  } catch (error) {
    console.error('Failed to load player progress from localStorage', error);
    return null;
  }
}

/**
 * Clear player progress from localStorage
 */
export function clearPlayerProgress(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear player progress', error);
    return false;
  }
}

/**
 * Add evidence to player's progress and award KP
 * Updates unlocked instruments based on KP thresholds
 */
export function addEvidenceAndAwardKP(
  progress: LocalPlayerProgress,
  evidence: Evidence,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): void {
  // Add evidence to log
  progress.evidence_log.push(evidence);
  progress.total_knowledge_points += evidence.knowledge_points_awarded;
  progress.last_updated_at = Date.now();

  // Update unlocked instruments based on KP thresholds
  updateUnlockedInstruments(progress, constants);
}

/**
 * Update unlocked instruments based on current KP total
 */
export function updateUnlockedInstruments(
  progress: LocalPlayerProgress,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): void {
  const kp = progress.total_knowledge_points;

  // Tier 1
  if (kp >= constants.UNLOCK_WATCHLIST) {
    progress.unlocked_instruments.add('watchlist');
  }
  if (kp >= constants.UNLOCK_STABILITY_METER) {
    progress.unlocked_instruments.add('stability_meter');
  }

  // Tier 2
  if (kp >= constants.UNLOCK_EXPORT) {
    progress.unlocked_instruments.add('export');
  }

  // Tier 3
  if (kp >= constants.UNLOCK_OVERLAYS) {
    progress.unlocked_instruments.add('overlays');
  }

  // Tier 4
  if (kp >= constants.UNLOCK_BRANCH) {
    progress.unlocked_instruments.add('branch_checkpoint');
  }

  // Tier 5
  if (kp >= constants.UNLOCK_FREQUENCY_CHART) {
    progress.unlocked_instruments.add('frequency_chart');
  }

  // Tier 6
  if (kp >= constants.UNLOCK_FORECAST) {
    progress.unlocked_instruments.add('forecast_dashboard');
  }

  // Tier 7
  if (kp >= constants.UNLOCK_COMPARE) {
    progress.unlocked_instruments.add('outcome_comparison');
  }

  // Tier 8
  if (kp >= constants.UNLOCK_SCENARIOS) {
    progress.unlocked_instruments.add('scenario_builder');
  }

  // Tier 9
  if (kp >= constants.UNLOCK_LIBRARY) {
    progress.unlocked_instruments.add('scenario_library');
  }
}

/**
 * Check if instrument is unlocked
 */
export function isInstrumentUnlocked(
  progress: LocalPlayerProgress,
  instrument: string
): boolean {
  return progress.unlocked_instruments.has(instrument);
}

/**
 * Add world metadata to player's progress
 */
export function addWorldMetadata(
  progress: LocalPlayerProgress,
  world: WorldMetadata
): void {
  progress.worlds_played.set(world.world_seed, world);
  progress.last_updated_at = Date.now();
}

/**
 * Add field journal entry
 */
export function addFieldJournalEntry(
  progress: LocalPlayerProgress,
  entry: FieldJournalEntry
): void {
  progress.field_journal.push(entry);
  progress.last_updated_at = Date.now();
}

/**
 * Get evidence for a specific world
 */
export function getEvidenceForWorld(
  progress: LocalPlayerProgress,
  world_seed: number
): Evidence[] {
  return progress.evidence_log.filter((e) => e.world_seed === world_seed);
}

/**
 * Get total evidence count
 */
export function getEvidenceCount(progress: LocalPlayerProgress): number {
  return progress.evidence_log.length;
}

/**
 * Get unlocked instruments list
 */
export function getUnlockedInstruments(progress: LocalPlayerProgress): string[] {
  return Array.from(progress.unlocked_instruments).sort();
}

/**
 * Get estimated storage size (bytes)
 * Used to warn before localStorage limit
 */
export function estimateStorageSize(progress: LocalPlayerProgress): number {
  try {
    const serialized: SerializedPlayerProgress = {
      session_id: progress.session_id,
      created_at: progress.created_at,
      last_updated_at: progress.last_updated_at,
      total_knowledge_points: progress.total_knowledge_points,
      unlocked_instruments: Array.from(progress.unlocked_instruments),
      evidence_log: progress.evidence_log,
      worlds_played: Array.from(progress.worlds_played.entries()),
      field_journal: progress.field_journal,
      settings: progress.settings,
    };

    const json = JSON.stringify(serialized);
    return new Blob([json]).size;
  } catch (error) {
    console.error('Failed to estimate storage size', error);
    return 0;
  }
}

/**
 * Export player progress as JSON string (for backup/sharing)
 */
export function exportPlayerProgress(progress: LocalPlayerProgress): string {
  try {
    const serialized: SerializedPlayerProgress = {
      session_id: progress.session_id,
      created_at: progress.created_at,
      last_updated_at: progress.last_updated_at,
      total_knowledge_points: progress.total_knowledge_points,
      unlocked_instruments: Array.from(progress.unlocked_instruments),
      evidence_log: progress.evidence_log,
      worlds_played: Array.from(progress.worlds_played.entries()),
      field_journal: progress.field_journal,
      settings: progress.settings,
    };

    return JSON.stringify(serialized, null, 2);
  } catch (error) {
    console.error('Failed to export player progress', error);
    return '';
  }
}

/**
 * Import player progress from JSON string
 */
export function importPlayerProgress(json: string): LocalPlayerProgress | null {
  try {
    const serialized = JSON.parse(json) as SerializedPlayerProgress;

    return {
      session_id: serialized.session_id,
      created_at: serialized.created_at,
      last_updated_at: serialized.last_updated_at,
      total_knowledge_points: serialized.total_knowledge_points,
      unlocked_instruments: new Set(serialized.unlocked_instruments),
      evidence_log: serialized.evidence_log,
      worlds_played: new Map(serialized.worlds_played),
      field_journal: serialized.field_journal,
      settings: serialized.settings,
    };
  } catch (error) {
    console.error('Failed to import player progress', error);
    return null;
  }
}
