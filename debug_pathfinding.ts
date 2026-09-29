import { World } from './src/simulation/world';
import { Creature } from './src/simulation/creature';
import { DEFAULT_TRAITS } from './src/utils/traits';
import { moveAcrossTerrain } from './src/simulation/biomeTraversal';

const world = new World(100, 100);
for (let y = 0; y < world.height; y++) {
  for (let x = 0; x < world.width; x++) {
    world.setCell(x, y, { biome: 'grassland', waterDepth: 0 });
  }
}

// Create impassable wall at x=40-41
for (let x = 40; x <= 41; x++) {
  for (let y = 45; y <= 55; y++) {
    world.setCell(x, y, { waterDepth: 6.0, biome: 'ocean' });
  }
}

const creature = new Creature({
  speciesId: 'terrestrial',
  lineageId: 'terrestrial',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, speed: 5, aquaticAdaptation: 0.1 },
  x: 20,
  y: 50,
  energy: 300,
});

console.log('Initial:', creature.x, creature.y);
for (let i = 0; i < 20; i++) {
  const newPos = moveAcrossTerrain(creature, { x: 80, y: 50 }, world);
  creature.x = newPos.x;
  creature.y = newPos.y;
  console.log(`Step ${i+1}: (${creature.x}, ${creature.y})`);
}
