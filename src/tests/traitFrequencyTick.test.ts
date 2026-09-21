import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { runEngine, tickEngine, type EngineState } from '../simulation/engine';
import { buildDemoEngine } from '../simulation/demoWorld';
import {
  deserializeEngineState,
  serializeEngineState,
} from '../simulation/enginePersistence';
import {
  recordTraitFrequencyWindow,
  TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS,
  type TraitFrequencyRecord,
} from '../simulation/traitFrequency';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';
import type { CreatureSnapshot } from '../state/store';

function snapshot(
  index: number,
  overrides: Partial<CreatureSnapshot> = {}
): CreatureSnapshot {
  return {
    id: `creature-${index}`,
    speciesId: 'species_a',
    lineageId: 'lineage_a',
    parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0,
    y: 0,
    energy: 100,
    age: 1,
    lifecycleState: 'alive',
    corpseDecayTicks: 0,
    ...overrides,
  };
}

describe('recordTraitFrequencyWindow', () => {
  it('groups living creatures by lineage and appends one window per lineage', () => {
    const histories: TraitFrequencyRecord = {};
    const creatures = [
      snapshot(0, { lineageId: 'lineage_a', traits: { ...DEFAULT_TRAITS, speed: 1 } }),
      snapshot(1, { lineageId: 'lineage_a', traits: { ...DEFAULT_TRAITS, speed: 1.5 } }),
      snapshot(2, {
        lineageId: 'lineage_b',
        speciesId: 'species_b',
        traits: { ...DEFAULT_TRAITS, speed: 2 },
      }),
    ];

    const next = recordTraitFrequencyWindow(histories, creatures, 0, 25);

    expect(Object.keys(next).sort()).toEqual(['lineage_a', 'lineage_b']);
    expect(next.lineage_a.recentWindow).toHaveLength(1);
    expect(next.lineage_a.recentWindow[0].sampleSize).toBe(2);
    expect(next.lineage_a.recentWindow[0].speciesId).toBe('species_a');
    expect(next.lineage_a.recentWindow[0].lineageId).toBe('lineage_a');
    expect(next.lineage_a.recentWindow[0].traitFrequencies.speed).toBeDefined();
    expect(next.lineage_b.recentWindow[0].sampleSize).toBe(1);
  });

  it('excludes corpses so death does not masquerade as trait change', () => {
    const creatures = [
      snapshot(0, { traits: { ...DEFAULT_TRAITS, speed: 1 } }),
      snapshot(1, {
        lifecycleState: 'corpse',
        traits: { ...DEFAULT_TRAITS, speed: 99 },
      }),
    ];

    const next = recordTraitFrequencyWindow({}, creatures, 0, 25);

    expect(next.lineage_a.recentWindow[0].sampleSize).toBe(1);
    expect(next.lineage_a.recentWindow[0].traitFrequencies.speed.max).toBe(1);
  });

  it('leaves the input record untouched (no mutation)', () => {
    const creatures = [snapshot(0)];
    const histories = {
      lineage_z: {
        recentWindow: [],
        compressedArchive: [],
        maxRecentWindows: 10,
        compressionRatio: 2,
      },
    };

    recordTraitFrequencyWindow(histories, creatures, 0, 25);

    expect(Object.keys(histories)).toEqual(['lineage_z']);
  });
});

