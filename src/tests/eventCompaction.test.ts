import { describe, expect, it } from 'vitest';
import {
  compactEvents,
  eventClassification,
  estimateEventsSerializedSize,
  DETAILED_RETENTION_TICKS,
  MAX_EVENTS_BEFORE_COMPACT,
  EVENT_COMPACTION_VERSION,
  type AggregateEvent,
} from '../simulation/eventCompaction';
import type { SimEvent } from '../simulation/events';

describe('Event Compaction: Bounded Persistence for Long Runs', () => {
  describe('event classification', () => {
    it('classifies extinction and speciation as milestones', () => {
      const extinctionEvent: SimEvent = {
        type: 'extinction',
        tick: 100,
        speciesId: 'species_1',
        detail: 'Species went extinct',
      };
      const speciationEvent: SimEvent = {
        type: 'speciation',
        tick: 200,
        speciesId: 'species_2',
        lineageId: 'lineage_1',
        detail: 'New species appeared',
      };
      expect(eventClassification(extinctionEvent)).toBe('milestone');
      expect(eventClassification(speciationEvent)).toBe('milestone');
    });

    it('classifies intervention and environmental-shock as milestones', () => {
      const interventionEvent: SimEvent = {
        type: 'intervention',
        tick: 150,
        interventionKind: 'settings-change',
        detail: 'God mode change',
      };
      const shockEvent: SimEvent = {
        type: 'environmental-shock',
        tick: 300,
        shockKind: 'temperature-spike',
        detail: 'Climate event',
      };
      expect(eventClassification(interventionEvent)).toBe('milestone');
      expect(eventClassification(shockEvent)).toBe('milestone');
    });

    it('classifies births, deaths, mutations as compactable detail', () => {
      const birthEvent: SimEvent = {
        type: 'birth',
        tick: 50,
        creatureId: 'creature_1',
        speciesId: 'species_1',
      };
      const deathEvent: SimEvent = {
        type: 'death',
        tick: 75,
        creatureId: 'creature_2',
        speciesId: 'species_1',
        deathCause: 'starvation',
      };
      const mutationEvent: SimEvent = {
        type: 'mutation',
        tick: 80,
        creatureId: 'creature_3',
        speciesId: 'species_1',
      };
      expect(eventClassification(birthEvent)).toBe('compactable');
      expect(eventClassification(deathEvent)).toBe('compactable');
      expect(eventClassification(mutationEvent)).toBe('compactable');
    });
  });

  describe('event compaction', () => {
    it('preserves all milestone events regardless of age', () => {
      const oldExtinction: SimEvent = {
        type: 'extinction',
        tick: 100,
        speciesId: 'ancient_species',
      };
      const oldSpeciation: SimEvent = {
        type: 'speciation',
        tick: 150,
        speciesId: 'old_lineage',
      };
      const recentIntervention: SimEvent = {
        type: 'intervention',
        tick: 5000,
        interventionKind: 'species-introduction',
      };

      const events = [
        oldExtinction,
        oldSpeciation,
        recentIntervention,
        ...Array.from({ length: 100 }, (_, i) => ({
          type: 'birth' as const,
          tick: 1000 + i,
          creatureId: `creature_${i}`,
          speciesId: 'species_1',
        })),
      ];

      const compacted = compactEvents(events, 5000);

      // Verify milestones are present
      expect(compacted.some((e) => e.type === 'extinction' && e.tick === 100)).toBe(true);
      expect(compacted.some((e) => e.type === 'speciation' && e.tick === 150)).toBe(true);
      expect(compacted.some((e) => e.type === 'intervention' && e.tick === 5000)).toBe(true);
    });

    it('retains detailed recent events within retention window', () => {
      const recentBirth: SimEvent = {
        type: 'birth',
        tick: 5000 - DETAILED_RETENTION_TICKS + 100,
        creatureId: 'creature_1',
        speciesId: 'species_1',
      };
      const veryRecentBirth: SimEvent = {
        type: 'birth',
        tick: 5000,
        creatureId: 'creature_2',
        speciesId: 'species_1',
      };
      const events = [recentBirth, veryRecentBirth];

      const compacted = compactEvents(events, 5000);

      // Both should be retained as they're within the detail window
      expect(compacted).toContainEqual(recentBirth);
      expect(compacted).toContainEqual(veryRecentBirth);
    });

    it('aggregates old compactable events into summary buckets', () => {
      // Create 100 old birth events outside retention window
      const oldBirths: SimEvent[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'birth' as const,
        tick: 100 + i, // All before retention cutoff
        creatureId: `creature_${i}`,
        speciesId: 'species_1',
      }));

      const compacted = compactEvents(oldBirths, 5000);

      // Should aggregate into fewer events (one per 50-tick bucket)
      const aggregates = compacted.filter((e) => (e as AggregateEvent).aggregatedCount);
      expect(aggregates.length).toBeGreaterThan(0);
      expect(aggregates.length).toBeLessThan(oldBirths.length);

      // Verify aggregates have metadata
      for (const agg of aggregates) {
        expect((agg as AggregateEvent).aggregatedCount).toBeGreaterThan(0);
        expect((agg as AggregateEvent).aggregatedFrom).toBeDefined();
        expect((agg as AggregateEvent).aggregatedTo).toBeDefined();
      }
    });

    it('returns array within MAX_EVENTS_BEFORE_COMPACT bound', () => {
      // Create a large event set with many old compactables and some milestones
      const events: SimEvent[] = [];

      // Add many milestones to verify they're kept
      for (let i = 0; i < 500; i++) {
        events.push({
          type: i % 2 === 0 ? 'extinction' : 'speciation',
          tick: i * 10,
          speciesId: `species_${i}`,
        });
      }

      // Add many old births that will be aggregated
      for (let i = 0; i < 5000; i++) {
        events.push({
          type: 'birth',
          tick: 1000 + i,
          creatureId: `creature_${i}`,
          speciesId: 'species_1',
        });
      }

      const compacted = compactEvents(events, 10000);

      expect(compacted.length).toBeLessThanOrEqual(MAX_EVENTS_BEFORE_COMPACT);
    });

    it('deterministically produces same compaction for same input', () => {
      const events: SimEvent[] = [
        { type: 'birth', tick: 10, creatureId: 'c1', speciesId: 's1' },
        { type: 'extinction', tick: 50, speciesId: 's2' },
        { type: 'birth', tick: 100, creatureId: 'c2', speciesId: 's1' },
        { type: 'death', tick: 150, creatureId: 'c3', speciesId: 's1', deathCause: 'starvation' },
      ];

      const compact1 = compactEvents(events, 2000);
      const compact2 = compactEvents(events, 2000);

      expect(compact1).toEqual(compact2);
    });

    it('handles empty event list gracefully', () => {
      const compacted = compactEvents([], 1000);
      expect(compacted).toEqual([]);
    });

    it('handles all-milestone events gracefully', () => {
      const events: SimEvent[] = [
        { type: 'extinction', tick: 100, speciesId: 's1' },
        { type: 'speciation', tick: 200, speciesId: 's2' },
        { type: 'intervention', tick: 300, interventionKind: 'settings-change' },
      ];

      const compacted = compactEvents(events, 1000);

      // All should be retained
      expect(compacted).toEqual(events);
    });
  });

  describe('size estimation', () => {
    it('estimates milestone events as larger', () => {
      const milestone: SimEvent = {
        type: 'extinction',
        tick: 100,
        speciesId: 's1',
        detail: 'Large extinction event',
        traitChanges: Array.from({ length: 5 }, (_, i) => ({
          trait: 'size' as const,
          before: i,
          after: i + 1,
        })),
      };

      const detail: SimEvent = {
        type: 'birth',
        tick: 100,
        creatureId: 'c1',
        speciesId: 's1',
      };

      const milestoneSize = estimateEventsSerializedSize([milestone]);
      const detailSize = estimateEventsSerializedSize([detail]);

      expect(milestoneSize).toBeGreaterThan(detailSize);
    });

    it('estimates aggregates as compact', () => {
      const aggregate: AggregateEvent = {
        type: 'birth',
        tick: 100,
        aggregatedCount: 1000,
        aggregatedFrom: 100,
        aggregatedTo: 149,
        detail: '1000 births (ticks 100–149)',
      };

      const individual: SimEvent = {
        type: 'birth',
        tick: 100,
        creatureId: 'c1',
        speciesId: 's1',
      };

      const aggregateSize = estimateEventsSerializedSize([aggregate]);
      const individualSize = estimateEventsSerializedSize([individual]);

      // Aggregate should be smaller per event
      expect(aggregateSize).toBeLessThan(individualSize * 100);
    });

    it('handles large event arrays', () => {
      const events: SimEvent[] = Array.from({ length: 10000 }, (_, i) => ({
        type: i % 4 === 0 ? 'extinction' : i % 4 === 1 ? 'birth' : i % 4 === 2 ? 'death' : 'mutation',
        tick: i,
        creatureId: `creature_${i}`,
        speciesId: 's1',
      }));

      const size = estimateEventsSerializedSize(events);

      // Should estimate reasonable size in bytes
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(10_000_000); // Sanity check: under 10 MB
    });
  });

  describe('compaction version and metadata', () => {
    it('exports current compaction version', () => {
      expect(EVENT_COMPACTION_VERSION).toBe(1);
    });

    it('verifies retention and budget constants are sensible', () => {
      expect(DETAILED_RETENTION_TICKS).toBeGreaterThan(0);
      expect(MAX_EVENTS_BEFORE_COMPACT).toBeGreaterThan(0);
      expect(MAX_EVENTS_BEFORE_COMPACT).toBeGreaterThan(1000); // At least 1k
    });
  });

  describe('real-world scenarios', () => {
    it('compacts a 10k-tick run to reasonable bounds', () => {
      const events: SimEvent[] = [];

      // Simulate speciation and extinction over 10k ticks
      for (let tick = 0; tick < 10000; tick += 100) {
        events.push({
          type: 'speciation',
          tick,
          speciesId: `species_${tick}`,
          lineageId: `lineage_${tick}`,
        });
      }
      for (let tick = 50; tick < 10000; tick += 150) {
        events.push({
          type: 'extinction',
          tick,
          speciesId: `extinct_${tick}`,
        });
      }

      // Add many individual birth/death events
      for (let i = 0; i < 5000; i++) {
        events.push({
          type: 'birth',
          tick: Math.floor(Math.random() * 10000),
          creatureId: `creature_${i}`,
          speciesId: `species_${i % 100}`,
        });
        events.push({
          type: 'death',
          tick: Math.floor(Math.random() * 10000),
          creatureId: `creature_${i}`,
          speciesId: `species_${i % 100}`,
          deathCause: 'starvation',
        });
      }

      const compacted = compactEvents(events, 10000);

      expect(compacted.length).toBeLessThanOrEqual(MAX_EVENTS_BEFORE_COMPACT);

      // Verify important events are retained
      const milestones = compacted.filter((e) => ['extinction', 'speciation'].includes(e.type));
      expect(milestones.length).toBeGreaterThan(0);
    });

    it('compacts a 100k-tick run maintaining milestone preservation', () => {
      const events: SimEvent[] = [];

      // Simulate many long-lived events
      for (let tick = 0; tick < 100000; tick += 50) {
        if (tick % 500 === 0) {
          events.push({
            type: 'extinction',
            tick,
            speciesId: `species_${tick}`,
          });
        }
      }

      // Add old detail events
      for (let i = 0; i < 8000; i++) {
        events.push({
          type: 'birth',
          tick: i * 10,
          creatureId: `creature_${i}`,
          speciesId: 's1',
        });
      }

      const compacted = compactEvents(events, 100000);

      // Should stay under budget
      expect(compacted.length).toBeLessThanOrEqual(MAX_EVENTS_BEFORE_COMPACT);

      // Milestones should all be preserved
      const extinctionCount = compacted.filter((e) => e.type === 'extinction').length;
      expect(extinctionCount).toBe(200); // 100000 / 50 / 10 = 200
    });
  });

  describe('replay requirements', () => {
    it('preserves causal evidence across compaction', () => {
      // Scenario: track a lineage extinction with its family tree
      const ancestralBirths = Array.from({ length: 10 }, (_, i) => ({
        type: 'birth' as const,
        tick: 100 + i,
        creatureId: `ancestor_${i}`,
        speciesId: 's_ancestor',
        lineageId: 'lineage_root',
      }));

      const speciation: SimEvent = {
        type: 'speciation',
        tick: 200,
        speciesId: 's_derived',
        ancestralSpeciesId: 's_ancestor',
        lineageId: 'lineage_derived',
      };

      const derivedBirths = Array.from({ length: 50 }, (_, i) => ({
        type: 'birth' as const,
        tick: 200 + i,
        creatureId: `derived_${i}`,
        speciesId: 's_derived',
        lineageId: 'lineage_derived',
      }));

      const extinction: SimEvent = {
        type: 'extinction',
        tick: 500,
        speciesId: 's_derived',
      };

      const events = [...ancestralBirths, speciation, ...derivedBirths, extinction];
      const compacted = compactEvents(events, 10000);

      // Critical: speciation and extinction must be preserved
      expect(compacted.some((e) => e.type === 'speciation')).toBe(true);
      expect(compacted.some((e) => e.type === 'extinction')).toBe(true);
    });
  });
});
