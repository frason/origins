import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, runEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getEnergyCapacity } from '../simulation/energy';

function creature(energy: number, strategy: 'herbivore' | 'carnivore' = 'herbivore') {
  return new Creature({
    speciesId: `${strategy}_species`,
    lineageId: `${strategy}_root`,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy },
    x: 10,
    y: 10,
    energy,
  });
}

describe('energy stability', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('conserves invested energy across reproduction', () => {
    const engine = createEngine(7, [creature(200, 'carnivore')], 20, 20, {
      baseMetabolism: 0,
      monocultureMortalityPenalty: 0,
      reproductionEnergyThreshold: 150,
      reproductionEnergyCost: 75,
    });

    const next = tickEngine(engine);
    const livingEnergy = next.creatures
      .filter((item) => item.lifecycleState === 'alive')
      .reduce((sum, item) => sum + item.energy, 0);

    expect(next.creatures).toHaveLength(2);
    expect(livingEnergy).toBe(200);
  });

  it('keeps every creature energy finite and bounded over 500 high-food ticks', () => {
    const engine = createEngine(99, [creature(100)], 20, 20, {
      baseMetabolism: 0,
      reproductionEnergyThreshold: 10_000,
      monocultureMortalityPenalty: 0,
      overcrowdingMortalityRate: 0,
    });
    for (let y = 0; y < engine.world.height; y++) {
      for (let x = 0; x < engine.world.width; x++) {
        engine.world.setCell(x, y, { producerBiomass: 10_000 });
      }
    }

    const final = runEngine(engine, 500);

    expect(final.creatures.length).toBeGreaterThan(0);
    for (const item of final.creatures) {
      expect(Number.isFinite(item.energy)).toBe(true);
      expect(item.energy).toBeGreaterThanOrEqual(0);
      expect(item.energy).toBeLessThanOrEqual(getEnergyCapacity(item));
    }
  });
});
