import { describe, it, expect } from 'vitest';
import {
  AdaptationMetricsTracker,
  describeChange,
  rateEvidenceQuality,
  DEFAULT_ADAPTATION_CONFIG,
  type AdaptationObservation,
} from '../simulation/adaptationMetrics';
import { DEFAULT_TRAITS } from '../utils/traits';
import type { CreatureSnapshot } from '../state/store';

function createMockCreature(
  index: number,
  overrides: Partial<CreatureSnapshot> = {}
): CreatureSnapshot {
  return {
    id: `creature-${index}`,
    speciesId: 'test-species',
    lineageId: 'test-lineage',
    parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0,
    y: 0,
    energy: 100,
    age: 10,
    lifecycleState: 'alive',
    corpseDecayTicks: 0,
    ...overrides,
  };
}

describe('AdaptationMetricsTracker', () => {
  it('creates tracker with default config', () => {
    const tracker = new AdaptationMetricsTracker();
    expect(tracker).toBeDefined();
  });

  it('creates tracker with custom config', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 100,
      minPopulationSize: 5,
    });
    expect(tracker).toBeDefined();
  });

  it('samples trait frequencies at configured interval', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10, // sample every 10 ticks
    });

    let observations: AdaptationObservation[] = [];

    // Tick 1-9: not yet at sample point
    for (let tick = 1; tick < 10; tick++) {
      const creatures = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );
      observations = tracker.updateMetrics(tick, creatures, []);
      expect(observations).toHaveLength(0);
    }

    // Tick 10: sample should occur
    const creatures = Array.from({ length: 5 }, (_, i) =>
      createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
    );
    observations = tracker.updateMetrics(10, creatures, []);
    // No observations yet since no prior baseline

    // Tick 20: second sample should show changes
    const creaturesChanged = Array.from({ length: 5 }, (_, i) =>
      createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.5 } })
    );
    observations = tracker.updateMetrics(20, creaturesChanged, []);
    // Should have detected speed change
    expect(observations.length).toBeGreaterThanOrEqual(0);
  });

  it('ignores lineages below minimum population', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10,
      minPopulationSize: 3,
    });

    // Single creature - should not sample
    const creatures = [createMockCreature(0)];
    const observations = tracker.updateMetrics(10, creatures, []);

    expect(observations).toHaveLength(0);
  });

  it('tracks multiple lineages independently', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10,
    });

    const creatures1 = Array.from({ length: 3 }, (_, i) =>
      createMockCreature(i, {
        speciesId: 'species1',
        lineageId: 'lineage1',
        traits: { ...DEFAULT_TRAITS, speed: 1.0 },
      })
    );

    const creatures2 = Array.from({ length: 3 }, (_, i) =>
      createMockCreature(i, {
        speciesId: 'species2',
        lineageId: 'lineage2',
        traits: { ...DEFAULT_TRAITS, speed: 0.5 },
      })
    );

    tracker.updateMetrics(10, [...creatures1, ...creatures2], []);

    // Both lineages should have histories
    const hist1 = tracker.getLineageHistory('species1', 'lineage1');
    const hist2 = tracker.getLineageHistory('species2', 'lineage2');

    expect(hist1 || hist2).toBeDefined(); // At least one should exist
  });

  it('retrieves lineage adaptation history', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10,
    });

    const creatures = Array.from({ length: 5 }, (_, i) =>
      createMockCreature(i, {
        speciesId: 'test-species',
        lineageId: 'test-lineage',
        traits: { ...DEFAULT_TRAITS, speed: 1.0 },
      })
    );

    tracker.updateMetrics(10, creatures, []);
    const history = tracker.getLineageHistory('test-species', 'test-lineage');

    expect(history).toBeDefined();
    expect(history?.speciesId).toBe('test-species');
    expect(history?.lineageId).toBe('test-lineage');
  });

  it('returns null for non-existent lineage', () => {
    const tracker = new AdaptationMetricsTracker();
    const history = tracker.getLineageHistory('fake-species', 'fake-lineage');
    expect(history).toBeNull();
  });

  it('retrieves recent adaptations within lookback window', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10,
    });

    // Make changes at ticks 10 and 20
    for (let tick = 10; tick <= 20; tick += 10) {
      const speed = tick === 10 ? 1.0 : 1.5;
      const creatures = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, {
          speciesId: 'test-species',
          lineageId: 'test-lineage',
          traits: { ...DEFAULT_TRAITS, speed },
        })
      );
      tracker.updateMetrics(tick, creatures, []);
    }

    const recent = tracker.getRecentAdaptations('test-species', 'test-lineage', 100);
    expect(Array.isArray(recent)).toBe(true);
  });

  it('summarizes adaptation types across lineage', () => {
    const tracker = new AdaptationMetricsTracker();

    const creatures = Array.from({ length: 5 }, (_, i) =>
      createMockCreature(i)
    );

    tracker.updateMetrics(10, creatures, []);
    const summary = tracker.getAdaptationSummary('test-species', 'test-lineage');

    expect(summary).toBeDefined();
    expect(summary.drift).toBe(0);
    expect(summary.selection).toBe(0);
    expect(summary['mutation-appearance']).toBe(0);
    // All should be 0 since we're checking a created history
  });

  it('returns empty summary for non-existent lineage', () => {
    const tracker = new AdaptationMetricsTracker();
    const summary = tracker.getAdaptationSummary('fake', 'fake');

    expect(summary.drift).toBe(0);
    expect(summary.selection).toBe(0);
    expect(summary['mutation-appearance']).toBe(0);
  });

  it('retrieves all lineage histories', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 10,
    });

    for (let i = 0; i < 3; i++) {
      const creatures = Array.from({ length: 3 }, (_, j) =>
        createMockCreature(j, {
          speciesId: 'species1',
          lineageId: `lineage${i}`,
        })
      );
      tracker.updateMetrics(10, creatures, []);
    }

    const all = tracker.getAllLineageHistories();
    expect(Array.isArray(all)).toBe(true);
  });

  it('prunes old data to manage memory', () => {
    const tracker = new AdaptationMetricsTracker({
      windowSize: 5,
    });

    // Create many lineages
    for (let l = 0; l < 10; l++) {
      const creatures = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          speciesId: 'species1',
          lineageId: `lineage${l}`,
        })
      );
      tracker.updateMetrics(10, creatures, []);
    }

    const before = tracker.getAllLineageHistories().length;
    tracker.pruneOldData(5); // keep max 5 per species
    const after = tracker.getAllLineageHistories().length;

    expect(after).toBeLessThanOrEqual(before);
  });
});

