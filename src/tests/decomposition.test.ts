import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import {
  checkAgeAndStarvation,
  decayCorpse,
  recycleNutrients,
} from '../simulation/decomposition';
import {
  MAX_CREATURE_AGE_TICKS,
  CORPSE_DECAY_RATE,
  CORPSE_DECAY_DURATION_TICKS,
} from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';

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
      expect(cell.nutrients).toBeCloseTo(expectedPerTick * 2, 5);

      // Third decay tick
      decayCorpse(creature, world);
      cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(expectedPerTick * 3, 5);
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
  });

  describe('recycleNutrients', () => {
    it('should convert nutrients to energy at 0.5 ratio', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 100, energy: 0 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(50, 5);
    });

    it('should reduce nutrients after recycling', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 100, energy: 0 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(50, 5);
    });

    it('should process all cells with nutrients', () => {
      const world = new World();
      world.setCell(10, 10, { nutrients: 100, energy: 0 });
      world.setCell(50, 50, { nutrients: 200, energy: 0 });
      world.setCell(90, 90, { nutrients: 50, energy: 0 });

      recycleNutrients(world);

      expect(world.getCell(10, 10).energy).toBeCloseTo(50, 5);
      expect(world.getCell(50, 50).energy).toBeCloseTo(100, 5);
      expect(world.getCell(90, 90).energy).toBeCloseTo(25, 5);
    });

    it('should preserve existing energy when recycling nutrients', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 100, energy: 30 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(30 + 50, 5);
    });

    it('should not affect cells with zero nutrients', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 0, energy: 25 });

      recycleNutrients(world);

      const cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(25, 5);
      expect(cell.nutrients).toBe(0);
    });

    it('should handle multiple recycling cycles', () => {
      const world = new World();
      world.setCell(50, 50, { nutrients: 100, energy: 0 });

      // First cycle: 100 nutrients → 50 energy, 50 nutrients remain
      recycleNutrients(world);
      let cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(50, 5);
      expect(cell.nutrients).toBeCloseTo(50, 5);

      // Second cycle: 50 nutrients → 25 energy, 25 nutrients remain
      recycleNutrients(world);
      cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(75, 5);
      expect(cell.nutrients).toBeCloseTo(25, 5);
    });

    it('should close the energy loop: corpse → nutrients → energy', () => {
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

      // Total nutrients should be 10 × 10 = 100
      let cell = world.getCell(50, 50);
      expect(cell.nutrients).toBeCloseTo(100, 5);

      // Recycle nutrients (100 nutrients × 0.5 = 50 energy)
      recycleNutrients(world);

      cell = world.getCell(50, 50);
      expect(cell.energy).toBeCloseTo(50, 5);
      expect(cell.nutrients).toBeCloseTo(50, 5);
    });
  });
});
