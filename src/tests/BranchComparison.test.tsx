import { describe, expect, it, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BranchComparisonView } from '../ui/BranchComparison';
import { sampleMetrics, type WorldBranch, type EcosystemMetrics } from '../simulation/worldBranch';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';

// Mock the useStore hook
vi.mock('../state/store', () => ({
  useStore: vi.fn((selector) => {
    if (selector.toString().includes('branchCollection')) {
      return null;
    }
    return undefined;
  }),
}));

function createTestWorld(tick: number, population: number = 10): WorldSnapshot {
  return {
    width: 100,
    height: 100,
    tick,
    seed: 42,
    cells: Array(10000).fill({
      energy: 10,
      nutrients: 5,
      producerBiomass: 0.5,
      toxicity: 0,
      elevation: 0,
      moisture: 0.5,
      temperature: 20,
      biome: 'temperate' as const,
      producerArchetype: 'grass' as const,
    }),
    creatures: Array(population)
      .fill(null)
      .map((_, i) => ({
        id: `creature_${i}`,
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: {
          size: 1 + (i % 3), // Vary traits for trait frequency testing
          speed: 2 + (i % 2),
          visionRange: 5,
          hearingRange: 10,
          camouflage: 0.5,
          armor: 0,
          boneDensity: 1,
          metabolism: 1,
          reproductionRate: 1,
          brainSize: 1,
          consciousnessLevel: 0,
          communication: 0,
          collectiveConnection: 0,
          thermalTolerance: 0,
          waterRetention: 0,
          aquaticAffinity: 0,
          aquaticAdaptation: 0,
          terrainGrip: 0,
          toxinResistance: 0,
          auditorySteal: 0,
          waterNeed: 0.5,
          saltTolerance: 0,
          energyStrategy: 'herbivore' as const,
        },
        x: Math.floor(Math.random() * 100),
        y: Math.floor(Math.random() * 100),
        energy: 50 + (i * 5), // Vary energy
        age: 5,
        lifecycleState: 'alive' as const,
        corpseDecayTicks: 0,
      })),
    events: [],
    constants: SIMULATION_CONSTANTS,
  };
}

function createTestBranch(worldState: WorldSnapshot, name: string = 'Test Branch'): WorldBranch {
  return {
    id: `branch_test_${Date.now()}`,
    name,
    branchFromTick: 10,
    changedIntervention: {
      tick: 10,
      kind: 'settings-change',
      label: 'Test intervention',
    },
    tick: worldState.tick ?? 0,
    worldState,
    checkpoints: [{ tick: worldState.tick ?? 0, worldSnapshot: worldState }],
    seed: 42,
    createdAt: Date.now(),
    active: false,
  };
}

describe('BranchComparisonView', () => {
  describe('trait frequency display', () => {
    it('displays trait frequencies when metrics contain traitFrequencies', () => {
      const worldA = createTestWorld(50, 15);
      const worldB = createTestWorld(50, 15);

      const branchA = createTestBranch(worldA, 'Branch A');
      const branchB = createTestBranch(worldB, 'Branch B');

      // Get metrics which should include trait frequencies
      const metricsA = sampleMetrics(worldA);
      const metricsB = sampleMetrics(worldB);

      // Verify trait frequencies were populated
      expect(metricsA.traitFrequencies).toBeDefined();
      expect(metricsB.traitFrequencies).toBeDefined();
      expect(Object.keys(metricsA.traitFrequencies ?? {}).length).toBeGreaterThan(0);

      // Now render the component
      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={branchB} />
      );

      // Check for trait frequency section in the rendered output
      const traitSection = container.querySelector('[class*="traitFrequencySection"]');
      expect(traitSection).toBeTruthy();
    });

    it('renders trait names and values for multiple species', () => {
      const worldA = createTestWorld(50, 20);
      // Add a second species
      worldA.creatures!.slice(10).forEach((c) => {
        c.speciesId = 'species_2';
      });

      const branchA = createTestBranch(worldA, 'Branch A');
      const branchB = createTestBranch(createTestWorld(50, 15), 'Branch B');

      const metricsA = sampleMetrics(worldA);
      expect(Object.keys(metricsA.traitFrequencies ?? {}).length).toBeGreaterThanOrEqual(1);

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={branchB} />
      );

      // Check that trait names are rendered
      const text = container.textContent ?? '';
      expect(text).toContain('Trait Frequencies');
      expect(text).toContain('Branch A Species Traits');
    });

    it('handles empty trait frequencies gracefully', () => {
      const worldA = createTestWorld(50, 0); // No creatures
      const worldB = createTestWorld(50, 0);

      const branchA = createTestBranch(worldA);
      const branchB = createTestBranch(worldB);

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={branchB} />
      );

      // Should render without crashing
      expect(container).toBeTruthy();
    });
  });

  describe('timeline synchronization UI', () => {
    it('renders timeline section for branches with checkpoints', () => {
      const worldA = createTestWorld(50, 10);
      const branchA = createTestBranch(worldA, 'Branch A');
      branchA.checkpoints = [
        { tick: 10, worldSnapshot: createTestWorld(10, 10) },
        { tick: 20, worldSnapshot: createTestWorld(20, 10) },
        { tick: 30, worldSnapshot: createTestWorld(30, 10) },
      ];

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={undefined} />
      );

      const text = container.textContent ?? '';
      expect(text).toContain('Timeline Focus Synchronization');
      expect(text).toContain('Branch A Timeline');
    });

    it('renders map region synchronization section', () => {
      const worldA = createTestWorld(50, 10);
      const worldB = createTestWorld(50, 10);
      const branchA = createTestBranch(worldA, 'Branch A');
      const branchB = createTestBranch(worldB, 'Branch B');

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={branchB} />
      );

      const text = container.textContent ?? '';
      expect(text).toContain('Map Region Focus Synchronization');
    });
  });

  describe('metrics display', () => {
    it('displays ecosystem metrics for both branches', () => {
      const worldA = createTestWorld(50, 15);
      const worldB = createTestWorld(50, 20);

      const branchA = createTestBranch(worldA, 'Branch A');
      const branchB = createTestBranch(worldB, 'Branch B');

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={branchB} />
      );

      const text = container.textContent ?? '';
      // Should show metrics like population, species count, etc.
      expect(text).toContain('Population');
      expect(text).toContain('Species');
      expect(text).toContain('Living Energy');
    });

    it('shows current state when no timeline sync is active', () => {
      const worldA = createTestWorld(50, 15);
      const branchA = createTestBranch(worldA, 'Branch A');

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={undefined} />
      );

      const text = container.textContent ?? '';
      expect(text).toContain('Current State');
    });
  });

  describe('branch selection', () => {
    it('displays branch names and intervention info', () => {
      const worldA = createTestWorld(50, 15);
      const branchA = createTestBranch(worldA, 'High Metabolism');
      branchA.changedIntervention = {
        tick: 10,
        kind: 'settings-change',
        label: 'baseMetabolism: 2.0 → 1.5',
      };

      const { container } = render(
        <BranchComparisonView branchA={branchA} branchB={undefined} />
      );

      const text = container.textContent ?? '';
      expect(text).toContain('High Metabolism');
      expect(text).toContain('baseMetabolism');
    });
  });
});
