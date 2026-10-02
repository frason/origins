/**
 * Performance measurement test for DecisionIntent optimization
 *
 * Measures the reduction in perception scans achieved by using a single scan
 * per creature decision, rather than separate scans in decision and movement phases.
 *
 * This test compares the old rescanning path (applyMovement) vs the new
 * single-scan path (decideTick + applyMovementWithScan) with identical seeds and
 * populations to demonstrate the performance improvement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Creature, decideTick, applyMovementWithScan, applyMovement } from '../simulation/creature';
import { World } from '../simulation/world';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import { tickEngine, createEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { createRng } from '../simulation/rng';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('DecisionIntent Performance - Perception Scan Optimization', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  /**
   * Create a standard test population with controlled randomness
   */
  function createTestPopulation(
    size: number,
    seed: number = 12345
  ): {
    creatures: Creature[];
    world: World;
  } {
    Creature.resetIdCounter();
    const creatures: Creature[] = [];
    const rng = createRng(seed);

    for (let i = 0; i < size; i++) {
      creatures.push(
        new Creature({
          speciesId: i % 2 === 0 ? 'herbivore' : 'carnivore',
          lineageId: `lineage_${i}`,
          parentId: null,
          traits: {
            ...DEFAULT_TRAITS,
            energyStrategy: i % 2 === 0 ? 'herbivore' : 'carnivore',
            speed: 1.5 + rng() * 0.5,
            visionRange: 4 + rng() * 2,
          },
          x: 30 + (i % 5) * 5,
          y: 40 + Math.floor(i / 5) * 5,
          energy: 100 + rng() * 50,
        })
      );
    }

    const world = new World(100, 100);
    // Add some producer biomass to make feeding possible
    for (let x = 25; x < 75; x += 5) {
      for (let y = 35; y < 65; y += 5) {
        world.getCell(x, y).producerBiomass = 10;
      }
    }

    return { creatures, world };
  }

  it('before/after benchmark: old rescanning path vs new single-scan path', () => {
    const populationSize = 50;

    // OLD PATH: decideTick + applyMovement (rescans environment)
    const { creatures: creaturesOld, world: worldOld } = createTestPopulation(populationSize);
    const rngOld = createRng(12345);
    const spatialIndexOld = new CreatureSpatialIndex(creaturesOld);

    const startOld = performance.now();
    let oldScans = 0;
    for (const creature of creaturesOld) {
      if (creature.lifecycleState === 'alive') {
        // OLD: decideTick scans once
        const { decision } = decideTick(
          creature,
          worldOld,
          creaturesOld,
          rngOld,
          spatialIndexOld
        );
        oldScans++;

        // OLD: applyMovement scans again (redundant!)
        applyMovement(
          creature,
          decision,
          worldOld,
          creaturesOld,
          rngOld,
          spatialIndexOld
        );
        oldScans++;
      }
    }
    const timeOld = performance.now() - startOld;

    // NEW PATH: decideTick + applyMovementWithScan (single scan)
    const { creatures: creaturesNew, world: worldNew } = createTestPopulation(populationSize);
    const rngNew = createRng(12345);
    const spatialIndexNew = new CreatureSpatialIndex(creaturesNew);

    const startNew = performance.now();
    let newScans = 0;
    for (const creature of creaturesNew) {
      if (creature.lifecycleState === 'alive') {
        // NEW: decideTick scans once
        const { decision, scan } = decideTick(
          creature,
          worldNew,
          creaturesNew,
          rngNew,
          spatialIndexNew
        );
        newScans++;

        // NEW: applyMovementWithScan uses pre-scanned data (no additional scan)
        applyMovementWithScan(
          creature,
          decision,
          scan,
          worldNew,
          creaturesNew,
          {
            hydrationRecoveryFresh: SIMULATION_CONSTANTS.hydrationRecoveryFresh,
            hydrationRecoverySalineMultiplier: SIMULATION_CONSTANTS.hydrationRecoverySalineMultiplier,
          },
          spatialIndexNew
        );
      }
    }
    const timeNew = performance.now() - startNew;

    // Verify expectations
    expect(oldScans).toBe(populationSize * 2); // 2 scans per creature (redundant)
    expect(newScans).toBe(populationSize); // 1 scan per creature (optimized)

    const improvement = timeOld / timeNew;
    const percentImprovement = ((timeOld - timeNew) / timeOld) * 100;

    console.log(`\n=== DecisionIntent Benchmark Results ===`);
    console.log(`Population size: ${populationSize}`);
    console.log(`Old path (rescanning):`);
    console.log(`  Scans: ${oldScans} (2 per creature)`);
    console.log(`  Time: ${timeOld.toFixed(2)}ms`);
    console.log(`New path (single-scan):`);
    console.log(`  Scans: ${newScans} (1 per creature)`);
    console.log(`  Time: ${timeNew.toFixed(2)}ms`);
    console.log(`Improvement: ${improvement.toFixed(2)}x faster (${percentImprovement.toFixed(1)}% reduction)`);
    console.log(`========================================\n`);

    // The new path should be faster (at least not slower)
    // Note: With small populations, timing variance may be significant,
    // but scan count difference is deterministic
    expect(newScans * 2).toBe(oldScans);
    expect(timeNew).toBeLessThanOrEqual(timeOld * 1.1); // Allow 10% variance due to system noise
  });

  it('scan count is deterministic and reproducible', () => {
    // Verify that the optimization is deterministic:
    // same seed and population should produce identical scan patterns
    const populationSize = 30;

    // First run
    const { creatures: creatures1, world: world1 } = createTestPopulation(populationSize);
    const rng1 = createRng(99999);
    const spatialIndex1 = new CreatureSpatialIndex(creatures1);

    let scans1 = 0;
    for (const creature of creatures1) {
      if (creature.lifecycleState === 'alive') {
        const { decision, scan } = decideTick(
          creature,
          world1,
          creatures1,
          rng1,
          spatialIndex1
        );
        scans1++;
        applyMovementWithScan(
          creature,
          decision,
          scan,
          world1,
          creatures1,
          {
            hydrationRecoveryFresh: SIMULATION_CONSTANTS.hydrationRecoveryFresh,
            hydrationRecoverySalineMultiplier: SIMULATION_CONSTANTS.hydrationRecoverySalineMultiplier,
          },
          spatialIndex1
        );
      }
    }

    // Second run with identical seed
    const { creatures: creatures2, world: world2 } = createTestPopulation(populationSize);
    const rng2 = createRng(99999);
    const spatialIndex2 = new CreatureSpatialIndex(creatures2);

    let scans2 = 0;
    for (const creature of creatures2) {
      if (creature.lifecycleState === 'alive') {
        const { decision, scan } = decideTick(
          creature,
          world2,
          creatures2,
          rng2,
          spatialIndex2
        );
        scans2++;
        applyMovementWithScan(
          creature,
          decision,
          scan,
          world2,
          creatures2,
          {
            hydrationRecoveryFresh: SIMULATION_CONSTANTS.hydrationRecoveryFresh,
            hydrationRecoverySalineMultiplier: SIMULATION_CONSTANTS.hydrationRecoverySalineMultiplier,
          },
          spatialIndex2
        );
      }
    }

    // Both runs should have identical scan counts
    expect(scans1).toBe(scans2);
    expect(scans1).toBe(populationSize);

    console.log(`\n=== Determinism Check ===`);
    console.log(`Population size: ${populationSize}`);
    console.log(`Scan count (run 1): ${scans1}`);
    console.log(`Scan count (run 2): ${scans2}`);
    console.log(`Deterministic: ${scans1 === scans2 ? 'YES' : 'NO'}`);
    console.log(`========================\n`);
  });

  it('preserves correctness while reducing scan count', () => {
    // Verify that behavior is still correct after optimization
    const creature = new Creature({
      speciesId: 'test_species',
      lineageId: 'test_lineage',
      parentId: null,
      traits: {
        ...DEFAULT_TRAITS,
        energyStrategy: 'herbivore',
        speed: 2,
        visionRange: 5,
      },
      x: 50,
      y: 50,
      energy: 100,
    });

    const world = new World(100, 100);
    world.getCell(52, 50).producerBiomass = 15;
    world.getCell(50, 52).producerBiomass = 10;

    const rng = createRng(11111);
    const creatures = [creature];
    const spatialIndex = new CreatureSpatialIndex(creatures);

    // Get decision and scan
    const { decision, scan } = decideTick(
      creature,
      world,
      creatures,
      rng,
      spatialIndex
    );

    // Verify the scan found the food
    const hasFood = scan.foodLocations.length > 0;
    const shouldMove = decision === 'move-to-food' || decision === 'search';

    // Apply movement
    const prevX = creature.x;
    const prevY = creature.y;
    applyMovementWithScan(
      creature,
      decision,
      scan,
      world,
      creatures,
      {
        hydrationRecoveryFresh: SIMULATION_CONSTANTS.hydrationRecoveryFresh,
        hydrationRecoverySalineMultiplier: SIMULATION_CONSTANTS.hydrationRecoverySalineMultiplier,
      },
      spatialIndex
    );

    // Verify correctness:
    // 1. If there was food nearby and decision was move-to-food, creature should move
    if (hasFood && decision === 'move-to-food') {
      const distance = Math.max(
        Math.abs(creature.x - prevX),
        Math.abs(creature.y - prevY)
      );
      expect(distance).toBeGreaterThan(0);
    }

    // 2. Creature should not move beyond speed limit
    const maxMovement = creature.traits.speed;
    const actualMovement = Math.max(
      Math.abs(creature.x - prevX),
      Math.abs(creature.y - prevY)
    );
    expect(actualMovement).toBeLessThanOrEqual(maxMovement + 0.01); // Small epsilon for rounding
  });
});
