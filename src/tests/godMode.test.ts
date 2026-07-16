import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

function creature(strategy: 'herbivore' | 'carnivore', energy = 100): Creature {
  return new Creature({
    speciesId: `${strategy}_species`,
    lineageId: `${strategy}_lineage`,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy },
    x: 50,
    y: 50,
    energy,
  });
}

const disablePressure = {
  monocultureMortalityPenalty: 0,
  overcrowdingMortalityRate: 0,
};

describe('God Mode runtime constants', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('applies metabolism overrides on the next tick', () => {
    const engine = createEngine(1, [creature('carnivore')]);
    const next = tickEngine(engine, {
      ...disablePressure,
      baseMetabolism: 7,
      reproductionEnergyThreshold: 1000,
    });

    expect(next.creatures[0].energy).toBe(93);
    expect(next.constants.baseMetabolism).toBe(7);
  });

  it('applies producer growth and feeding efficiency overrides', () => {
    const engine = createEngine(2, [creature('herbivore')]);
    engine.world.setCell(50, 50, { producerBiomass: 20 });

    const next = tickEngine(engine, {
      ...disablePressure,
      producerGrowthRate: 0,
      feedingEfficiency: 0.25,
      baseMetabolism: 0,
      reproductionEnergyThreshold: 1000,
    });

    expect(next.creatures[0].energy).toBe(105);
    expect(next.world.getCell(50, 50).producerBiomass).toBe(0);
  });

  it('applies reproduction threshold and cost overrides', () => {
    const engine = createEngine(3, [creature('carnivore', 120)]);
    const next = tickEngine(engine, {
      ...disablePressure,
      baseMetabolism: 0,
      reproductionEnergyThreshold: 110,
      reproductionEnergyCost: 25,
    });

    expect(next.creatures).toHaveLength(2);
    expect(next.creatures[0].energy).toBe(95);
    expect(next.events.some((event) => event.type === 'birth')).toBe(true);
  });

  it('uses solar overrides when a world is reset or created', () => {
    const engine = createEngine(4, [], 100, 100, {
      baseSolarEnergy: 40,
      solarEdgeFalloffFactor: 0,
    });

    expect(engine.world.getCell(50, 50).energy).toBe(40);
    expect(engine.world.getCell(0, 0).energy).toBe(40);
    expect(engine.constants.baseSolarEnergy).toBe(40);
  });

  it('remains deterministic with identical runtime overrides', () => {
    const run = () => {
      Creature.resetIdCounter();
      let engine = createEngine(99, [creature('herbivore', 220)]);
      for (let tick = 0; tick < 25; tick++) {
        engine = tickEngine(engine, {
          ...disablePressure,
          baseMetabolism: 1.25,
          feedingEfficiency: 0.65,
          defaultMutationRate: 0.12,
          mutationDrift: 0.18,
        });
      }
      return JSON.stringify({
        world: engine.world.toJSON(),
        creatures: engine.creatures.map((item) => item.toJSON()),
        events: engine.events,
        constants: engine.constants,
      });
    };

    expect(run()).toBe(run());
  });
});
