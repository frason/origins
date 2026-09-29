import { describe, it } from 'vitest';
import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('Debug rock placement', () => {
  it('analyze rock distribution', () => {
    const seed = 6666;
    const constants = SIMULATION_CONSTANTS;
    const world = new World(100, 100, constants, seed);

    let rockCount = 0;
    let highElevationRockCount = 0;
    const substrateDistribution: Record<string, number> = {};
    const elevationBuckets = {
      low: 0,    // < 0.3
      mid: 0,    // 0.3-0.6
      high: 0,   // 0.6-0.8
      peak: 0    // > 0.8
    };

    const rocksByElevation: Array<{ x: number; y: number; elev: number; water: number; waterTable: number }> = [];

    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const cell = world.getCell(x, y);

        // Count substrates
        substrateDistribution[cell.substrate] = (substrateDistribution[cell.substrate] || 0) + 1;

        // Count rock
        if (cell.substrate === 'rock') {
          rockCount++;
          rocksByElevation.push({ x, y, elev: cell.elevation, water: cell.waterDepth, waterTable: cell.waterTable });
          if (cell.elevation > 0.65) {
            highElevationRockCount++;
          }
        }

        // Elevation distribution
        if (cell.elevation < 0.3) elevationBuckets.low++;
        else if (cell.elevation < 0.6) elevationBuckets.mid++;
        else if (cell.elevation < 0.8) elevationBuckets.high++;
        else elevationBuckets.peak++;
      }
    }

    console.log('\n=== SUBSTRATE DISTRIBUTION ===');
    Object.entries(substrateDistribution).forEach(([sub, count]) => {
      console.log(`  ${sub}: ${count} cells (${(count / 10000 * 100).toFixed(1)}%)`);
    });

    console.log('\n=== ELEVATION DISTRIBUTION ===');
    console.log(`  Low (< 0.3): ${elevationBuckets.low} cells (${(elevationBuckets.low / 10000 * 100).toFixed(1)}%)`);
    console.log(`  Mid (0.3-0.6): ${elevationBuckets.mid} cells (${(elevationBuckets.mid / 10000 * 100).toFixed(1)}%)`);
    console.log(`  High (0.6-0.8): ${elevationBuckets.high} cells (${(elevationBuckets.high / 10000 * 100).toFixed(1)}%)`);
    console.log(`  Peak (> 0.8): ${elevationBuckets.peak} cells (${(elevationBuckets.peak / 10000 * 100).toFixed(1)}%)`);

    console.log(`\n=== ROCK ANALYSIS ===`);
    console.log(`  Total rock: ${rockCount} cells (${(rockCount / 10000 * 100).toFixed(1)}%)`);
    console.log(`  High elevation rock (>0.65): ${highElevationRockCount} cells`);
    if (rockCount > 0) {
      console.log(`  Ratio: ${(highElevationRockCount / rockCount).toFixed(3)}`);
      console.log(`  Expected: > 0.6`);
    }

    // Sample some rock locations
    console.log('\n=== SAMPLE ROCK LOCATIONS ===');
    const samples = rocksByElevation.slice(0, 5);
    samples.forEach(r => {
      console.log(`  (${r.x}, ${r.y}): elev=${r.elev.toFixed(3)}, water=${r.water.toFixed(3)}, waterTable=${r.waterTable.toFixed(3)}`);
    });
  });
});