describe('trait-frequency tick wiring', () => {
  it('records nothing before the sampling interval elapses', () => {
    const state = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    const beforeInterval = runEngine(state, TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS - 1);

    expect(beforeInterval.tick).toBe(TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS - 1);
    expect(beforeInterval.traitFrequencyHistory).toEqual({});
  });

  it('populates per-lineage histories after N ticks from a fixed seed', () => {
    const state = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    const after = runEngine(state, TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS + 1);

    const lineageIds = Object.keys(after.traitFrequencyHistory);
    expect(lineageIds.length).toBeGreaterThan(0);

    // Every recorded key must belong to a lineage that actually existed in
    // the simulation, and every living lineage at the sampling tick must
    // have a history entry.
    const livingLineages = new Set(
      after.creatures
        .filter((c) => c.lifecycleState === 'alive')
        .map((c) => c.lineageId)
    );
    for (const lineageId of lineageIds) {
      const history = after.traitFrequencyHistory[lineageId];
      expect(history.recentWindow.length).toBeGreaterThanOrEqual(1);

      const first = history.recentWindow[0];
      expect(first.lineageId).toBe(lineageId);
      expect(first.startTick).toBe(0);
      expect(first.endTick).toBe(TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS);
      expect(first.sampleSize).toBeGreaterThan(0);
      expect(first.traitFrequencies.speed).toBeDefined();
    }
    for (const living of livingLineages) {
      expect(after.traitFrequencyHistory[living]).toBeDefined();
    }
  });

  it('is deterministic: same seed produces identical histories and states', () => {
    const runA = runEngine(
      buildDemoEngine(424242, { ...SIMULATION_CONSTANTS }),
      TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS * 2
    );
    const runB = runEngine(
      buildDemoEngine(424242, { ...SIMULATION_CONSTANTS }),
      TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS * 2
    );

    expect(runA.traitFrequencyHistory).toEqual(runB.traitFrequencyHistory);

    // The wiring must not perturb the simulation itself: identical seeds
    // still produce identical creatures, events, and history.
    expect(runA.creatures).toEqual(runB.creatures);
    expect(runA.events).toEqual(runB.events);
    expect(runA.history).toEqual(runB.history);
  });

  it('keeps recording on later windows without losing earlier ones', () => {
    const state = buildDemoEngine(777, { ...SIMULATION_CONSTANTS });
    const after = runEngine(state, TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS * 2 + 2);

    const lineageIds = Object.keys(after.traitFrequencyHistory);
    expect(lineageIds.length).toBeGreaterThan(0);
    for (const lineageId of lineageIds) {
      const windows = after.traitFrequencyHistory[lineageId].recentWindow;
      expect(windows.length).toBeGreaterThanOrEqual(1);
      // When two windows were sampled for a lineage they must be ordered
      // and non-overlapping.
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i].startTick).toBe(windows[i - 1].endTick);
      }
      const last = windows[windows.length - 1];
      expect(last.endTick).toBe(TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS * 2);
    }
  });
});

describe('trait-frequency save/load round-trip', () => {
  function buildSampledEngine(seed: number): EngineState {
    return runEngine(
      buildDemoEngine(seed, { ...SIMULATION_CONSTANTS }),
      TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS + 1
    );
  }

  it('preserves recorded histories through serialize/deserialize', () => {
    const state = buildSampledEngine(31337);

    const restored = deserializeEngineState(serializeEngineState(state));

    expect(restored.traitFrequencyHistory).toEqual(state.traitFrequencyHistory);
  });

  it('loads a pre-tracking save (field absent) as an empty record and keeps ticking', () => {
    // Stop just before a sampling boundary, then simulate an old save that
    // predates the traitFrequencyHistory field.
    const state = runEngine(
      buildDemoEngine(2024, { ...SIMULATION_CONSTANTS }),
      TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS - 1
    );
    const payload = JSON.parse(serializeEngineState(state));
    expect(payload.state.traitFrequencyHistory).toBeDefined();
    delete payload.state.traitFrequencyHistory;

    const restored = deserializeEngineState(JSON.stringify(payload));
    expect(restored.traitFrequencyHistory).toEqual({});

    // The very next tick crosses the sampling boundary: recording resumes.
    const ticked = tickEngine(restored);
    expect(ticked.tick).toBe(TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS);
    expect(Object.keys(ticked.traitFrequencyHistory).length).toBeGreaterThan(0);
  });
});

describe('recordTraitFrequencyWindow smoke: engine creatures', () => {
  it('accepts real Creature snapshots from the engine (type-level integration)', () => {
    Creature.resetIdCounter();
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 50,
      y: 50,
      energy: 100,
    });
    const snapshots: CreatureSnapshot[] = [
      {
        id: creature.id,
        speciesId: creature.speciesId,
        lineageId: creature.lineageId,
        parentId: creature.parentId,
        traits: creature.traits,
        x: creature.x,
        y: creature.y,
        energy: creature.energy,
        age: creature.age,
        lifecycleState: creature.lifecycleState,
        corpseDecayTicks: creature.corpseDecayTicks,
      },
    ];

    const next = recordTraitFrequencyWindow({}, snapshots, 0, TRAIT_FREQUENCY_SAMPLE_INTERVAL_TICKS);
    expect(next.lineage_1.recentWindow).toHaveLength(1);
  });
});
