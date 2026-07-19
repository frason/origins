import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import {
  applyMetabolism,
  feedOnProducer,
  feedOnCreature,
  feedOnCorpse,
  canReproduce,
  payReproductionCost,
} from '../simulation/energy';
import {
  BASE_METABOLISM,
  FEEDING_EFFICIENCY,
  REPRODUCTION_ENERGY_THRESHOLD,
  REPRODUCTION_ENERGY_COST,
} from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('Energy Functions', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  describe('applyMetabolism', () => {
    it('should deduct metabolic cost from creature energy', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const expectedCost = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      const expectedEnergy = 100 - expectedCost;

      applyMetabolism(creature);

      expect(creature.energy).toBeCloseTo(expectedEnergy, 5);
      expect(creature.lifecycleState).toBe('alive');
    });

    it('should calculate metabolism correctly with size multiplier', () => {
      const largeTraits = { ...DEFAULT_TRAITS, size: 2 };
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: largeTraits,
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const expectedCost = BASE_METABOLISM * 2 * largeTraits.metabolism;
      applyMetabolism(creature);

      expect(creature.energy).toBeCloseTo(100 - expectedCost, 5);
    });

    it('should calculate metabolism correctly with metabolism multiplier', () => {
      const highMetabTraits = { ...DEFAULT_TRAITS, metabolism: 2 };
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: highMetabTraits,
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const expectedCost = BASE_METABOLISM * DEFAULT_TRAITS.size * 2;
      applyMetabolism(creature);

      expect(creature.energy).toBeCloseTo(100 - expectedCost, 5);
    });

    it('should kill creature when energy reaches zero', () => {
      const metabolicCost = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: metabolicCost,
        lifecycleState: 'alive',
      });

      applyMetabolism(creature);

      expect(creature.energy).toBe(0);
      expect(creature.lifecycleState).toBe('dead');
    });

    it('should kill creature when energy goes negative', () => {
      const metabolicCost = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: metabolicCost / 2, // Not enough energy
        lifecycleState: 'alive',
      });

      applyMetabolism(creature);

      expect(creature.energy).toBe(0);
      expect(creature.lifecycleState).toBe('dead');
    });

    it('should accumulate metabolism cost over multiple ticks', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 1000,
        lifecycleState: 'alive',
      });

      const costPerTick = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      const initialEnergy = 1000;

      applyMetabolism(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - costPerTick, 5);

      applyMetabolism(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - 2 * costPerTick, 5);

      applyMetabolism(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - 3 * costPerTick, 5);
    });

    it('should not further reduce energy if already dead', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 0,
        lifecycleState: 'dead',
      });

      applyMetabolism(creature);

      expect(creature.energy).toBe(0);
      expect(creature.lifecycleState).toBe('dead');
    });
  });

  describe('feedOnProducer', () => {
    it('should transfer biomass from cell to creature', () => {
      const world = new World();
      world.setCell(5, 5, { producerBiomass: 10 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 5,
        y: 5,
        energy: 100,
        lifecycleState: 'alive',
      });

      const energyGained = feedOnProducer(creature, world.getCell(5, 5), world, 5, 5);

      expect(energyGained).toBeCloseTo(10 * FEEDING_EFFICIENCY, 5);
      expect(creature.energy).toBeCloseTo(100 + 10 * FEEDING_EFFICIENCY, 5);
    });

    it('should reduce cell biomass to zero after feeding', () => {
      const world = new World();
      world.setCell(5, 5, { producerBiomass: 10 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 5,
        y: 5,
        energy: 100,
      });

      feedOnProducer(creature, world.getCell(5, 5), world, 5, 5);

      const updatedCell = world.getCell(5, 5);
      expect(updatedCell.producerBiomass).toBe(0);
    });

    it('should apply feeding efficiency correctly', () => {
      const world = new World();
      const biomass = 50;
      world.setCell(0, 0, { producerBiomass: biomass });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
      });

      const energyGained = feedOnProducer(creature, world.getCell(0, 0), world, 0, 0);

      expect(energyGained).toBeCloseTo(biomass * FEEDING_EFFICIENCY, 5);
      expect(creature.energy).toBeCloseTo(100 + biomass * FEEDING_EFFICIENCY, 5);
    });

    it('should return zero when cell has no biomass', () => {
      const world = new World();
      world.setCell(5, 5, { producerBiomass: 0 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 5,
        y: 5,
        energy: 100,
      });

      const initialEnergy = creature.energy;
      const energyGained = feedOnProducer(creature, world.getCell(5, 5), world, 5, 5);

      expect(energyGained).toBe(0);
      expect(creature.energy).toBe(initialEnergy);
    });

    it('should preserve other cell properties', () => {
      const world = new World();
      world.setCell(5, 5, {
        energy: 10,
        nutrients: 20,
        producerBiomass: 15,
        toxicity: 0.5,
      });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 5,
        y: 5,
        energy: 100,
      });

      feedOnProducer(creature, world.getCell(5, 5), world, 5, 5);

      const updatedCell = world.getCell(5, 5);
      expect(updatedCell.energy).toBe(10);
      expect(updatedCell.nutrients).toBe(20);
      expect(updatedCell.toxicity).toBe(0.5);
      expect(updatedCell.producerBiomass).toBe(0);
    });

    it('should handle fractional biomass', () => {
      const world = new World();
      world.setCell(3, 3, { producerBiomass: 7.5 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 3,
        y: 3,
        energy: 100,
      });

      const energyGained = feedOnProducer(creature, world.getCell(3, 3), world, 3, 3);

      expect(energyGained).toBeCloseTo(7.5 * FEEDING_EFFICIENCY, 5);
    });

    it('should handle multiple feedings from different cells', () => {
      const world = new World();
      world.setCell(1, 1, { producerBiomass: 10 });
      world.setCell(2, 2, { producerBiomass: 20 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 100,
      });

      const energy1 = feedOnProducer(creature, world.getCell(1, 1), world, 1, 1);
      const energy2 = feedOnProducer(creature, world.getCell(2, 2), world, 2, 2);

      expect(creature.energy).toBeCloseTo(
        100 + (10 * FEEDING_EFFICIENCY + 20 * FEEDING_EFFICIENCY),
        5
      );
      expect(energy1).toBeCloseTo(10 * FEEDING_EFFICIENCY, 5);
      expect(energy2).toBeCloseTo(20 * FEEDING_EFFICIENCY, 5);
    });
  });

  describe('feedOnCreature', () => {
    it('should transfer prey energy to predator', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 50,
        lifecycleState: 'alive',
      });

      const energyTransferred = feedOnCreature(predator, prey);

      expect(energyTransferred).toBeCloseTo(50 * FEEDING_EFFICIENCY, 5);
      expect(predator.energy).toBeCloseTo(100 + 50 * FEEDING_EFFICIENCY, 5);
    });

    it('should mark prey as dead', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 50,
        lifecycleState: 'alive',
      });

      feedOnCreature(predator, prey);

      expect(prey.lifecycleState).toBe('dead');
    });

    it('should apply feeding efficiency', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 200,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 100,
        lifecycleState: 'alive',
      });

      const energyTransferred = feedOnCreature(predator, prey);

      expect(energyTransferred).toBe(100 * FEEDING_EFFICIENCY);
      expect(predator.energy).toBeCloseTo(200 + 100 * FEEDING_EFFICIENCY, 5);
    });

    it('should handle predator eating multiple prey', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const prey1 = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 30,
        lifecycleState: 'alive',
      });

      const prey2 = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 2,
        y: 2,
        energy: 40,
        lifecycleState: 'alive',
      });

      const energy1 = feedOnCreature(predator, prey1);
      const energy2 = feedOnCreature(predator, prey2);

      expect(energy1).toBeCloseTo(30 * FEEDING_EFFICIENCY, 5);
      expect(energy2).toBeCloseTo(40 * FEEDING_EFFICIENCY, 5);
      expect(predator.energy).toBeCloseTo(
        100 + 30 * FEEDING_EFFICIENCY + 40 * FEEDING_EFFICIENCY,
        5
      );
      expect(prey1.lifecycleState).toBe('dead');
      expect(prey2.lifecycleState).toBe('dead');
    });

    it('should work with zero-energy prey', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 0,
        lifecycleState: 'alive',
      });

      const energyTransferred = feedOnCreature(predator, prey);

      expect(energyTransferred).toBe(0);
      expect(predator.energy).toBe(100);
      expect(prey.lifecycleState).toBe('dead');
    });

    it('should remove consumed energy from prey', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 1,
        y: 1,
        energy: 75,
        lifecycleState: 'alive',
      });

      feedOnCreature(predator, prey);

      expect(prey.energy).toBe(0);
    });
  });

  describe('feedOnCorpse', () => {
    it('should transfer energy and shorten the corpse lifetime', () => {
      const scavenger = new Creature({
        speciesId: 'scavenger',
        lineageId: 'scavenger_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
        x: 10,
        y: 10,
        energy: 20,
      });
      const corpse = new Creature({
        speciesId: 'prey',
        lineageId: 'prey_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 10,
        y: 10,
        energy: 100,
        lifecycleState: 'dead',
        corpseDecayTicks: 20,
      });

      const gained = feedOnCorpse(scavenger, corpse, 0.8, 0.25);

      expect(gained).toBe(20);
      expect(scavenger.energy).toBe(40);
      expect(corpse.energy).toBe(75);
      expect(corpse.corpseDecayTicks).toBe(17);
    });
  });

  describe('canReproduce', () => {
    it('should return true when energy is at threshold and alive', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD,
        lifecycleState: 'alive',
      });

      expect(canReproduce(creature)).toBe(true);
    });

    it('should return true when energy exceeds threshold and alive', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD + 50,
        lifecycleState: 'alive',
      });

      expect(canReproduce(creature)).toBe(true);
    });

    it('should return false when energy is below threshold', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD - 1,
        lifecycleState: 'alive',
      });

      expect(canReproduce(creature)).toBe(false);
    });

    it('should return false when energy is zero', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 0,
        lifecycleState: 'alive',
      });

      expect(canReproduce(creature)).toBe(false);
    });

    it('should return false when dead despite sufficient energy', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD + 100,
        lifecycleState: 'dead',
      });

      expect(canReproduce(creature)).toBe(false);
    });

    it('should return false when in corpse state despite sufficient energy', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD + 100,
        lifecycleState: 'corpse',
      });

      expect(canReproduce(creature)).toBe(false);
    });

    it('should handle high-energy creatures correctly', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 1000,
        lifecycleState: 'alive',
      });

      expect(canReproduce(creature)).toBe(true);
    });

    it('requires maturity when a minimum age is configured', () => {
      const creature = new Creature({
        speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x: 0, y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD, age: 7,
      });
      expect(canReproduce(creature, REPRODUCTION_ENERGY_THRESHOLD, 8, 6)).toBe(false);
      creature.age = 8;
      expect(canReproduce(creature, REPRODUCTION_ENERGY_THRESHOLD, 8, 6)).toBe(true);
    });

    it('requires the individual cooldown after a birth', () => {
      const creature = new Creature({
        speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x: 0, y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD, age: 12, lastReproductionAge: 8,
      });
      expect(canReproduce(creature, REPRODUCTION_ENERGY_THRESHOLD, 8, 6)).toBe(false);
      creature.age = 14;
      expect(canReproduce(creature, REPRODUCTION_ENERGY_THRESHOLD, 8, 6)).toBe(true);
    });
  });

  describe('payReproductionCost', () => {
    it('should deduct reproduction energy cost', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 300,
        lifecycleState: 'alive',
      });

      const initialEnergy = creature.energy;
      payReproductionCost(creature);

      expect(creature.energy).toBe(initialEnergy - REPRODUCTION_ENERGY_COST);
    });

    it('should deduct cost exactly once', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 500,
        lifecycleState: 'alive',
      });

      payReproductionCost(creature);

      expect(creature.energy).toBe(500 - REPRODUCTION_ENERGY_COST);
      expect(creature.lifecycleState).toBe('alive');
    });

    it('should never make energy negative when the requested cost is too high', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_COST / 2,
        lifecycleState: 'alive',
      });

      const paid = payReproductionCost(creature);

      expect(paid).toBe(REPRODUCTION_ENERGY_COST / 2);
      expect(creature.energy).toBe(0);
    });

    it('should allow multiple reproduction cost deductions', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_COST * 3,
        lifecycleState: 'alive',
      });

      const initialEnergy = REPRODUCTION_ENERGY_COST * 3;

      payReproductionCost(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - REPRODUCTION_ENERGY_COST, 5);

      payReproductionCost(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - 2 * REPRODUCTION_ENERGY_COST, 5);

      payReproductionCost(creature);
      expect(creature.energy).toBeCloseTo(initialEnergy - 3 * REPRODUCTION_ENERGY_COST, 5);
    });

    it('should work with high energy values', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100000,
        lifecycleState: 'alive',
      });

      payReproductionCost(creature);

      expect(creature.energy).toBe(100000 - REPRODUCTION_ENERGY_COST);
    });

    it('should maintain lifecycle state', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 300,
        lifecycleState: 'alive',
      });

      payReproductionCost(creature);

      expect(creature.lifecycleState).toBe('alive');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle metabolism before feeding', () => {
      const world = new World();
      world.setCell(0, 0, { producerBiomass: 20 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 50,
        lifecycleState: 'alive',
      });

      // Apply metabolism
      applyMetabolism(creature);
      const metabolismCost = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      expect(creature.energy).toBeCloseTo(50 - metabolismCost, 5);

      // Feed on producer
      const energyGained = feedOnProducer(creature, world.getCell(0, 0), world, 0, 0);
      expect(creature.energy).toBeCloseTo(50 - metabolismCost + 20 * FEEDING_EFFICIENCY, 5);
    });

    it('should allow reproduction after feeding', () => {
      const world = new World();
      world.setCell(0, 0, { producerBiomass: 300 });

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: 'alive',
      });

      // Cannot reproduce initially
      expect(canReproduce(creature)).toBe(false);

      // Feed enough to reach threshold
      feedOnProducer(creature, world.getCell(0, 0), world, 0, 0);

      // Now can reproduce
      expect(canReproduce(creature)).toBe(true);

      // Pay cost
      payReproductionCost(creature);
      expect(creature.energy).toBe(100 + 300 * FEEDING_EFFICIENCY - REPRODUCTION_ENERGY_COST);
    });

    it('should handle creature lifecycle: birth -> growth -> reproduction -> death', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: REPRODUCTION_ENERGY_THRESHOLD + 50,
        lifecycleState: 'alive',
      });

      // Can reproduce (born with energy)
      expect(canReproduce(creature)).toBe(true);

      // Pay reproduction cost
      payReproductionCost(creature);
      expect(canReproduce(creature)).toBe(false);

      // Metabolism costs more energy
      const metabolismCost = BASE_METABOLISM * DEFAULT_TRAITS.size * DEFAULT_TRAITS.metabolism;
      // Need enough iterations to drain remaining energy
      for (let i = 0; i < 200; i++) {
        applyMetabolism(creature);
        if (creature.lifecycleState === 'dead') break;
      }

      expect(creature.lifecycleState).toBe('dead');
      expect(creature.energy).toBe(0);
    });

    it('should handle predator-prey energy flow', () => {
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 0,
        y: 0,
        energy: 50,
        lifecycleState: 'alive',
      });

      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 1,
        y: 1,
        energy: 200,
        lifecycleState: 'alive',
      });

      expect(canReproduce(predator)).toBe(false);
      expect(canReproduce(prey)).toBe(true);

      // Predator hunts prey
      feedOnCreature(predator, prey);

      expect(canReproduce(predator)).toBe(true);
      expect(prey.lifecycleState).toBe('dead');
    });
  });
});
