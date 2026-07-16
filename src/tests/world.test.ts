import { World, Cell, computeSolarEnergyGrid } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('World - Grid Data Model', () => {
  describe('Initialization', () => {
    it('should initialize a 100×100 grid with all zeros', () => {
      const world = new World();

      expect(world.width).toBe(100);
      expect(world.height).toBe(100);

      // Check a sample of cells are zero
      for (let x = 0; x < 100; x += 10) {
        for (let y = 0; y < 100; y += 10) {
          const cell = world.getCell(x, y);
          expect(cell.energy).toBe(0);
          expect(cell.nutrients).toBe(0);
          expect(cell.producerBiomass).toBe(0);
          expect(cell.toxicity).toBe(0);
        }
      }
    });

    it('should support custom dimensions', () => {
      const world = new World(50, 75);
      expect(world.width).toBe(50);
      expect(world.height).toBe(75);

      const cell = world.getCell(0, 0);
      expect(cell.energy).toBe(0);
      expect(cell.nutrients).toBe(0);
      expect(cell.producerBiomass).toBe(0);
      expect(cell.toxicity).toBe(0);
    });
  });

  describe('getCell / setCell round-trip', () => {
    it('should read back values after setting them', () => {
      const world = new World();

      const testCell: Cell = {
        energy: 42.5,
        nutrients: 10.2,
        producerBiomass: 5.7,
        toxicity: 0.3,
        elevation: 0.6,
        moisture: 0.7,
        temperature: 0.8,
        biome: 'forest',
        producerArchetype: 'canopy-colony',
      };

      world.setCell(50, 50, testCell);
      const retrieved = world.getCell(50, 50);

      expect(retrieved.energy).toBe(42.5);
      expect(retrieved.nutrients).toBe(10.2);
      expect(retrieved.producerBiomass).toBe(5.7);
      expect(retrieved.toxicity).toBe(0.3);
    });

    it('should merge partial cell updates', () => {
      const world = new World();

      // Set initial values
      world.setCell(30, 40, {
        energy: 100,
        nutrients: 50,
        producerBiomass: 25,
        toxicity: 5,
      });

      // Partially update only energy and nutrients
      world.setCell(30, 40, { energy: 75, nutrients: 60 });

      const cell = world.getCell(30, 40);
      expect(cell.energy).toBe(75);
      expect(cell.nutrients).toBe(60);
      expect(cell.producerBiomass).toBe(25); // unchanged
      expect(cell.toxicity).toBe(5); // unchanged
    });

    it('should not return the internal cell object (prevent external mutation)', () => {
      const world = new World();
      world.setCell(10, 20, {
        energy: 100,
        nutrients: 50,
        producerBiomass: 25,
        toxicity: 10,
      });

      const cell1 = world.getCell(10, 20);
      cell1.energy = 999; // Mutate the returned object

      // Getting the cell again should return the original value
      const cell2 = world.getCell(10, 20);
      expect(cell2.energy).toBe(100);
    });

    it('should handle multiple cells independently', () => {
      const world = new World();

      world.setCell(0, 0, { energy: 10, nutrients: 20, producerBiomass: 30, toxicity: 40 });
      world.setCell(99, 99, { energy: 100, nutrients: 200, producerBiomass: 300, toxicity: 400 });

      const cell1 = world.getCell(0, 0);
      const cell2 = world.getCell(99, 99);

      expect(cell1.energy).toBe(10);
      expect(cell2.energy).toBe(100);
    });
  });

  describe('toJSON / fromJSON round-trip', () => {
    it('should serialize and deserialize identical cell values', () => {
      const world1 = new World();

      // Set various cell values
      world1.setCell(0, 0, { energy: 10, nutrients: 20, producerBiomass: 30, toxicity: 40 });
      world1.setCell(50, 50, { energy: 100, nutrients: 200, producerBiomass: 300, toxicity: 400 });
      world1.setCell(99, 99, { energy: 1000, nutrients: 2000, producerBiomass: 3000, toxicity: 4000 });

      // Serialize to JSON
      const json = world1.toJSON();

      // Deserialize back to a new World
      const world2 = World.fromJSON(json);

      // Verify dimensions
      expect(world2.width).toBe(world1.width);
      expect(world2.height).toBe(world1.height);

      // Verify all cells are identical
      for (let x = 0; x < 100; x += 10) {
        for (let y = 0; y < 100; y += 10) {
          const cell1 = world1.getCell(x, y);
          const cell2 = world2.getCell(x, y);

          expect(cell2.energy).toBe(cell1.energy);
          expect(cell2.nutrients).toBe(cell1.nutrients);
          expect(cell2.producerBiomass).toBe(cell1.producerBiomass);
          expect(cell2.toxicity).toBe(cell1.toxicity);
        }
      }
    });

    it('should handle custom dimensions in JSON round-trip', () => {
      const world1 = new World(50, 75);
      world1.setCell(25, 37, { energy: 123, nutrients: 456, producerBiomass: 789, toxicity: 0.1 });

      const json = world1.toJSON();
      const world2 = World.fromJSON(json);

      expect(world2.width).toBe(50);
      expect(world2.height).toBe(75);

      const cell = world2.getCell(25, 37);
      expect(cell.energy).toBe(123);
      expect(cell.nutrients).toBe(456);
      expect(cell.producerBiomass).toBe(789);
      expect(cell.toxicity).toBe(0.1);
    });

    it('should preserve floating-point values with good precision', () => {
      const world1 = new World();
      const testValues = {
        energy: 42.123456789,
        nutrients: 10.987654321,
        producerBiomass: 5.5555555555,
        toxicity: 0.0000000001,
      };

      world1.setCell(10, 20, testValues);

      const json = world1.toJSON();
      const world2 = World.fromJSON(json);

      const cell = world2.getCell(10, 20);
      expect(cell.energy).toBeCloseTo(testValues.energy, 10);
      expect(cell.nutrients).toBeCloseTo(testValues.nutrients, 10);
      expect(cell.producerBiomass).toBeCloseTo(testValues.producerBiomass, 10);
      expect(cell.toxicity).toBeCloseTo(testValues.toxicity, 10);
    });
  });

  describe('Out-of-bounds access', () => {
    it('should throw error when getting cell with negative coordinates', () => {
      const world = new World();

      expect(() => world.getCell(-1, 0)).toThrow();
      expect(() => world.getCell(0, -1)).toThrow();
      expect(() => world.getCell(-5, -5)).toThrow();
    });

    it('should throw error when getting cell beyond grid bounds', () => {
      const world = new World();

      expect(() => world.getCell(100, 50)).toThrow();
      expect(() => world.getCell(50, 100)).toThrow();
      expect(() => world.getCell(100, 100)).toThrow();
      expect(() => world.getCell(1000, 1000)).toThrow();
    });

    it('should throw error when setting cell with negative coordinates', () => {
      const world = new World();

      expect(() => world.setCell(-1, 0, { energy: 10 })).toThrow();
      expect(() => world.setCell(0, -1, { energy: 10 })).toThrow();
    });

    it('should throw error when setting cell beyond grid bounds', () => {
      const world = new World();

      expect(() => world.setCell(100, 50, { energy: 10 })).toThrow();
      expect(() => world.setCell(50, 100, { energy: 10 })).toThrow();
    });

    it('should provide descriptive error messages', () => {
      const world = new World();

      try {
        world.getCell(-5, 10);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toContain('out of bounds');
        expect(e.message).toContain('x=-5');
        expect(e.message).toContain('y=10');
      }
    });

    it('should throw for custom dimensions with out-of-bounds access', () => {
      const world = new World(50, 75);

      expect(() => world.getCell(50, 0)).toThrow();
      expect(() => world.getCell(0, 75)).toThrow();
      expect(() => world.setCell(49, 74, { energy: 10 })).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should work with corners of the grid', () => {
      const world = new World();

      world.setCell(0, 0, { energy: 1, nutrients: 2, producerBiomass: 3, toxicity: 4 });
      world.setCell(99, 0, { energy: 5, nutrients: 6, producerBiomass: 7, toxicity: 8 });
      world.setCell(0, 99, { energy: 9, nutrients: 10, producerBiomass: 11, toxicity: 12 });
      world.setCell(99, 99, { energy: 13, nutrients: 14, producerBiomass: 15, toxicity: 16 });

      expect(world.getCell(0, 0).energy).toBe(1);
      expect(world.getCell(99, 0).energy).toBe(5);
      expect(world.getCell(0, 99).energy).toBe(9);
      expect(world.getCell(99, 99).energy).toBe(13);
    });

    it('should handle zero cell values', () => {
      const world = new World();

      world.setCell(50, 50, { energy: 0, nutrients: 0, producerBiomass: 0, toxicity: 0 });
      const cell = world.getCell(50, 50);

      expect(cell.energy).toBe(0);
      expect(cell.nutrients).toBe(0);
      expect(cell.producerBiomass).toBe(0);
      expect(cell.toxicity).toBe(0);
    });

    it('should handle large positive and negative values', () => {
      const world = new World();

      world.setCell(25, 25, {
        energy: 1e10,
        nutrients: -1e10,
        producerBiomass: Number.MAX_SAFE_INTEGER,
        toxicity: -Number.MAX_SAFE_INTEGER,
      });

      const cell = world.getCell(25, 25);
      expect(cell.energy).toBe(1e10);
      expect(cell.nutrients).toBe(-1e10);
      expect(cell.producerBiomass).toBe(Number.MAX_SAFE_INTEGER);
      expect(cell.toxicity).toBe(-Number.MAX_SAFE_INTEGER);
    });
  });

  describe('fromJSON error handling', () => {
    it('should throw on null or undefined', () => {
      expect(() => World.fromJSON(null)).toThrow();
      expect(() => World.fromJSON(undefined)).toThrow();
    });

    it('should throw on non-object input', () => {
      expect(() => World.fromJSON('string')).toThrow();
      expect(() => World.fromJSON(42)).toThrow();
      expect(() => World.fromJSON([])).toThrow();
    });

    it('should throw on missing required fields', () => {
      expect(() => World.fromJSON({ width: 100 })).toThrow();
      expect(() => World.fromJSON({ height: 100 })).toThrow();
      expect(() => World.fromJSON({ width: 100, height: 100 })).toThrow();
      expect(() => World.fromJSON({ cells: [] })).toThrow();
    });

    it('should throw if cell count does not match dimensions', () => {
      const data = {
        width: 100,
        height: 100,
        cells: new Array(9999).fill({ energy: 0, nutrients: 0, producerBiomass: 0, toxicity: 0 }),
      };

      expect(() => World.fromJSON(data)).toThrow('cell count');
    });
  });
});

