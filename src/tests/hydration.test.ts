import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  applyHydrationDecline,
  getHydrationMetabolismPenalty,
  shouldDieFromHydration,
  drinkWater,
} from '../simulation/energy';
import { World } from '../simulation/world';

describe('hydration system', () => {
  beforeEach(() => Creature.resetIdCounter());

  describe('hydration decline', () => {
    it('declines by waterNeed * depletionRate each tick', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, waterNeed: 1 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 1,
      });

      expect(creature.hydration).toBe(1);
      applyHydrationDecline(creature, 0.1);
      expect(creature.hydration).toBeCloseTo(0.9);
      applyHydrationDecline(creature, 0.1);
      expect(creature.hydration).toBeCloseTo(0.8);
    });

    it('declines over multiple ticks to eventually reach zero', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, waterNeed: 1 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 1,
      });

      for (let i = 0; i < 20; i++) {
        applyHydrationDecline(creature, 0.1);
      }
      expect(creature.hydration).toBeLessThanOrEqual(0);
    });

    it('does not go below zero', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, waterNeed: 1 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.05,
      });

      applyHydrationDecline(creature, 0.1);
      expect(creature.hydration).toBe(0);
    });
  });

  describe('hydration metabolism penalty', () => {
    it('returns zero penalty when hydration is above threshold', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.5,
      });

      const penalty = getHydrationMetabolismPenalty(creature, 10, 0.3, 1.5);
      expect(penalty).toBe(0);
    });

    it('applies penalty when hydration falls below threshold', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.2,
      });

      const baseCost = 10;
      const penalty = getHydrationMetabolismPenalty(creature, baseCost, 0.3, 1.5);
      expect(penalty).toBeGreaterThan(0);
      expect(penalty).toBeLessThanOrEqual(baseCost * 0.5);
    });

    it('scales penalty up to maximum at zero hydration', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0,
      });

      const baseCost = 10;
      const penalty = getHydrationMetabolismPenalty(creature, baseCost, 0.3, 1.5);
      expect(penalty).toBeCloseTo(baseCost * 0.5); // (1.5 - 1) = 0.5
    });
  });

  describe('hydration death threshold', () => {
    it('does not cause death when hydration is above threshold', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.1,
      });

      const shouldDie = shouldDieFromHydration(
        creature,
        0, // deathThreshold at 0
        0.1, // 10% chance per tick
        () => 0.5 // deterministic RNG always returns 0.5
      );
      expect(shouldDie).toBe(false);
    });

    it('can cause death with probabilistic RNG at critical hydration', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0,
      });

      // Should die (probability 0.15 > mortality rate 0.1)
      let shouldDie = shouldDieFromHydration(
        creature,
        0,
        0.1,
        () => 0.05 // 5% < 10% mortality rate
      );
      expect(shouldDie).toBe(true);

      // Should not die (probability 0.05 < mortality rate 0.1)
      shouldDie = shouldDieFromHydration(
        creature,
        0,
        0.1,
        () => 0.15 // 15% > 10% mortality rate
      );
      expect(shouldDie).toBe(false);
    });

    it('never causes death from a single tick of dehydration', () => {
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.01, // Just barely above zero
      });

      // Creature at hydration > 0 should never die from hydration
      const shouldDie = shouldDieFromHydration(
        creature,
        0,
        1, // 100% mortality rate
        () => 0 // Worst-case RNG
      );
      expect(shouldDie).toBe(false);
    });
  });

  describe('drinking from water', () => {
    it('restores hydration from fresh water', () => {
      const world = new World(20, 20);
      // Create fresh water adjacent to creature at (10, 10)
      world.setCell(11, 10, { waterDepth: 1, salinity: 0.05 });

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
      });

      const restored = drinkWater(creature, world, SIMULATION_CONSTANTS);
      expect(restored).toBeCloseTo(0.7); // 1 - 0.3
      expect(creature.hydration).toBe(1); // Fully restored
    });

    it('partially restores hydration from saline water based on saltTolerance', () => {
      const world = new World(20, 20);
      // Create saline water adjacent to creature at (10, 10)
      world.setCell(11, 10, { waterDepth: 1, salinity: 0.3 });

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, saltTolerance: 0.5 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
      });

      const restored = drinkWater(creature, world, SIMULATION_CONSTANTS);
      // Recovery = 0.5 * saltTolerance = 0.5 * 0.5 = 0.25
      expect(restored).toBeCloseTo(0.25);
      expect(creature.hydration).toBeCloseTo(0.55);
    });

    it('creatures with zero saltTolerance cannot drink saline water', () => {
      const world = new World(20, 20);
      // Create saline water (only option) adjacent to creature at (10, 10)
      world.setCell(11, 10, { waterDepth: 1, salinity: 0.3 });

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, saltTolerance: 0 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
      });

      const restored = drinkWater(creature, world, SIMULATION_CONSTANTS);
      expect(restored).toBe(0);
      expect(creature.hydration).toBe(0.3); // Unchanged
    });

    it('accrues toxicity from saline water based on low salt tolerance', () => {
      const world = new World(20, 20);
      // Create saline water adjacent to creature at (10, 10)
      world.setCell(11, 10, { waterDepth: 1, salinity: 0.4 });

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, saltTolerance: 0.1 }, // Low tolerance
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
        toxinExposure: 0,
      });

      drinkWater(creature, world, SIMULATION_CONSTANTS);
      // toxicityDamage = (1 - 0.1) * 0.4 * 0.5 = 0.9 * 0.4 * 0.5 = 0.18
      expect(creature.toxinExposure).toBeCloseTo(0.18);
    });

    it('prefers fresh water over saline water when both are adjacent', () => {
      const world = new World(20, 20);
      // Fresh water to the right (11, 10)
      world.setCell(11, 10, { waterDepth: 1, salinity: 0.05 });
      // Saline water above (10, 9)
      world.setCell(10, 9, { waterDepth: 1, salinity: 0.4 });

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, saltTolerance: 0.5 },
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
        toxinExposure: 0,
      });

      drinkWater(creature, world, SIMULATION_CONSTANTS);
      // Should use fresh water
      expect(creature.hydration).toBe(1);
      expect(creature.toxinExposure).toBe(0);
    });

    it('returns zero if no adjacent water exists', () => {
      const world = new World(10, 10);

      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 10,
        y: 10,
        energy: 100,
        hydration: 0.3,
      });

      const restored = drinkWater(creature, world, SIMULATION_CONSTANTS);
      expect(restored).toBe(0);
      expect(creature.hydration).toBe(0.3); // Unchanged
    });
  });

  describe('full simulation with hydration', () => {
    it('integrates hydration decline and metabolism penalty in live tick loop', () => {
      const engine = createEngine(42, [
        new Creature({
          speciesId: 'test_species',
          lineageId: 'test_lineage',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, waterNeed: 1 },
          x: 50,
          y: 50,
          energy: 100,
          hydration: 1,
        }),
      ], 100, 100, {
        baseMetabolism: 5,
        hydrationDepletionRate: 0.1,
        hydrationMetabolismPenaltyThreshold: 0.3,
        hydrationMetabolismPenaltyMultiplier: 1.5,
      });

      const before = engine.creatures[0];
      expect(before.hydration).toBe(1);
      expect(before.energy).toBe(100);

      const after = tickEngine(engine);
      const creature = after.creatures[0];

      // Hydration should have declined
      expect(creature.hydration).toBeLessThan(before.hydration);
      // Energy should have been reduced by metabolism
      expect(creature.energy).toBeLessThan(before.energy);
    });

    it('creature can drink from adjacent water to restore hydration', () => {
      const world = new World(100, 100);
      // Add fresh water at position (51, 50)
      world.setCell(51, 50, { waterDepth: 2, salinity: 0.05 });

      const engine = createEngine(42, [
        new Creature({
          speciesId: 'test_species',
          lineageId: 'test_lineage',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, waterNeed: 1 },
          x: 50,
          y: 50,
          energy: 100,
          hydration: 0.2,
        }),
      ], 100, 100, {
        baseMetabolism: 0,
        hydrationDepletionRate: 0.1,
      });

      // Replace the world with our custom one with water
      engine.world = world;

      const before = engine.creatures[0];
      expect(before.hydration).toBe(0.2);

      const after = tickEngine(engine);
      const creature = after.creatures[0];

      // Hydration should have been restored by drinking
      expect(creature.hydration).toBeGreaterThan(before.hydration);
      expect(creature.hydration).toBeCloseTo(1, 1);
    });
  });
});
