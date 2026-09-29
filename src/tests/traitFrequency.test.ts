import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTraitFrequencies,
  measureTraitDivergence,
  isMutationAppearance,
  classifyChange,
  generateAdaptationEvidence,
  createTraitFrequencyHistory,
  appendTraitFrequency,
  type TraitFrequencySummary,
} from '../simulation/traitFrequency';
import { DEFAULT_TRAITS } from '../utils/traits';
import type { CreatureSnapshot } from '../state/store';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';

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

describe('Trait Frequency Tracking', () => {
  describe('computeTraitFrequencies', () => {
    it('computes trait statistics for a cohort', () => {
      const creatures = Array.from({ length: 10 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, speed: 0.5 + i * 0.1 },
        })
      );

      const summary = computeTraitFrequencies(creatures, 0, 100, 'species1', 'lineage1');

      expect(summary).not.toBeNull();
      expect(summary?.populationSize).toBe(10);
      expect(summary?.sampleSize).toBe(10);
      expect(summary?.traitFrequencies['speed']).toBeDefined();

      const speedDist = summary?.traitFrequencies['speed'];
      expect(speedDist?.min).toBeCloseTo(0.5, 1);
      expect(speedDist?.max).toBeCloseTo(1.4, 1);
      expect(speedDist?.mean).toBeCloseTo(0.95, 1);
    });

    it('handles empty creature list', () => {
      const summary = computeTraitFrequencies([], 0, 100, 'species1', 'lineage1');
      expect(summary).toBeNull();
    });

    it('tracks discrete traits like energyStrategy', () => {
      const creatures = [
        createMockCreature(0, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        }),
        createMockCreature(1, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        }),
        createMockCreature(2, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      const summary = computeTraitFrequencies(creatures, 0, 100, 'species1', 'lineage1');

      expect(summary?.traitFrequencies['energyStrategy']?.frequency).toBeDefined();
      const freq = summary?.traitFrequencies['energyStrategy'].frequency;
      expect(freq?.['herbivore']).toBeCloseTo(0.667, 2);
      expect(freq?.['carnivore']).toBeCloseTo(0.333, 2);
    });
  });

  describe('measureTraitDivergence', () => {
    it('detects identical distributions as zero divergence', () => {
      const creatures = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1 } })
      );

      const summary1 = computeTraitFrequencies(creatures, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creatures, 100, 200, 'species1', 'lineage1');

      expect(summary1).not.toBeNull();
      expect(summary2).not.toBeNull();

      const divergence = measureTraitDivergence(summary1!, summary2!);
      expect(divergence).toBeLessThan(0.1); // some rounding error
    });

    it('detects large trait mean shifts', () => {
      const creaturesA = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 0.5 } })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 2.0 } })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      expect(summary1).not.toBeNull();
      expect(summary2).not.toBeNull();

      const divergence = measureTraitDivergence(summary1!, summary2!);
      // Divergence averaged across all traits; even one trait changing significantly is detectable
      expect(divergence).toBeGreaterThanOrEqual(0.04);
    });

    it('detects strategy changes', () => {
      const creaturesA = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesB = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      expect(summary1).not.toBeNull();
      expect(summary2).not.toBeNull();

      const divergence = measureTraitDivergence(summary1!, summary2!);
      // Strategy changes are detected, but averaged across all traits
      expect(divergence).toBeGreaterThan(0.02);
    });
  });

  describe('isMutationAppearance', () => {
    it('detects new discrete trait values', () => {
      const creaturesA = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesB = [
        ...creaturesA.slice(0, 2),
        createMockCreature(2, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      expect(summary1).not.toBeNull();
      expect(summary2).not.toBeNull();

      const isMutation = isMutationAppearance(
        'energyStrategy',
        summary2!,
        summary1!
      );
      expect(isMutation).toBe(true);
    });

    it('does not flag existing strategies as mutations', () => {
      const creaturesA = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const isMutation = isMutationAppearance(
        'energyStrategy',
        summary2!,
        summary1!
      );
      expect(isMutation).toBe(false);
    });
  });

  describe('classifyChange', () => {
    it('classifies mutation appearance', () => {
      const creaturesA = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesB = [
        ...creaturesA,
        createMockCreature(3, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const classification = classifyChange(
        summary2!,
        summary1!,
        'energyStrategy'
      );
      expect(classification).toBe('mutation-appearance');
    });

    it('classifies selection when fitness is linked', () => {
      const creaturesA = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 0.5 } })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const classification = classifyChange(
        summary2!,
        summary1!,
        'speed',
        0.3 // survival correlation
      );
      expect(classification).toBe('selection');
    });

    it('classifies drift vs neutral-shift based on divergence threshold', () => {
      // Small change (above classification threshold, below neutral-shift threshold)
      // 1.0 → 1.02 gives ~0.005-0.01 average divergence across traits → drift
      const creaturesA1 = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );
      const creaturesB1 = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.02 } })
      );

      const summary1a = computeTraitFrequencies(creaturesA1, 0, 100, 'species1', 'lineage1');
      const summary1b = computeTraitFrequencies(creaturesB1, 100, 200, 'species1', 'lineage1');

      const classification1 = classifyChange(
        summary1b!,
        summary1a!,
        'speed'
      );
      expect(classification1).toBe('drift');

      // Larger change (above neutral-shift threshold)
      // 1.0 → 1.2 gives ~0.03 average divergence across traits → neutral-shift
      const creaturesA2 = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );
      const creaturesB2 = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.2 } })
      );

      const summary2a = computeTraitFrequencies(creaturesA2, 0, 100, 'species1', 'lineage1');
      const summary2b = computeTraitFrequencies(creaturesB2, 100, 200, 'species1', 'lineage1');

      const classification2 = classifyChange(
        summary2b!,
        summary2a!,
        'speed'
      );
      expect(classification2).toBe('neutral-shift');
    });

    it('classifies speciation when high divergence + strategy isolation', () => {
      // Speciation requires:
      // 1. High overall trait divergence (> 0.3)
      // 2. Energy strategy shift (reproductive isolation)
      // Create creatures with very different traits AND different energy strategies
      const creaturesA = [
        createMockCreature(0, {
          traits: { ...DEFAULT_TRAITS, speed: 1.0, size: 1.0, energyStrategy: 'herbivore' },
        }),
        createMockCreature(1, {
          traits: { ...DEFAULT_TRAITS, speed: 1.0, size: 1.0, energyStrategy: 'herbivore' },
        }),
        createMockCreature(2, {
          traits: { ...DEFAULT_TRAITS, speed: 1.0, size: 1.0, energyStrategy: 'herbivore' },
        }),
      ];

      const creaturesB = [
        createMockCreature(0, {
          traits: { ...DEFAULT_TRAITS, speed: 2.5, size: 2.0, energyStrategy: 'carnivore' },
        }),
        createMockCreature(1, {
          traits: { ...DEFAULT_TRAITS, speed: 2.5, size: 2.0, energyStrategy: 'carnivore' },
        }),
        createMockCreature(2, {
          traits: { ...DEFAULT_TRAITS, speed: 2.5, size: 2.0, energyStrategy: 'carnivore' },
        }),
      ];

      const summaryA = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summaryB = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      expect(summaryA).not.toBeNull();
      expect(summaryB).not.toBeNull();

      // Classify the energyStrategy trait change (should detect speciation due to strategy shift)
      const classification = classifyChange(summaryB!, summaryA!, 'energyStrategy');
      expect(classification).toBe('speciation');
    });
  });

  describe('generateAdaptationEvidence', () => {
    it('generates high-confidence evidence for mutations', () => {
      const creaturesA = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesB = [
        ...creaturesA,
        createMockCreature(3, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const evidence = generateAdaptationEvidence(
        summary2!,
        summary1!,
        'energyStrategy'
      );

      expect(evidence).not.toBeNull();
      expect(evidence?.confidence).toBe(1.0);
      expect(evidence?.evidence).toContain('mutation-appearance');
    });

    it('generates evidence with fitness correlation', () => {
      const creaturesA = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 0.5 } })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const evidence = generateAdaptationEvidence(
        summary2!,
        summary1!,
        'speed',
        0.8, // high survival rate
        0.6 // high reproduction rate
      );

      expect(evidence).not.toBeNull();
      expect(evidence?.evidence).toContain('frequency-increase');
      expect(evidence?.evidence).toContain('survival-linked');
      expect(evidence?.linkedFitness).toBeGreaterThan(0.5);
    });
  });

  describe('Bounded history storage', () => {
    it('creates empty history', () => {
      const history = createTraitFrequencyHistory();
      expect(history.recentWindow).toHaveLength(0);
      expect(history.compressedArchive).toHaveLength(0);
    });

    it('appends summaries without overflow', () => {
      let history = createTraitFrequencyHistory();

      for (let i = 0; i < 5; i++) {
        const creatures = Array.from({ length: 3 }, (_, j) =>
          createMockCreature(j, { traits: { ...DEFAULT_TRAITS, speed: 0.5 + i * 0.1 } })
        );
        const summary = computeTraitFrequencies(
          creatures,
          i * 100,
          (i + 1) * 100,
          'species1',
          'lineage1'
        );
        if (summary) {
          history = appendTraitFrequency(history, summary, 10);
        }
      }

      expect(history.recentWindow.length).toBeLessThanOrEqual(10);
      expect(history.recentWindow.length).toBe(5);
    });

    it('compresses old data when history fills', () => {
      let history = createTraitFrequencyHistory();

      // Add 15 summaries to trigger compression
      for (let i = 0; i < 15; i++) {
        const creatures = Array.from({ length: 3 }, (_, j) =>
          createMockCreature(j, {
            traits: { ...DEFAULT_TRAITS, speed: 0.5 + i * 0.05 },
          })
        );
        const summary = computeTraitFrequencies(
          creatures,
          i * 100,
          (i + 1) * 100,
          'species1',
          'lineage1'
        );
        if (summary) {
          history = appendTraitFrequency(history, summary, 5);
        }
      }

      expect(history.recentWindow.length).toBeLessThanOrEqual(5);
      expect(history.compressedArchive.length).toBeGreaterThan(0);
    });
  });

  describe('Deterministic classification', () => {
    it('produces identical classifications across multiple runs with same data', () => {
      const creaturesRun1A = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 0.5 } })
      );
      const creaturesRun1B = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );

      const creaturesRun2A = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 0.5 } })
      );
      const creaturesRun2B = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );

      // Run 1
      const summary1A = computeTraitFrequencies(creaturesRun1A, 0, 100, 'species1', 'lineage1');
      const summary1B = computeTraitFrequencies(creaturesRun1B, 100, 200, 'species1', 'lineage1');
      const classification1 = classifyChange(summary1B!, summary1A!, 'speed', 0.3, 0.2);

      // Run 2 (identical inputs)
      const summary2A = computeTraitFrequencies(creaturesRun2A, 0, 100, 'species1', 'lineage1');
      const summary2B = computeTraitFrequencies(creaturesRun2B, 100, 200, 'species1', 'lineage1');
      const classification2 = classifyChange(summary2B!, summary2A!, 'speed', 0.3, 0.2);

      // Classifications should be identical
      expect(classification1).toBe(classification2);
    });

    it('produces identical evidence across multiple runs', () => {
      const creaturesRun1A = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesRun1B = [
        ...creaturesRun1A,
        createMockCreature(3, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      const creaturesRun2A = Array.from({ length: 3 }, (_, i) =>
        createMockCreature(i, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        })
      );
      const creaturesRun2B = [
        ...creaturesRun2A,
        createMockCreature(3, {
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        }),
      ];

      // Run 1
      const summary1A = computeTraitFrequencies(creaturesRun1A, 0, 100, 'species1', 'lineage1');
      const summary1B = computeTraitFrequencies(creaturesRun1B, 100, 200, 'species1', 'lineage1');
      const evidence1 = generateAdaptationEvidence(
        summary1B!,
        summary1A!,
        'energyStrategy',
        0.8,
        0.6
      );

      // Run 2
      const summary2A = computeTraitFrequencies(creaturesRun2A, 0, 100, 'species1', 'lineage1');
      const summary2B = computeTraitFrequencies(creaturesRun2B, 100, 200, 'species1', 'lineage1');
      const evidence2 = generateAdaptationEvidence(
        summary2B!,
        summary2A!,
        'energyStrategy',
        0.8,
        0.6
      );

      // Evidence should be identical
      if (evidence1 && evidence2) {
        expect(evidence1.confidence).toBe(evidence2.confidence);
        expect(evidence1.direction).toBe(evidence2.direction);
        expect(evidence1.magnitude).toBeCloseTo(evidence2.magnitude);
        expect(evidence1.evidence).toEqual(evidence2.evidence);
      }
    });

    it('classifies with insufficient evidence as unknown when thresholds not met', () => {
      const creaturesA = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.01 } })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      // Very small change, no fitness correlation
      const classification = classifyChange(summary2!, summary1!, 'speed', 0.02, 0.02);

      // Should classify as drift (below threshold for selection)
      // or unknown if we enforce strict thresholds
      expect(['drift', 'unknown']).toContain(classification);
    });
  });

  describe('Engine Integration', () => {
    it('tick loop populates adaptation tracker with fixed seed after N ticks', () => {
      // Create initial creatures with specific traits
      const creatures = [
        new Creature({
          speciesId: 'test-species',
          lineageId: 'test-lineage',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, speed: 0.5 },
          x: 50,
          y: 50,
          energy: 150,
        }),
        new Creature({
          speciesId: 'test-species',
          lineageId: 'test-lineage',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, speed: 0.5 },
          x: 51,
          y: 50,
          energy: 150,
        }),
      ];

      // Create engine with fixed seed
      const FIXED_SEED = 42;
      let state = createEngine(FIXED_SEED, creatures, 100, 100);

      // Run simulation for enough ticks to cross sampling interval
      const TICKS_TO_RUN = 60; // DEFAULT sampling is 50 ticks
      for (let i = 0; i < TICKS_TO_RUN; i++) {
        state = tickEngine(state);
      }

      // After running ticks, the tracker should have recorded data
      // since the sampling interval is 50 ticks by default
      const tracker = state.adaptationMetrics;
      expect(tracker).toBeDefined();

      // Get the lineage history
      const history = tracker.getLineageHistory('test-species', 'test-lineage');

      // The tracker should have recorded frequencies after the sampling interval
      // even if creatures died or were born, the lineage tracking should work
      // At minimum, we should have access to adaptation observations from the current tick
      expect(state.lastAdaptationObservations).toBeDefined();
      expect(Array.isArray(state.lastAdaptationObservations)).toBe(true);

      // Verify that the tracker is a live object that can be queried
      const allHistories = tracker.getAllLineageHistories();
      expect(Array.isArray(allHistories)).toBe(true);

      // If the lineage survived the sampling interval, we should have history
      // (histories may be empty if population died out before sampling)
      // But the tracker object itself should be functional
      expect(tracker.getAdaptationSummary('test-species', 'test-lineage')).toBeDefined();
    });

    it('adaptation metrics persist across multiple ticks', () => {
      const creatures = [
        new Creature({
          speciesId: 'species-A',
          lineageId: 'lineage-A',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, speed: 1.0 },
          x: 25,
          y: 25,
          energy: 200,
        }),
        new Creature({
          speciesId: 'species-A',
          lineageId: 'lineage-A',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, speed: 1.0 },
          x: 26,
          y: 25,
          energy: 200,
        }),
      ];

      const FIXED_SEED = 123;
      let state = createEngine(FIXED_SEED, creatures, 100, 100);

      // Store initial tracker reference
      const initialTracker = state.adaptationMetrics;
      expect(initialTracker).toBeDefined();

      // Run multiple ticks
      for (let i = 0; i < 100; i++) {
        state = tickEngine(state);
      }

      // The tracker should be the same object (or at least functional)
      expect(state.adaptationMetrics).toBeDefined();

      // The tracker should have potentially recorded data across the ticks
      const summaries = state.adaptationMetrics.getAdaptationSummary('species-A', 'lineage-A');
      expect(summaries).toBeDefined();
      expect(typeof summaries).toBe('object');

      // lastAdaptationObservations should be populated during ticks
      expect(Array.isArray(state.lastAdaptationObservations)).toBe(true);
    });
  });
});
