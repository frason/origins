import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, tickEngine, type EngineState } from '../simulation/engine';
import {
  deserializeEngineState,
  serializeEngineState,
  type PersistedEngineState,
} from '../simulation/enginePersistence';
import { Creature } from '../simulation/creature';
import { buildStarterCreatures } from '../simulation/starterWorld';
import { StreamedRng } from '../simulation/rng';
import { DEFAULT_SEASON_CONFIG, LEGACY_SEASON_CONFIG, type SeasonConfig } from '../simulation/seasons';
import { SIMULATION_CONSTANTS } from '../utils/constants';

// Season save migration and determinism snapshots (#355, docs/design-seasons.md "Save/load and determinism").

const W = 20;
const H = 20;
const SEED = 4242;
const SNAPSHOT_TICKS = [0, 240, 960, 9600];

const fixturePath = (name: string) => resolve(process.cwd(), 'src/tests/fixtures', name);
/** Save written by the pre-season code path (no season block), 20x20 world, seed 4242, tick 0. */
const PRE_SEASON_SAVE = readFileSync(fixturePath('preSeasonSave20x20.json'), 'utf8');
/**
 * Golden fingerprints (see `fingerprint`), generated from the pre-season code path with seasons absent:
 * "fixture@T" = the fixture restored and ticked T times; "fresh@T" = same-seed fresh run at tick T.
 */
const PRE_SEASON_HASHES: Record<string, string> = JSON.parse(
  readFileSync(fixturePath('preSeasonSave20x20.hashes.json'), 'utf8'),
);

/** Stable 2×32-bit FNV-1a fingerprint of a full serialized snapshot plus its length. */
function fingerprint(serialized: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < serialized.length; i++) {
    const c = serialized.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + ':' + serialized.length;
}

function freshEngine(seasonConfig?: SeasonConfig): EngineState {
  // Creature ids come from a process-global counter; reset so each same-seed run starts identically.
  Creature.resetIdCounter();
  const creatures = buildStarterCreatures(
    SEED, W, H, SIMULATION_CONSTANTS.corpseDecayDurationTicks, new StreamedRng(SEED, 0),
  );
  return createEngine(SEED, creatures, W, H, {}, seasonConfig);
}

/** Fingerprints of the full state at each snapshot tick, from a single run. */
function snapshotRun(seasonConfig?: SeasonConfig): Record<string, string> {
  const out: Record<string, string> = {};
  let state = freshEngine(seasonConfig);
  for (let tick = 0; tick <= SNAPSHOT_TICKS[SNAPSHOT_TICKS.length - 1]; tick++) {
    if (SNAPSHOT_TICKS.includes(tick)) out[String(tick)] = fingerprint(serializeEngineState(state));
    if (tick < SNAPSHOT_TICKS[SNAPSHOT_TICKS.length - 1]) state = tickEngine(state);
  }
  return out;
}

function payloadOf(serialized: string): PersistedEngineState {
  return JSON.parse(serialized) as PersistedEngineState;
}

describe('season block in the save payload (#355)', () => {
  it('a save with no season block loads with seasons disabled', () => {
    expect(payloadOf(PRE_SEASON_SAVE).state).not.toHaveProperty('seasonConfig');
    const restored = deserializeEngineState(PRE_SEASON_SAVE);
    expect(restored.seasonConfig).toBeUndefined();
    expect(restored.seasonConfig?.enabled ?? LEGACY_SEASON_CONFIG.enabled).toBe(false);
  });

  it('a legacy save written by the current code carries no season block', () => {
    const legacy = freshEngine();
    expect(legacy.seasonConfig).toBeUndefined();
    expect(payloadOf(serializeEngineState(legacy)).state).not.toHaveProperty('seasonConfig');
  });

  it('an explicit season block with enabled=false loads as disabled and is preserved', () => {
    const disabled = { ...DEFAULT_SEASON_CONFIG, enabled: false };
    const payload = payloadOf(PRE_SEASON_SAVE);
    payload.state.seasonConfig = disabled;
    const restored = deserializeEngineState(JSON.stringify(payload));
    expect(restored.seasonConfig).toEqual(disabled);
    expect(restored.seasonConfig?.enabled).toBe(false);
  });

  it('an enabled season block round-trips through save and load', () => {
    const enabled = { ...DEFAULT_SEASON_CONFIG, phaseOffsetTicks: 240 };
    const state = freshEngine(enabled);
    const saved = serializeEngineState(state);
    expect(payloadOf(saved).state.seasonConfig).toEqual(enabled);
    const restored = deserializeEngineState(saved);
    expect(restored.seasonConfig).toEqual(enabled);
    expect(serializeEngineState(tickEngine(restored))).toBe(serializeEngineState(tickEngine(state)));
  });

  it('rejects a malformed season block instead of silently defaulting', () => {
    const payload = payloadOf(PRE_SEASON_SAVE);
    payload.state.seasonConfig = { ...DEFAULT_SEASON_CONFIG, enabled: 'yes' } as unknown as SeasonConfig;
    expect(() => deserializeEngineState(JSON.stringify(payload))).toThrow(RangeError);
  });
});

describe('old-save fixture replay (#355)', () => {
  it('the pre-season fixture restores and ticks to the pre-season golden state', () => {
    const restored = deserializeEngineState(PRE_SEASON_SAVE);
    expect(fingerprint(serializeEngineState(restored))).toBe(PRE_SEASON_HASHES['fixture@0']);
    let state = restored;
    for (let i = 0; i < 120; i++) state = tickEngine(state);
    expect(fingerprint(serializeEngineState(state))).toBe(PRE_SEASON_HASHES['fixture@120']);
  });

  it('replaying the fixture matches a fresh same-seed run with seasons absent', () => {
    let fromFixture = deserializeEngineState(PRE_SEASON_SAVE);
    let fresh = freshEngine();
    for (let i = 0; i < 30; i++) {
      fromFixture = tickEngine(fromFixture);
      fresh = tickEngine(fresh);
    }
    expect(serializeEngineState(fromFixture)).toBe(serializeEngineState(fresh));
  });
});

describe('determinism snapshots (#355)', () => {
  it('seasons absent reproduce the pre-season snapshots at ticks 0, 240, 960, 9600', () => {
    const golden = Object.fromEntries(SNAPSHOT_TICKS.map((t) => [String(t), PRE_SEASON_HASHES[`fresh@${t}`]]));
    expect(snapshotRun(undefined)).toEqual(golden);
  }, 900_000);

  it('an explicit disabled block changes only the season block, not the simulated content', () => {
    let absent = freshEngine();
    let disabled = freshEngine({ ...DEFAULT_SEASON_CONFIG, enabled: false });
    for (let i = 0; i < 240; i++) {
      absent = tickEngine(absent);
      disabled = tickEngine(disabled);
    }
    const strip = (state: EngineState) => {
      const payload = payloadOf(serializeEngineState(state));
      delete payload.state.seasonConfig;
      return JSON.stringify(payload);
    };
    expect(strip(disabled)).toBe(strip(absent));
  });

  it('same seed and same enabled config give identical snapshots at ticks 0, 240, 960, 9600', () => {
    const first = snapshotRun(DEFAULT_SEASON_CONFIG);
    const second = snapshotRun(DEFAULT_SEASON_CONFIG);
    expect(Object.keys(first)).toEqual(SNAPSHOT_TICKS.map(String));
    expect(second).toEqual(first);
    // Sanity: enabling seasons must actually change the simulated state versus the pre-season baseline.
    expect(first['240']).not.toBe(PRE_SEASON_HASHES['fresh@240']);
  }, 900_000);
});
