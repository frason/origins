import { describe, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('debug267', () => {
  it('debug feeding sound', () => {
    const herbivore = new Creature({
      speciesId: 'herbivore_species',
      lineageId: 'herbivore_lineage',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size: 2, hearingRange: 50 },
      x: 50,
      y: 50,
      energy: 200,
    });

    const carnivore = new Creature({
      speciesId: 'carnivore_species',
      lineageId: 'carnivore_lineage',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', hearingRange: 50, brainSize: 5 },
      x: 50,
      y: 50,
      energy: 200,
    });

    let engine = createEngine(2025, [herbivore, carnivore]);
    for (let y = 0; y < engine.world.height; y++) {
      for (let x = 0; x < engine.world.width; x++) {
        const cell = engine.world.getCell(x, y);
        engine.world.setCell(x, y, { ...cell, producerBiomass: 50 });
      }
    }
    engine = tickEngine(engine);
    console.log('TICK1 events', JSON.stringify(engine.events));
    console.log('TICK1 herb', JSON.stringify(engine.creatures.find((c) => c.speciesId === 'herbivore_species')));
    engine = tickEngine(engine);
    console.log('TICK2 events', JSON.stringify(engine.events.filter((e) => e.tick === 2)));
  });
});
