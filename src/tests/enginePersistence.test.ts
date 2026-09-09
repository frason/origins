import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { deserializeEngineState, serializeEngineState, createPersistedEngineState, EVENT_COMPACTION_VERSION_STORED } from '../simulation/enginePersistence';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import type { SimEvent } from '../simulation/events';

describe('versioned engine persistence', () => {
  it('restores an exact world that continues deterministically', () => {
    let source = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    for (let tick = 0; tick < 30; tick++) source = tickEngine(source);
    const restored = deserializeEngineState(serializeEngineState(source));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(source));
    expect(tickEngine(restored)).toEqual(tickEngine(source));
  });

  it('rejects corrupt and unsupported saves with recoverable errors', () => {
    expect(() => deserializeEngineState('not json')).toThrow('valid JSON');
    expect(() => deserializeEngineState(JSON.stringify({ version: 99, state: {} })))
      .toThrow('unsupported version');
  });
});

describe('event compaction during persistence', () => {
  it('applies event compaction to bounded events array', () => {
    let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });

    // Simulate ticks to generate many events
    for (let tick = 0; tick < 100; tick++) {
      state = tickEngine(state);
    }

    const persisted = createPersistedEngineState(state);

    // Verify compaction metadata is present
    expect(persisted.compactionVersion).toBe(EVENT_COMPACTION_VERSION_STORED);
    expect(persisted.eventCompactionMetadata).toBeDefined();
    expect(persisted.eventCompactionMetadata?.originalEventCount).toBeGreaterThanOrEqual(
      persisted.eventCompactionMetadata?.compactedEventCount ?? 0
    );
    expect(persisted.eventCompactionMetadata?.compactionAppliedAtTick).toBe(state.tick);
  });

  it('retains milestone events through compaction', () => {
    let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });

    // Ensure we have milestones by running long enough
    for (let tick = 0; tick < 200; tick++) {
      state = tickEngine(state);
    }

    // Add some manual milestone events to ensure they're tested
    if (state.events.length === 0) {
      state.events.push({
        type: 'extinction',
        tick: state.tick,
        speciesId: 'test_species',
      });
    }

    const persisted = createPersistedEngineState(state);
    const persistedEvents = persisted.state.events as SimEvent[];

    // Verify any extinction events are retained
    const extinctionEvents = persistedEvents.filter((e) => e.type === 'extinction');
    if (state.events.some((e) => e.type === 'extinction')) {
      expect(extinctionEvents.length).toBeGreaterThan(0);
    }
  });

  it('estimates serialized size accurately', () => {
    let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });

    for (let tick = 0; tick < 50; tick++) {
      state = tickEngine(state);
    }

    const persisted = createPersistedEngineState(state);
    const estimatedBytes = persisted.eventCompactionMetadata?.estimatedSerializedBytes ?? 0;

    // Sanity check: estimated size should be positive and reasonable
    expect(estimatedBytes).toBeGreaterThan(0);
    expect(estimatedBytes).toBeLessThan(100_000); // Shouldn't be huge for short runs
  });

  it('preserves event continuity on round-trip save/load', () => {
    let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });

    for (let tick = 0; tick < 50; tick++) {
      state = tickEngine(state);
    }

    const originalEventCount = state.events.length;
    const serialized = serializeEngineState(state);
    const restored = deserializeEngineState(serialized);

    // After restoration, events should be present (though possibly compacted)
    expect(restored.events.length).toBeGreaterThan(0);

    // Compaction may reduce count, but shouldn't go to zero
    expect(restored.events.length).toBeLessThanOrEqual(originalEventCount);
  });

  it('handles worlds with many events without corruption', () => {
    let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS, worldWidth: 30, worldHeight: 30 });

    // Generate many ticks to accumulate events
    for (let tick = 0; tick < 200; tick++) {
      state = tickEngine(state);
    }

    const eventCount = state.events.length;
    const persisted = createPersistedEngineState(state);

    // Verify serialization doesn't fail with large event counts
    expect(() => JSON.stringify(persisted)).not.toThrow();

    // Verify metadata shows compaction occurred if needed
    if (eventCount > 100) {
      expect(persisted.eventCompactionMetadata).toBeDefined();
    }
  });
});

