// Quick verification that the determinism cadence fix works

import { Creature } from './dist/simulation/creature.js';
import { World } from './dist/simulation/world.js';
import { moveAcrossTerrain } from './dist/simulation/biomeTraversal.js';

const DEFAULT_TRAITS = {
  size: 1,
  speed: 1,
  visionRange: 10,
  hearingRange: 5,
  camouflage: 0,
  armor: 0,
  boneDensity: 0,
  metabolism: 0.5,
  reproductionRate: 0.5,
  brainSize: 0.5,
  consciousness: 0.5,
  communication: 0,
  collectiveConnection: 0,
  energyStrategy: 'herbivore',
  aquaticAffinity: 0,
  terrainGrip: 0,
};

try {
  const world = new World(30, 30, 42);

  // Set up obstacle similar to test
  for (let y = 19; y <= 21; y++) {
    for (let x = 19; x <= 21; x++) world.setCell(x, y, { biome: 'ocean' });
  }
  world.setCell(20, 20, { biome: 'grassland' });
  world.setCell(21, 20, { biome: 'wetland' });
  world.setCell(22, 20, { biome: 'grassland' });

  // Test delayed creature (age 5)
  const delayed = new Creature({
    speciesId: 'test',
    lineageId: 'test',
    parentId: null,
    traits: DEFAULT_TRAITS,
    x: 20,
    y: 20,
    energy: 50,
    age: 5,
  });

  // Test moving creature (age 1)
  const moving = new Creature({
    speciesId: 'test',
    lineageId: 'test',
    parentId: null,
    traits: DEFAULT_TRAITS,
    x: 20,
    y: 20,
    energy: 50,
    age: 1,
  });

  const delayedResult = moveAcrossTerrain(delayed, { x: 22, y: 20 }, world);
  const movingResult = moveAcrossTerrain(moving, { x: 22, y: 20 }, world);

  console.log('Delayed creature (age=5) position:', delayedResult);
  console.log('Expected: { x: 20, y: 20 }');
  console.log('Pass:', delayedResult.x === 20 && delayedResult.y === 20);

  console.log('\nMoving creature (age=1) position:', movingResult);
  console.log('Expected: { x: 21, y: 20 }');
  console.log('Pass:', movingResult.x === 21 && movingResult.y === 20);
} catch (e) {
  console.error('Error:', e.message);
}
