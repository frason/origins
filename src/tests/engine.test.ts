import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import {
  createEngine,
  tickEngine,
  runEngine,
  hasLocalReproductiveResources,
  EngineState,
  SimEvent,
} from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getProducerTraits } from '../simulation/producerTypes';
import { CORPSE_DECAY_DURATION_TICKS } from '../utils/constants';

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
    it('requires recurring carrion before starter scavengers reproduce', () => {
      const scavenger = new Creature({
        speciesId: 'scavenger', lineageId: 'scavenger', parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'scavenger' },
        x: 2, y: 2, energy: 180,
      });
      const corpse = new Creature({
        speciesId: 'prey', lineageId: 'scavenger_starter_carrion', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x: 2, y: 3, energy: 80,
        lifecycleState: 'dead', corpseDecayTicks: 20,
      });
      const world = new World(5, 5);
      const index = new CreatureSpatialIndex([scavenger, corpse]);

      expect(hasLocalReproductiveResources(scavenger, world, index))
        .toBe(false);
      corpse.lineageId = 'naturally_generated_carrion';
      expect(hasLocalReproductiveResources(scavenger, world, index))
        .toBe(true);
    });

    it('should not crash with zero creatures', () => {
      const engine = createEngine(12345, []);

      const newEngine = tickEngine(engine);

      expect(newEngine.tick).toBe(1);
      expect(newEngine.creatures.length).toBe(0);
      expect(newEngine.events.length).toBe(0);
    });

    it('leaves a small edible carcass when a creature starves', () => {
      const creature = new Creature({
        speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x: 2, y: 2, energy: 0,
      });
      const engine = createEngine(12345, [creature], 5, 5, {
        producerGrowthRate: 0,
        corpseDecayRate: 0,
        corpseToxicityPerTick: 0,
        minimumCarrionEnergy: 24,
      });

      const next = tickEngine(engine);

      expect(next.creatures[0]).toMatchObject({
        lifecycleState: 'dead',
        corpseDecayTicks: CORPSE_DECAY_DURATION_TICKS - 1,
        energy: 24,
      });
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
      for (let i = 0; i < CORPSE_DECAY_DURATION_TICKS + 5; i++) {
        engine = tickEngine(engine);

        if (engine.creatures.length === 0) {
          break; // Creature has been removed
        }
      }

      // After the configured decay duration, the corpse is removed.
      expect(engine.creatures.length).toBe(0);
    });

    it('should keep metabolism deaths as visible corpses for the configured duration', () => {
      const creature = new Creature({
        speciesId: 'short-lived',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 1,
      });
      const engine = createEngine(12345, [creature], 100, 100, {
        corpseDecayDurationTicks: 40,
        monocultureMortalityPenalty: 0,
      });

      const next = tickEngine(engine);

      expect(next.creatures).toHaveLength(1);
      expect(next.creatures[0].lifecycleState).toBe('dead');
      expect(next.creatures[0].corpseDecayTicks).toBe(39);
      expect(next.events).toContainEqual(
        expect.objectContaining({
          type: 'death',
          creatureId: next.creatures[0].id,
          deathCause: 'starvation',
        })
      );
    });

    it('should preserve and log prey killed during feeding', () => {
      const predator = new Creature({
        speciesId: 'predator',
        lineageId: 'predator_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 20,
      });
      const prey = new Creature({
        speciesId: 'prey',
        lineageId: 'prey_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 20,
      });
      const engine = createEngine(12345, [predator, prey], 100, 100, {
        corpseDecayDurationTicks: 25,
        monocultureMortalityPenalty: 0,
      });

      const next = tickEngine(engine);
      const corpse = next.creatures.find((candidate) => candidate.speciesId === 'prey');

      expect(corpse?.lifecycleState).toBe('dead');
      expect(corpse?.corpseDecayTicks).toBe(24);
      expect(next.events).toContainEqual(
        expect.objectContaining({
          type: 'death',
          creatureId: corpse?.id,
          speciesId: 'prey',
          lineageId: 'prey_root',
          deathCause: 'predation',
        })
      );
    });

    it('does not let a well-fed predator kill surplus prey', () => {
      const predator = new Creature({
        speciesId: 'predator',
        lineageId: 'predator_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 180,
      });
      const prey = new Creature({
        speciesId: 'prey',
        lineageId: 'prey_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 50,
      });
      const engine = createEngine(12345, [predator, prey], 100, 100, {
        baseMetabolism: 0,
        predationHungerThresholdShare: 0.75,
        monocultureMortalityPenalty: 0,
      });

      const next = tickEngine(engine);
      expect(next.events.some((event) => event.deathCause === 'predation')).toBe(false);
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
        age: 8,
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
      expect(birthEvents[0].lineageId).toBeTruthy();
    });

    it('records reproducible ancestry and trait changes for mutations', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 50,
        y: 50,
        energy: 300,
        age: 8,
      });
      const engine = createEngine(12345, [creature], 100, 100, {
        defaultMutationRate: 1,
        monocultureMortalityPenalty: 0,
      });
      engine.world.setCell(50, 50, { producerBiomass: 100 });
      const next = tickEngine(engine);
      const mutation = next.events.find((event) => event.type === 'mutation');

      expect(mutation?.parentLineageId).toBe('lineage_root');
      expect(mutation?.lineageId).toBeTruthy();
      expect(mutation?.lineageId).not.toBe(mutation?.parentLineageId);
      // After DecisionIntent optimization, RNG sequence changed slightly but mutations still occur.
      // Expect at least 1 trait change (mutations should occur with 100% mutation rate)
      expect(mutation?.traitChanges).toBeDefined();
      expect(mutation?.traitChanges?.length).toBeGreaterThan(0);
      expect(mutation?.traitChanges?.[0].before).not.toBe(mutation?.traitChanges?.[0].after);
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
      const newEngine = tickEngine(engine, { reproductionEnergyThreshold: 1000 });

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

    it('should emit extinction events with affectedRegion when species dies', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 42,
        y: 37,
        energy: 1, // Will die quickly
      });

      let engine = createEngine(12345, [creature], 100, 100, {
        maxCreatureAgeTicks: 2,
        corpseDecayDurationTicks: 1,
        baseMetabolism: 10, // High metabolism to ensure starvation
      });

      // Run ticks until species is extinct
      for (let i = 0; i < 20; i++) {
        engine = tickEngine(engine);
      }

      const deathEvents = engine.events.filter((e) => e.type === 'death');
      expect(deathEvents.length).toBeGreaterThanOrEqual(1);

      const extinctionEvents = engine.events.filter((e) => e.type === 'extinction');
      expect(extinctionEvents.length).toBeGreaterThanOrEqual(1);

      // Verify extinction event has affectedRegion
      const extinctionEvent = extinctionEvents[0];
      expect(extinctionEvent).toHaveProperty('affectedRegion');
      expect(extinctionEvent.affectedRegion).toBeDefined();
      if (extinctionEvent.affectedRegion) {
        expect(extinctionEvent.affectedRegion).toHaveProperty('x');
        expect(extinctionEvent.affectedRegion).toHaveProperty('y');
        expect(extinctionEvent.affectedRegion.x).toBe(42);
        expect(extinctionEvent.affectedRegion.y).toBe(37);
      }
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

  describe('Stalking trait preservation (regression test)', () => {
    it('should NOT permanently mutate predator genetic traits during stalking across multiple ticks', () => {
      // Create a predator with known speed and metabolism
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'lineage_pred',
        parentId: null,
        traits: {
          ...DEFAULT_TRAITS,
          energyStrategy: 'carnivore',
          speed: 2.0,
          metabolism: 1.0,
          visionRange: 15,
        },
        x: 50,
        y: 50,
        energy: 1000, // High energy to survive multiple ticks of stalking
      });

      // Create a prey creature close to the predator so stalking might activate
      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'lineage_prey',
        parentId: null,
        traits: {
          ...DEFAULT_TRAITS,
          energyStrategy: 'herbivore',
          speed: 1.0,
        },
        x: 56, // 6 cells away, within vision range
        y: 50,
        energy: 200,
      });

      let engine = createEngine(8888, [predator, prey]);

      // Find the predator in the engine state (it gets a new ID during deep copy)
      let predatorInEngine = engine.creatures.find(
        (c) => c.speciesId === 'predator_species' && c.lifecycleState === 'alive'
      );
      expect(predatorInEngine).toBeDefined();
      expect(predatorInEngine!.traits.speed).toBe(2.0);
      expect(predatorInEngine!.traits.metabolism).toBe(1.0);

      const predatorId = predatorInEngine!.id;

      // Run multiple ticks and verify traits remain stable
      for (let tick = 0; tick < 3; tick++) {
        engine = tickEngine(engine);
        const pred = engine.creatures.find(
          (c) => c.id === predatorId && c.lifecycleState === 'alive'
        );
        if (pred) {
          // Traits should never be modified by stalking behavior
          expect(pred.traits.speed).toBe(2.0);
          expect(pred.traits.metabolism).toBe(1.0);
        }
      }
    });
  });

  describe('Sound ecology integration', () => {
    it('prey flight: herbivore detects threat sound and emits sound-flee event', () => {
      // Create a listening herbivore with good hearing at one location
      const listenerHerbivore = new Creature({
        speciesId: 'herbivore_listener',
        lineageId: 'herbivore_listener_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', hearingRange: 50 },
        x: 55,
        y: 50,
        energy: 200,
      });

      // Create a victim herbivore at another location
      const victimHerbivore = new Creature({
        speciesId: 'herbivore_victim',
        lineageId: 'herbivore_victim_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 200,
      });

      // Create a predator that is hungry (low energy) to trigger attack
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 30, // Very low energy - will be hungry
      });

      let engine = createEngine(42, [listenerHerbivore, victimHerbivore, predator], 100, 100, {
        predationHungerThresholdShare: 0.9, // Very hungry at 90% threshold
      });

      // Tick 1: predator (hungry) should attack victim herbivore at same location (creating attack/distress sounds)
      engine = tickEngine(engine);

      // Tick 2: listener herbivore should detect the threat sounds and emit sound-flee event
      engine = tickEngine(engine);

      // Check for sound-flee events from listener herbivore
      const soundFleeEvents = engine.events.filter((e) => e.type === 'sound-flee');
      const herbivoresInEvents = soundFleeEvents.filter((e) => e.speciesId === 'herbivore_listener');

      // Verify that listener herbivore detected threat sounds and fled
      expect(herbivoresInEvents.length).toBeGreaterThan(0);
      expect(engine.tick).toBe(2);
    });

    it('predator investigation: carnivore detects feeding sound from prey', () => {
      // Create a herbivore that will feed
      const herbivore = new Creature({
        speciesId: 'herbivore_species',
        lineageId: 'herbivore_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size: 1 },
        x: 50,
        y: 50,
        energy: 200,
      });

      // Create a carnivore positioned nearby with good hearing
      const carnivore = new Creature({
        speciesId: 'carnivore_species',
        lineageId: 'carnivore_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', hearingRange: 50 },
        x: 55,
        y: 50,
        energy: 200,
      });

      let engine = createEngine(43, [herbivore, carnivore]);

      // Add producer biomass at herbivore location so it can feed
      const cell = engine.world.getCell(50, 50);
      engine.world.setCell(50, 50, {
        ...cell,
        producerBiomass: 50,
      });

      // Tick 1: herbivore feeds at (50, 50), creating feeding sound
      engine = tickEngine(engine);

      // Tick 2: carnivore nearby should detect the feeding sound and investigate
      engine = tickEngine(engine);

      // Check for sound-investigate event from any carnivore
      const investigateEvents = engine.events.filter(
        (e) =>
          e.type === 'sound-investigate' &&
          e.speciesId === 'carnivore_species'
      );

      // Verify that carnivore detected feeding sound and investigated
      expect(investigateEvents.length).toBeGreaterThan(0);
      expect(engine.tick).toBe(2);
    });

    it('scavenger attraction: scavenger detects corpse sounds and investigates', () => {
      // Create a prey creature that will die
      const prey = new Creature({
        speciesId: 'prey_species',
        lineageId: 'prey_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 50,
      });

      // Create a scavenger with good hearing positioned nearby (away from the attack)
      const scavenger = new Creature({
        speciesId: 'scavenger_species',
        lineageId: 'scavenger_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'scavenger', hearingRange: 50 },
        x: 56,
        y: 50,
        energy: 150,
      });

      // Create a predator that will attack the prey
      const predator = new Creature({
        speciesId: 'predator_species',
        lineageId: 'predator_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 50,
        energy: 30, // Hungry so will attack
      });

      let engine = createEngine(44, [prey, scavenger, predator], 100, 100, {
        predationHungerThresholdShare: 0.9,
      });

      // Tick 1: predator attacks prey (both create attack and distress sounds)
      engine = tickEngine(engine);

      // Tick 2: scavenger should detect sounds and potentially investigate
      engine = tickEngine(engine);

      // Check for sound-investigate or sound-detection event from scavenger
      const soundEvents = engine.events.filter(
        (e) =>
          (e.type === 'sound-investigate' || e.type === 'sound-detection') &&
          e.speciesId === 'scavenger_species'
      );

      // Scavenger should have detected something
      expect(soundEvents.length).toBeGreaterThan(0);
      expect(engine.tick).toBe(2);
    });

    it('sound-detection event is emitted when creature hears activity', () => {
      // Create two creatures
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', hearingRange: 50, speed: 2 },
        x: 50,
        y: 50,
        energy: 200,
      });

      const creature2 = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', hearingRange: 50 },
        x: 55,
        y: 50,
        energy: 200,
      });

      let engine = createEngine(45, [creature1, creature2]);

      // Add producer biomass so creatures don't starve
      for (let y = 0; y < engine.world.height; y++) {
        for (let x = 0; x < engine.world.width; x++) {
          const cell = engine.world.getCell(x, y);
          engine.world.setCell(x, y, { ...cell, producerBiomass: 10 });
        }
      }

      // Tick 1: creatures move/feed, creating sounds
      engine = tickEngine(engine);

      // Tick 2: creatures should detect sounds from tick 1
      engine = tickEngine(engine);

      // Check for sound-detection events (evidence that sound ecology is working)
      const detectionEvents = engine.events.filter(
        (e) => e.type === 'sound-detection'
      );

      // Verify that creatures detected sounds
      expect(detectionEvents.length).toBeGreaterThan(0);
      expect(engine.tick).toBe(2);
      expect(engine.creatures.length).toBeGreaterThan(0);
    });

    it('sound events have consistent details and tick information', () => {
      // Create a simple scenario where we can verify event structure
      const creature = new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 50,
        y: 50,
        energy: 200,
      });

      let engine = createEngine(47, [creature]);

      // Add producer biomass so creature can feed
      const cell = engine.world.getCell(50, 50);
      engine.world.setCell(50, 50, { ...cell, producerBiomass: 50 });

      // Tick 1: creature feeds, creating feeding sound
      engine = tickEngine(engine);

      // All events should have proper structure
      const allSoundEvents = engine.events.filter(
        (e) => e.type.includes('sound')
      );

      for (const event of allSoundEvents) {
        expect(event.tick).toBeDefined();
        expect(event.creatureId).toBeDefined();
        expect(event.speciesId).toBeDefined();
        expect(event.lineageId).toBeDefined();
        expect(event.detail).toBeDefined();
      }

      expect(engine.tick).toBe(1);
    });

    it('sound ecology behaviors are deterministic with same seed', () => {
      // Test that same seed produces same sound events
      const createScenario = (seed: number) => {
        const creature1 = new Creature({
          speciesId: 'species_1',
          lineageId: 'lineage_1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', hearingRange: 50 },
          x: 50,
          y: 50,
          energy: 200,
        });

        const creature2 = new Creature({
          speciesId: 'species_2',
          lineageId: 'lineage_2',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
          x: 50,
          y: 50,
          energy: 30,
        });

        let engine = createEngine(seed, [creature1, creature2], 100, 100, {
          predationHungerThresholdShare: 0.9,
        });
        engine = tickEngine(engine);

        // Return event type counts for comparison
        return engine.events
          .filter((e) => e.type.includes('sound'))
          .map((e) => e.type)
          .sort()
          .join(',');
      };

      Creature.resetIdCounter();
      const result1 = createScenario(888);

      Creature.resetIdCounter();
      const result2 = createScenario(888);

      // Same seed should produce same sound events
      expect(result1).toBe(result2);
    });
  });
});