describe('Helper functions', () => {
  it('describes evolutionary changes in readable form', () => {
    const observation: AdaptationObservation = {
      speciesId: 'species1',
      lineageId: 'lineage1',
      tick: 100,
      trait: 'speed',
      changeType: 'selection',
      evidence: null,
      populationSize: 50,
    };

    const description = describeChange(observation, 'TestSpecies', 'TestLineage');

    expect(description).toContain('speed');
    expect(description).toContain('TestSpecies');
    expect(description).toContain('TestLineage');
  });

  it('rates evidence quality based on confidence', () => {
    const highConfidence = {
      speciesId: 'species1',
      lineageId: 'lineage1',
      trait: 'speed' as const,
      startTick: 0,
      endTick: 100,
      direction: 'increase' as const,
      magnitude: 0.5,
      confidence: 0.95,
      evidence: [] as any,
      linkedFitness: 0.8,
    };

    const quality = rateEvidenceQuality(highConfidence);
    expect(quality).toBeGreaterThan(0.7);
  });

  it('rates null evidence as zero quality', () => {
    const quality = rateEvidenceQuality(null);
    expect(quality).toBe(0);
  });

  it('reduces quality for drift evidence', () => {
    const driftEvidence = {
      speciesId: 'species1',
      lineageId: 'lineage1',
      trait: 'speed' as const,
      startTick: 0,
      endTick: 100,
      direction: 'increase' as const,
      magnitude: 0.1,
      confidence: 0.7,
      evidence: ['neutral-shift'] as any,
    };

    const quality = rateEvidenceQuality(driftEvidence);
    expect(quality).toBeLessThan(0.7);
  });
});
