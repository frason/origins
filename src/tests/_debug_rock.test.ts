import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('DEBUG: Rock distribution', () => {
  it('show rock substrate distribution', () => {
    const seed = 6666;
    const world = new World(100, 100, SIMULATION_CONSTANTS, seed);

    let substrateCounts: Record<string, number> = {};
    let rockByElevation: number[] = [];

    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const cell = world.getCell(x, y);
        substrateCounts[cell.substrate] = (substrateCounts[cell.substrate] || 0) + 1;

        if (cell.substrate === 'rock') {
          rockByElevation.push(cell.elevation);
        }
      }
    }

    console.log('Substrate distribution:', substrateCounts);
    rockByElevation.sort();
    const rockMedian = rockByElevation[Math.floor(rockByElevation.length / 2)];
    const highElevRock = rockByElevation.filter(e => e > 0.65).length;
    console.log(`Rock: count=${substrateCounts['rock']}, median elev=${rockMedian.toFixed(3)}, high-elev (>0.65)=${highElevRock}/${rockByElevation.length}`);

    expect(true).toBe(true);
  });
});
