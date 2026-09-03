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

    it('classifies drift for small changes without fitness', () => {
      const creaturesA = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.0 } })
      );
      const creaturesB = Array.from({ length: 5 }, (_, i) =>
        createMockCreature(i, { traits: { ...DEFAULT_TRAITS, speed: 1.02 } })
      );

      const summary1 = computeTraitFrequencies(creaturesA, 0, 100, 'species1', 'lineage1');
      const summary2 = computeTraitFrequencies(creaturesB, 100, 200, 'species1', 'lineage1');

      const classification = classifyChange(
        summary2!,
        summary1!,
        'speed'
      );
      expect(classification).toBe('drift');
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
});
