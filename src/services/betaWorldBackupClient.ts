import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ORIGINS_APP_VERSION } from '../simulation/diagnosticBundle';
import type { EngineState } from '../simulation/engine';
import {
  ENGINE_SAVE_VERSION,
  deserializeEngineState,
  serializeEngineState,
} from '../simulation/enginePersistence';
import { worldNameFromSeed } from '../ui/worldName';
import { loadBetaDataConfig, type BetaDataConfig } from './betaDataConfig';

const BACKUP_SLOT = 'current';
const BACKUP_LIMIT_BYTES = 8 * 1024 * 1024;

export interface BetaWorldBackupRow {
  slot: string;
  world_name: string;
  seed: number;
  tick: number;
  schema_version: number;
  app_version: string;
  world_state: unknown;
}

export interface BetaWorldBackupBackend {
  ensureAnonymousUserId(): Promise<string>;
  saveCurrentWorld(row: BetaWorldBackupRow): Promise<void>;
  loadCurrentWorld(): Promise<BetaWorldBackupRow | null>;
}

export type BetaWorldBackupResult =
  | { status: 'success'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string; retryable: boolean };

export type BetaWorldRestoreResult =
  | { status: 'success'; state: EngineState; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string; retryable: boolean };

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createWorldBackupRow(state: EngineState): BetaWorldBackupRow {
  const serialized = serializeEngineState(state);
  const byteSize = new TextEncoder().encode(serialized).byteLength;
  if (byteSize > BACKUP_LIMIT_BYTES) {
    throw new Error('This world exceeds the 8 MiB beta cloud-backup limit. Export a local world file instead.');
  }
  return {
    slot: BACKUP_SLOT,
    world_name: worldNameFromSeed(state.seed),
    seed: state.seed,
    tick: state.tick,
    schema_version: ENGINE_SAVE_VERSION,
    app_version: ORIGINS_APP_VERSION,
    world_state: JSON.parse(serialized),
  };
}

/** Upload only when the player explicitly requests it; local saves remain primary. */
export async function saveBetaWorldBackup(
  state: EngineState,
  backend: BetaWorldBackupBackend | null,
): Promise<BetaWorldBackupResult> {
  if (!backend) {
    return { status: 'unavailable', message: 'Cloud backup is not configured for this build. Your browser save and export still work.' };
  }
  let row: BetaWorldBackupRow;
  try {
    row = createWorldBackupRow(state);
    await backend.ensureAnonymousUserId();
    await backend.saveCurrentWorld(row);
    return {
      status: 'success',
      message: `Cloud backup saved at tick ${state.tick.toLocaleString()}. It belongs to this browser; clearing site data loses access.`,
    };
  } catch (error) {
    return { status: 'error', message: describeError(error, 'Could not save the cloud backup.'), retryable: true };
  }
}

/** Restore an owner-scoped explicit backup without ever replacing local state on failure. */
export async function restoreBetaWorldBackup(
  backend: BetaWorldBackupBackend | null,
): Promise<BetaWorldRestoreResult> {
  if (!backend) {
    return { status: 'unavailable', message: 'Cloud restore is not configured for this build.' };
  }
  try {
    await backend.ensureAnonymousUserId();
    const row = await backend.loadCurrentWorld();
    if (!row) return { status: 'empty', message: 'No cloud backup exists for this browser.' };
    const state = deserializeEngineState(JSON.stringify(row.world_state));
    return {
      status: 'success',
      state,
      message: `Restored cloud backup at tick ${state.tick.toLocaleString()}.`,
    };
  } catch (error) {
    return { status: 'error', message: describeError(error, 'Could not restore the cloud backup.'), retryable: true };
  }
}

let cachedClient: { url: string; client: SupabaseClient } | null = null;

function getSupabaseClient(config: BetaDataConfig): SupabaseClient {
  if (cachedClient?.url === config.url) return cachedClient.client;
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  cachedClient = { url: config.url, client };
  return client;
}

export function createSupabaseBetaWorldBackupBackend(config: BetaDataConfig): BetaWorldBackupBackend {
  const client = getSupabaseClient(config);
  return {
    async ensureAnonymousUserId() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user?.id) return existing.session.user.id;
      const { data, error } = await client.auth.signInAnonymously();
      if (error || !data.session?.user?.id) throw new Error(error?.message || 'Anonymous sign-in failed.');
      return data.session.user.id;
    },
    async saveCurrentWorld(row) {
      const { error } = await client
        .from('beta_world_backups')
        .upsert(row, { onConflict: 'owner_id,slot' });
      if (error) throw new Error(error.message || 'Could not store the world backup.');
    },
    async loadCurrentWorld() {
      const { data, error } = await client
        .from('beta_world_backups')
        .select('slot, world_name, seed, tick, schema_version, app_version, world_state')
        .eq('slot', BACKUP_SLOT)
        .maybeSingle();
      if (error) throw new Error(error.message || 'Could not load the world backup.');
      return data as BetaWorldBackupRow | null;
    },
  };
}

/** Missing or invalid public configuration leaves the game local-first. */
export function loadBetaWorldBackupBackend(): BetaWorldBackupBackend | null {
  try {
    const config = loadBetaDataConfig();
    return config ? createSupabaseBetaWorldBackupBackend(config) : null;
  } catch {
    return null;
  }
}
