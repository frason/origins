import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import {
  checkAgeAndStarvation,
  decayCorpse,
  recycleNutrients,
  dissipateToxicity,
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

      expect(world.getCell(5, 5).toxicity).toBe(4);
      expect(world.getCell(6, 5).toxicity).toBeGreaterThan(world.getCell(7, 5).toxicity);
      expect(world.getCell(7, 5).toxicity).toBeGreaterThan(world.getCell(8, 5).toxicity);
      expect(world.getCell(9, 5).toxicity).toBe(0);
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
});
