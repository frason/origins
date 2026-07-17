import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

function runBreedingCohort() {
  Creature.resetIdCounter();
  const founders = Array.from({ length: 100 }, (_, index) =>
    new Creature({
      speciesId: 'founder_species',
      lineageId: 'founder_lineage',
      parentId: null,
      traits: {
        ...DEFAULT_TRAITS,
        energyStrategy: 'carnivore',
        speed: 0.1,
      },
      x: index % 10,
      y: Math.floor(index / 10),
      energy: 200,
    })
  );
  const engine = createEngine(4242, founders, 20, 20, {
    baseMetabolism: 0,
    monocultureMortalityPenalty: 0,
    overcrowdingMortalityRate: 0,
  });
  return tickEngine(engine);
}

describe('observable evolution frequency', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('produces a healthy deterministic number of births and mutation events', () => {
    const first = runBreedingCohort();
    const second = runBreedingCohort();
    const eventCounts = (events: typeof first.events) => ({
      births: events.filter((event) => event.type === 'birth').length,
      mutations: events.filter((event) => event.type === 'mutation').length,
    });

    expect(eventCounts(first.events)).toEqual(eventCounts(second.events));
    expect(eventCounts(first.events).births).toBe(100);
    expect(eventCounts(first.events).mutations).toBeGreaterThanOrEqual(5);
    expect(eventCounts(first.events).mutations).toBeLessThanOrEqual(25);
  });
});
