import { beforeEach, describe, expect, it } from 'vitest';
import { measureBiomass } from '../simulation/biomassMetrics';
import { Creature } from '../simulation/creature';
import { buildDemoEngine } from '../simulation/demoWorld';
import {
  feedOnProducer,
  getEnergyCapacity,
  getProducerBiteCapacity,
} from '../simulation/energy';
import { tickEngine } from '../simulation/engine';
import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';

function grazer(x = 0, y = 0, energy = 100): Creature {
  return new Creature({
    speciesId: 'grazer', lineageId: 'grazer', parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
    x, y, energy,
  });
}

describe('biomass ecology baseline', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('consumes only enough biomass to fill available energy capacity', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { producerBiomass: 100 });
    const animal = grazer();
    animal.energy = getEnergyCapacity(animal) - 5;

    const gained = feedOnProducer(animal, world.getCell(0, 0), world, 0, 0, 0.8);

    expect(gained).toBeCloseTo(5, 8);
    expect(animal.energy).toBe(getEnergyCapacity(animal));
    expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(93.75, 8);
  });

  it('does not remove biomass when feeding transfers no energy', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { producerBiomass: 25 });
    const animal = grazer();

    expect(feedOnProducer(animal, world.getCell(0, 0), world, 0, 0, 0)).toBe(0);
    expect(animal.energy).toBe(100);
    expect(world.getCell(0, 0).producerBiomass).toBe(25);
  });

  it('makes sequential grazers share rather than duplicate local biomass', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { producerBiomass: 10 });
    const first = grazer(0, 0, 0);
    const second = grazer(0, 0, 0);

    const firstGain = feedOnProducer(first, world.getCell(0, 0), world, 0, 0, 0.8);
    const secondGain = feedOnProducer(second, world.getCell(0, 0), world, 0, 0, 0.8);

    expect(firstGain).toBeCloseTo(8, 8);
    expect(secondGain).toBe(0);
    expect(world.getCell(0, 0).producerBiomass).toBe(0);
  });

  it('limits a hungry grazer to one physical bite per tick', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { producerBiomass: 100 });
    const animal = grazer(0, 0, 0);
    const biteCapacity = getProducerBiteCapacity(animal);

    const gained = feedOnProducer(animal, world.getCell(0, 0), world, 0, 0, 0.8);

    expect(biteCapacity).toBe(20);
    expect(gained).toBeCloseTo(16, 8);
    expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(80, 8);
  });

  it('lets size increase harvesting capacity without exceeding the hard ceiling', () => {
    const small = grazer();
    const large = grazer();
    large.traits.size = 4;
    large.traits.speed = 3;

    expect(getProducerBiteCapacity(large)).toBeGreaterThan(getProducerBiteCapacity(small));
    expect(getProducerBiteCapacity(large)).toBeLessThanOrEqual(100);
  });

  it('makes concentrated grazers deplete a tile faster than a sparse grazer', () => {
    const denseWorld = new World(1, 1);
    const sparseWorld = new World(1, 1);
    denseWorld.setCell(0, 0, { producerBiomass: 100 });
    sparseWorld.setCell(0, 0, { producerBiomass: 100 });

    for (let index = 0; index < 3; index++) {
      feedOnProducer(grazer(0, 0, 0), denseWorld.getCell(0, 0), denseWorld, 0, 0, 0.8);
    }
    feedOnProducer(grazer(0, 0, 0), sparseWorld.getCell(0, 0), sparseWorld, 0, 0, 0.8);

    expect(denseWorld.getCell(0, 0).producerBiomass).toBe(40);
    expect(sparseWorld.getCell(0, 0).producerBiomass).toBe(80);
    expect(sparseWorld.getCell(0, 0).producerBiomass).toBeGreaterThan(0);
  });

  it('distinguishes abundant world biomass from depleted occupied habitat', () => {
    const world = new World(2, 2);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) world.setCell(x, y, { producerBiomass: 100 });
    }
    world.setCell(0, 0, { producerBiomass: 20 });
    const colony = [grazer(0, 0, 0), grazer(0, 0, 0), grazer(0, 0, 0)];
    const before = measureBiomass(world, colony);
    for (const animal of colony) {
      feedOnProducer(animal, world.getCell(0, 0), world, 0, 0, 0.8);
    }
    const after = measureBiomass(world, colony);

    expect(before.occupiedTileCount).toBe(1);
    expect(after.occupiedTileBiomass).toBeLessThan(before.occupiedTileBiomass);
    expect(after.depletedOccupiedTileShare).toBe(1);
    expect(after.totalBiomass).toBeGreaterThan(after.occupiedTileBiomass);
  });

  it('returns finite empty-state metrics and ignores corpses', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { producerBiomass: 40 });
    const corpse = grazer();
    corpse.lifecycleState = 'corpse';

    expect(measureBiomass(world, [corpse])).toEqual({
      totalBiomass: 40,
      occupiedTileBiomass: 0,
      occupiedTileCount: 0,
      averageOccupiedTileBiomass: 0,
      depletedOccupiedTileCount: 0,
      depletedOccupiedTileShare: 0,
    });
  });

  it('records a replay-identical local biomass baseline across fixed seeds', () => {
    const run = () => [12345, 54321, 99999].map((seed) => {
      let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
      for (let tick = 0; tick < 100; tick++) state = tickEngine(state);
      const metrics = measureBiomass(state.world, state.creatures);
      return {
        seed,
        population: state.creatures.filter((creature) => creature.lifecycleState === 'alive').length,
        totalBiomass: Math.round(metrics.totalBiomass),
        occupiedTileCount: metrics.occupiedTileCount,
        averageOccupiedTileBiomass: Number(metrics.averageOccupiedTileBiomass.toFixed(3)),
        depletedOccupiedTileShare: Number(metrics.depletedOccupiedTileShare.toFixed(3)),
      };
    });
    const first = run();

    expect(run()).toEqual(first);
    expect(new Set(first.map((baseline) => JSON.stringify(baseline))).size).toBe(3);
    expect(first).toMatchInlineSnapshot(`
      [
        {
          "averageOccupiedTileBiomass": 0.768,
          "depletedOccupiedTileShare": 1,
          "occupiedTileCount": 12,
          "population": 15,
          "seed": 12345,
          "totalBiomass": 615916,
        },
        {
          "averageOccupiedTileBiomass": 0.367,
          "depletedOccupiedTileShare": 1,
          "occupiedTileCount": 13,
          "population": 15,
          "seed": 54321,
          "totalBiomass": 685136,
        },
        {
          "averageOccupiedTileBiomass": 16.967,
          "depletedOccupiedTileShare": 0.778,
          "occupiedTileCount": 18,
          "population": 30,
          "seed": 99999,
          "totalBiomass": 738337,
        },
      ]
    `);
  }, 90_000);
});
