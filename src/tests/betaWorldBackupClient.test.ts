import { describe, expect, it, vi } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  createWorldBackupRow,
  restoreBetaWorldBackup,
  saveBetaWorldBackup,
  type BetaWorldBackupBackend,
} from '../services/betaWorldBackupClient';

function backend(overrides: Partial<BetaWorldBackupBackend> = {}): BetaWorldBackupBackend {
  return {
    ensureAnonymousUserId: vi.fn().mockResolvedValue('anonymous-browser'),
    saveCurrentWorld: vi.fn().mockResolvedValue(undefined),
    loadCurrentWorld: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('beta world backup client', () => {
  it('creates a bounded, versioned JSON-safe backup row without owner identity', () => {
    const state = buildDemoEngine(42, SIMULATION_CONSTANTS);
    const row = createWorldBackupRow(state);

    expect(row).toMatchObject({
      slot: 'current',
      seed: 42,
      tick: 0,
      schema_version: 1,
      app_version: '0.1.0',
    });
    expect(row).not.toHaveProperty('owner_id');
    expect(row.world_state).toMatchObject({
      version: 1,
      state: { seed: 42, tick: 0 },
    });
  });

  it('authenticates before writing an explicit cloud backup', async () => {
    const calls: string[] = [];
    const client = backend({
      ensureAnonymousUserId: vi.fn().mockImplementation(async () => { calls.push('auth'); return 'anonymous-browser'; }),
      saveCurrentWorld: vi.fn().mockImplementation(async (row) => {
        calls.push('save');
        expect(row).not.toHaveProperty('owner_id');
      }),
    });
    const result = await saveBetaWorldBackup(buildDemoEngine(42, SIMULATION_CONSTANTS), client);

    expect(result).toMatchObject({ status: 'success', message: expect.stringContaining('clearing site data') });
    expect(calls).toEqual(['auth', 'save']);
  });

  it('keeps play local-first when cloud backup is unavailable', async () => {
    await expect(saveBetaWorldBackup(buildDemoEngine(42, SIMULATION_CONSTANTS), null)).resolves.toMatchObject({
      status: 'unavailable',
    });
  });

  it('restores an exact saved engine state without touching a different owner', async () => {
    const original = buildDemoEngine(42, SIMULATION_CONSTANTS);
    const client = backend({ loadCurrentWorld: vi.fn().mockResolvedValue(createWorldBackupRow(original)) });
    const result = await restoreBetaWorldBackup(client);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.state).toEqual(original);
    }
    expect(client.ensureAnonymousUserId).toHaveBeenCalledOnce();
  });

  it('does not replace the current world when no owner-scoped backup exists', async () => {
    await expect(restoreBetaWorldBackup(backend())).resolves.toMatchObject({ status: 'empty' });
  });
});
