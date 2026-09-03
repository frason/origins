/**
 * Field Journal Integration — wire simulation engine events to journal entries
 *
 * This module connects the deterministic simulation engine to the field journal,
 * creating entries when significant lineage events occur (births, adaptations,
 * speciation, extinctions, interventions).
 *
 * The journal itself is non-deterministic (player notes, timestamps), but entries
 * are keyed by simulation tick and event type, making them reproducible.
 */

import type { EngineState } from './engine';
import type { FieldJournal, FieldJournalEntry } from './fieldJournal';
import {
  createFirstSightingEntry,
  createAdaptationEntry,
  createSpeationEntry,
  createExtinctionEntry,
  createInterventionEntry,
  addJournalEntry,
} from './fieldJournal';
import type { SimEvent } from './events';

/**
 * Track seen lineages to detect first sightings
 */
interface LineageTracker {
  seenLineages: Set<string>; // "speciesId:lineageId"
  lastEventByLineage: Map<string, number>; // Last tick we saw each lineage
}

/**
 * Generate journal entries from a new tick's events
 *
 * This is called after each engine tick to capture significant evolutionary moments.
 * It compares the new events against historical state to create journal entries.
 */
export function recordJournalEntries(
  journal: FieldJournal,
  previousState: EngineState | null,
  currentState: EngineState,
  tracker: LineageTracker
): FieldJournal {
  let updated = journal;
  const newEvents = previousState
    ? currentState.events.slice(previousState.events.length)
    : currentState.events;

  // Extract just the new events from this tick
  const tickNewEvents = newEvents.filter((e) => e.tick === currentState.tick);

  // Track which lineages we've seen so far
  for (const creature of currentState.creatures) {
    if (creature.lifecycleState === 'alive') {
      tracker.seenLineages.add(`${creature.speciesId}:${creature.lineageId}`);
      tracker.lastEventByLineage.set(
        `${creature.speciesId}:${creature.lineageId}`,
        currentState.tick
      );
    }
  }

  // Process each event type to create journal entries
  const birthEvents = tickNewEvents.filter((e) => e.type === 'birth') as any[];
  const mutationEvents = tickNewEvents.filter((e) => e.type === 'mutation') as any[];
  const speciationEvents = tickNewEvents.filter((e) => e.type === 'speciation') as any[];
  const deathEvents = tickNewEvents.filter((e) => e.type === 'death') as any[];
  const extinctionEvents = tickNewEvents.filter((e) => e.type === 'extinction') as any[];

  // Record first sightings: When we see a lineage for the first time
  const seenThisTick = new Set<string>();
  for (const event of tickNewEvents) {
    if (!('lineageId' in event) || !event.lineageId || !event.speciesId) continue;
    const lineageId: string = event.lineageId; // Type guard: narrow to string after checking
    const speciesId: string = event.speciesId; // Type guard
    const lineageKey = `${speciesId}:${lineageId}`;
    if (!seenThisTick.has(lineageKey)) {
      if (!journal.entries.some(
        (e) => e.type === 'first-sighting'
          && e.speciesId === speciesId
          && e.lineageId === lineageId
      )) {
        // Count living creatures of this lineage to get population
        const population = currentState.creatures.filter(
          (c) => c.lifecycleState === 'alive'
            && c.speciesId === speciesId
            && c.lineageId === lineageId
        ).length;
        if (population > 0) {
          const entry = createFirstSightingEntry(
            speciesId,
            lineageId,
            currentState.tick,
            population
          );
          updated = addJournalEntry(updated, entry);
          seenThisTick.add(lineageKey);
        }
      }
    }
  }

  // Record adaptations: When a lineage shows significant trait changes
  for (const event of mutationEvents) {
    if (!event.lineageId) continue;
    const population = currentState.creatures.filter(
      (c) => c.lifecycleState === 'alive'
        && c.speciesId === event.speciesId
        && c.lineageId === event.lineageId
    ).length;
    if (population > 0 && event.traitChanges && event.traitChanges.length > 0) {
      const entry = createAdaptationEntry(
        event.speciesId,
        event.lineageId,
        currentState.tick,
        event.traitChanges,
        population,
        event.mutationPressure
      );
      updated = addJournalEntry(updated, entry);
    }
  }

  // Record speciation events: When a new species is established
  for (const event of speciationEvents) {
    if (!event.lineageId) continue;
    const founderCount = currentState.creatures.filter(
      (c) => c.lifecycleState === 'alive'
        && c.speciesId === event.speciesId
    ).length;
    const entry = createSpeationEntry(
      event.ancestralSpeciesId,
      event.speciesId,
      event.lineageId,
      currentState.tick,
      founderCount
    );
    updated = addJournalEntry(updated, entry);
  }

  // Record extinctions: When a lineage or species disappears
  for (const event of extinctionEvents) {
    // Look for the last living creature of this species to get its population
    const previousLiving = previousState?.creatures.filter(
      (c) => c.lifecycleState === 'alive' && c.speciesId === event.speciesId
    ) ?? [];

    if (previousLiving.length > 0) {
      // Group by lineage: each lineage that's no longer living may be extinct
      const previousLineages = new Map<string, number>();
      for (const creature of previousLiving) {
        previousLineages.set(
          creature.lineageId,
          (previousLineages.get(creature.lineageId) ?? 0) + 1
        );
      }

      // For each lineage that was alive but is now gone from this species
      for (const [lineageId, count] of previousLineages.entries()) {
        const stillAlive = currentState.creatures.filter(
          (c) => c.lifecycleState === 'alive'
            && c.speciesId === event.speciesId
            && c.lineageId === lineageId
        ).length;

        if (stillAlive === 0) {
          // This lineage is extinct
          const entry = createExtinctionEntry(
            event.speciesId,
            lineageId,
            currentState.tick,
            count,
            deathEvents.find((d) => d.speciesId === event.speciesId)?.deathCause
          );
          updated = addJournalEntry(updated, entry);
        }
      }
    }
  }

  // Record interventions: When player introduces a species or changes world settings
  const interventionEvents = tickNewEvents.filter((e) => e.type === 'intervention') as any[];
  for (const event of interventionEvents) {
    if (event.interventionKind === 'species-introduction') {
      const entry = createInterventionEntry(
        currentState.tick,
        'species-introduction',
        event.detail || `Introduced ${event.speciesId}`,
        event.speciesId,
        event.interventionOrigin
      );
      updated = addJournalEntry(updated, entry);
    }
  }

  return updated;
}

/**
 * Create a new lineage tracker
 */
export function createLineageTracker(): LineageTracker {
  return {
    seenLineages: new Set(),
    lastEventByLineage: new Map(),
  };
}

/**
 * Create an intervention entry when player introduces a species
 */
export function recordSpeciesIntroduction(
  journal: FieldJournal,
  tick: number,
  speciesId: string,
  location: { x: number; y: number } | null,
  founderCount: number
): FieldJournal {
  const entry = createInterventionEntry(
    tick,
    'species-introduction',
    `Introduced ${speciesId} with ${founderCount} founders`,
    speciesId,
    location ?? undefined
  );
  return addJournalEntry(journal, entry);
}
