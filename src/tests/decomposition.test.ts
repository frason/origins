import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import {
  checkAgeAndStarvation,
  decayCorpse,
  recycleNutrients,
  dissipateToxicity,
  calculateDecomposerActivity,
  processDecomposition,
  aggregateCorpseBiomass,
} from '../simulation/decomposition';
import {
  MAX_CREATURE_AGE_TICKS,
  CORPSE_DECAY_RATE,
  CORPSE_DECAY_DURATION_TICKS,
} from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getNutrientCapacity } from '../simulation/producer';

describe('Decomposition Functions', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  describe('checkAgeAndStarvation', () => {
    it('should mark creature as dead when energy drops to zero', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 0,
        age: 100,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.corpseDecayTicks).toBe(CORPSE_DECAY_DURATION_TICKS);
    });

    it('should mark creature as dead when energy is negative', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: -5,
        age: 100,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.corpseDecayTicks).toBe(CORPSE_DECAY_DURATION_TICKS);
    });

    it('should mark creature as dead when age exceeds MAX_CREATURE_AGE_TICKS', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        age: MAX_CREATURE_AGE_TICKS,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.corpseDecayTicks).toBe(CORPSE_DECAY_DURATION_TICKS);
    });

    it('should mark creature as dead when age exceeds MAX_CREATURE_AGE_TICKS by large margin', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        age: MAX_CREATURE_AGE_TICKS + 100,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.corpseDecayTicks).toBe(CORPSE_DECAY_DURATION_TICKS);
    });

    it('should not mark young, healthy creature as dead', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        age: 10,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('alive');
      expect(creature.corpseDecayTicks).toBe(0);
    });

    it('should mark creature as dead when both age and energy conditions are met', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 0,
        age: MAX_CREATURE_AGE_TICKS + 50,
        lifecycleState: 'alive',
      });

      checkAgeAndStarvation(creature);

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.corpseDecayTicks).toBe(CORPSE_DECAY_DURATION_TICKS);
    });
  });

  describe('decayCorpse', () => {
    it('should decrement corpseDecayTicks each tick', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      const initialTicks = creature.corpseDecayTicks;
      decayCorpse(creature, world);

      expect(creature.corpseDecayTicks).toBe(initialTicks - 1);
    });

    it('should add nutrients to cell equal to energy × CORPSE_DECAY_RATE', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      const expectedNutrients = 100 * CORPSE_DECAY_RATE;
      decayCorpse(creature, world);

      const cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(expectedNutrients, 5);
    });

    it('should accumulate nutrients over multiple decay ticks', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      const expectedPerTick = 100 * CORPSE_DECAY_RATE;

      // First decay tick
      decayCorpse(creature, world);
      let cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(expectedPerTick, 5);

      // Second decay tick
      decayCorpse(creature, world);
      cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(19, 5);

      // Third decay tick
      decayCorpse(creature, world);
      cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(27.1, 5);
    });

    it('should reach zero corpseDecayTicks after 10 ticks', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      for (let i = 0; i < 10; i++) {
        decayCorpse(creature, world);
      }

      expect(creature.corpseDecayTicks).toBe(0);
    });

    it('should continue decrementing past zero', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 1,
      });

      decayCorpse(creature, world);
      expect(creature.corpseDecayTicks).toBe(0);

      decayCorpse(creature, world);
      expect(creature.corpseDecayTicks).toBe(-1);
    });

    it('should add nutrients to different cell locations', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 25,
        y: 75,
        energy: 50,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      const expectedNutrients = 50 * CORPSE_DECAY_RATE;
      decayCorpse(creature, world);

      const cell = world.getCell(25, 75);
      expect(cell.nutrients).toBeCloseTo(expectedNutrients, 5);
    });

    it('should preserve existing nutrients when adding', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 20 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      const expectedNutrients = 100 * CORPSE_DECAY_RATE;
      decayCorpse(creature, world);

      const cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(20 + expectedNutrients, 5);
    });

    it('should apply toxicity that diminishes radially', () => {
      const world = new World(11, 11);
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 5,
        y: 5,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      decayCorpse(creature, world, CORPSE_DECAY_RATE, 4, 3);

      expect(world.getCell(5, 5).toxicity).toBeCloseTo(2.4);
      expect(world.getCell(6, 5).toxicity).toBeGreaterThan(world.getCell(7, 5).toxicity);
      expect(world.getCell(7, 5).toxicity).toBeGreaterThan(world.getCell(8, 5).toxicity);
      expect(world.getCell(9, 5).toxicity).toBe(0);
    });

    it('wraps radial toxicity across the east/west seam', () => {
      const world = new World(5, 5);
      const creature = new Creature({
        speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x: 0, y: 2, energy: 100,
        lifecycleState: 'dead', corpseDecayTicks: 10,
      });

      decayCorpse(creature, world, 0, 4, 1);

      expect(world.getCell(4, 2).toxicity).toBeGreaterThan(0);
      expect(world.getCell(1, 2).toxicity).toBeGreaterThan(0);
    });

    it('creates a deterministic peak-miasma stage during decay', () => {
      const stageToxicity = (remainingTicks: number) => {
        const world = new World(3, 3);
        const corpse = new Creature({
          speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
          traits: { ...DEFAULT_TRAITS }, x: 1, y: 1, energy: 10,
          lifecycleState: 'dead', corpseDecayTicks: remainingTicks,
        });
        decayCorpse(corpse, world, 0, 1, 0, 30);
        return world.getCell(1, 1).toxicity;
      };

      expect(stageToxicity(30)).toBeCloseTo(0.4);
      expect(stageToxicity(20)).toBeCloseTo(1.5);
      expect(stageToxicity(10)).toBeCloseTo(0.6);
    });

    it('should dissipate existing toxicity deterministically', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { toxicity: 10 });

      dissipateToxicity(world, 0.8);

      expect(world.getCell(1, 1).toxicity).toBe(8);
    });
  });

  describe('recycleNutrients', () => {
    it('should keep solar energy separate from recycled nutrients', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 20, energy: 7 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.energy).toBe(7);
      expect(cell.nutrients).toBe(20);
    });

    it('should cap recycled nutrients at local habitat capacity', () => {
      const world = new World();
      world.setCell(50, 50, {
        nutrients: 1000,
        biome: 'tundra',
        producerArchetype: 'frost-lichen',
      });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(22.5, 5);
    });

    it('should not affect cells with zero nutrients', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 0, energy: 25 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(25, 5);
      expect(cell.nutrients).toBe(0);
    });

    it('should close the material loop without creating renewable energy', () => {
      const world = new World();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 10,
      });

      // Decay corpse (100 energy × 0.1 = 10 nutrients per tick)
      for (let i = 0; i < 10; i++) {
        decayCorpse(creature, world);
      }

      let cell = world.getCell(50, 50);
      expect(cell.nutrients).toBe(getNutrientCapacity(cell));

      recycleNutrients(world);

      cell = world.getCell(50, 50);
      expect(cell.energy).toBe(0);
      expect(cell.nutrients).toBe(getNutrientCapacity(cell));
    });
  });

  describe('calculateDecomposerActivity', () => {
    it('should return 0 when no corpse biomass available', () => {
      const activity = calculateDecomposerActivity(0.5, 0.6, 0, 0);
      expect(activity).toBe(0);
    });

    it('should return 0 with high toxicity despite corpse biomass', () => {
      const activity = calculateDecomposerActivity(0.5, 0.6, 5, 100);
      expect(activity).toBeLessThan(0.01);
    });

    it('should be high at optimal conditions (temp ~0.5, moisture ~0.6, low toxicity)', () => {
      const activity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      expect(activity).toBeGreaterThan(0.8);
    });

    it('should be deterred by extreme cold (temperature near 0)', () => {
      const coldActivity = calculateDecomposerActivity(0.05, 0.6, 0, 100);
      const optimalActivity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      expect(coldActivity).toBeLessThan(optimalActivity * 0.3);
    });

    it('should be deterred by extreme heat (temperature near 1)', () => {
      const heatActivity = calculateDecomposerActivity(0.95, 0.6, 0, 100);
      const optimalActivity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      expect(heatActivity).toBeLessThan(optimalActivity * 0.3);
    });

    it('should be deterred by dry conditions (low moisture)', () => {
      const dryActivity = calculateDecomposerActivity(0.5, 0.05, 0, 100);
      const optimalActivity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      expect(dryActivity).toBeLessThan(optimalActivity * 0.3);
    });

    it('should be deterred by oversaturation (high moisture)', () => {
      const saturatedActivity = calculateDecomposerActivity(0.5, 0.95, 0, 100);
      const optimalActivity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      expect(saturatedActivity).toBeLessThan(optimalActivity);
    });

    it('should increase with more corpse biomass available', () => {
      const scarceBiomass = calculateDecomposerActivity(0.5, 0.6, 0, 10);
      const abundantBiomass = calculateDecomposerActivity(0.5, 0.6, 0, 1000);
      expect(abundantBiomass).toBeGreaterThan(scarceBiomass);
    });

    it('should be deterministic: same inputs always yield same output', () => {
      const result1 = calculateDecomposerActivity(0.5, 0.6, 0.2, 50);
      const result2 = calculateDecomposerActivity(0.5, 0.6, 0.2, 50);
      const result3 = calculateDecomposerActivity(0.5, 0.6, 0.2, 50);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should cap activity at 1.0 regardless of corpse biomass', () => {
      const activity = calculateDecomposerActivity(0.5, 0.6, 0, 10000);
      expect(activity).toBeLessThanOrEqual(1);
    });

    it('should show gradual toxicity inhibition from 0 to high levels', () => {
      const noToxicity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      const lowToxicity = calculateDecomposerActivity(0.5, 0.6, 0.5, 100);
      const highToxicity = calculateDecomposerActivity(0.5, 0.6, 2, 100);
      expect(noToxicity).toBeGreaterThan(lowToxicity);
      expect(lowToxicity).toBeGreaterThan(highToxicity);
    });
  });

  describe('processDecomposition', () => {
    // Helper: processDecomposition mutates a cell copy, so we need to persist changes
    const decomposeAndPersist = (world: World, x: number, y: number, activity: number) => {
      const cell = world.getCell(x, y);
      processDecomposition(cell, activity);
      // Persist the mutated cell back to the world, preserving all fields
      world.setCell(x, y, cell);
    };

    it('should consume corpse biomass and return nutrients', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });

      decomposeAndPersist(world, 1, 1, 0.5);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBeLessThan(100);
      expect(cell.nutrients).toBeGreaterThan(0);
    });

    it('should return nutrients equal to consumed biomass (100% recovery)', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });

      decomposeAndPersist(world, 1, 1, 0.5);

      const cell = world.getCell(1, 1);
      const consumed = 100 - (cell.corpseBiomass ?? 0);
      const nutrientsAdded = cell.nutrients;
      expect(nutrientsAdded).toBeCloseTo(consumed, 5);
    });

    it('should cap nutrients at max capacity', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 10000, nutrients: 0, biome: 'desert' });

      const capacity = getNutrientCapacity(world.getCell(1, 1));
      decomposeAndPersist(world, 1, 1, 1.0);

      const cell = world.getCell(1, 1);
      expect(cell.nutrients).toBeLessThanOrEqual(capacity);
    });

    it('should not process corpses with zero decomposer activity', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });

      decomposeAndPersist(world, 1, 1, 0);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(100);
      expect(cell.nutrients).toBe(0);
    });

    it('should decompose faster with higher activity rate', () => {
      const world1 = new World(3, 3);
      const world2 = new World(3, 3);
      world1.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });
      world2.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });

      decomposeAndPersist(world1, 1, 1, 0.2);
      decomposeAndPersist(world2, 1, 1, 0.8);

      expect((world2.getCell(1, 1).corpseBiomass ?? 0)).toBeLessThan(
        (world1.getCell(1, 1).corpseBiomass ?? 0)
      );
    });

    it('should handle scarcity: no decomposition with empty corpse biomass', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 0, nutrients: 10 });

      decomposeAndPersist(world, 1, 1, 0.8);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(0);
      expect(cell.nutrients).toBe(10);
    });

    it('should handle overload: gradually consume large corpse pile', () => {
      const world = new World(3, 3);
      const initialBiomass = 10000;
      world.setCell(1, 1, { corpseBiomass: initialBiomass, nutrients: 0 });

      // Simulate decomposition over multiple ticks
      for (let i = 0; i < 5; i++) {
        decomposeAndPersist(world, 1, 1, 0.1);
      }

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBeLessThan(initialBiomass);
      expect(cell.corpseBiomass).toBeGreaterThan(0); // Should not fully decompose
    });

    it('should not produce negative nutrients', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: -50, nutrients: 0 });

      decomposeAndPersist(world, 1, 1, 0.5);

      const cell = world.getCell(1, 1);
      expect(cell.nutrients).toBeGreaterThanOrEqual(0);
    });

    it('should be deterministic across multiple calls', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, { corpseBiomass: 100, nutrients: 0 });

      const state1 = { ...world.getCell(1, 1) };
      decomposeAndPersist(world, 1, 1, 0.5);
      const state2 = { ...world.getCell(1, 1) };

      // Reset and repeat
      world.setCell(1, 1, state1);
      decomposeAndPersist(world, 1, 1, 0.5);
      const state3 = { ...world.getCell(1, 1) };

      expect(state2.corpseBiomass).toBe(state3.corpseBiomass);
      expect(state2.nutrients).toBe(state3.nutrients);
    });
  });

  describe('aggregateCorpseBiomass', () => {
    it('should aggregate dead creature energy into cell corpseBiomass', () => {
      const world = new World(3, 3);
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 50,
          lifecycleState: 'dead',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(50);
    });

    it('should accumulate multiple corpses on the same tile', () => {
      const world = new World(3, 3);
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 30,
          lifecycleState: 'dead',
        }),
        new Creature({
          speciesId: 'sp2',
          lineageId: 'l2',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 45,
          lifecycleState: 'dead',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(75);
    });

    it('should distribute corpses across multiple tiles', () => {
      const world = new World(3, 3);
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 0,
          y: 0,
          energy: 20,
          lifecycleState: 'dead',
        }),
        new Creature({
          speciesId: 'sp2',
          lineageId: 'l2',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 2,
          y: 2,
          energy: 35,
          lifecycleState: 'dead',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      expect(world.getCell(0, 0).corpseBiomass).toBe(20);
      expect(world.getCell(2, 2).corpseBiomass).toBe(35);
      expect(world.getCell(1, 1).corpseBiomass).toBe(0);
    });

    it('should ignore alive creatures', () => {
      const world = new World(3, 3);
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 50,
          lifecycleState: 'alive',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(0);
    });

    it('should ignore dead creatures with zero energy', () => {
      const world = new World(3, 3);
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 0,
          lifecycleState: 'dead',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      const cell = world.getCell(1, 1);
      expect(cell.corpseBiomass).toBe(0);
    });

    it('should reset all cells before aggregating', () => {
      const world = new World(3, 3);
      world.setCell(0, 0, { corpseBiomass: 999 });
      world.setCell(1, 1, { corpseBiomass: 888 });

      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 2,
          y: 2,
          energy: 50,
          lifecycleState: 'dead',
        }),
      ];

      aggregateCorpseBiomass(creatures, world);

      expect(world.getCell(0, 0).corpseBiomass).toBe(0);
      expect(world.getCell(1, 1).corpseBiomass).toBe(0);
      expect(world.getCell(2, 2).corpseBiomass).toBe(50);
    });

    it('should be deterministic across multiple calls', () => {
      const creatures = [
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 1,
          y: 1,
          energy: 42,
          lifecycleState: 'dead',
        }),
      ];

      const world1 = new World(3, 3);
      const world2 = new World(3, 3);

      aggregateCorpseBiomass(creatures, world1);
      aggregateCorpseBiomass(creatures, world2);

      expect(world1.getCell(1, 1).corpseBiomass).toBe(
        world2.getCell(1, 1).corpseBiomass
      );
    });
  });

  describe('Decomposition Integration: Biome Equilibria', () => {
    // Helper for integration tests
    const decomposeAndPersist = (world: World, x: number, y: number, activity: number) => {
      const cell = world.getCell(x, y);
      processDecomposition(cell, activity);
      world.setCell(x, y, { corpseBiomass: cell.corpseBiomass, nutrients: cell.nutrients });
    };

    it('should decompose faster in warm, moist biomes (e.g., wetland)', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.6,
        moisture: 0.7,
        toxicity: 0,
        biome: 'wetland',
      });

      const activity = calculateDecomposerActivity(0.6, 0.7, 0, 100);
      decomposeAndPersist(world, 1, 1, activity);

      expect(world.getCell(1, 1).corpseBiomass).toBeLessThan(100);
      expect(world.getCell(1, 1).nutrients).toBeGreaterThan(0);
    });

    it('should decompose slowly in cold biomes (e.g., tundra)', () => {
      const world = new World(3, 3);
      world.setCell(1, 1, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.2,
        moisture: 0.4,
        toxicity: 0,
        biome: 'tundra',
        producerArchetype: 'frost-lichen',
      });

      const activity = calculateDecomposerActivity(0.2, 0.4, 0, 100);
      // Cold conditions should have very low decomposer activity
      expect(activity).toBeLessThan(0.1);

      decomposeAndPersist(world, 1, 1, activity);

      const cell = world.getCell(1, 1);
      // Very low activity means minimal decomposition
      expect(cell.corpseBiomass).toBeGreaterThan(90);
      expect(cell.nutrients).toBeLessThan(10);
    });

    it('should show different equilibria: wetland vs tundra over multiple ticks', () => {
      const wetlandWorld = new World(50, 50);
      const tundraWorld = new World(50, 50);

      // Wetland: warm & moist
      wetlandWorld.setCell(25, 25, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.6,
        moisture: 0.7,
        toxicity: 0,
        biome: 'wetland',
      });

      // Tundra: cold & dry
      tundraWorld.setCell(25, 25, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.2,
        moisture: 0.3,
        toxicity: 0,
        biome: 'tundra',
      });

      // Decompose for 5 ticks
      for (let i = 0; i < 5; i++) {
        const wetlandActivity = calculateDecomposerActivity(0.6, 0.7, 0, (wetlandWorld.getCell(25, 25).corpseBiomass ?? 0));
        decomposeAndPersist(wetlandWorld, 25, 25, wetlandActivity);

        const tundraActivity = calculateDecomposerActivity(0.2, 0.3, 0, (tundraWorld.getCell(25, 25).corpseBiomass ?? 0));
        decomposeAndPersist(tundraWorld, 25, 25, tundraActivity);
      }

      // Wetland should have less corpse biomass left
      expect((wetlandWorld.getCell(25, 25).corpseBiomass ?? 0)).toBeLessThan(
        (tundraWorld.getCell(25, 25).corpseBiomass ?? 0)
      );
    });

    it('should demonstrate nutrient accumulation in scarcity (slow decomposition)', () => {
      const world = new World(50, 50);
      world.setCell(25, 25, {
        corpseBiomass: 2,
        nutrients: 0,
        temperature: 0.1, // Very cold
        moisture: 0.2, // Very dry
        toxicity: 0,
        biome: 'tundra',
      });

      const activity = calculateDecomposerActivity(0.1, 0.2, 0, 2);
      // Very cold, dry conditions with minimal biomass should have low activity
      expect(activity).toBeGreaterThan(0);
      expect(activity).toBeLessThan(1);

      decomposeAndPersist(world, 25, 25, activity);

      const cell = world.getCell(25, 25);
      // With minimal biomass, some decomposition occurs based on activity
      expect(cell.corpseBiomass).toBeLessThanOrEqual(2);
      if (activity > 0 && cell.corpseBiomass < 2) {
        expect(cell.nutrients).toBeGreaterThan(0);
      }
    });

    it('should demonstrate nutrient accumulation in overload (abundant corpses)', () => {
      const world = new World(50, 50);
      world.setCell(25, 25, {
        corpseBiomass: 1000,
        nutrients: 0,
        temperature: 0.5,
        moisture: 0.6,
        toxicity: 0,
        biome: 'grassland',
        producerArchetype: 'ground-cover',
      });

      const cell = world.getCell(25, 25);
      const activity = calculateDecomposerActivity(0.5, 0.6, 0, 1000);
      expect(activity).toBeGreaterThan(0.3); // Good conditions

      // Get capacity before decomposition
      const capacity = getNutrientCapacity(cell);

      // Decompose over multiple ticks
      for (let i = 0; i < 10; i++) {
        decomposeAndPersist(world, 25, 25, activity);
      }

      const resultCell = world.getCell(25, 25);
      // Should still have significant corpse biomass (not all decomposed)
      expect(resultCell.corpseBiomass).toBeGreaterThan(0);
      // Should have accumulated some nutrients (capped by capacity)
      expect(resultCell.nutrients).toBeGreaterThan(0);
      expect(resultCell.nutrients).toBeLessThanOrEqual(capacity);
    });

    it('should show inhibition: toxic cells decompose slowly', () => {
      const cleanWorld = new World(50, 50);
      const toxicWorld = new World(50, 50);

      cleanWorld.setCell(25, 25, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.5,
        moisture: 0.6,
        toxicity: 0,
        biome: 'grassland',
        producerArchetype: 'ground-cover',
      });

      toxicWorld.setCell(25, 25, {
        corpseBiomass: 100,
        nutrients: 0,
        temperature: 0.5,
        moisture: 0.6,
        toxicity: 3,
        biome: 'grassland',
        producerArchetype: 'ground-cover',
      });

      const cleanActivity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
      const toxicActivity = calculateDecomposerActivity(0.5, 0.6, 3, 100);

      // Verify toxic activity is much lower than clean
      expect(toxicActivity).toBeLessThan(cleanActivity);

      // Decompose over many ticks to show accumulation of difference
      for (let i = 0; i < 20; i++) {
        const cleanBiomass = cleanWorld.getCell(25, 25).corpseBiomass ?? 0;
        const toxicBiomass = toxicWorld.getCell(25, 25).corpseBiomass ?? 0;

        // Recalculate activity based on current biomass
        const cleanActivityCurrent = calculateDecomposerActivity(0.5, 0.6, 0, cleanBiomass);
        const toxicActivityCurrent = calculateDecomposerActivity(0.5, 0.6, 3, toxicBiomass);

        decomposeAndPersist(cleanWorld, 25, 25, cleanActivityCurrent);
        decomposeAndPersist(toxicWorld, 25, 25, toxicActivityCurrent);
      }

      // Toxic cell should have more corpse biomass remaining
      expect((toxicWorld.getCell(25, 25).corpseBiomass ?? 0)).toBeGreaterThanOrEqual(
        (cleanWorld.getCell(25, 25).corpseBiomass ?? 0)
      );
    });
  });

  describe('Multi-seed Decomposition Consistency', () => {
    it('should produce consistent results across different world seeds', () => {
      const seeds = [42, 123, 999];
      const results: number[] = [];

      for (const seed of seeds) {
        const world = new World(3, 3, undefined, seed);
        const creatures = [
          new Creature({
            speciesId: 'sp1',
            lineageId: 'l1',
            parentId: null,
            traits: { ...DEFAULT_TRAITS },
            x: 1,
            y: 1,
            energy: 75,
            lifecycleState: 'dead',
          }),
        ];

        aggregateCorpseBiomass(creatures, world);
        const activity = calculateDecomposerActivity(0.5, 0.6, 0, 75);
        processDecomposition(world.getCell(1, 1), activity);

        results.push(world.getCell(1, 1).corpseBiomass ?? 0);
      }

      // All seeds should produce identical decomposition (deterministic)
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });
});
