import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { feedOnProducer } from '../simulation/energy';
import { growProducers } from '../simulation/producer';
import { PRODUCER_TRAITS, getProducerTraits } from '../simulation/producerTypes';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';

function herbivore(): Creature {
  return new Creature({
    speciesId: 'grazer',
    lineageId: 'grazer_root',
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
    x: 0,
    y: 0,
    energy: 100,
  });
}

describe('producer archetype traits', () => {
  it('defines normalized defenses and positive ecology values', () => {
    for (const traits of Object.values(PRODUCER_TRAITS)) {
      expect(traits.growthMultiplier).toBeGreaterThan(0);
      expect(traits.carryingCapacity).toBeGreaterThan(0);
      expect(traits.defense).toBeGreaterThanOrEqual(0);
      expect(traits.defense).toBeLessThan(1);
      expect(traits.energyDensity).toBeGreaterThan(0);
    }
  });

  it('uses archetype-specific carrying capacity', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, {
      biome: 'desert',
      producerArchetype: 'xerophyte-mat',
      energy: 1000,
      producerBiomass: 34,
    });

    growProducers(world, 'solar', 1, true);

    expect(world.getCell(0, 0).producerBiomass).toBe(
      getProducerTraits('xerophyte-mat').carryingCapacity
    );
  });

  it('makes defended producers harder to consume', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, {
      producerArchetype: 'lithotroph',
      producerBiomass: 20,
    });
    const creature = herbivore();

    const gained = feedOnProducer(creature, world.getCell(0, 0), world, 0, 0, 1, true);

    expect(gained).toBeCloseTo(7, 5);
    expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(10, 5);
  });

  it('makes energy-dense algae more rewarding than equal defended biomass', () => {
    const algaeWorld = new World(1, 1);
    const matWorld = new World(1, 1);
    algaeWorld.setCell(0, 0, { producerArchetype: 'photic-algae', producerBiomass: 20 });
    matWorld.setCell(0, 0, { producerArchetype: 'xerophyte-mat', producerBiomass: 20 });

    const algaeEnergy = feedOnProducer(
      herbivore(),
      algaeWorld.getCell(0, 0),
      algaeWorld,
      0,
      0,
      1,
      true
    );
    const matEnergy = feedOnProducer(
      herbivore(),
      matWorld.getCell(0, 0),
      matWorld,
      0,
      0,
      1,
      true
    );

    expect(algaeEnergy).toBeGreaterThan(matEnergy);
  });
});
