import { World } from '../simulation/world';
import {
  growProducers,
  EnergyType,
  ENERGY_TYPE_MULTIPLIERS,
  MAX_PRODUCER_BIOMASS,
  BIOME_PRODUCTIVITY,
  getBiomeProductivity,
} from '../simulation/producer';
import { PRODUCER_GROWTH_RATE } from '../utils/constants';

describe('Producer Growth Logic', () => {
  describe('EnergyType and Multipliers', () => {
    it('should export all required energy types', () => {
      const energyTypes: EnergyType[] = ['solar', 'geothermal', 'chemical', 'radioactive', 'mixed'];

      energyTypes.forEach((type) => {
        expect(ENERGY_TYPE_MULTIPLIERS[type]).toBeDefined();
      });
    });

    it('should have correct multiplier values', () => {
      expect(ENERGY_TYPE_MULTIPLIERS.solar).toBe(1.0);
      expect(ENERGY_TYPE_MULTIPLIERS.mixed).toBe(0.8);
      expect(ENERGY_TYPE_MULTIPLIERS.geothermal).toBe(0.7);
      expect(ENERGY_TYPE_MULTIPLIERS.chemical).toBe(0.5);
      expect(ENERGY_TYPE_MULTIPLIERS.radioactive).toBe(0.3);
    });

    it('should have positive multipliers less than or equal to 1.0', () => {
      Object.values(ENERGY_TYPE_MULTIPLIERS).forEach((multiplier) => {
        expect(multiplier).toBeGreaterThan(0);
        expect(multiplier).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('growProducers function', () => {
    describe('Biome productivity', () => {
      it('defines positive productivity for every biome', () => {
        for (const productivity of Object.values(BIOME_PRODUCTIVITY)) {
          expect(productivity).toBeGreaterThan(0);
        }
      });

      it('makes lush biomes more productive than harsh biomes', () => {
        expect(getBiomeProductivity('forest')).toBeGreaterThan(
          getBiomeProductivity('desert')
        );
        expect(getBiomeProductivity('wetland')).toBeGreaterThan(
          getBiomeProductivity('tundra')
        );
        expect(getBiomeProductivity('grassland')).toBeGreaterThan(
          getBiomeProductivity('mountain')
        );
      });

      it('applies biome productivity when enabled', () => {
        const forest = new World(1, 1);
        const desert = new World(1, 1);
        forest.setCell(0, 0, { energy: 10, biome: 'forest' });
        desert.setCell(0, 0, { energy: 10, biome: 'desert' });

        growProducers(forest, 'solar', PRODUCER_GROWTH_RATE, true);
        growProducers(desert, 'solar', PRODUCER_GROWTH_RATE, true);

        expect(forest.getCell(0, 0).producerBiomass).toBeCloseTo(1.2, 5);
        expect(desert.getCell(0, 0).producerBiomass).toBeCloseTo(0.2, 5);
      });
    });

    describe('Basic growth calculation', () => {
      it('should increase producerBiomass based on energy and energy type', () => {
        const world = new World(10, 10);

        // Set up a cell with energy=10
        world.setCell(5, 5, { energy: 10, producerBiomass: 0 });

        // With solar (multiplier=1.0):
        // growth = 0.1 × 10 × 1.0 = 1.0
        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(1.0, 5);
      });

      it('should apply energy type multipliers correctly', () => {
        const world = new World(10, 10);
        world.setCell(0, 0, { energy: 10, producerBiomass: 0 });

        // Test each energy type
        const testCases: [EnergyType, number][] = [
          ['solar', 1.0 * 10 * PRODUCER_GROWTH_RATE],
          ['mixed', 0.8 * 10 * PRODUCER_GROWTH_RATE],
          ['geothermal', 0.7 * 10 * PRODUCER_GROWTH_RATE],
          ['chemical', 0.5 * 10 * PRODUCER_GROWTH_RATE],
          ['radioactive', 0.3 * 10 * PRODUCER_GROWTH_RATE],
        ];

        testCases.forEach(([energyType, expectedGrowth]) => {
          const testWorld = new World(10, 10);
          testWorld.setCell(0, 0, { energy: 10, producerBiomass: 0 });

          growProducers(testWorld, energyType);

          const cell = testWorld.getCell(0, 0);
          expect(cell.producerBiomass).toBeCloseTo(expectedGrowth, 5);
        });
      });

      it('should accumulate growth across multiple ticks', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 10, producerBiomass: 0 });

        // First tick
        growProducers(world, 'solar');
        let cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(1.0, 5);

        // Second tick
        growProducers(world, 'solar');
        cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(2.0, 5);

        // Third tick
        growProducers(world, 'solar');
        cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(3.0, 5);
      });
    });

    describe('Zero energy handling', () => {
      it('should not grow biomass when cell energy is zero', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 0, producerBiomass: 5 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBe(5); // No growth
      });

      it('should handle negative energy (no growth)', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: -10, producerBiomass: 5 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        // Growth = 0.1 × (-10) × 1.0 = -1.0, so biomass becomes 4.0
        expect(cell.producerBiomass).toBeCloseTo(4.0, 5);
      });
    });

    describe('Biomass capping', () => {
      it('should never exceed MAX_PRODUCER_BIOMASS', () => {
        const world = new World(10, 10);

        // Set cell to near maximum
        world.setCell(5, 5, {
          energy: 1000, // Lots of energy
          producerBiomass: MAX_PRODUCER_BIOMASS - 5,
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeLessThanOrEqual(MAX_PRODUCER_BIOMASS);
        expect(cell.producerBiomass).toBe(MAX_PRODUCER_BIOMASS);
      });

      it('should cap growth when approaching maximum', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 10, producerBiomass: MAX_PRODUCER_BIOMASS - 0.5 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBe(MAX_PRODUCER_BIOMASS);
      });

      it('should respect cap even with high energy and high multiplier', () => {
        const world = new World(10, 10);
        world.setCell(0, 0, { energy: 1000, producerBiomass: 50 });

        growProducers(world, 'solar');

        const cell = world.getCell(0, 0);
        expect(cell.producerBiomass).toBeLessThanOrEqual(MAX_PRODUCER_BIOMASS);
      });

      it('should keep biomass at cap after multiple ticks at max', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 1000, producerBiomass: MAX_PRODUCER_BIOMASS });

        growProducers(world, 'solar');
        let cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBe(MAX_PRODUCER_BIOMASS);

        growProducers(world, 'solar');
        cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBe(MAX_PRODUCER_BIOMASS);
      });
    });

    describe('Full world simulation', () => {
      it('should update all cells in the world', () => {
        const world = new World(5, 5);

        // Set different energy levels in cells
        world.setCell(0, 0, { energy: 10, producerBiomass: 0 });
        world.setCell(2, 2, { energy: 20, producerBiomass: 0 });
        world.setCell(4, 4, { energy: 5, producerBiomass: 0 });

        growProducers(world, 'solar');

        expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(1.0, 5);
        expect(world.getCell(2, 2).producerBiomass).toBeCloseTo(2.0, 5);
        expect(world.getCell(4, 4).producerBiomass).toBeCloseTo(0.5, 5);

        // Cells without explicit energy should still be processed (at 0)
        expect(world.getCell(1, 1).producerBiomass).toBe(0);
      });

      it('should handle full 100x100 grid without errors', () => {
        const world = new World();

        // Set some cells with energy
        for (let i = 0; i < 10; i++) {
          world.setCell(i * 10, i * 10, { energy: 10, producerBiomass: 0 });
        }

        expect(() => growProducers(world, 'solar')).not.toThrow();

        // Verify a few cells were updated
        expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(1.0, 5);
        expect(world.getCell(90, 90).producerBiomass).toBeCloseTo(1.0, 5);
      });
    });

    describe('Edge cases and precision', () => {
      it('should handle fractional energy values', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 7.5, producerBiomass: 0 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(0.75, 5);
      });

      it('should handle fractional starting biomass', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 10, producerBiomass: 2.5 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(3.5, 5);
      });

      it('should preserve other cell properties during growth', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 10,
          nutrients: 25.5,
          producerBiomass: 5,
          toxicity: 0.1,
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.energy).toBe(10); // Energy unchanged
        expect(cell.nutrients).toBe(25.5); // Nutrients unchanged
        expect(cell.producerBiomass).toBeCloseTo(5 + 1 / 1.1, 5); // Toxicity suppresses growth
        expect(cell.toxicity).toBe(0.1); // Toxicity unchanged
      });

      it('should suppress producer growth in toxic cells', () => {
        const cleanWorld = new World();
        const toxicWorld = new World();
        cleanWorld.setCell(50, 50, { energy: 10, producerBiomass: 0, toxicity: 0 });
        toxicWorld.setCell(50, 50, { energy: 10, producerBiomass: 0, toxicity: 3 });

        growProducers(cleanWorld, 'solar');
        growProducers(toxicWorld, 'solar');

        expect(toxicWorld.getCell(50, 50).producerBiomass).toBeCloseTo(
          cleanWorld.getCell(50, 50).producerBiomass / 4,
          5
        );
      });

      it('should handle very small growth values', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, { energy: 0.001, producerBiomass: 0 });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        // growth = 0.1 × 0.001 × 1.0 = 0.0001
        expect(cell.producerBiomass).toBeCloseTo(0.0001, 6);
      });
    });

    describe('Energy type consistency', () => {
      it('should produce consistent results for same energy type', () => {
        const world1 = new World(10, 10);
        const world2 = new World(10, 10);

        world1.setCell(5, 5, { energy: 15, producerBiomass: 0 });
        world2.setCell(5, 5, { energy: 15, producerBiomass: 0 });

        growProducers(world1, 'chemical');
        growProducers(world2, 'chemical');

        expect(world1.getCell(5, 5).producerBiomass).toBe(world2.getCell(5, 5).producerBiomass);
      });

      it('should produce different results for different energy types', () => {
        const worldSolar = new World(10, 10);
        const worldChemical = new World(10, 10);

        worldSolar.setCell(5, 5, { energy: 10, producerBiomass: 0 });
        worldChemical.setCell(5, 5, { energy: 10, producerBiomass: 0 });

        growProducers(worldSolar, 'solar');
        growProducers(worldChemical, 'chemical');

        const solarBiomass = worldSolar.getCell(5, 5).producerBiomass;
        const chemicalBiomass = worldChemical.getCell(5, 5).producerBiomass;

        expect(solarBiomass).toBeGreaterThan(chemicalBiomass);
      });
    });
  });
});
