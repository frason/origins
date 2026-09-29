import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../simulation/world';
import { Creature } from '../simulation/creature';
import {
  applyDisaster,
  getDisasterInfo,
  DISASTER_RADIUS,
  type NaturalDisaster,
  type NaturalDisasterKind,
} from '../simulation/disasters';
import { createRng } from '../simulation/rng';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('Natural Disasters', () => {
  let world: World;
  let creatures: Creature[];
  const seed = 12345;
  const rng = createRng(seed);

  beforeEach(() => {
    world = new World(100, 100, SIMULATION_CONSTANTS, seed);
    creatures = [
      new Creature({
        speciesId: 'test_1',
        lineageId: 'test_1',
        parentId: null,
        traits: {
          size: 1,
          speed: 1,
          visionRange: 5,
          hearingRange: 2,
          camouflage: 0.5,
          armor: 0.3,
          boneDensity: 0.5,
          metabolism: 1,
          reproductionRate: 1,
          brainSize: 0.5,
          consciousnessLevel: 0.5,
          communication: 0.3,
          collectiveConnection: 0.2,
          thermalTolerance: 0.5,
          waterRetention: 0.5,
          aquaticAffinity: 0.2,
          aquaticAdaptation: 0,
          terrainGrip: 0.5,
          toxinResistance: 0.3,
          auditorySteal: 0.2,
          waterNeed: 0.5,
          saltTolerance: 0,
          energyStrategy: 'herbivore',
        },
        x: 50,
        y: 50,
        energy: 200,
      }),
      new Creature({
        speciesId: 'test_2',
        lineageId: 'test_2',
        parentId: null,
        traits: {
          size: 0.8,
          speed: 1.2,
          visionRange: 6,
          hearingRange: 2.5,
          camouflage: 0.4,
          armor: 0.5,
          boneDensity: 0.6,
          metabolism: 1.1,
          reproductionRate: 0.9,
          brainSize: 0.6,
          consciousnessLevel: 0.6,
          communication: 0.2,
          collectiveConnection: 0.1,
          thermalTolerance: 0.6,
          waterRetention: 0.4,
          aquaticAffinity: 0.3,
          aquaticAdaptation: 0,
          terrainGrip: 0.4,
          toxinResistance: 0.2,
          auditorySteal: 0.1,
          waterNeed: 0.5,
          saltTolerance: 0,
          energyStrategy: 'carnivore',
        },
        x: 55,
        y: 50,
        energy: 180,
      }),
    ];
  });

  describe('Disaster Info', () => {
    it('returns disaster metadata', () => {
      const info = getDisasterInfo('nutrient-bloom');
      expect(info.kind).toBe('nutrient-bloom');
      expect(info.tone).toBe('beneficial');
      expect(info.title).toBe('Nutrient Bloom');
      expect(info.description).toContain('nutrient');
    });

    it('lists all beneficial disasters', () => {
      const beneficialKinds: NaturalDisasterKind[] = [
        'nutrient-bloom',
        'mild-flood',
        'meteor-seeding',
      ];
      for (const kind of beneficialKinds) {
        const info = getDisasterInfo(kind);
        expect(info.tone).toBe('beneficial');
      }
    });

    it('lists all harmful disasters', () => {
      const harmfulKinds: NaturalDisasterKind[] = [
        'drought',
        'cold-snap',
        'wildfire',
        'toxic-vent',
        'temperature-spike',
      ];
      for (const kind of harmfulKinds) {
        const info = getDisasterInfo(kind);
        expect(info.tone).toBe('harmful');
      }
    });
  });

  describe('Nutrient Bloom', () => {
    it('increases nutrients in affected area', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialNutrients = centerCell.nutrients;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.nutrients).toBeGreaterThan(initialNutrients);
    });

    it('does not harm creatures', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const initialEnergy = creatures[0].energy;
      applyDisaster(disaster, world, creatures, 0, rng);
      expect(creatures[0].energy).toBe(initialEnergy);
    });

    it('affects falloff with distance', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerBefore = world.getCell(50, 50).nutrients;
      const farBefore = world.getCell(45, 45).nutrients;

      applyDisaster(disaster, world, creatures, 0, rng);

      const centerAfter = world.getCell(50, 50).nutrients;
      const farAfter = world.getCell(45, 45).nutrients;

      const centerIncrease = centerAfter - centerBefore;
      const farIncrease = farAfter - farBefore;

      expect(centerIncrease).toBeGreaterThan(farIncrease);
    });
  });

  describe('Mild Flood', () => {
    it('increases moisture in affected area', () => {
      const disaster: NaturalDisaster = {
        kind: 'mild-flood',
        tone: 'beneficial',
        title: 'Mild Flood',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialMoisture = centerCell.moisture;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.moisture).toBeGreaterThan(initialMoisture);
    });

    it('clamps moisture to 1', () => {
      const disaster: NaturalDisaster = {
        kind: 'mild-flood',
        tone: 'beneficial',
        title: 'Mild Flood',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      // Pre-wet the center cell
      world.getCell(50, 50).moisture = 0.95;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.moisture).toBeLessThanOrEqual(1);
    });
  });

  describe('Meteor Seeding', () => {
    it('adds significant nutrients', () => {
      const disaster: NaturalDisaster = {
        kind: 'meteor-seeding',
        tone: 'beneficial',
        title: 'Meteor Seeding',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialNutrients = centerCell.nutrients;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.nutrients).toBeGreaterThan(initialNutrients + 50);
    });
  });

  describe('Drought', () => {
    it('reduces moisture and energy', () => {
      const disaster: NaturalDisaster = {
        kind: 'drought',
        tone: 'harmful',
        title: 'Drought',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialMoisture = centerCell.moisture;
      const initialEnergy = centerCell.energy;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.moisture).toBeLessThan(initialMoisture);
      expect(afterCell.energy).toBeLessThan(initialEnergy);
    });
  });

  describe('Cold Snap', () => {
    it('reduces temperature', () => {
      const disaster: NaturalDisaster = {
        kind: 'cold-snap',
        tone: 'harmful',
        title: 'Cold Snap',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialTemp = centerCell.temperature;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.temperature).toBeLessThan(initialTemp);
    });

    it('damages nearby creatures', () => {
      const disaster: NaturalDisaster = {
        kind: 'cold-snap',
        tone: 'harmful',
        title: 'Cold Snap',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const initialEnergy = creatures[0].energy;
      applyDisaster(disaster, world, creatures, 0, rng);
      expect(creatures[0].energy).toBeLessThan(initialEnergy);
    });
  });

  describe('Wildfire', () => {
    it('reduces producer biomass and increases toxicity', () => {
      const disaster: NaturalDisaster = {
        kind: 'wildfire',
        tone: 'harmful',
        title: 'Wildfire',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      // Add biomass to the center cell using setCell
      world.setCell(50, 50, { producerBiomass: 100 });
      const initialBiomass = world.getCell(50, 50).producerBiomass;
      const initialToxicity = world.getCell(50, 50).toxicity;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.producerBiomass).toBeLessThan(initialBiomass);
      expect(afterCell.toxicity).toBeGreaterThan(initialToxicity);
    });

    it('damages nearby creatures', () => {
      const disaster: NaturalDisaster = {
        kind: 'wildfire',
        tone: 'harmful',
        title: 'Wildfire',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const initialEnergy = creatures[0].energy;
      applyDisaster(disaster, world, creatures, 0, rng);
      expect(creatures[0].energy).toBeLessThan(initialEnergy);
    });
  });

  describe('Toxic Vent', () => {
    it('increases toxicity and reduces nutrients', () => {
      const disaster: NaturalDisaster = {
        kind: 'toxic-vent',
        tone: 'harmful',
        title: 'Toxic Vent',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      // Initialize cell with some nutrients for the test
      world.setCell(50, 50, { nutrients: 50 });
      const centerCell = world.getCell(50, 50);
      const initialToxicity = centerCell.toxicity;
      const initialNutrients = centerCell.nutrients;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.toxicity).toBeGreaterThan(initialToxicity);
      expect(afterCell.nutrients).toBeLessThan(initialNutrients);
    });

    it('poisons nearby creatures', () => {
      const disaster: NaturalDisaster = {
        kind: 'toxic-vent',
        tone: 'harmful',
        title: 'Toxic Vent',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const initialToxinExposure = creatures[0].toxinExposure;
      applyDisaster(disaster, world, creatures, 0, rng);
      expect(creatures[0].toxinExposure).toBeGreaterThan(initialToxinExposure);
    });
  });

  describe('Temperature Spike', () => {
    it('increases temperature', () => {
      const disaster: NaturalDisaster = {
        kind: 'temperature-spike',
        tone: 'harmful',
        title: 'Temperature Spike',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const centerCell = world.getCell(50, 50);
      const initialTemp = centerCell.temperature;

      applyDisaster(disaster, world, creatures, 0, rng);

      const afterCell = world.getCell(50, 50);
      expect(afterCell.temperature).toBeGreaterThan(initialTemp);
    });
  });

  describe('Disaster Outcome Event', () => {
    it('generates environmental-shock event', () => {
      const disaster: NaturalDisaster = {
        kind: 'wildfire',
        tone: 'harmful',
        title: 'Wildfire',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const outcome = applyDisaster(disaster, world, creatures, 100, rng);

      expect(outcome.event.type).toBe('environmental-shock');
      expect(outcome.event.tick).toBe(100);
      expect(outcome.event.shockKind).toBe('wildfire');
      expect(outcome.event.affectedRegion).toEqual({
        x: 50,
        y: 50,
        radius: DISASTER_RADIUS,
      });
    });

    it('tracks affected creatures in outcome', () => {
      const disaster: NaturalDisaster = {
        kind: 'wildfire',
        tone: 'harmful',
        title: 'Wildfire',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const outcome = applyDisaster(disaster, world, creatures, 0, rng);

      expect(outcome.affectedCreatures).toContain(creatures[0].id);
      expect(outcome.affectedCreatures).toContain(creatures[1].id);
    });

    it('tracks affected cell count', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      const outcome = applyDisaster(disaster, world, creatures, 0, rng);

      // Radius of 8 should affect many cells
      expect(outcome.affectedCells).toBeGreaterThan(50);
    });
  });

  describe('Boundary Conditions', () => {
    it('handles disasters at world edges', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 0,
        centerY: 0,
        radius: DISASTER_RADIUS,
      };

      const outcome = applyDisaster(disaster, world, creatures, 0, rng);

      // Should process without error and affect some cells
      expect(outcome.affectedCells).toBeGreaterThan(0);
    });

    it('handles disasters at opposite world edges', () => {
      const disaster: NaturalDisaster = {
        kind: 'drought',
        tone: 'harmful',
        title: 'Drought',
        description: 'Test',
        centerX: 99,
        centerY: 99,
        radius: DISASTER_RADIUS,
      };

      const outcome = applyDisaster(disaster, world, creatures, 0, rng);

      // Should process without error and affect some cells
      expect(outcome.affectedCells).toBeGreaterThan(0);
    });

    it('does not affect creatures outside radius', () => {
      creatures[0].x = 0;
      creatures[0].y = 0;

      const disaster: NaturalDisaster = {
        kind: 'wildfire',
        tone: 'harmful',
        title: 'Wildfire',
        description: 'Test',
        centerX: 99,
        centerY: 99,
        radius: DISASTER_RADIUS,
      };

      const initialEnergy = creatures[0].energy;
      applyDisaster(disaster, world, creatures, 0, rng);
      expect(creatures[0].energy).toBe(initialEnergy);
    });
  });

  describe('RNG Determinism', () => {
    it('produces same results with same RNG seed', () => {
      const disaster: NaturalDisaster = {
        kind: 'nutrient-bloom',
        tone: 'beneficial',
        title: 'Nutrient Bloom',
        description: 'Test',
        centerX: 50,
        centerY: 50,
        radius: DISASTER_RADIUS,
      };

      // First application
      const world1 = new World(100, 100, SIMULATION_CONSTANTS, seed);
      const rng1 = createRng(seed);
      applyDisaster(disaster, world1, creatures, 0, rng1);
      const result1 = world1.getCell(50, 50).nutrients;

      // Second application with same seed
      const world2 = new World(100, 100, SIMULATION_CONSTANTS, seed);
      const rng2 = createRng(seed);
      applyDisaster(disaster, world2, creatures, 0, rng2);
      const result2 = world2.getCell(50, 50).nutrients;

      expect(result1).toBe(result2);
    });
  });
});
