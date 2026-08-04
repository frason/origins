import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { buildDemoEngine } from '../simulation/demoWorld';
import { createEngine, hasLocalReproductiveResources, tickEngine } from '../simulation/engine';
import { World } from '../simulation/world';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';

function animal(strategy: EnergyStrategy, x = 2, y = 2) {
  return new Creature({
    speciesId: strategy, lineageId: strategy, parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy },
    x, y, energy: 100, age: 8,
  });
}

describe('reproduction governance', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('requires food appropriate to the parent strategy', () => {
    const world = new World(5, 5);
    const herbivore = animal('herbivore');
    const carnivore = animal('carnivore');
    let index = new CreatureSpatialIndex([herbivore]);
    expect(hasLocalReproductiveResources(herbivore, world, index)).toBe(false);
    world.setCell(2, 2, { producerBiomass: 5 });
    expect(hasLocalReproductiveResources(herbivore, world, index)).toBe(true);
    index = new CreatureSpatialIndex([carnivore]);
    expect(hasLocalReproductiveResources(carnivore, world, index)).toBe(false);
    const prey = animal('herbivore', 3, 2);
    index = new CreatureSpatialIndex([carnivore, prey]);
    expect(hasLocalReproductiveResources(carnivore, world, index)).toBe(true);
  });

  it('keeps the first twelve ticks in an establishment phase', () => {
    let state = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    for (let tick = 0; tick < 12; tick++) state = tickEngine(state);
    const births = state.events.filter((event) => event.type === 'birth').length;
    const deaths = state.events.filter((event) => event.type === 'death').length;
    expect(births).toBeGreaterThan(0);
    expect(births).toBeLessThanOrEqual(15);
    expect(deaths).toBeLessThanOrEqual(12);
  });

  it('replays the governed opening exactly', () => {
    const run = () => {
      let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });
      for (let tick = 0; tick < 12; tick++) state = tickEngine(state);
      return JSON.stringify({
        creatures: state.creatures.map((creature) => creature.toJSON()),
        events: state.events,
      });
    };
    expect(run()).toBe(run());
  });

  it('records durable parent evidence when offspring are produced', () => {
    const parent = animal('herbivore');
    parent.energy = 180;
    const state = createEngine(7, [parent], 5, 5, {
      baseMetabolism: 0,
      reproductionEnergyThreshold: 100,
      reproductionEnergyCost: 10,
      reproductionMaturityAgeTicks: 0,
      reproductionCooldownTicks: 0,
      defaultMutationRate: 0,
      monocultureMortalityPenalty: 0,
    });
    state.world.setCell(2, 2, { producerBiomass: 50 });

    const next = tickEngine(state);
    const persistedParent = next.creatures.find((creature) => creature.id === state.creatures[0].id);
    expect(persistedParent?.offspringCount).toBe(1);
    expect(next.events).toContainEqual(expect.objectContaining({
      type: 'birth', parentCreatureId: state.creatures[0].id,
    }));
  });
});
