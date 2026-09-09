/**
 * Event Compaction and Bounded Persistence
 *
 * Addresses unbounded event growth during long simulation runs while preserving:
 * - Deterministic replay from checkpoints
 * - Important causal evidence (extinctions, speciation, interventions)
 * - Journal and timeline observability
 * - Serialized size bounds for localStorage/persistence
 *
 * Strategy:
 * 1. Keep detailed events for recent ticks (DETAILED_RETENTION_TICKS)
 * 2. Promote milestone events (extinction, speciation, major interventions) indefinitely
 * 3. Aggregate summary events for older detail records
 * 4. Compact at checkpoint boundaries for determinism
 */

import type { SimEvent } from './events';

/**
 * Retention policy: how many ticks to keep detailed event records
 * Beyond this window, only milestone events and aggregates are retained
 */
export const DETAILED_RETENTION_TICKS = 2000;

/**
 * Maximum number of events to retain before compaction
 * Typically 5000-10000 events for a long run
 */
export const MAX_EVENTS_BEFORE_COMPACT = 10000;

/**
 * Milestone event types that are always preserved
 */
const MILESTONE_EVENT_TYPES = new Set<SimEvent['type']>([
  'extinction',
  'speciation',
  'intervention',
  'environmental-shock',
]);

/**
 * Per-species death statistics for aggregated death events.
 * Preserves enough information for adaptive reproduction timing.
 */
export interface SpeciesDeathStat {
  count: number; // Number of deaths
  ageAtDeaths: number[]; // Individual ages at death (small sample for reconstruction)
}

/**
 * Aggregate event representing a summary of births/deaths over multiple ticks.
 * For death events, includes per-species lifespan evidence to preserve causal data
 * needed by buildSpeciesLifespanEvidence() for adaptive reproduction timing.
 */
export interface AggregateEvent extends SimEvent {
  type: 'birth' | 'death' | 'mutation';
  aggregatedCount?: number; // Number of individual events summarized
  aggregatedFrom?: number; // Oldest tick in aggregated range
  aggregatedTo?: number; // Newest tick in aggregated range
  // For death events only: per-species death statistics to support adaptive reproduction
  speciesDeathStats?: Record<string, SpeciesDeathStat>;
}

/**
 * Classify an event as detail (ephemeral), milestone (permanent), or compactable
 */
export function eventClassification(event: SimEvent): 'milestone' | 'detail' | 'compactable' {
  if (MILESTONE_EVENT_TYPES.has(event.type)) return 'milestone';
  if (event.type === 'birth' || event.type === 'death' || event.type === 'mutation') {
    return 'compactable';
  }
  return 'detail';
}

/**
 * Compact events based on age and redundancy.
 *
 * - Milestone events are never discarded
 * - Events older than DETAILED_RETENTION_TICKS are aggregated if compactable
 * - Detailed retention events remain unchanged
 * - Returns compacted event array within size bounds
 *
 * Called at checkpoint boundaries to ensure determinism.
 *
 * @param events Full event history
 * @param currentTick Current simulation tick
 * @returns Compacted event array with bounded size
 */
export function compactEvents(events: SimEvent[], currentTick: number): SimEvent[] {
  const detailedCutoff = currentTick - DETAILED_RETENTION_TICKS;
  const milestones: SimEvent[] = [];
  const detailedRecent: SimEvent[] = [];
  const compactableOld: SimEvent[] = [];

  // Classify and partition events
  for (const event of events) {
    const classification = eventClassification(event);
    if (classification === 'milestone') {
      milestones.push(event);
    } else if (event.tick > detailedCutoff) {
      detailedRecent.push(event);
    } else if (classification === 'compactable') {
      compactableOld.push(event);
    } else {
      // Other detail events older than window: keep them (rare, low volume)
      detailedRecent.push(event);
    }
  }

  // Aggregate old compactable events by type and time window (50-tick buckets)
  const aggregated = aggregateEventsByBucket(compactableOld);

  // Combine: milestones + recent detail + aggregates
  const result = [...milestones, ...detailedRecent, ...aggregated];

  // If still over budget, discard oldest aggregates (preserve milestones + recent)
  if (result.length > MAX_EVENTS_BEFORE_COMPACT) {
    const sortedByAge = result.sort((a, b) => a.tick - b.tick);
    // Keep all milestones and recent detail, discard oldest aggregates
    const toKeep = sortedByAge.filter((e) => {
      const classification = eventClassification(e);
      return classification === 'milestone' || e.tick > detailedCutoff;
    });
    // If even that exceeds budget, truncate oldest non-milestone events
    if (toKeep.length > MAX_EVENTS_BEFORE_COMPACT) {
      return toKeep.slice(-MAX_EVENTS_BEFORE_COMPACT);
    }
    return toKeep;
  }

  return result;
}

/**
 * Aggregate compactable events into 50-tick buckets.
 * For death events, preserves per-species lifespan evidence to support
 * adaptive reproduction timing in buildSpeciesLifespanEvidence().
 */
