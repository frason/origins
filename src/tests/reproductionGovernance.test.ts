import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { buildDemoEngine } from '../simulation/demoWorld';
import { hasLocalReproductiveResources, tickEngine } from '../simulation/engine';
import { World } from '../simulation/world';
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
    expect(hasLocalReproductiveResources(herbivore, [herbivore], world)).toBe(false);
    world.setCell(2, 2, { producerBiomass: 5 });
    expect(hasLocalReproductiveResources(herbivore, [herbivore], world)).toBe(true);
    expect(hasLocalReproductiveResources(carnivore, [carnivore], world)).toBe(false);
    const prey = animal('herbivore', 3, 2);
    expect(hasLocalReproductiveResources(carnivore, [carnivore, prey], world)).toBe(true);
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
});
