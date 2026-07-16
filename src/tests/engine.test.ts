import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import {
  createEngine,
  tickEngine,
  runEngine,
  EngineState,
  SimEvent,
} from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getProducerTraits } from '../simulation/producerTypes';

describe('Simulation Engine', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  afterEach(() => {
    Creature.resetIdCounter();
  });

  describe('createEngine', () => {
    it('should initialize engine with seed and creatures', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine = createEngine(12345, [creature]);

      expect(engine.seed).toBe(12345);
      expect(engine.tick).toBe(0);
      expect(engine.creatures.length).toBe(1);
      expect(engine.events.length).toBe(0);
      expect(engine.world).toBeDefined();
    });

    it('should deep copy initial creatures', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine = createEngine(12345, [creature]);

      // Modify the original creature
      creature.energy = 50;

      // Engine state should be unchanged
      expect(engine.creatures[0].energy).toBe(100);
    });

    it('should create world with correct dimensions', () => {
      const engine = createEngine(12345, [], 150, 75);

      expect(engine.world.width).toBe(150);
      expect(engine.world.height).toBe(75);
    });

    it('should default to WORLD_WIDTH and WORLD_HEIGHT', () => {
      const engine = createEngine(12345, []);

      expect(engine.world.width).toBe(100);
      expect(engine.world.height).toBe(100);
    });
  });

  describe('tickEngine', () => {
    it('should not crash with zero creatures', () => {
      const engine = createEngine(12345, []);

      const newEngine = tickEngine(engine);

      expect(newEngine.tick).toBe(1);
      expect(newEngine.creatures.length).toBe(0);
      expect(newEngine.events.length).toBe(0);
    });

    it('should increment tick counter', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      let engine = createEngine(12345, [creature]);
      expect(engine.tick).toBe(0);

      engine = tickEngine(engine);
      expect(engine.tick).toBe(1);

      engine = tickEngine(engine);
      expect(engine.tick).toBe(2);
    });

    it('should not modify original state (immutability)', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const originalEngine = createEngine(12345, [creature]);
      const originalCreatureId = originalEngine.creatures[0].id;

      const newEngine = tickEngine(originalEngine);

      // Original should be unchanged
      expect(originalEngine.tick).toBe(0);
      expect(originalEngine.creatures[0].id).toBe(originalCreatureId);
      expect(originalEngine.creatures.length).toBe(1);
    });

    it('should allow herbivore to feed on producer biomass and gain energy', () => {
      const herbivore = new Creature({
        speciesId: 'species_herbivore',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size: 1 },
        x: 50,
        y: 50,
        energy: 50,
      });

      const engine = createEngine(12345, [herbivore]);

      // Add producer biomass at the herbivore's location; zero energy prevents
      // growProducers from adding biomass before feeding, keeping the expected calc exact
      const cell = engine.world.getCell(50, 50);
      engine.world.setCell(50, 50, {
        ...cell,
        producerBiomass: 20,
        energy: 0,
      });

      const newEngine = tickEngine(engine);

      const producerTraits = getProducerTraits(cell.producerArchetype);
      const consumedBiomass = 20 * (1 - producerTraits.defense);
      const expectedEnergyGain = consumedBiomass * 0.8 * producerTraits.energyDensity;
      const metabolicCost =
        2 * // BASE_METABOLISM
        1 * // size
        1; // metabolism multiplier
      const expectedEnergy = 50 + expectedEnergyGain - metabolicCost;

      expect(newEngine.creatures[0].energy).toBeCloseTo(expectedEnergy, 0);
      expect(newEngine.world.getCell(50, 50).producerBiomass).toBeCloseTo(
        20 - consumedBiomass,
        5
      );
    });

    it('should remove dead creatures after full decomposition', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 1, // Will die from starvation
        age: 0,
        lifecycleState: 'alive',
      });

      let engine = createEngine(12345, [creature]);

      // Tick until the creature is fully decomposed
      for (let i = 0; i < 15; i++) {
        engine = tickEngine(engine);

        if (engine.creatures.length === 0) {
          break; // Creature has been removed
        }
      }

      // After 15 ticks, creature should be fully decomposed and removed
      expect(engine.creatures.length).toBe(0);
    });

    it('should be deterministic: same seed produces same results', () => {
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      Creature.resetIdCounter();
      const engine1 = createEngine(42, [creature1]);
      const state1 = tickEngine(engine1);

      Creature.resetIdCounter();
      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });
      const engine2 = createEngine(42, [creature2]);
      const state2 = tickEngine(engine2);

      // Both should have the same tick, creature count, and events
      expect(state1.tick).toBe(state2.tick);
      expect(state1.creatures.length).toBe(state2.creatures.length);
      expect(state1.events.length).toBe(state2.events.length);

      // Energy should be the same
      if (state1.creatures.length > 0 && state2.creatures.length > 0) {
        expect(state1.creatures[0].energy).toBeCloseTo(state2.creatures[0].energy, 5);
      }
    });

    it('should log birth events during reproduction', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1 },
        x: 50,
        y: 50,
        energy: 300, // Enough to reproduce
      });

      const engine = createEngine(12345, [creature]);

      // Add producer biomass to keep creature alive and allow reproduction
      engine.world.setCell(50, 50, { producerBiomass: 100 });

      const newEngine = tickEngine(engine);

      // Should have birth event
      const birthEvents = newEngine.events.filter((e) => e.type === 'birth');
      expect(birthEvents.length).toBeGreaterThan(0);
      expect(birthEvents[0].tick).toBe(0);
      expect(birthEvents[0].speciesId).toBe('species_1');
    });

    it('should age creatures each tick', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 500, // Plenty of energy to survive
        age: 0,
      });

      let engine = createEngine(12345, [creature]);

      expect(engine.creatures[0].age).toBe(0);

      engine = tickEngine(engine);
      expect(engine.creatures[0].age).toBe(1);

      engine = tickEngine(engine);
      expect(engine.creatures[0].age).toBe(2);
    });

    it('should apply metabolism each tick', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 2 }, // Larger size = higher metabolism
        x: 50,
        y: 50,
        energy: 200,
      });

      const engine = createEngine(12345, [creature]);
      // Zero out cell so producer growth doesn't cause incidental feeding
      const cell = engine.world.getCell(50, 50);
      engine.world.setCell(50, 50, { ...cell, producerBiomass: 0, energy: 0 });
      const newEngine = tickEngine(engine);

      // Metabolism cost = BASE_METABOLISM * size * metabolism
      // = 2 * 2 * 1 = 4
      const expectedEnergy = 200 - 4;

      expect(newEngine.creatures[0].energy).toBeCloseTo(expectedEnergy, 0);
    });
  });

  describe('runEngine', () => {
    it('should run multiple ticks', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 1000,
      });

      const engine = createEngine(12345, [creature]);
      const newEngine = runEngine(engine, 5);

      expect(newEngine.tick).toBe(5);
    });

    it('should be equivalent to calling tickEngine multiple times', () => {
      Creature.resetIdCounter();
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 500,
      });
      const engine1 = createEngine(99, [creature1]);

      Creature.resetIdCounter();
      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 500,
      });
      const engine2 = createEngine(99, [creature2]);

      // Run 10 ticks with runEngine
      const state1 = runEngine(engine1, 10);

      // Run 10 ticks with sequential tickEngine calls
      let state2 = engine2;
      for (let i = 0; i < 10; i++) {
        state2 = tickEngine(state2);
      }

      expect(state1.tick).toBe(state2.tick);
      expect(state1.tick).toBe(10);
      expect(state1.creatures.length).toBe(state2.creatures.length);

      // Event logs should match
      expect(state1.events.length).toBe(state2.events.length);
    });

    it('should handle zero ticks', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine = createEngine(12345, [creature]);
      const newEngine = runEngine(engine, 0);

      expect(newEngine.tick).toBe(0);
      expect(newEngine.creatures.length).toBe(1);
    });

    it('should accumulate events across multiple ticks', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1 },
        x: 50,
        y: 50,
        energy: 500, // Enough to reproduce and survive
      });

      const engine = createEngine(12345, [creature]);
      engine.world.setCell(50, 50, { producerBiomass: 100 });

      const newEngine = runEngine(engine, 5);

      expect(newEngine.tick).toBe(5);
      // Should have accumulated events across ticks
      expect(newEngine.events).toBeDefined();
      expect(Array.isArray(newEngine.events)).toBe(true);
    });
  });

  describe('Event logging', () => {
    it('should log death events', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 1, // Will die
      });

      let engine = createEngine(12345, [creature]);

      // Run ticks until creature is removed
      for (let i = 0; i < 15; i++) {
        engine = tickEngine(engine);
      }

      const deathEvents = engine.events.filter((e) => e.type === 'death');
      expect(deathEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve event history', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1 },
        x: 50,
        y: 50,
        energy: 400,
      });

      let engine = createEngine(12345, [creature]);
      engine.world.setCell(50, 50, { producerBiomass: 100 });

      const tick1 = tickEngine(engine);
      const tick2 = tickEngine(tick1);

      // Events should accumulate
      expect(tick2.events.length).toBeGreaterThanOrEqual(tick1.events.length);
    });
  });

  describe('Producer growth integration', () => {
    it('should grow producers each tick', () => {
      const engine = createEngine(12345, []);

      const cellBefore = engine.world.getCell(50, 50);
      const biomassBefore = cellBefore.producerBiomass;

      const newEngine = tickEngine(engine);

      const cellAfter = newEngine.world.getCell(50, 50);
      const biomassAfter = cellAfter.producerBiomass;

      // Should have grown (assuming solar energy available at center)
      expect(biomassAfter).toBeGreaterThan(biomassBefore);
    });
  });

  describe('Creature interaction', () => {
    it('should handle multiple creatures in same cell', () => {
      const herbivore = new Creature({
        speciesId: 'herbivore_species',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 100,
      });

      const carnivore = new Creature({
        speciesId: 'carnivore_species',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 100,
      });

      const engine = createEngine(12345, [herbivore, carnivore]);

      expect(engine.creatures.length).toBe(2);

      const newEngine = tickEngine(engine);

      // Both creatures should still be in simulation (though herbivore may have been eaten)
      // This test just ensures no crash occurs
      expect(newEngine.creatures).toBeDefined();
    });
  });
});