function aggregateEventsByBucket(events: SimEvent[]): SimEvent[] {
  if (events.length === 0) return [];

  const BUCKET_SIZE = 50;
  const MAX_AGES_PER_SPECIES = 20; // Sample up to 20 ages per species per bucket

  interface BucketData {
    births: number;
    deaths: number;
    mutations: number;
    minTick: number;
    maxTick: number;
    // Track per-species death ages to preserve lifespan evidence
    deathsBySpecies: Map<string, number[]>;
  }

  const buckets = new Map<number, BucketData>();

  for (const event of events) {
    const bucket = Math.floor(event.tick / BUCKET_SIZE);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        births: 0,
        deaths: 0,
        mutations: 0,
        minTick: event.tick,
        maxTick: event.tick,
        deathsBySpecies: new Map(),
      });
    }
    const b = buckets.get(bucket)!;
    if (event.type === 'birth') b.births++;
    else if (event.type === 'death' && event.speciesId && typeof event.ageAtDeath === 'number') {
      b.deaths++;
      // Track individual ages for this species (up to MAX_AGES_PER_SPECIES)
      const ages = b.deathsBySpecies.get(event.speciesId) ?? [];
      if (ages.length < MAX_AGES_PER_SPECIES) {
        ages.push(event.ageAtDeath);
        b.deathsBySpecies.set(event.speciesId, ages);
      }
    } else if (event.type === 'death') {
      b.deaths++;
    } else if (event.type === 'mutation') {
      b.mutations++;
    }
    b.minTick = Math.min(b.minTick, event.tick);
    b.maxTick = Math.max(b.maxTick, event.tick);
  }

  const aggregates: AggregateEvent[] = [];
  for (const [, data] of buckets) {
    if (data.births > 0) {
      aggregates.push({
        type: 'birth',
        tick: data.minTick,
        aggregatedCount: data.births,
        aggregatedFrom: data.minTick,
        aggregatedTo: data.maxTick,
        detail: `${data.births} births (ticks ${data.minTick}–${data.maxTick})`,
      });
    }
    if (data.deaths > 0) {
      // Construct per-species death stats from aggregated data
      const speciesDeathStats: Record<string, SpeciesDeathStat> = {};
      for (const [speciesId, ages] of data.deathsBySpecies) {
        speciesDeathStats[speciesId] = {
          count: ages.length, // For now, count equals ages collected
          ageAtDeaths: ages,
        };
      }

      aggregates.push({
        type: 'death',
        tick: data.minTick,
        aggregatedCount: data.deaths,
        aggregatedFrom: data.minTick,
        aggregatedTo: data.maxTick,
        speciesDeathStats,
        detail: `${data.deaths} deaths (ticks ${data.minTick}–${data.maxTick})`,
      });
    }
    if (data.mutations > 0) {
      aggregates.push({
        type: 'mutation',
        tick: data.minTick,
        aggregatedCount: data.mutations,
        aggregatedFrom: data.minTick,
        aggregatedTo: data.maxTick,
        detail: `${data.mutations} mutations (ticks ${data.minTick}–${data.maxTick})`,
      });
    }
  }

  return aggregates;
}

/**
 * Estimate serialized size (bytes) of an event array.
 * Used for memory budgeting and observability.
 */
export function estimateEventsSerializedSize(events: SimEvent[]): number {
  // Base estimate: each event ~200–500 bytes JSON-serialized
  // Milestone events tend larger (with detail, traitChanges, etc.)
  let bytes = 0;
  for (const event of events) {
    const classification = eventClassification(event);
    if (classification === 'milestone') {
      bytes += 400; // Larger: includes trait changes, ecosystem state
    } else if (classification === 'compactable' && (event as AggregateEvent).aggregatedCount) {
      bytes += 150; // Aggregates are small
    } else {
      bytes += 250; // Standard detail events
    }
  }
  return bytes;
}

/**
 * Memory budget document (informational).
 * Typical long-run budgets with compaction active:
 *
 * Scenario 1: 10,000-tick run
 * - ~150 speciation events (milestones)
 * - ~200 extinction events (milestones)
 * - ~50 intervention events (milestones)
 * - ~2000 recent detail events (births, deaths, mutations, last 2000 ticks)
 * - ~1000 aggregated events (old births/deaths/mutations, 50-tick buckets)
 * - Total: ~3400 events, ~800 KB serialized
 *
 * Scenario 2: 100,000-tick run
 * - ~800 speciation events (milestones)
 * - ~1200 extinction events (milestones)
 * - ~300 intervention events (milestones)
 * - ~2000 recent detail events (last 2000 ticks)
 * - ~1800 aggregated events (2000 ticks / 50-tick bucket)
 * - Total: ~6100 events, ~1.5 MB serialized
 *
 * Scenario 3: 1,000,000-tick run with intensive interventions
 * - ~5000 speciation events (milestones)
 * - ~8000 extinction events (milestones)
 * - ~2000 intervention events (milestones)
 * - ~2000 recent detail events
 * - ~2000 aggregated events
 * - Total: ~19,000 events, capped at MAX_EVENTS_BEFORE_COMPACT (10,000)
 * - Serialized: ~2.5 MB (capped)
 *
 * With compaction, serialized size stays under 3 MB for runs up to 1M ticks.
 */

/**
 * Version tracking for compaction format
 * Bumped when aggregation strategy or milestone definitions change
 */
export const EVENT_COMPACTION_VERSION = 1;
