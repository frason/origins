import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import { getProducerTraits } from '../simulation/producerTypes';

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
    engine.world.setCell(50, 50, { temperature: 0.5, moisture: 0.5 });
    const next = tickEngine(engine, {
      ...disablePressure,
      baseMetabolism: 7,
      reproductionEnergyThreshold: 1000,
    });

    expect(next.creatures[0].energy).toBe(93);
    expect(next.constants.baseMetabolism).toBe(7);
    expect(next.events.filter((event) => event.type === 'intervention')).toHaveLength(1);
    expect(next.events.find((event) => event.type === 'intervention')?.constantChanges)
      .toEqual(expect.arrayContaining([
        { constant: 'baseMetabolism', before: 2, after: 7 },
        { constant: 'reproductionEnergyThreshold', before: 150, after: 1000 },
      ]));
    expect(next.events.find((event) => event.type === 'intervention')?.ecosystemBefore)
      .toMatchObject({ population: 1, speciesCount: 1, lineageCount: 1 });
  });

  it('groups changes into one intervention and does not repeat unchanged settings', () => {
    const engine = createEngine(11, [creature('carnivore')]);
    const changed = tickEngine(engine, {
      ...disablePressure,
      baseMetabolism: 3,
      feedingEfficiency: 0.6,
      reproductionEnergyThreshold: 1000,
    });
    const unchanged = tickEngine(changed, changed.constants);

    expect(changed.events.filter((event) => event.type === 'intervention')).toHaveLength(1);
    expect(changed.events.find((event) => event.type === 'intervention')?.constantChanges)
      .toHaveLength(5);
    expect(unchanged.events.filter((event) => event.type === 'intervention')).toHaveLength(1);
  });

  it('replays an identical intervention schedule exactly', () => {
    const run = () => {
      Creature.resetIdCounter();
      let engine = createEngine(17, [creature('herbivore', 180)]);
      engine = tickEngine(engine, { baseMetabolism: 1, reproductionEnergyThreshold: 1000 });
      engine = tickEngine(engine);
      engine = tickEngine(engine, { feedingEfficiency: 0.55 });
      return JSON.stringify(engine.events);
    };

    expect(run()).toBe(run());
  });

  it('applies producer growth and feeding efficiency overrides', () => {
    const engine = createEngine(2, [creature('herbivore')]);
    const producerTraits = getProducerTraits(
      engine.world.getCell(50, 50).producerArchetype
    );
    engine.world.setCell(50, 50, { producerBiomass: 20 });

    const next = tickEngine(engine, {
      ...disablePressure,
      producerGrowthRate: 0,
      feedingEfficiency: 0.25,
      baseMetabolism: 0,
      reproductionEnergyThreshold: 1000,
    });

    const consumed = 20 * (1 - producerTraits.defense);
    expect(next.creatures[0].energy).toBeCloseTo(
      100 + consumed * 0.25 * producerTraits.energyDensity,
      5
    );
    expect(next.world.getCell(50, 50).producerBiomass).toBeCloseTo(20 - consumed, 5);
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

  it('applies solar overrides on the next tick without losing recycled energy', () => {
    const engine = createEngine(5, []);
    const center = engine.world.getCell(50, 50);
    engine.world.setCell(50, 50, { energy: center.energy + 7 });

    const next = tickEngine(engine, {
      baseSolarEnergy: 40,
      solarEdgeFalloffFactor: 0,
    });

    expect(next.world.getCell(50, 50).energy).toBe(47);
    expect(next.world.getCell(0, 0).energy).toBe(40);
    expect(next.constants.baseSolarEnergy).toBe(40);
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
