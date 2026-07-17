import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, runEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

function population(count: number, speciesId: string): Creature[] {
  return Array.from({ length: count }, (_, index) =>
    new Creature({
      speciesId,
      lineageId: `${speciesId}_root`,
      parentId: null,
      traits: {
        ...DEFAULT_TRAITS,
        energyStrategy: 'herbivore',
        speed: 0.1,
      },
      x: index % 20,
      y: Math.floor(index / 20),
      energy: 200,
    })
  );
}

const pressureOverrides = {
  baseMetabolism: 0,
  reproductionEnergyThreshold: 50,
  reproductionEnergyCost: 10,
  defaultMutationRate: 0,
  maxGlobalPopulation: 50,
  monocultureDominanceThreshold: 0.8,
  monocultureReproductionLimit: 2,
  overcrowdingMortalityRate: 0,
};

describe('monoculture population control', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('makes a reproducing monoculture decline instead of replenishing itself', () => {
    const initial = createEngine(42, population(40, 'monoculture'), 30, 30, {
      ...pressureOverrides,
      monocultureMortalityPenalty: 0.2,
    });

    const final = runEngine(initial, 100);
    const living = final.creatures.filter((creature) => creature.lifecycleState === 'alive');

    expect(final.events.filter((event) => event.type === 'birth').length).toBeLessThanOrEqual(1);
    expect(living).toHaveLength(0);
  });

  it('uses free capacity for minority species but not the dominant monopoly', () => {
    const initial = createEngine(
      9,
      [...population(30, 'dominant'), ...population(5, 'minority')],
      30,
      30,
      { ...pressureOverrides, monocultureMortalityPenalty: 0 }
    );

    const next = tickEngine(initial);
    const births = next.events.filter((event) => event.type === 'birth');

    expect(births.length).toBe(5);
    expect(births.every((event) => event.speciesId === 'minority')).toBe(true);
  });

  it('never allows births to exceed global carrying capacity', () => {
    const initial = createEngine(
      11,
      [...population(15, 'alpha'), ...population(15, 'beta')],
      30,
      30,
      {
        ...pressureOverrides,
        maxGlobalPopulation: 40,
        monocultureMortalityPenalty: 0,
      }
    );

    const next = tickEngine(initial);
    const living = next.creatures.filter((creature) => creature.lifecycleState === 'alive');

    expect(living).toHaveLength(40);
    expect(next.events.filter((event) => event.type === 'birth')).toHaveLength(10);
  });

  it('deterministically culls oversized imported populations to capacity', () => {
    const run = () => {
      Creature.resetIdCounter();
      const initial = createEngine(77, population(80, 'oversized'), 30, 30, {
        ...pressureOverrides,
        monocultureDominanceThreshold: 1,
        monocultureMortalityPenalty: 0,
      });
      return tickEngine(initial).creatures
        .filter((creature) => creature.lifecycleState === 'alive')
        .map((creature) => creature.id);
    };

    expect(run()).toEqual(run());
    expect(run()).toHaveLength(50);
  });
});
