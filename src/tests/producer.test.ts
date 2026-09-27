import { World } from '../simulation/world';
import {
  growProducers,
  EnergyType,
  ENERGY_TYPE_MULTIPLIERS,
  MAX_PRODUCER_BIOMASS,
  BIOME_PRODUCTIVITY,
  calculateProducerGrowth,
  getNutrientCapacity,
  getBiomeProductivity,
  calculateSubstrateAffinityMultiplier,
  calculateWaterSuitabilityMultiplier,
  calculateSalinitySuitabilityMultiplier,
  calculateMoistureSuitabilityMultiplier,
  calculateSuitabilityMultiplier,
} from '../simulation/producer';
import { PRODUCER_GROWTH_RATE } from '../utils/constants';
import type { ProducerArchetype } from '../simulation/producerTypes';

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
    describe('bounded nutrient cycle', () => {
      it('limits growth to the available local nutrient stock', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 100,
          nutrients: 0,
          producerBiomass: 0,
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar', 1, true, true);

        expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(15, 5);
        expect(world.getCell(0, 0).nutrients).toBe(0);
      });

      it('declines when producer maintenance cannot be met', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 0,
          nutrients: 0,
          producerBiomass: 30,
          biome: 'mountain',
          producerArchetype: 'lithotroph',
          toxicity: 100,
        });

        growProducers(world, 'solar', PRODUCER_GROWTH_RATE, true, true);

        expect(world.getCell(0, 0).producerBiomass).toBeLessThan(30);
      });

      it('recovers an abandoned depleted cell gradually and stays bounded', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 100,
          nutrients: 0,
          producerBiomass: 0,
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar', PRODUCER_GROWTH_RATE, true, true);
        const firstTick = world.getCell(0, 0).producerBiomass;
        for (let tick = 0; tick < 20; tick++) {
          growProducers(world, 'solar', PRODUCER_GROWTH_RATE, true, true);
        }

        expect(firstTick).toBeGreaterThan(0);
        expect(firstTick).toBeLessThan(16);
        expect(world.getCell(0, 0).producerBiomass).toBeGreaterThan(firstTick);
        expect(world.getCell(0, 0).nutrients).toBeLessThanOrEqual(
          getNutrientCapacity(world.getCell(0, 0))
        );
      });

      it('gives productive biomes larger nutrient stocks than harsh biomes', () => {
        const forest = new World(1, 1);
        const desert = new World(1, 1);
        forest.setCell(0, 0, { biome: 'forest', producerArchetype: 'canopy-colony' });
        desert.setCell(0, 0, { biome: 'desert', producerArchetype: 'xerophyte-mat' });

        expect(getNutrientCapacity(forest.getCell(0, 0))).toBeGreaterThan(
          getNutrientCapacity(desert.getCell(0, 0))
        );
      });
    });

    describe('Biome productivity', () => {
      it('defines positive productivity for every biome', () => {
        for (const productivity of Object.values(BIOME_PRODUCTIVITY)) {
          expect(productivity).toBeGreaterThan(0);
        }
      });

      it('slows growth continuously as local biomass approaches capacity', () => {
        const sparse = new World(1, 1);
        const dense = new World(1, 1);
        sparse.setCell(0, 0, {
          energy: 10,
          producerBiomass: 10,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });
        dense.setCell(0, 0, {
          energy: 10,
          producerBiomass: 90,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        const sparseGrowth = calculateProducerGrowth(
          sparse.getCell(0, 0), 'solar', PRODUCER_GROWTH_RATE
        );
        const denseGrowth = calculateProducerGrowth(
          dense.getCell(0, 0), 'solar', PRODUCER_GROWTH_RATE
        );

        // With loam (1.2x multiplier): 0.1 * 10 * 1.0 * 1.2 * (1 - 10/100) = 1.08
        expect(sparseGrowth.growth).toBeCloseTo(1.08, 5);
        // Dense: 0.1 * 10 * 1.0 * 1.2 * (1 - 90/100) = 0.12
        expect(denseGrowth.growth).toBeCloseTo(0.12, 5);
        expect(sparseGrowth.growth).toBeGreaterThan(denseGrowth.growth);
      });

      it('reports biome-specific capacity without mutating the cell', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          biome: 'tundra',
          producerArchetype: 'frost-lichen',
          energy: 10,
          producerBiomass: 20,
        });
        const before = world.getCell(0, 0);

        const result = calculateProducerGrowth(
          before, 'solar', PRODUCER_GROWTH_RATE, true
        );

        expect(result.carryingCapacity).toBe(45);
        expect(result.nextBiomass).toBeGreaterThan(before.producerBiomass);
        expect(world.getCell(0, 0)).toEqual(before);
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
        forest.setCell(0, 0, {
          energy: 10,
          biome: 'forest',
          producerArchetype: 'canopy-colony',
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });
        desert.setCell(0, 0, {
          energy: 10,
          biome: 'desert',
          producerArchetype: 'xerophyte-mat',
          waterDepth: 0.05,
          salinity: 0.0,
          moisture: 0.2,
          substrate: 'sand',
        });

        growProducers(forest, 'solar', PRODUCER_GROWTH_RATE, true);
        growProducers(desert, 'solar', PRODUCER_GROWTH_RATE, true);

        // Forest: canopy-colony (1.2 biome) * loam (1.3 archetype affinity) = 1.56
        // 0.1 * 10 * 1.0 * 1.2 * 1.3 * (1 - 0/100) = 1.56
        expect(forest.getCell(0, 0).producerBiomass).toBeCloseTo(1.56, 5);
        // Desert: xerophyte-mat (0.2 biome) * sand (1.3 archetype affinity) = 0.26
        // 0.1 * 10 * 1.0 * 0.2 * 1.3 * (1 - 0/100) = 0.26
        expect(desert.getCell(0, 0).producerBiomass).toBeCloseTo(0.26, 5);
      });
    });

    describe('Basic growth calculation', () => {
      it('should increase producerBiomass based on energy and energy type', () => {
        const world = new World(10, 10);

        // Set up a cell with energy=10 and optimal conditions for ground-cover
        world.setCell(5, 5, {
          energy: 10,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        // With solar (multiplier=1.0) and loam substrate (1.2x for ground-cover):
        // growth = 0.1 × 10 × 1.0 × 1.2 = 1.2
        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(1.2, 5);
      });

      it('should apply energy type multipliers correctly', () => {
        const world = new World(10, 10);
        world.setCell(0, 0, {
          energy: 10,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        // Test each energy type with loam substrate (1.2x for ground-cover)
        const testCases: [EnergyType, number][] = [
          ['solar', 1.0 * 10 * PRODUCER_GROWTH_RATE * 1.2],
          ['mixed', 0.8 * 10 * PRODUCER_GROWTH_RATE * 1.2],
          ['geothermal', 0.7 * 10 * PRODUCER_GROWTH_RATE * 1.2],
          ['chemical', 0.5 * 10 * PRODUCER_GROWTH_RATE * 1.2],
          ['radioactive', 0.3 * 10 * PRODUCER_GROWTH_RATE * 1.2],
        ];

        testCases.forEach(([energyType, expectedGrowth]) => {
          const testWorld = new World(10, 10);
          testWorld.setCell(0, 0, {
            energy: 10,
            producerBiomass: 0,
            waterDepth: 0.1,
            salinity: 0.0,
            moisture: 0.5,
            substrate: 'loam',
            biome: 'grassland',
            producerArchetype: 'ground-cover',
          });

          growProducers(testWorld, energyType);

          const cell = testWorld.getCell(0, 0);
          expect(cell.producerBiomass).toBeCloseTo(expectedGrowth, 5);
        });
      });

      it('should accumulate growth across multiple ticks', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 10,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        // First tick: 0.1 * 10 * 1.0 * 1.2 = 1.2
        growProducers(world, 'solar');
        let cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(1.2, 4);

        // Second tick: growth limited by capacity
        growProducers(world, 'solar');
        cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(2.3856, 4);

        // Third tick
        growProducers(world, 'solar');
        cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(3.5569728, 4);
      });
    });

    describe('Zero energy handling', () => {
      it('should not grow biomass when cell energy is zero', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 0,
          producerBiomass: 5,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBe(5); // No growth
      });

      it('should handle negative energy (no growth)', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: -10,
          producerBiomass: 5,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        // Negative energy with loam 1.2x: decline but moderated by current density
        expect(cell.producerBiomass).toBeCloseTo(3.86, 5);
      });
    });

    describe('Biomass capping', () => {
      it('should never exceed MAX_PRODUCER_BIOMASS', () => {
        const world = new World(10, 10);

        // Set cell to near maximum
        world.setCell(5, 5, {
          energy: 1000, // Lots of energy
          producerBiomass: MAX_PRODUCER_BIOMASS - 5,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeLessThanOrEqual(MAX_PRODUCER_BIOMASS);
        expect(cell.producerBiomass).toBe(MAX_PRODUCER_BIOMASS);
      });

      it('should slow growth rather than snapping biomass to capacity', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 10,
          producerBiomass: MAX_PRODUCER_BIOMASS - 0.5,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        // At capacity boundary, growth should be very small but exist
        expect(cell.producerBiomass).toBeCloseTo(99.506, 5);
      });

      it('should respect cap even with high energy and high multiplier', () => {
        const world = new World(10, 10);
        world.setCell(0, 0, {
          energy: 1000,
          producerBiomass: 50,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(0, 0);
        expect(cell.producerBiomass).toBeLessThanOrEqual(MAX_PRODUCER_BIOMASS);
      });

      it('should keep biomass at cap after multiple ticks at max', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 1000,
          producerBiomass: MAX_PRODUCER_BIOMASS,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });

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

        // Set different energy levels in cells with optimal growing conditions
        world.setCell(0, 0, {
          energy: 10,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });
        world.setCell(2, 2, {
          energy: 20,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });
        world.setCell(4, 4, {
          energy: 5,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(1.2, 5);
        expect(world.getCell(2, 2).producerBiomass).toBeCloseTo(2.4, 5);
        expect(world.getCell(4, 4).producerBiomass).toBeCloseTo(0.6, 5);

        // Cells without explicit energy should still be processed (at 0)
        expect(world.getCell(1, 1).producerBiomass).toBe(0);
      });

      it('should handle full 100x100 grid without errors', () => {
        const world = new World();

        // Set some cells with energy and optimal conditions
        for (let i = 0; i < 10; i++) {
          world.setCell(i * 10, i * 10, {
            energy: 10,
            producerBiomass: 0,
            waterDepth: 0.1,
            salinity: 0.0,
            moisture: 0.5,
            substrate: 'loam',
            biome: 'grassland',
            producerArchetype: 'ground-cover',
          });
        }

        expect(() => growProducers(world, 'solar')).not.toThrow();

        // Verify a few cells were updated (with loam 1.2x multiplier)
        expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(1.2, 5);
        expect(world.getCell(90, 90).producerBiomass).toBeCloseTo(1.2, 5);
      });
    });

    describe('Edge cases and precision', () => {
      it('should handle fractional energy values', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 7.5,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(0.9, 5); // 0.1 * 7.5 * 1.0 * 1.2
      });

      it('should handle fractional starting biomass', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 10,
          producerBiomass: 2.5,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.producerBiomass).toBeCloseTo(3.67, 5); // 2.5 + 0.1 * 10 * 1.0 * 1.2 * (1 - 2.5/100)
      });

      it('should preserve other cell properties during growth', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 10,
          nutrients: 25.5,
          producerBiomass: 5,
          toxicity: 0.1,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        expect(cell.energy).toBe(10); // Energy unchanged
        expect(cell.nutrients).toBe(25.5); // Nutrients unchanged
        // Toxicity 0.1: multiplier=1/(1+0.1)≈0.909, loam 1.2: 5 + 0.1*10*1.0*(1/1.1)*1.2*(1-5/100)
        expect(cell.producerBiomass).toBeCloseTo(6.0363636, 5);
        expect(cell.toxicity).toBe(0.1); // Toxicity unchanged
      });

      it('should suppress producer growth in toxic cells', () => {
        const cleanWorld = new World();
        const toxicWorld = new World();
        cleanWorld.setCell(50, 50, {
          energy: 10,
          producerBiomass: 0,
          toxicity: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });
        toxicWorld.setCell(50, 50, {
          energy: 10,
          producerBiomass: 0,
          toxicity: 3,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
        });

        growProducers(cleanWorld, 'solar');
        growProducers(toxicWorld, 'solar');

        expect(toxicWorld.getCell(50, 50).producerBiomass).toBeCloseTo(
          cleanWorld.getCell(50, 50).producerBiomass / 4,
          5
        );
      });

      it('should handle very small growth values', () => {
        const world = new World(10, 10);
        world.setCell(5, 5, {
          energy: 0.001,
          producerBiomass: 0,
          waterDepth: 0.1,
          salinity: 0.0,
          moisture: 0.5,
          substrate: 'loam',
          biome: 'grassland',
          producerArchetype: 'ground-cover',
        });

        growProducers(world, 'solar');

        const cell = world.getCell(5, 5);
        // growth = 0.1 × 0.001 × 1.0 × 1.2 = 0.00012
        expect(cell.producerBiomass).toBeCloseTo(0.00012, 7);
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

  describe('Substrate and Water Multipliers (Pure Functions)', () => {
    describe('Suitability multiplier calculation', () => {
      it('should return 1.0 within preference range', () => {
        expect(calculateSuitabilityMultiplier(0.5, 0.3, 0.7)).toBe(1.0);
        expect(calculateSuitabilityMultiplier(0.3, 0.3, 0.7)).toBe(1.0);
        expect(calculateSuitabilityMultiplier(0.7, 0.3, 0.7)).toBe(1.0);
      });

      it('should degrade smoothly outside preference range', () => {
        const low = calculateSuitabilityMultiplier(0.1, 0.3, 0.7);  // 0.2 below min
        const medium = calculateSuitabilityMultiplier(0.0, 0.3, 0.7); // 0.3 below min
        const far = calculateSuitabilityMultiplier(-0.1, 0.3, 0.7);   // 0.4 below min

        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThan(1.0);
        expect(medium).toBeLessThan(low);
        expect(far).toBeLessThan(medium);
      });

      it('should never reach zero (no hard barriers)', () => {
        const veryFar = calculateSuitabilityMultiplier(10, 0.3, 0.7);
        expect(veryFar).toBeGreaterThan(0);
        expect(veryFar).toBeLessThan(0.1);
      });

      it('should be symmetric around preference range', () => {
        const below = calculateSuitabilityMultiplier(0.1, 0.3, 0.7);
        const above = calculateSuitabilityMultiplier(0.9, 0.3, 0.7);
        expect(below).toBeCloseTo(above, 5);
      });
    });

    describe('Substrate affinity multiplier (data-driven, no plant assumptions)', () => {
      it('rock substrate favors geothermal and radioactive energy', () => {
        const lithotroph: ProducerArchetype = 'lithotroph';
        const geothermalMultiplier = calculateSubstrateAffinityMultiplier(
          lithotroph,
          'rock',
          'geothermal'
        );
        const chemicalMultiplier = calculateSubstrateAffinityMultiplier(
          lithotroph,
          'rock',
          'chemical'
        );

        // Rock has high geothermal affinity (1.3) and high archetype affinity (1.3)
        // Chemical is lower at rock (0.8)
        expect(geothermalMultiplier).toBeGreaterThan(chemicalMultiplier);
        expect(geothermalMultiplier).toBeGreaterThan(1.0);
      });

      it('sediment substrate favors chemical and mixed energy', () => {
        const marshBiofilm: ProducerArchetype = 'marsh-biofilm';
        const chemicalMultiplier = calculateSubstrateAffinityMultiplier(
          marshBiofilm,
          'sediment',
          'chemical'
        );
        const solarMultiplier = calculateSubstrateAffinityMultiplier(
          marshBiofilm,
          'sediment',
          'solar'
        );

        // Sediment has high chemical affinity (1.2) and marsh-biofilm also favors sediment
        // Chemical should outperform solar in sediment
        expect(chemicalMultiplier).toBeGreaterThan(solarMultiplier);
      });

      it('clay substrate enables chemosynthetic producers without assuming plants', () => {
        const lithotroph: ProducerArchetype = 'lithotroph';
        const clayMultiplier = calculateSubstrateAffinityMultiplier(
          lithotroph,
          'clay',
          'chemical'
        );

        // Lithotroph can thrive on chemical energy in clay (both favor chemical)
        expect(clayMultiplier).toBeGreaterThan(0.8);
      });

      it('different archetypes have different substrate affinities', () => {
        const sandsRock = calculateSubstrateAffinityMultiplier('xerophyte-mat', 'rock', 'solar');
        const lithotrophsRock = calculateSubstrateAffinityMultiplier('lithotroph', 'rock', 'solar');

        // Lichens love rock (1.4), xerophytes prefer sand
        expect(lithotrophsRock).toBeGreaterThan(sandsRock);
      });

      it('peat substrate with geothermal energy is unfavorable (low retention for energy)', () => {
        const marshBiofilm: ProducerArchetype = 'marsh-biofilm';
        const peatGeothermMultiplier = calculateSubstrateAffinityMultiplier(
          marshBiofilm,
          'peat',
          'geothermal'
        );

        // Peat has low geothermal affinity (0.6), reducing growth
        expect(peatGeothermMultiplier).toBeLessThan(1.0);
      });

      it('always returns positive multiplier (degradation, never hard block)', () => {
        const archetypes: ProducerArchetype[] = [
          'photic-algae',
          'xerophyte-mat',
          'ground-cover',
          'canopy-colony',
          'marsh-biofilm',
          'frost-lichen',
          'lithotroph',
        ];
        const substrates = ['sand', 'loam', 'clay', 'peat', 'rock', 'sediment'] as const;
        const energyTypes: EnergyType[] = ['solar', 'geothermal', 'chemical', 'radioactive', 'mixed'];

        for (const archetype of archetypes) {
          for (const substrate of substrates) {
            for (const energy of energyTypes) {
              const multiplier = calculateSubstrateAffinityMultiplier(archetype, substrate, energy);
              expect(multiplier).toBeGreaterThan(0);
            }
          }
        }
      });
    });

    describe('Water depth suitability (aquatic vs terrestrial)', () => {
      it('photic-algae thrive in water', () => {
        const algaeInWater = calculateWaterSuitabilityMultiplier('photic-algae', 0.6);
        const algaeOnLand = calculateWaterSuitabilityMultiplier('photic-algae', 0.05);

        expect(algaeInWater).toBe(1.0); // Within preferred range [0.2, 1.0]
        expect(algaeOnLand).toBeLessThan(1.0);
      });

      it('xerophyte-mat prefers dry conditions', () => {
        const dryMat = calculateWaterSuitabilityMultiplier('xerophyte-mat', 0.05);
        const wetMat = calculateWaterSuitabilityMultiplier('xerophyte-mat', 0.5);

        expect(dryMat).toBe(1.0); // Within preferred range [0.0, 0.1]
        expect(wetMat).toBeLessThan(1.0);
      });

      it('marsh-biofilm prefers shallow to moderate water', () => {
        const shallowWater = calculateWaterSuitabilityMultiplier('marsh-biofilm', 0.25);
        const veryDeep = calculateWaterSuitabilityMultiplier('marsh-biofilm', 1.0);
        const veryDry = calculateWaterSuitabilityMultiplier('marsh-biofilm', 0.0);

        expect(shallowWater).toBe(1.0); // Within [0.1, 0.4]
        expect(veryDeep).toBeLessThan(1.0);
        expect(veryDry).toBeLessThan(1.0);
      });

      it('all archetypes have some water tolerance (no total rejection)', () => {
        const archetypes: ProducerArchetype[] = [
          'photic-algae',
          'xerophyte-mat',
          'ground-cover',
          'canopy-colony',
          'marsh-biofilm',
          'frost-lichen',
          'lithotroph',
        ];

        for (const archetype of archetypes) {
          const veryWet = calculateWaterSuitabilityMultiplier(archetype, 1.0);
          const veryDry = calculateWaterSuitabilityMultiplier(archetype, 0.0);

          expect(veryWet).toBeGreaterThan(0);
          expect(veryDry).toBeGreaterThan(0);
        }
      });
    });

    describe('Salinity suitability (freshwater vs saline)', () => {
      it('most archetypes prefer fresh water', () => {
        const freshAlgae = calculateSalinitySuitabilityMultiplier('photic-algae', 0.0);
        const brackish = calculateSalinitySuitabilityMultiplier('photic-algae', 0.3);
        const saline = calculateSalinitySuitabilityMultiplier('photic-algae', 0.8);

        expect(freshAlgae).toBe(1.0);
        expect(brackish).toBeLessThan(1.0);
        expect(saline).toBeLessThan(brackish);
      });

      it('lithotroph tolerates all salinity levels', () => {
        const fresh = calculateSalinitySuitabilityMultiplier('lithotroph', 0.0);
        const brackish = calculateSalinitySuitabilityMultiplier('lithotroph', 0.5);
        const hypersaline = calculateSalinitySuitabilityMultiplier('lithotroph', 1.0);

        // Lithotroph prefers [0.0, 1.0] (tolerates all)
        expect(fresh).toBe(1.0);
        expect(brackish).toBe(1.0);
        expect(hypersaline).toBe(1.0);
      });

      it('all archetypes have some salinity tolerance (no total rejection)', () => {
        const archetypes: ProducerArchetype[] = [
          'photic-algae',
          'xerophyte-mat',
          'ground-cover',
          'canopy-colony',
          'marsh-biofilm',
          'frost-lichen',
          'lithotroph',
        ];

        for (const archetype of archetypes) {
          const fresh = calculateSalinitySuitabilityMultiplier(archetype, 0.0);
          const hypersaline = calculateSalinitySuitabilityMultiplier(archetype, 1.0);

          expect(fresh).toBeGreaterThan(0);
          expect(hypersaline).toBeGreaterThan(0);
        }
      });
    });

    describe('Moisture suitability (wet vs dry substrates)', () => {
      it('frost-lichen prefers low moisture', () => {
        const dry = calculateMoistureSuitabilityMultiplier('frost-lichen', 0.2);
        const wet = calculateMoistureSuitabilityMultiplier('frost-lichen', 0.9);

        expect(dry).toBe(1.0); // Within [0.1, 0.4]
        expect(wet).toBeLessThan(1.0);
      });

      it('marsh-biofilm prefers high moisture', () => {
        const wet = calculateMoistureSuitabilityMultiplier('marsh-biofilm', 0.9);
        const dry = calculateMoistureSuitabilityMultiplier('marsh-biofilm', 0.2);

        expect(wet).toBe(1.0); // Within [0.7, 1.0]
        expect(dry).toBeLessThan(1.0);
      });

      it('ground-cover is moderate moisture specialist', () => {
        const moderate = calculateMoistureSuitabilityMultiplier('ground-cover', 0.5);
        const veryWet = calculateMoistureSuitabilityMultiplier('ground-cover', 1.0);
        const veryDry = calculateMoistureSuitabilityMultiplier('ground-cover', 0.0);

        expect(moderate).toBe(1.0); // Within [0.3, 0.7]
        expect(veryWet).toBeLessThan(1.0);
        expect(veryDry).toBeLessThan(1.0);
      });

      it('all archetypes have moisture tolerance (no total rejection)', () => {
        const archetypes: ProducerArchetype[] = [
          'photic-algae',
          'xerophyte-mat',
          'ground-cover',
          'canopy-colony',
          'marsh-biofilm',
          'frost-lichen',
          'lithotroph',
        ];

        for (const archetype of archetypes) {
          const veryWet = calculateMoistureSuitabilityMultiplier(archetype, 1.0);
          const veryDry = calculateMoistureSuitabilityMultiplier(archetype, 0.0);

          expect(veryWet).toBeGreaterThan(0);
          expect(veryDry).toBeGreaterThan(0);
        }
      });
    });

    describe('Combined growth formula with substrate and water effects', () => {
      it('lithotroph grows well on chemical energy in rock substrate underwater', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 50,
          substrate: 'rock',
          waterDepth: 0.3,
          salinity: 0.0,
          moisture: 0.5,
          producerArchetype: 'lithotroph',
          producerBiomass: 0,
        });

        const growth = calculateProducerGrowth(world.getCell(0, 0), 'chemical');

        // Lithotroph likes rock substrate (1.3), chemical energy (0.8 efficiency),
        // can tolerate water (within 0.0-0.3 range, so 1.0),
        // prefers fresh salinity (1.0), tolerates moisture (1.0)
        expect(growth.growth).toBeGreaterThan(0.5);
      });

      it('photic-algae grows better in sediment than in rock with chemical energy', () => {
        const worldRock = new World(1, 1);
        worldRock.setCell(0, 0, {
          energy: 50,
          substrate: 'rock',
          waterDepth: 0.5,
          salinity: 0.0,
          moisture: 0.5,
          producerArchetype: 'photic-algae',
          producerBiomass: 0,
        });

        const worldSediment = new World(1, 1);
        worldSediment.setCell(0, 0, {
          energy: 50,
          substrate: 'sediment',
          waterDepth: 0.5,
          salinity: 0.0,
          moisture: 0.5,
          producerArchetype: 'photic-algae',
          producerBiomass: 0,
        });

        const growthRock = calculateProducerGrowth(worldRock.getCell(0, 0), 'chemical');
        const growthSediment = calculateProducerGrowth(worldSediment.getCell(0, 0), 'chemical');

        // Photic-algae prefers sediment (1.1) over rock (0.6) even with same energy type
        expect(growthSediment.growth).toBeGreaterThan(growthRock.growth);
      });

      it('xerophyte-mat thrives in sand with solar energy and low water', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 10,
          substrate: 'sand',
          waterDepth: 0.05,
          salinity: 0.0,
          moisture: 0.2,
          producerArchetype: 'xerophyte-mat',
          producerBiomass: 0,
        });

        const growth = calculateProducerGrowth(world.getCell(0, 0), 'solar');

        // Xerophyte-mat loves sand (1.3), solar (1.0), low water (1.0), dry (1.0)
        expect(growth.growth).toBeGreaterThan(0.15);
      });

      it('marsh-biofilm thrives in peat with high water and moisture', () => {
        const world = new World(1, 1);
        world.setCell(0, 0, {
          energy: 30,
          substrate: 'peat',
          waterDepth: 0.25,
          salinity: 0.0,
          moisture: 0.9,
          producerArchetype: 'marsh-biofilm',
          producerBiomass: 0,
        });

        const growth = calculateProducerGrowth(world.getCell(0, 0), 'solar');

        // Marsh-biofilm loves peat (1.3), water (1.0), fresh (1.0), wet (1.0)
        expect(growth.growth).toBeGreaterThan(2.0);
      });

      it('no producer is zero growth even in mismatched conditions (degradation only)', () => {
        const archetypes: ProducerArchetype[] = [
          'photic-algae',
          'xerophyte-mat',
          'ground-cover',
          'canopy-colony',
          'marsh-biofilm',
          'frost-lichen',
          'lithotroph',
        ];
        const substrates = ['sand', 'loam', 'clay', 'peat', 'rock', 'sediment'] as const;
        const energyTypes: EnergyType[] = ['solar', 'geothermal', 'chemical', 'radioactive', 'mixed'];

        for (const archetype of archetypes) {
          for (const substrate of substrates) {
            for (const energy of energyTypes) {
              const world = new World(1, 1);
              world.setCell(0, 0, {
                energy: 10,
                substrate,
                waterDepth: 0.5, // Arbitrary condition
                salinity: 0.5,
                moisture: 0.5,
                producerArchetype: archetype,
                producerBiomass: 0,
              });

              const growth = calculateProducerGrowth(world.getCell(0, 0), energy);
              expect(growth.growth).toBeGreaterThan(0);
            }
          }
        }
      });
    });
  });
});
