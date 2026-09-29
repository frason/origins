import { Creature } from './src/simulation/creature';
import { createEngine, tickEngine } from './src/simulation/engine';
import { DEFAULT_TRAITS } from './src/utils/traits';

Creature.resetIdCounter();

const herbivore = new Creature({
  speciesId: 'herbivore_species',
  lineageId: 'herbivore_lineage',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', hearingRange: 50 },
  x: 50,
  y: 50,
  energy: 200,
});

const predator = new Creature({
  speciesId: 'predator_species',
  lineageId: 'predator_lineage',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
  x: 50,
  y: 50,
  energy: 30,
});

let engine = createEngine(42, [herbivore, predator], 100, 100, {
  predationHungerThresholdShare: 0.9,
});

console.log('Before tick 1:');
console.log('  Creatures:', engine.creatures.length);
console.log('  Active sounds:', engine.activeSounds.length);

engine = tickEngine(engine);

console.log('After tick 1:');
console.log('  Creatures:', engine.creatures.length);
console.log('  Active sounds:', engine.activeSounds.length);
const soundEvents1 = engine.events.filter(e => e.type.includes('sound'));
console.log('  Sound events:', soundEvents1.length);
console.log('  Sound types:', soundEvents1.map(e => e.type));
const fleeEvents1 = engine.events.filter(e => e.type === 'sound-flee');
console.log('  Flee events:', fleeEvents1.length);

engine = tickEngine(engine);

console.log('After tick 2:');
console.log('  Creatures:', engine.creatures.length);
const soundEvents2 = engine.events.filter(e => e.type.includes('sound'));
console.log('  Sound events (total):', soundEvents2.length);
const fleeEvents2 = engine.events.filter(e => e.type === 'sound-flee');
console.log('  Flee events:', fleeEvents2.length);
