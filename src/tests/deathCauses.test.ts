import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

function creature(id: string, energy = 100, x = 1) {
  const value = new Creature({
    speciesId: id,
    lineageId: `${id}-root`,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', speed: 0 },
    x,
    y: 1,
    energy,
  });
  return value;
}

describe('structured engine death causes', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('attributes natural age deaths', () => {
    const state = createEngine(1, [creature('elder')], 4, 4, {
      baseMetabolism: 0,
      maxCreatureAgeTicks: 1,
      monocultureMortalityPenalty: 0,
    });
    const next = tickEngine(state);
    expect(next.events).toContainEqual(expect.objectContaining({
      type: 'death', speciesId: 'elder', deathCause: 'age',
    }));
  });

  it('attributes stochastic monoculture pressure without adding RNG calls', () => {
    const state = createEngine(2, [creature('same', 100, 1), creature('same', 100, 2)], 4, 4, {
      baseMetabolism: 0,
      monocultureDominanceThreshold: 0,
      monocultureMortalityPenalty: 1,
      monocultureReproductionLimit: 1,
      maxGlobalPopulation: 10,
    });
    const next = tickEngine(state);
    expect(next.events.filter((event) => event.type === 'death')).toHaveLength(2);
    expect(next.events.filter((event) => event.type === 'death').every(
      (event) => event.deathCause === 'monoculture-pressure'
    )).toBe(true);
  });

  it('attributes deterministic hard-cap deaths to overcrowding', () => {
    const state = createEngine(
      3,
      [creature('one', 100, 0), creature('two', 100, 1), creature('three', 100, 2)],
      4,
      4,
      {
        baseMetabolism: 0,
        monocultureDominanceThreshold: 1,
        monocultureMortalityPenalty: 0,
        overcrowdingMortalityRate: 0,
        maxGlobalPopulation: 1,
      }
    );
    const next = tickEngine(state);
    const deaths = next.events.filter((event) => event.type === 'death');
    expect(deaths).toHaveLength(2);
    expect(deaths.every((event) => event.deathCause === 'overcrowding')).toBe(true);
  });

  it('replays identical cause history from identical seeds', () => {
    const run = () => {
      Creature.resetIdCounter();
      return tickEngine(createEngine(4, [creature('same', 100, 1), creature('same', 100, 2)], 4, 4, {
        baseMetabolism: 0,
        monocultureDominanceThreshold: 0,
        monocultureMortalityPenalty: 0.5,
        monocultureReproductionLimit: 1,
      })).events;
    };
    expect(run()).toEqual(run());
  });
});
