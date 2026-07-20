import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import {
  buildLocalResourcePressureCache,
  LOCAL_PRESSURE_500_CREATURE_BUDGET_MS,
} from '../simulation/localResourcePressure';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';

function creature(
  strategy: EnergyStrategy,
  x = 3,
  y = 3,
  speciesId: string = strategy,
  lifecycleState: 'alive' | 'dead' = 'alive'
): Creature {
  return new Creature({
    speciesId,
    lineageId: speciesId,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy },
    x,
    y,
    energy: 100,
    lifecycleState,
    corpseDecayTicks: lifecycleState === 'dead' ? 20 : 0,
  });
}

function foodWorld(width = 8, height = 8): World {
  const world = new World(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      world.setCell(x, y, { biome: 'grassland', producerBiomass: 0 });
    }
  }
  return world;
}

describe('local resource pressure', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('returns byte-identical aggregate records for identical state', () => {
    const world = foodWorld();
    const creatures = [creature('herbivore'), creature('herbivore', 4, 3)];
    world.setCell(3, 3, { producerBiomass: 50 });
    const first = buildLocalResourcePressureCache(10, creatures, world, 2);
    const replay = buildLocalResourcePressureCache(10, creatures, world, 2);

    expect(JSON.stringify(replay.records())).toBe(JSON.stringify(first.records()));
    expect(first.tick).toBe(10);
    expect(first.get(creatures[0].id)).toBe(first.get(creatures[0].id));
  });

  it('measures producer food and competing grazers for herbivores', () => {
    const world = foodWorld();
    const observer = creature('herbivore');
    const competitor = creature('omnivore', 4, 3, 'other');
    world.setCell(3, 3, { producerBiomass: 100 });
    const record = buildLocalResourcePressureCache(0, [observer, competitor], world, 2)
      .get(observer.id)!;

    expect(record.nearbyLiving).toBe(1);
    expect(record.foodCompetitors).toBe(1);
    expect(record.accessibleProducerEnergy).toBeGreaterThan(0);
    expect(record.accessiblePreyEnergy).toBe(0);
    expect(record.pressure).toBeLessThan(1);
  });

  it('uses prey energy rather than producer biomass for carnivores', () => {
    const world = foodWorld();
    world.setCell(3, 3, { producerBiomass: 1_000 });
    const predator = creature('carnivore');
    const prey = creature('herbivore', 4, 3);
    const record = buildLocalResourcePressureCache(0, [predator, prey], world, 2)
      .get(predator.id)!;

    expect(record.prey).toBe(1);
    expect(record.accessiblePreyEnergy).toBe(100);
    expect(record.accessibleProducerEnergy).toBe(0);
    expect(record.accessibleFoodEnergy).toBe(100);
  });

  it('uses corpses as the dedicated scavenger food context', () => {
    const world = foodWorld();
    const scavenger = creature('scavenger');
    const corpse = creature('herbivore', 4, 3, 'carrion', 'dead');
    const record = buildLocalResourcePressureCache(0, [scavenger, corpse], world, 2)
      .get(scavenger.id)!;

    expect(record.corpses).toBe(1);
    expect(record.accessibleCorpseEnergy).toBe(100);
    expect(record.accessibleFoodEnergy).toBe(100);
    expect(record.prey).toBe(0);
  });

  it('combines producer, prey, and corpse energy for omnivores', () => {
    const world = foodWorld();
    world.setCell(3, 3, { producerBiomass: 100 });
    const omnivore = creature('omnivore');
    const prey = creature('herbivore', 4, 3);
    const corpse = creature('herbivore', 3, 4, 'carrion', 'dead');
    const record = buildLocalResourcePressureCache(0, [omnivore, prey, corpse], world, 2)
      .get(omnivore.id)!;

    expect(record.accessibleProducerEnergy).toBeGreaterThan(0);
    expect(record.accessiblePreyEnergy).toBe(100);
    expect(record.accessibleCorpseEnergy).toBe(100);
    expect(record.accessibleFoodEnergy).toBeCloseTo(
      record.accessibleProducerEnergy + 200
    );
  });

  it('raises pressure when equal consumers have less accessible food', () => {
    const abundant = foodWorld();
    const scarce = foodWorld();
    abundant.setCell(3, 3, { producerBiomass: 100 });
    scarce.setCell(3, 3, { producerBiomass: 1 });
    const creatures = [creature('herbivore'), creature('herbivore', 4, 3, 'other')];

    const abundantPressure = buildLocalResourcePressureCache(0, creatures, abundant, 2)
      .get(creatures[0].id)!.pressure;
    const scarcePressure = buildLocalResourcePressureCache(0, creatures, scarce, 2)
      .get(creatures[0].id)!.pressure;
    expect(scarcePressure).toBeGreaterThan(abundantPressure);
  });

  it('stores bounded aggregates without serializing neighborhoods', () => {
    const world = foodWorld();
    const animals = [creature('herbivore'), creature('herbivore', 4, 3)];
    const cache = buildLocalResourcePressureCache(12, animals, world, 2);
    const serialized = JSON.stringify(cache.records());

    expect(cache.size).toBe(2);
    expect(serialized).not.toContain('traits');
    expect(serialized).not.toContain('neighbors');
    expect(Object.values(cache.records()[0]).some(Array.isArray)).toBe(false);
  });

  it('builds a 500-creature cache within the documented budget', () => {
    const world = foodWorld(100, 100);
    const animals = Array.from({ length: 500 }, (_, index) =>
      creature('herbivore', index % 100, Math.floor(index / 100) * 10, `species-${index % 4}`)
    );
    const started = performance.now();
    const cache = buildLocalResourcePressureCache(20, animals, world, 5);
    const elapsed = performance.now() - started;

    expect(cache.size).toBe(500);
    expect(elapsed).toBeLessThan(LOCAL_PRESSURE_500_CREATURE_BUDGET_MS);
  });
});
