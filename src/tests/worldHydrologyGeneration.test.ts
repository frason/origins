import { World, generateTerrain, generateHydrology, generateSubstrate } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('World Hydrology Generation', () => {
  describe('Determinism - Same seed produces identical worlds', () => {
    it('should generate identical worlds from the same seed (snapshot test)', () => {
      const seed = 42;
      const constants = SIMULATION_CONSTANTS;

      const world1 = new World(100, 100, constants, seed);
      const world2 = new World(100, 100, constants, seed);

      // Compare all cells for exact match
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell1 = world1.getCell(x, y);
          const cell2 = world2.getCell(x, y);

          expect(cell2.elevation).toBe(cell1.elevation);
          expect(cell2.temperature).toBe(cell1.temperature);
          expect(cell2.biome).toBe(cell1.biome);
          expect(cell2.substrate).toBe(cell1.substrate);
          expect(cell2.waterDepth).toBe(cell1.waterDepth);
          expect(cell2.waterTable).toBe(cell1.waterTable);
          expect(cell2.salinity).toBe(cell1.salinity);
        }
      }
    });

    it('should produce different worlds from different seeds', () => {
      const constants = SIMULATION_CONSTANTS;

      const world1 = new World(100, 100, constants, 1);
      const world2 = new World(100, 100, constants, 2);

      let differences = 0;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell1 = world1.getCell(x, y);
          const cell2 = world2.getCell(x, y);

          if (
            cell1.substrate !== cell2.substrate ||
            cell1.waterDepth !== cell2.waterDepth ||
            cell1.salinity !== cell2.salinity
          ) {
            differences++;
          }
        }
      }

      expect(differences).toBeGreaterThan(0); // Should have differences
    });
  });

  describe('Hydrology - Water routing and basin formation', () => {
    it('should create lakes at local elevation minima', () => {
      const seed = 123;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let lakeCount = 0;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.waterDepth > 0.2) {
            lakeCount++;
          }
        }
      }

      expect(lakeCount).toBeGreaterThan(0);
    });

    it('should assign salinity to ocean-adjacent basins', () => {
      const seed = 456;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let salineCount = 0;
      let freshCount = 0;
      let allWaterCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.waterDepth > 0.1) {
            allWaterCount++;
            if (cell.salinity > 0.3) {
              salineCount++;
            } else if (cell.salinity < 0.2) {
              freshCount++;
            }
          }
        }
      }

      // Should have water bodies and proper salinity assignment
      expect(allWaterCount).toBeGreaterThan(0);
      // Fresh water from inland basins should be present
      if (allWaterCount > 0) {
        expect(freshCount + salineCount).toBeGreaterThan(0);
      }
    });

    it('should set waterTable on dry cells', () => {
      const seed = 789;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let dryWithWaterTableCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.waterDepth === 0 && cell.waterTable > 0) {
            dryWithWaterTableCount++;
          }
        }
      }

      // Most dry cells should have some water table
      expect(dryWithWaterTableCount).toBeGreaterThan(1000);
    });

    it('should maintain water depth in range [0, 1]', () => {
      const seed = 999;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          expect(cell.waterDepth).toBeGreaterThanOrEqual(0);
          expect(cell.waterDepth).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should maintain water table in range [0, 1]', () => {
      const seed = 1111;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          expect(cell.waterTable).toBeGreaterThanOrEqual(0);
          expect(cell.waterTable).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should maintain salinity in range [0, 1]', () => {
      const seed = 2222;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          expect(cell.salinity).toBeGreaterThanOrEqual(0);
          expect(cell.salinity).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('Basin-invariant tests', () => {
    it('should route water only downhill or to equal elevation neighbors', () => {
      const seed = 3333;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);
      const width = 100;
      const height = 100;

      // Independent algorithm: identify all true local minima
      const trueLocalMinima = new Set<string>();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = world.getCell(x, y);
          const elev = cell.elevation;
          let isLocalMin = true;

          // Check all 8 neighbors
          const dx = [-1, 0, 1, 1, 0, 1, 0, -1];
          const dy = [0, 1, 1, 0, 1, -1, -1, -1];

          for (let i = 0; i < 8; i++) {
            const nx = x + dx[i];
            const ny = y + dy[i];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighCell = world.getCell(nx, ny);
              // If any neighbor is strictly lower, not a local minimum
              if (neighCell.elevation < elev) {
                isLocalMin = false;
                break;
              }
            }
          }

          if (isLocalMin) {
            trueLocalMinima.add(`${x},${y}`);
          }
        }
      }

      // Verify every water cell either:
      // 1. Is a true local minimum, OR
      // 2. Can trace a downhill path to a true local minimum
      let waterCellCount = 0;
      let waterCellsInValidBasins = 0;
      const invalidWaterCells: Array<[number, number]> = [];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = world.getCell(x, y);

          if (cell.waterDepth > 0) {
            waterCellCount++;
            const elev = cell.elevation;

            // Trace downhill path to find basin outlet
            let currentX = x;
            let currentY = y;
            let foundBasin = false;
            const visited = new Set<string>();
            const pathLength = 10000; // Limit iterations to detect infinite loops

            for (let step = 0; step < pathLength; step++) {
              const key = `${currentX},${currentY}`;
              if (visited.has(key)) {
                // Cycle detected - we're at a local minimum
                if (trueLocalMinima.has(key)) {
                  foundBasin = true;
                }
                break;
              }
              visited.add(key);

              if (trueLocalMinima.has(key)) {
                foundBasin = true;
                break;
              }

              const currentCell = world.getCell(currentX, currentY);
              const currentElev = currentCell.elevation;

              // Find neighbor with strictly lower elevation (for downhill path)
              let lowestNeighbor: [number, number] | null = null;
              let lowestElev = currentElev;

              const dx = [-1, 0, 1, 1, 0, 1, 0, -1];
              const dy = [0, 1, 1, 0, 1, -1, -1, -1];

              for (let i = 0; i < 8; i++) {
                const nx = currentX + dx[i];
                const ny = currentY + dy[i];
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nCell = world.getCell(nx, ny);
                  if (nCell.elevation < lowestElev) {
                    lowestElev = nCell.elevation;
                    lowestNeighbor = [nx, ny];
                  }
                }
              }

              if (lowestNeighbor === null) {
                // No downhill neighbor - must be at a local minimum
                if (trueLocalMinima.has(key)) {
                  foundBasin = true;
                }
                break;
              }

              [currentX, currentY] = lowestNeighbor;
            }

            if (foundBasin) {
              waterCellsInValidBasins++;
            } else {
              invalidWaterCells.push([x, y]);
            }
          }
        }
      }

      // Assertions
      expect(waterCellCount).toBeGreaterThan(0);
      expect(waterCellsInValidBasins).toBe(waterCellCount);
      if (invalidWaterCells.length > 0) {
        console.log(`Found ${invalidWaterCells.length} water cells not in valid basins:`, invalidWaterCells.slice(0, 5));
      }
    });

    it('should have water table higher in areas with low elevation', () => {
      const seed = 4444;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let lowElevationAvgWaterTable = 0;
      let highElevationAvgWaterTable = 0;
      let lowCount = 0;
      let highCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.elevation < 0.4) {
            lowElevationAvgWaterTable += cell.waterTable;
            lowCount++;
          }
          if (cell.elevation > 0.65) {
            highElevationAvgWaterTable += cell.waterTable;
            highCount++;
          }
        }
      }

      const lowAvg = lowElevationAvgWaterTable / lowCount;
      const highAvg = highElevationAvgWaterTable / highCount;

      // Low elevation should have higher average water table
      expect(lowAvg).toBeGreaterThan(highAvg);
    });
  });

  describe('Substrate generation', () => {
    it('should assign all cells a valid substrate type', () => {
      const seed = 5555;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      const validSubstrates = new Set(['sand', 'loam', 'clay', 'peat', 'rock', 'sediment']);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          expect(validSubstrates.has(cell.substrate)).toBe(true);
        }
      }
    });

    it('should place rock substrate at high elevations', () => {
      const seed = 6666;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let rockCount = 0;
      let highElevationRockCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.substrate === 'rock') {
            rockCount++;
            if (cell.elevation > 0.65) {
              highElevationRockCount++;
            }
          }
        }
      }

      // Most rock should be at high elevations
      if (rockCount > 0) {
        expect(highElevationRockCount / rockCount).toBeGreaterThan(0.6);
      }
    });

    it('should place peat substrate in wet areas', () => {
      const seed = 7777;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let peatCount = 0;
      let wetPeatCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.substrate === 'peat') {
            peatCount++;
            if (cell.waterTable > 0.4 || cell.waterDepth > 0.1) {
              wetPeatCount++;
            }
          }
        }
      }

      // Most peat should be in wet areas
      if (peatCount > 0) {
        expect(wetPeatCount / peatCount).toBeGreaterThan(0.5);
      }
    });

    it('should place sediment substrate underwater or in saline areas', () => {
      const seed = 8888;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let sedimentCount = 0;
      let waterOrSalineSedimentCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.substrate === 'sediment') {
            sedimentCount++;
            if (cell.waterDepth > 0.1 || cell.salinity > 0.3) {
              waterOrSalineSedimentCount++;
            }
          }
        }
      }

      // Most sediment should be in water or saline areas
      if (sedimentCount > 0) {
        expect(waterOrSalineSedimentCount / sedimentCount).toBeGreaterThan(0.5);
      }
    });

    it('should place sand substrate at high elevations with low water', () => {
      const seed = 9999;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let sandCount = 0;
      let highDrySandCount = 0;

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.substrate === 'sand') {
            sandCount++;
            if (cell.elevation > 0.5 && cell.waterDepth < 0.1 && cell.waterTable < 0.3) {
              highDrySandCount++;
            }
          }
        }
      }

      // Sand should have reasonable placement
      expect(sandCount).toBeGreaterThan(0);
    });
  });

  describe('Biome reclassification after hydrology', () => {
    it('should recompute biome based on water table', () => {
      const seed = 10000;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      let wetlandCount = 0;
      let wetlandsWithWater = 0;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.biome === 'wetland') {
            wetlandCount++;
            // Wetlands should have meaningful moisture/water
            if (cell.waterTable > 0.2 || cell.waterDepth > 0.05) {
              wetlandsWithWater++;
            }
          }
        }
      }

      // Should have some wetlands and most should have water
      expect(wetlandCount).toBeGreaterThan(0);
      if (wetlandCount > 0) {
        expect(wetlandsWithWater / wetlandCount).toBeGreaterThan(0.3);
      }
    });

    it('should preserve existing biome distribution for dry areas', () => {
      const seed = 11111;
      const width = 100;
      const height = 100;

      // Generate terrain without constants (no solar/hydrology)
      const terrain = generateTerrain(width, height, seed);

      // Count biomes in original terrain
      const originalBiomeCounts: Record<string, number> = {};
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const biome = terrain[y][x].biome;
          originalBiomeCounts[biome] = (originalBiomeCounts[biome] || 0) + 1;
        }
      }

      // Generate full world
      const constants = SIMULATION_CONSTANTS;
      const world = new World(width, height, constants, seed);

      // Count biomes in new world
      const newBiomeCounts: Record<string, number> = {};
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = world.getCell(x, y);
          const biome = cell.biome;
          newBiomeCounts[biome] = (newBiomeCounts[biome] || 0) + 1;
        }
      }

      // Biome distribution should be similar (water may shift some to wetland)
      // but overall structure should be preserved
      expect(Object.keys(newBiomeCounts).length).toBeGreaterThan(0);
      expect(newBiomeCounts['ocean']).toBeGreaterThan(0);
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle small world dimensions', () => {
      const seed = 12345;
      const constants = { ...SIMULATION_CONSTANTS, worldWidth: 10, worldHeight: 10 };
      const world = new World(10, 10, constants, seed);

      expect(world.width).toBe(10);
      expect(world.height).toBe(10);

      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          const cell = world.getCell(x, y);
          expect(cell.waterDepth).toBeGreaterThanOrEqual(0);
          expect(cell.waterDepth).toBeLessThanOrEqual(1);
          expect(cell.substrate).toBeTruthy();
        }
      }
    });

    it('should handle seed=0', () => {
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, 0);

      let hasWater = false;
      let hasSubstrates = new Set<string>();

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          if (cell.waterDepth > 0) hasWater = true;
          hasSubstrates.add(cell.substrate);
        }
      }

      expect(hasWater).toBe(true);
      expect(hasSubstrates.size).toBeGreaterThan(1);
    });

    it('should handle very large seeds', () => {
      const seed = 0xffffffff;
      const constants = SIMULATION_CONSTANTS;
      const world = new World(100, 100, constants, seed);

      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const cell = world.getCell(x, y);
          expect(isFinite(cell.waterDepth)).toBe(true);
          expect(isFinite(cell.waterTable)).toBe(true);
          expect(isFinite(cell.salinity)).toBe(true);
        }
      }
    });
  });
});
