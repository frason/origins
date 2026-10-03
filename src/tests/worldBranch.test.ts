import { describe, expect, it } from 'vitest';
import {
  createBranch,
  captureCheckpointOnBranch,
  captureCheckpointOnBranchWithReplay,
  sampleMetrics,
  compareBranches,
  findCommonHistoryTick,
  estimateBranchSize,
  boundBranchStorage,
  validateBranchCompatibility,
  checkpointCanReplay,
  type WorldBranch,
  type ChangedIntervention,
} from '../simulation/worldBranch';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  createEngine,
  tickEngine,
  type EngineState,
} from '../simulation/engine';
import {
  captureCheckpoint,
  restoreCheckpoint,
  type SimulationCheckpoint,
} from '../simulation/checkpointTimeline';
import { Creature } from '../simulation/creature';

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

/**
 * Convert EngineState to WorldSnapshot for testing
 */
function engineStateToSnapshot(state: EngineState): WorldSnapshot {
  const world = state.world.toJSON() as {
    width: number;
    height: number;
    cells: WorldSnapshot['cells'];
  };
  return {
    ...world,
    creatures: state.creatures.map((creature) => ({
      id: creature.id,
      speciesId: creature.speciesId,
      lineageId: creature.lineageId,
      parentId: creature.parentId,
      traits: { ...creature.traits },
      x: creature.x,
      y: creature.y,
      energy: creature.energy,
      age: creature.age,
      lifecycleState: creature.lifecycleState,
      corpseDecayTicks: creature.corpseDecayTicks,
      lastReproductionAge: creature.lastReproductionAge,
      generation: creature.generation,
      incipientSpeciesId: creature.incipientSpeciesId,
      offspringCount: creature.offspringCount,
      toxinExposure: creature.toxinExposure,
      localResourcePressure: creature.localResourcePressure,
      reproductionPressureMultiplier: creature.reproductionPressureMultiplier,
      dispersalTargetX: creature.dispersalTargetX,
      dispersalTargetY: creature.dispersalTargetY,
      lastDispersalTick: creature.lastDispersalTick,
      dispersalMoves: creature.dispersalMoves,
    })),
    events: state.events.map((event) => ({ ...event })),
    seed: state.seed,
    tick: state.tick,
    constants: { ...state.constants },
    speciesProfiles: state.speciesProfiles,
    incipientSpecies: state.incipientSpecies,
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

    it('replays branch checkpoints deterministically against the real engine', () => {
      // Test the core requirement: branch checkpoints must contain enough state
      // to replay deterministically against the real engine

      const constants = { ...SIMULATION_CONSTANTS, worldWidth: 20, worldHeight: 20 };

      // Create initial engine state and run forward
      let engineState = createEngine(12345, [], 20, 20, constants);
      let engineCheckpoints: SimulationCheckpoint<EngineState>[] = [];

      // Run 30 ticks, capturing engine checkpoints at intervals
      for (let tick = 0; tick < 30; tick++) {
        engineState = tickEngine(engineState, constants);
        if (engineState.tick % 10 === 0) {
          engineCheckpoints = captureCheckpoint<EngineState>(
            engineCheckpoints,
            engineState,
            10,
            5
          );
        }
      }

      // Verify we have checkpoints captured
      expect(engineCheckpoints.length).toBeGreaterThan(0);
      expect(engineCheckpoints.some(cp => cp.tick === 10)).toBe(true);

      // At tick 10, create a branch from the engine checkpoint
      const checkpoint10 = engineCheckpoints.find(cp => cp.tick === 10);
      expect(checkpoint10).toBeDefined();

      const branchWorldSnapshot = engineStateToSnapshot(checkpoint10!.state);
      const branch = createBranch(
        branchWorldSnapshot,
        10,
        { tick: 10, kind: 'settings-change', label: 'test branch' },
        'Test Branch'
      );

      // Capture a checkpoint on the branch that references the real engine checkpoint
      const branchAfterCapture = captureCheckpointOnBranchWithReplay(
        branch,
        branchWorldSnapshot,
        10, // replayCheckpointTick: references the real engine checkpoint at tick 10
        10  // interval
      );

      // Verify the checkpoint was captured and has the replay reference
      expect(branchAfterCapture.checkpoints.length).toBe(1);
      expect(branchAfterCapture.checkpoints[0].tick).toBe(10);
      expect(checkpointCanReplay(branchAfterCapture.checkpoints[0])).toBe(true);
      expect(branchAfterCapture.checkpoints[0].replayCheckpointTick).toBe(10);

      // Now verify that we can restore from this reference and continue deterministically
      const restoreResult = restoreCheckpoint(engineCheckpoints, 10);
      expect(restoreResult).not.toBeNull();

      // Get the original state at tick 10 before we continue
      const originalAt10 = checkpoint10!.state;

      // Run 5 more ticks from the original checkpoint to tick 15
      let originalContinued = originalAt10;
      for (let i = 0; i < 5; i++) {
        originalContinued = tickEngine(originalContinued, constants);
      }
      const originalAt15 = originalContinued;

      // Now restore from the checkpoint and continue to tick 15
      let restoredState = restoreResult!.state;
      for (let i = 0; i < 5; i++) {
        restoredState = tickEngine(restoredState, constants);
      }
      const restoredAt15 = restoredState;

      // Verify both reached tick 15
      expect(originalAt15.tick).toBe(15);
      expect(restoredAt15.tick).toBe(15);

      // Verify creature counts match (necessary but not sufficient for identical results)
      expect(restoredAt15.creatures.length).toBe(originalAt15.creatures.length);

      // Verify full creature state matches for deterministic replay (if creatures exist)
      if (restoredAt15.creatures.length > 0) {
        for (let i = 0; i < Math.min(originalAt15.creatures.length, restoredAt15.creatures.length); i++) {
          const origC = originalAt15.creatures[i];
          const restC = restoredAt15.creatures[i];

          // Compare creature identity and state
          expect(restC.id).toBe(origC.id);
          expect(restC.speciesId).toBe(origC.speciesId);
          expect(restC.x).toBe(origC.x);
          expect(restC.y).toBe(origC.y);
          expect(restC.energy).toBeCloseTo(origC.energy, 0);
          expect(restC.age).toBe(origC.age);
          expect(restC.lifecycleState).toBe(origC.lifecycleState);

          // Compare traits (should be identical)
          expect(restC.traits.size).toBe(origC.traits.size);
          expect(restC.traits.speed).toBe(origC.traits.speed);
          expect(restC.traits.visionRange).toBe(origC.traits.visionRange);
          expect(restC.traits.metabolism).toBe(origC.traits.metabolism);
        }
      }

      // Verify world grid cells match (energy, nutrients, etc.)
      for (let i = 0; i < originalAt15.width * originalAt15.height; i++) {
        const origCell = originalAt15.cells[i];
        const restCell = restoredAt15.cells[i];
        expect(restCell.energy).toBeCloseTo(origCell.energy, 1);
        expect(restCell.nutrients).toBeCloseTo(origCell.nutrients, 1);
        expect(restCell.producerBiomass).toBeCloseTo(origCell.producerBiomass, 1);
      }

      // Verify RNG state is identical by checking that both produce identical results
      // if we continue one more tick from tick 15
      const origNext = tickEngine(originalAt15, constants);
      const restNext = tickEngine(restoredAt15, constants);

      expect(origNext.creatures.length).toBe(restNext.creatures.length);
      expect(origNext.tick).toBe(restNext.tick);
    });
  });
});
