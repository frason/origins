import { World, generateTerrain } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('DEBUG: Elevation distribution', () => {
  it('show overall elevation distribution', () => {
    const seed = 6666;
    const terrain = generateTerrain(100, 100, seed);

    let totalHighElev = 0;
    let totalMidElev = 0;
    let totalLowElev = 0;
    const elevBuckets: Record<number, number> = {};

    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const elev = terrain[y][x].elevation;
        const bucket = Math.floor(elev * 10) / 10;
        elevBuckets[bucket] = (elevBuckets[bucket] || 0) + 1;

        if (elev > 0.65) totalHighElev++;
        else if (elev > 0.35) totalMidElev++;
        else totalLowElev++;
      }
    }

    console.log(`Total cells: 10000`);
    console.log(`High elev (>0.65): ${totalHighElev} (${(totalHighElev/100).toFixed(1)}%)`);
    console.log(`Mid elev (0.35-0.65): ${totalMidElev} (${(totalMidElev/100).toFixed(1)}%)`);
    console.log(`Low elev (<0.35): ${totalLowElev} (${(totalLowElev/100).toFixed(1)}%)`);
    console.log('Elevation distribution:');
    Object.keys(elevBuckets).sort((a, b) => parseFloat(b) - parseFloat(a)).forEach(bucket => {
      const pct = ((elevBuckets[parseFloat(bucket)] || 0) / 100).toFixed(1);
      console.log(`  ${bucket}-${(parseFloat(bucket)+0.1).toFixed(1)}: ${pct}%`);
    });

    expect(true).toBe(true);
  });
});