// ============================================================================
// Solar Energy Grid Tests
// ============================================================================

describe('Solar Energy Grid - Radial Dissipation', () => {
  describe('computeSolarEnergyGrid function', () => {
    it('should return a 100×100 grid', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      expect(Array.isArray(grid)).toBe(true);
      expect(grid.length).toBe(100);

      for (let row of grid) {
        expect(Array.isArray(row)).toBe(true);
        expect(row.length).toBe(100);
      }
    });

    it('should return number values for all cells', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          expect(typeof grid[y][x]).toBe('number');
          expect(isFinite(grid[y][x])).toBe(true);
        }
      }
    });

    it('should set center cell (50, 50) to BASE_SOLAR_ENERGY (10)', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      const centerEnergy = grid[50][50];
      expect(centerEnergy).toBeCloseTo(SIMULATION_CONSTANTS.baseSolarEnergy, 5);
    });

    it('should have corner cells with energy less than center', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      const centerEnergy = grid[50][50];
      const corner1 = grid[0][0];
      const corner2 = grid[0][99];
      const corner3 = grid[99][0];
      const corner4 = grid[99][99];

      expect(corner1).toBeLessThan(centerEnergy);
      expect(corner2).toBeLessThan(centerEnergy);
      expect(corner3).toBeLessThan(centerEnergy);
      expect(corner4).toBeLessThan(centerEnergy);
    });

    it('should have all cell values >= 1 (no cell completely dark)', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          expect(grid[y][x]).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('should have all cell values <= BASE_SOLAR_ENERGY (no cell brighter than center)', () => {
      const grid = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      const baseSolarEnergy = SIMULATION_CONSTANTS.baseSolarEnergy;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          expect(grid[y][x]).toBeLessThanOrEqual(baseSolarEnergy);
        }
      }
    });

    it('should be deterministic (same constants produce same results)', () => {
      const grid1 = computeSolarEnergyGrid(SIMULATION_CONSTANTS);
      const grid2 = computeSolarEnergyGrid(SIMULATION_CONSTANTS);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          expect(grid2[y][x]).toBe(grid1[y][x]);
        }
      }
    });

    it('should respect SOLAR_EDGE_FALLOFF_FACTOR parameter', () => {
      // Create constants with different falloff factors
      const lowFalloff = { ...SIMULATION_CONSTANTS, solarEdgeFalloffFactor: 0.2 };
      const highFalloff = { ...SIMULATION_CONSTANTS, solarEdgeFalloffFactor: 0.9 };

      const gridLow = computeSolarEnergyGrid(lowFalloff);
      const gridHigh = computeSolarEnergyGrid(highFalloff);

      // Corner cells should have MORE energy with low falloff, LESS with high falloff
      expect(gridLow[0][0]).toBeGreaterThan(gridHigh[0][0]);

      // Center should remain the same
      expect(gridLow[50][50]).toBeCloseTo(gridHigh[50][50], 5);
    });

    it('should handle different falloff factors without errors', () => {
      const factors = [0.0, 0.3, 0.7, 1.0];

      for (const factor of factors) {
        const constants = { ...SIMULATION_CONSTANTS, solarEdgeFalloffFactor: factor };
        const grid = computeSolarEnergyGrid(constants);

        // Should not throw and should return valid grid
        expect(grid.length).toBe(100);
        expect(grid[0].length).toBe(100);

        // All values should still be valid
        for (let y = 0; y < 100; y++) {
          for (let x = 0; x < 100; x++) {
            expect(grid[y][x]).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });
  });

  describe('World initialization with solar energy grid', () => {
    it('should initialize cells with solar energy values when constants provided', () => {
      // Create a World with SIMULATION_CONSTANTS
      const world = new World(100, 100, SIMULATION_CONSTANTS);

      // Center cell (50, 50) should have BASE_SOLAR_ENERGY ≈ 10
      const centerCell = world.getCell(50, 50);
      expect(centerCell.energy).toBeCloseTo(SIMULATION_CONSTANTS.baseSolarEnergy, 5);
      expect(centerCell.energy).toBeCloseTo(10, 5);

      // Corner cell (0, 0) should have less energy than center
      const cornerCell = world.getCell(0, 0);
      expect(cornerCell.energy).toBeLessThan(centerCell.energy);
      expect(cornerCell.energy).toBeLessThan(10);

      // All cells should have energy >= 1 (minimum solar energy)
      let cellsChecked = 0;
      for (let x = 0; x < 100; x += 10) {
        for (let y = 0; y < 100; y += 10) {
          const cell = world.getCell(x, y);
          expect(cell.energy).toBeGreaterThanOrEqual(1);
          cellsChecked++;
        }
      }
      expect(cellsChecked).toBeGreaterThan(0);
    });
  });
});
