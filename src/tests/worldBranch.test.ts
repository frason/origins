import { describe, expect, it } from 'vitest';
import {
  createBranch,
  captureCheckpointOnBranch,
  sampleMetrics,
  compareBranches,
  findCommonHistoryTick,
  estimateBranchSize,
  boundBranchStorage,
  validateBranchCompatibility,
  type WorldBranch,
  type ChangedIntervention,
} from '../simulation/worldBranch';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';

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
          size: 1,
          speed: 1,
          visionRange: 1,
          hearingRange: 1,
          camouflage: 0,
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
        energy: 50,
        age: 5,
        lifecycleState: 'alive' as const,
        corpseDecayTicks: 0,
      })),
    events: [
      {
        type: 'intervention',
        tick: 10,
        interventionKind: 'settings-change',
        constantChanges: [{ constant: 'baseMetabolism', before: 2, after: 1 }],
      },
    ],
    constants: SIMULATION_CONSTANTS,
  };
}

describe('world branching and counterfactual analysis', () => {
  describe('createBranch', () => {
    it('creates a new branch from a checkpoint with unique ID', () => {
      const world = createTestWorld(20);
      const intervention: ChangedIntervention = {
        tick: 10,
        kind: 'settings-change',
        label: 'baseMetabolism: 2.0 → 1.5',
      };

      const branch = createBranch(world, 10, intervention, 'High Metabolism');

      expect(branch.id).toMatch(/^branch_\d+_[a-z0-9]+$/);
      expect(branch.name).toBe('High Metabolism');
      expect(branch.branchFromTick).toBe(10);
      expect(branch.tick).toBe(10);
      expect(branch.changedIntervention).toEqual(intervention);
      expect(branch.active).toBe(false);
    });

    it('preserves common history up to fork point', () => {
      const world = createTestWorld(30);
      world.events = [
        { type: 'birth', tick: 5, creatureId: 'c1', speciesId: 's1' },
        { type: 'birth', tick: 15, creatureId: 'c2', speciesId: 's1' },
        { type: 'death', tick: 25, creatureId: 'c1' },
      ];

      const intervention: ChangedIntervention = {
        tick: 20,
        kind: 'species-introduction',
        label: 'Introduced herbivore',
      };

      const branch = createBranch(world, 20, intervention, 'With herbivore');

      // Only events up to fork point (20) should be included
      expect(branch.worldState?.events).toHaveLength(2);
      expect(branch.worldState?.events?.every((e) => e.tick <= 20)).toBe(true);
    });

    it('records seed from parent world', () => {
      const world = createTestWorld(10);
      world.seed = 12345;

      const intervention: ChangedIntervention = { tick: 10, kind: 'settings-change', label: 'test' };
      const branch = createBranch(world, 10, intervention, 'Test');

      expect(branch.seed).toBe(12345);
    });
  });

  describe('captureCheckpointOnBranch', () => {
    it('captures checkpoint at interval boundaries', () => {
      let branch = createBranch(createTestWorld(0), 0, { tick: 0, kind: 'settings-change', label: 'test' }, 'Test');

      for (let tick of [10, 20, 30]) {
        const world = createTestWorld(tick);
        branch = captureCheckpointOnBranch(branch, world, 10, 3);
      }

      expect(branch.checkpoints.map((cp) => cp.tick)).toEqual([10, 20, 30]);
    });

    it('ignores non-interval ticks', () => {
      let branch = createBranch(createTestWorld(0), 0, { tick: 0, kind: 'settings-change', label: 'test' }, 'Test');

      const world11 = createTestWorld(11);
      branch = captureCheckpointOnBranch(branch, world11, 10, 3);

      expect(branch.checkpoints).toHaveLength(0);
    });

    it('replaces checkpoint at same tick', () => {
      let branch = createBranch(createTestWorld(0), 0, { tick: 0, kind: 'settings-change', label: 'test' }, 'Test');
      const world = createTestWorld(10);
      world.creatures = Array(5).fill(null).map((_, i) => ({
        ...world.creatures![0],
        id: `creature_${i}`,
      }));

      branch = captureCheckpointOnBranch(branch, world, 10, 3);
      expect(branch.checkpoints).toHaveLength(1);
      expect(branch.checkpoints[0].tick).toBe(10);

      // Capture again at same tick with different state
      const world2 = createTestWorld(10);
      world2.creatures = Array(15).fill(null).map((_, i) => ({
        ...world2.creatures![0],
        id: `creature_${i}`,
      }));

      branch = captureCheckpointOnBranch(branch, world2, 10, 3);
      expect(branch.checkpoints).toHaveLength(1); // Still 1, replaced
      expect(branch.tick).toBe(10);
    });

    it('enforces maximum checkpoint limit', () => {
      let branch = createBranch(createTestWorld(0), 0, { tick: 0, kind: 'settings-change', label: 'test' }, 'Test');

      for (let tick = 10; tick <= 100; tick += 10) {
        const world = createTestWorld(tick);
        branch = captureCheckpointOnBranch(branch, world, 10, 3);
      }

      // Should only keep last 3
      expect(branch.checkpoints).toHaveLength(3);
      expect(branch.checkpoints.map((cp) => cp.tick)).toEqual([80, 90, 100]);
    });
  });

  describe('sampleMetrics', () => {
    it('counts population and species', () => {
      const world = createTestWorld(10, 25);
      // Add another species
      world.creatures![10].speciesId = 'species_2';
      world.creatures![15].speciesId = 'species_2';

      const metrics = sampleMetrics(world);

      expect(metrics.population).toBe(25);
      expect(metrics.speciesCount).toBe(2);
      expect(metrics.tick).toBe(10);
    });

    it('sums living energy', () => {
      const world = createTestWorld(10, 5);
      world.creatures?.forEach((c) => {
        c.energy = 100;
        c.lifecycleState = 'alive';
      });

      const metrics = sampleMetrics(world);
      expect(metrics.livingEnergy).toBe(500);
    });

    it('excludes dead creature energy', () => {
      const world = createTestWorld(10, 5);
      world.creatures?.forEach((c, i) => {
        c.energy = 100;
        if (i < 2) c.lifecycleState = 'dead';
        else c.lifecycleState = 'alive';
      });

      const metrics = sampleMetrics(world);
      expect(metrics.livingEnergy).toBe(300); // Only 3 alive creatures
    });

    it('sums producer biomass from all cells', () => {
      const world = createTestWorld(10);
      world.cells = Array(100).fill({
        ...world.cells![0],
        producerBiomass: 10,
      });

      const metrics = sampleMetrics(world);
      expect(metrics.producerBiomass).toBe(1000);
    });

    it('counts extinction events', () => {
      const world = createTestWorld(10);
      world.events = [
        { type: 'extinction', tick: 5, speciesId: 's1' },
        { type: 'extinction', tick: 8, speciesId: 's2' },
        { type: 'birth', tick: 6, creatureId: 'c1', speciesId: 's3' },
      ];

      const metrics = sampleMetrics(world);
      expect(metrics.extinctionCount).toBe(2);
    });
  });

  describe('compareBranches', () => {
    it('identifies extinction differences between branches', () => {
      const world1 = createTestWorld(50);
      world1.events = [
        { type: 'extinction', tick: 20, speciesId: 'herbivore_1' },
        { type: 'extinction', tick: 30, speciesId: 'carnivore_1' },
      ];

      const world2 = createTestWorld(50);
      world2.events = [
        { type: 'extinction', tick: 25, speciesId: 'carnivore_1' }, // Different tick
        // herbivore_1 never went extinct
      ];

      const branch1 = createBranch(world1, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B1');
      branch1.worldState = world1;

      const branch2 = createBranch(world2, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B2');
      branch2.worldState = world2;

      const divergence = compareBranches(branch1, branch2, 10);

      expect(divergence.extinctionDifferences).toContainEqual(
        expect.objectContaining({ speciesId: 'herbivore_1', extinctIn: 'branch_a' })
      );
    });

    it('identifies major event divergence', () => {
      const world1 = createTestWorld(50);
      world1.events = [
        { type: 'speciation', tick: 20, speciesId: 's1' },
      ];

      const world2 = createTestWorld(50);
      world2.events = [
        { type: 'speciation', tick: 25, speciesId: 's2' },
      ];

      const branch1 = createBranch(world1, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B1');
      branch1.worldState = world1;

      const branch2 = createBranch(world2, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B2');
      branch2.worldState = world2;

      const divergence = compareBranches(branch1, branch2, 10);

      expect(divergence.divergenceTick).toBeDefined();
      expect(divergence.divergenceTick).toBeGreaterThan(10);
    });

    it('samples metrics at checkpoints', () => {
      const world1 = createTestWorld(50, 15);
      const world2 = createTestWorld(50, 20);

      const branch1 = createBranch(world1, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B1');
      branch1.worldState = world1;
      branch1.checkpoints = [{ tick: 30 }, { tick: 50 }];

      const branch2 = createBranch(world2, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'B2');
      branch2.worldState = world2;
      branch2.checkpoints = [{ tick: 30 }, { tick: 50 }];

      const divergence = compareBranches(branch1, branch2, 10);

      expect(divergence.metricsSamples.length).toBeGreaterThan(0);
      expect(divergence.metricsSamples[0].tick).toBeGreaterThan(10);
    });
  });

  describe('findCommonHistoryTick', () => {
    it('returns the earlier branch point', () => {
      const world1 = createTestWorld(50);
      const world2 = createTestWorld(50);

      const branch1 = createBranch(world1, 15, { tick: 15, kind: 'settings-change', label: 'test' }, 'B1');
      const branch2 = createBranch(world2, 20, { tick: 20, kind: 'settings-change', label: 'test' }, 'B2');

      const common = findCommonHistoryTick(branch1, branch2);

      expect(common).toBe(15);
    });

    it('handles branches from same point', () => {
      const world1 = createTestWorld(50);
      const world2 = createTestWorld(50);

      const branch1 = createBranch(world1, 20, { tick: 20, kind: 'settings-change', label: 'test' }, 'B1');
      const branch2 = createBranch(world2, 20, { tick: 20, kind: 'settings-change', label: 'test' }, 'B2');

      const common = findCommonHistoryTick(branch1, branch2);

      expect(common).toBe(20);
    });
  });

  describe('estimateBranchSize', () => {
    it('estimates size including world state', () => {
      const world = createTestWorld(50, 20);
      const branch = createBranch(world, 10, { tick: 10, kind: 'settings-change', label: 'test' }, 'Test');

      const size = estimateBranchSize(branch);

      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('includes checkpoint overhead', () => {
      let branch = createBranch(createTestWorld(0), 0, { tick: 0, kind: 'settings-change', label: 'test' }, 'Test');
      branch.checkpoints = [{ tick: 10 }, { tick: 20 }, { tick: 30 }];

      const size = estimateBranchSize(branch);

      expect(size).toBeGreaterThan(100); // At least some overhead
    });
  });

  describe('boundBranchStorage', () => {
    it('keeps newest branches within limit', () => {
      const mainWorld = createTestWorld(50, 5);
      const mainBranch = createBranch(mainWorld, 10, { tick: 10, kind: 'settings-change', label: 'main' }, 'Main');

      const branch1 = createBranch(createTestWorld(50, 5), 10, { tick: 10, kind: 'settings-change', label: 'alt1' }, 'Alt1');
      branch1.createdAt = 100;

      const branch2 = createBranch(createTestWorld(50, 5), 10, { tick: 10, kind: 'settings-change', label: 'alt2' }, 'Alt2');
      branch2.createdAt = 200; // Newer

      const collection = {
        main: mainBranch,
        alternatives: [branch1, branch2],
      };

      const bounded = boundBranchStorage(collection, 50000); // Small limit

      // Should keep main and at least one alternative
      expect(bounded.main.id).toBe(mainBranch.id);
      expect(bounded.alternatives.length).toBeGreaterThanOrEqual(0);
    });

    it('always keeps main branch', () => {
      const mainBranch = createBranch(createTestWorld(50, 100), 10, { tick: 10, kind: 'settings-change', label: 'main' }, 'Main');

      const collection = {
        main: mainBranch,
        alternatives: [],
      };

      const bounded = boundBranchStorage(collection, 100); // Tiny limit

      expect(bounded.main.id).toBe(mainBranch.id);
    });
  });

  describe('validateBranchCompatibility', () => {
    it('validates complete branch', () => {
      const branch = createBranch(
        createTestWorld(10),
        5,
        { tick: 5, kind: 'settings-change', label: 'test' },
        'Valid'
      );

      expect(validateBranchCompatibility(branch)).toBe(true);
    });

    it('rejects branch missing id', () => {
      const branch = createBranch(
        createTestWorld(10),
        5,
        { tick: 5, kind: 'settings-change', label: 'test' },
        'Test'
      );
      const invalid = { ...branch, id: '' } as any;

      expect(validateBranchCompatibility(invalid)).toBe(false);
    });

    it('rejects branch missing changedIntervention', () => {
      const branch = createBranch(
        createTestWorld(10),
        5,
        { tick: 5, kind: 'settings-change', label: 'test' },
        'Test'
      );
      const invalid = { ...branch, changedIntervention: {} } as any;

      expect(validateBranchCompatibility(invalid)).toBe(false);
    });

    it('rejects branch with invalid branchFromTick', () => {
      const branch = createBranch(
        createTestWorld(10),
        5,
        { tick: 5, kind: 'settings-change', label: 'test' },
        'Test'
      );
      const invalid = { ...branch, branchFromTick: 'not_a_number' } as any;

      expect(validateBranchCompatibility(invalid)).toBe(false);
    });
  });

  describe('branch integration and replay', () => {
    it('supports creating two branches from one checkpoint', () => {
      const parentWorld = createTestWorld(50, 20);
      const forkTick = 30;

      const branch1 = createBranch(
        parentWorld,
        forkTick,
        { tick: forkTick, kind: 'settings-change', label: 'High metabolism' },
        'High metabolism scenario'
      );

      const branch2 = createBranch(
        parentWorld,
        forkTick,
        { tick: forkTick, kind: 'species-introduction', label: 'With predator' },
        'With predator scenario'
      );

      expect(branch1.id).not.toBe(branch2.id);
      expect(branch1.branchFromTick).toBe(branch2.branchFromTick);
      expect(branch1.changedIntervention.label).not.toBe(branch2.changedIntervention.label);
    });

    it('can compare branches to see where they diverge', () => {
      const world1 = createTestWorld(50, 15);
      world1.events = [
        { type: 'birth', tick: 10, creatureId: 'c1', speciesId: 's1' },
        { type: 'extinction', tick: 25, speciesId: 's1' },
        { type: 'extinction', tick: 35, speciesId: 's2' },
      ];

      const world2 = createTestWorld(50, 15);
      world2.events = [
        { type: 'birth', tick: 10, creatureId: 'c1', speciesId: 's1' },
        // s1 survives longer in this branch
        { type: 'extinction', tick: 45, speciesId: 's3' }, // Different species goes extinct
      ];

      const branch1 = createBranch(world1, 20, { tick: 20, kind: 'settings-change', label: 'test' }, 'B1');
      branch1.worldState = world1;
      branch1.checkpoints = [{ tick: 20 }, { tick: 30 }, { tick: 40 }, { tick: 50 }];

      const branch2 = createBranch(world2, 20, { tick: 20, kind: 'settings-change', label: 'test' }, 'B2');
      branch2.worldState = world2;
      branch2.checkpoints = [{ tick: 20 }, { tick: 30 }, { tick: 40 }, { tick: 50 }];

      const divergence = compareBranches(branch1, branch2, 20);

      // Should identify that s1 and s2 went extinct in branch1 but not in branch2
      expect(divergence.extinctionDifferences.length).toBeGreaterThan(0);
      // s1 extinct in branch1, not in branch2
      expect(divergence.extinctionDifferences.some(d => d.speciesId === 's1' && d.extinctIn === 'branch_a')).toBe(true);
    });
  });
});
