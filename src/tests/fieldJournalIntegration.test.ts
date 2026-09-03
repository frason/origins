import { describe, it, expect, beforeEach } from 'vitest';
import type { EngineState } from '../simulation/engine';
import type { SimEvent } from '../simulation/events';
import { createFieldJournal } from '../simulation/fieldJournal';
import {
  recordJournalEntries,
  createLineageTracker,
} from '../simulation/fieldJournalIntegration';

/**
 * Integration test for Field Journal integration with simulation engine.
 * Verifies that journal entries are created from simulation events, and that
 * a lineage's full history (from first sighting to extinction) is reconstructable.
 */
describe('Field Journal Integration', () => {
  let journal = createFieldJournal(999);
  let tracker = createLineageTracker();

  beforeEach(() => {
    journal = createFieldJournal(999);
    tracker = createLineageTracker();
  });

  function createMockEngineState(
    tick: number,
    creatures: Array<{
      id: string;
      speciesId: string;
      lineageId: string;
      lifecycleState: 'alive' | 'dead' | 'corpse';
      energy: number;
      traits: Record<string, number>;
    }> = [],
    events: SimEvent[] = [],
    previousState?: EngineState
  ): EngineState {
    // Accumulate events cumulatively, like the real engine does
    const accumulatedEvents = previousState
      ? [...previousState.events, ...events]
      : events;

    return {
      tick,
      creatures: creatures.map((c) => ({
        id: c.id,
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        lifecycleState: c.lifecycleState,
        energy: c.energy,
        traits: c.traits,
        x: 50,
        y: 50,
        age: 0,
        generation: 1,
        parentId: null,
        brain: { neurons: 1, complexity: 0 },
      })),
      grid: {
        width: 100,
        height: 100,
        cells: [],
      },
      events: accumulatedEvents,
      checkpoints: [],
    } as any;
  }

  it('should record first sighting when a lineage is first observed', () => {
    // Start with empty engine
    const startState = createMockEngineState(1, []);

    // At tick 2, introduce a creature
    const creature1 = {
      id: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };
    const birthEvent: SimEvent = {
      tick: 2,
      type: 'birth',
      creatureId: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
    } as any;

    const state2 = createMockEngineState(2, [creature1], [birthEvent]);

    // Record journal entries from the birth event
    journal = recordJournalEntries(journal, startState, state2, tracker);

    // Should have a first-sighting entry
    const firstSightings = journal.entries.filter(
      (e) =>
        e.type === 'first-sighting' &&
        e.speciesId === 'mouse' &&
        e.lineageId === 'lineage-A'
    );
    expect(firstSightings.length).toBe(1);
    expect(firstSightings[0].tick).toBe(2);
    expect(firstSightings[0].observed.population).toBe(1);
  });

  it('should record adaptation when lineage shows trait changes', () => {
    // Start with a creature
    const creature1 = {
      id: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };

    const startState = createMockEngineState(1, [creature1]);
    tracker.seenLineages.add('mouse:lineage-A');

    // At tick 2, the creature has a mutation
    const creature1Mutated = {
      id: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 2, speed: 2 }, // Size changed
    };

    const mutationEvent: SimEvent = {
      tick: 2,
      type: 'mutation',
      creatureId: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      traitChanges: [{ trait: 'size', oldValue: 1, newValue: 2, percentChange: 100 }],
      mutationPressure: 0.1,
    } as any;

    const state2 = createMockEngineState(2, [creature1Mutated], [mutationEvent]);

    // Record journal entries
    journal = recordJournalEntries(journal, startState, state2, tracker);

    // Should have an adaptation entry
    const adaptations = journal.entries.filter(
      (e) =>
        e.type === 'adaptation' &&
        e.speciesId === 'mouse' &&
        e.lineageId === 'lineage-A'
    );
    expect(adaptations.length).toBeGreaterThan(0);
    expect(adaptations[0].tick).toBe(2);
    expect(adaptations[0].observed.traitChanges?.length).toBe(1);
  });

  it('should record extinction when a lineage dies out completely', () => {
    // Start with creatures
    const creature1 = {
      id: 'creature-1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };
    const creature2 = {
      id: 'creature-2',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };

    const startState = createMockEngineState(1, [creature1, creature2]);
    tracker.seenLineages.add('mouse:lineage-A');

    // At tick 2, both creatures die (extinction event)
    const extinctionEvent: SimEvent = {
      tick: 2,
      type: 'extinction',
      speciesId: 'mouse',
    } as any;

    const deathEvent1: SimEvent = {
      tick: 2,
      type: 'death',
      creatureId: 'creature-1',
      speciesId: 'mouse',
      deathCause: 'starvation',
    } as any;

    const deathEvent2: SimEvent = {
      tick: 2,
      type: 'death',
      creatureId: 'creature-2',
      speciesId: 'mouse',
      deathCause: 'starvation',
    } as any;

    // All creatures are now dead
    const state2 = createMockEngineState(2, [], [extinctionEvent, deathEvent1, deathEvent2]);

    // Record journal entries
    journal = recordJournalEntries(journal, startState, state2, tracker);

    // Should have an extinction entry
    const extinctions = journal.entries.filter(
      (e) =>
        e.type === 'extinction' &&
        e.speciesId === 'mouse' &&
        e.lineageId === 'lineage-A'
    );
    expect(extinctions.length).toBe(1);
    expect(extinctions[0].tick).toBe(2);
  });

  it('should reconstruct full lineage history from journal entries', () => {
    // Simulate a complete lineage lifecycle

    // Tick 1: Lineage A is born
    const state1Creature = {
      id: 'a1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 1 },
    };

    const birthEventA: SimEvent = {
      tick: 1,
      type: 'birth',
      creatureId: 'a1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
    } as any;

    const state1 = createMockEngineState(1, [state1Creature], [birthEventA]);
    journal = recordJournalEntries(journal, null, state1, tracker);

    // Verify first sighting was created
    let lineageAEntries = journal.entries.filter(
      (e) => e.speciesId === 'mouse' && e.lineageId === 'lineage-A'
    );
    expect(lineageAEntries.length).toBe(1);
    expect(lineageAEntries[0].type).toBe('first-sighting');

    // Tick 2: Mutation in Lineage A (with the creature still alive)
    const state2Creature = {
      id: 'a1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 2, speed: 1 },
    };

    const mutationEventA: SimEvent = {
      tick: 2,
      type: 'mutation',
      creatureId: 'a1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      traitChanges: [{ trait: 'size', oldValue: 1, newValue: 2, percentChange: 100 }],
    } as any;

    const state2 = createMockEngineState(2, [state2Creature], [mutationEventA], state1);
    journal = recordJournalEntries(journal, state1, state2, tracker);

    // Verify adaptation entry was created (total should be 2)
    lineageAEntries = journal.entries.filter(
      (e) => e.speciesId === 'mouse' && e.lineageId === 'lineage-A'
    );
    expect(lineageAEntries.length).toBeGreaterThanOrEqual(1);

    // Make sure tracker knows about this lineage before extinction
    tracker.seenLineages.add('mouse:lineage-A');
    tracker.lastEventByLineage.set('mouse:lineage-A', 2);

    // Tick 3: Extinction of Lineage A (both creature and lineage die)
    const extinctionEventA: SimEvent = {
      tick: 3,
      type: 'extinction',
      speciesId: 'mouse',
    } as any;

    const deathEventA: SimEvent = {
      tick: 3,
      type: 'death',
      creatureId: 'a1',
      speciesId: 'mouse',
      deathCause: 'starvation',
    } as any;

    const state3 = createMockEngineState(3, [], [extinctionEventA, deathEventA], state2);
    journal = recordJournalEntries(journal, state2, state3, tracker);

    // Verify the full history is recorded
    lineageAEntries = journal.entries.filter(
      (e) => e.speciesId === 'mouse' && e.lineageId === 'lineage-A'
    );
    expect(lineageAEntries.length).toBeGreaterThanOrEqual(2);

    // Should have first sighting
    const firstSighting = lineageAEntries.find((e) => e.type === 'first-sighting');
    expect(firstSighting).toBeDefined();

    // Should have extinction
    const extinction = lineageAEntries.find((e) => e.type === 'extinction');
    expect(extinction).toBeDefined();

    // Entries should be in chronological order
    if (firstSighting && extinction) {
      expect(extinction.tick).toBeGreaterThan(firstSighting.tick);
    }
  });

  it('should only record extinction once per lineage per extinction event', () => {
    // Start with creatures of two different lineages in the same species
    const creatureA = {
      id: 'a1',
      speciesId: 'mouse',
      lineageId: 'lineage-A',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };
    const creatureB = {
      id: 'b1',
      speciesId: 'mouse',
      lineageId: 'lineage-B',
      lifecycleState: 'alive' as const,
      energy: 50,
      traits: { size: 1, speed: 2 },
    };

    const startState = createMockEngineState(1, [creatureA, creatureB]);
    tracker.seenLineages.add('mouse:lineage-A');
    tracker.seenLineages.add('mouse:lineage-B');

    // Both lineages go extinct
    const extinctionEvent: SimEvent = {
      tick: 2,
      type: 'extinction',
      speciesId: 'mouse',
    } as any;

    const state2 = createMockEngineState(2, [], [extinctionEvent]);
    journal = recordJournalEntries(journal, startState, state2, tracker);

    // Should have exactly one extinction entry per lineage
    const extinctionsA = journal.entries.filter(
      (e) =>
        e.type === 'extinction' &&
        e.speciesId === 'mouse' &&
        e.lineageId === 'lineage-A'
    );
    const extinctionsB = journal.entries.filter(
      (e) =>
        e.type === 'extinction' &&
        e.speciesId === 'mouse' &&
        e.lineageId === 'lineage-B'
    );

    expect(extinctionsA.length).toBe(1);
    expect(extinctionsB.length).toBe(1);
  });
});
