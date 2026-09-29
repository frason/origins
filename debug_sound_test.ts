import { Creature } from './src/simulation/creature';
import { createEngine, tickEngine } from './src/simulation/engine';
import { DEFAULT_TRAITS } from './src/utils/traits';

Creature.resetIdCounter();

const herbivore = new Creature({
  speciesId: 'herbivore_species',
  lineageId: 'herbivore_lineage',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size: 2 },
  x: 50,
  y: 50,
  energy: 200,
});

const carnivore = new Creature({
  speciesId: 'carnivore_species',
  lineageId: 'carnivore_lineage',
  parentId: null,
  traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', hearingRange: 50, brainSize: 5 },
  x: 51,
  y: 50,
  energy: 200,
});

let engine = createEngine(2025, [herbivore, carnivore]);

// Add producer biomass at herbivore location so it can feed
const cell = engine.world.getCell(50, 50);
engine.world.setCell(50, 50, {
  ...cell,
  producerBiomass: 50,
});

console.log('=== Initial State ===');
console.log('Tick:', engine.tick);
console.log('Creatures:',  engine.creatures.map(c => ({ id: c.id.substring(0, 15), species: c.speciesId, x: c.x, y: c.y, energy: c.energy })));
console.log('Active sounds:', engine.activeSounds.length);
console.log('Events:', engine.events.length);

// Tick 1: herbivore feeds, creating feeding sound
console.log('\n=== Running Tick 1 ===');
engine = tickEngine(engine);
console.log('Tick:', engine.tick);
console.log('Creatures:', engine.creatures.map(c => ({ id: c.id.substring(0, 15), species: c.speciesId, x: c.x, y: c.y, energy: Math.round(c.energy), alive: c.lifecycleState === 'alive' })));
console.log('Active sounds:', engine.activeSounds.length);
if (engine.activeSounds.length > 0) {
  console.log('  Sounds:', engine.activeSounds.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y, intensity: s.intensity.toFixed(3) })));
}
const soundEvents1 = engine.events.filter(e => e.type && e.type.includes('sound'));
console.log('Sound events after tick 1:', soundEvents1.length);
if (soundEvents1.length > 0) {
  console.log('  Event types:', soundEvents1.map(e => e.type));
}

// Tick 2: carnivore detects the feeding sound
console.log('\n=== Running Tick 2 ===');
engine = tickEngine(engine);
console.log('Tick:', engine.tick);
console.log('Creatures:', engine.creatures.map(c => ({ id: c.id.substring(0, 15), species: c.speciesId, x: c.x, y: c.y, energy: Math.round(c.energy), alive: c.lifecycleState === 'alive' })));
console.log('Active sounds:', engine.activeSounds.length);
if (engine.activeSounds.length > 0) {
  console.log('  Sounds:', engine.activeSounds.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y, intensity: s.intensity.toFixed(3), tick: s.tick })));
}

const detectionEvents = engine.events.filter(
  (e) =>
    e.type === 'sound-detection' &&
    e.speciesId === 'carnivore_species'
);
console.log('Sound-detection events for carnivore:', detectionEvents.length);

const allSoundEvents = engine.events.filter(e => e.type && e.type.includes('sound'));
console.log('All sound events after tick 2:', allSoundEvents.length);
if (allSoundEvents.length > 0) {
  console.log('  Event types:', allSoundEvents.map(e => ({ type: e.type, species: e.speciesId, detail: e.detail })));
}
