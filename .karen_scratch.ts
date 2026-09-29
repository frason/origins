import { Creature } from './src/simulation/creature';
import { World } from './src/simulation/world';
import { DEFAULT_TRAITS } from './src/utils/traits';
import { moveAcrossTerrain } from './src/simulation/biomeTraversal';

Creature.resetIdCounter();
const world = new World(100, 100);
for (let y = 0; y < world.height; y++) {
  for (let x = 0; x < world.width; x++) {
    world.setCell(x, y, { biome: 'grassland', waterDepth: 0 });
  }
}
for (let x = 15; x <= 35; x++) {
  world.setCell(x, 50, { waterDepth: 1.0, biome: 'wetland' });
}
const creature = new Creature({
  speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
  traits: { ...DEFAULT_TRAITS, speed: 10, aquaticAdaptation: 0 },
  x: 10, y: 50, energy: 500,
});
const result = moveAcrossTerrain(creature, { x: 40, y: 50 }, world);
console.log('RESULT', JSON.stringify(result));
const cellAtResult = world.getCell(result.x, result.y);
console.log('Landed cell waterDepth', cellAtResult.waterDepth, 'biome', cellAtResult.biome);
