import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import {
  estimateProducerRegrowth,
  measureFoodAccess,
  runBiomassDiagnostic,
  summarizeGrazingPressure,
} from '../simulation/biomassDiagnostics';
import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';

function creature(strategy: EnergyStrategy, x: number, y: number): Creature {
  return new Creature({
    speciesId: strategy,
    lineageId: strategy,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy, visionRange: 2 },
    x,
    y,
    energy: 40,
  });
}

describe('headless biomass diagnostics', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('separates reachable food access by feeding strategy', () => {
    const world = new World(5, 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        world.setCell(x, y, { biome: 'grassland', producerBiomass: 0 });
      }
    }
    world.setCell(1, 0, { producerBiomass: 10 });
    const herbivore = creature('herbivore', 0, 0);
    const carnivore = creature('carnivore', 0, 1);
    const scavenger = creature('scavenger', 4, 4);
    const corpse = creature('herbivore', 4, 3);
    corpse.lifecycleState = 'corpse';
    corpse.corpseDecayTicks = 5;

    const access = measureFoodAccess(world, [herbivore, carnivore, scavenger, corpse]);

    expect(access.herbivore).toMatchObject({ population: 1, accessiblePopulation: 1 });
    expect(access.carnivore).toMatchObject({ population: 1, accessiblePopulation: 1 });
    expect(access.scavenger).toMatchObject({ population: 1, accessiblePopulation: 1 });
    expect(access.herbivore.lowEnergyPopulation).toBe(1);
  });

  it('predicts capped gross regrowth without mutating the world', () => {
    const world = new World(1, 1);
    const before = world.getCell(0, 0).producerBiomass;
    const growth = estimateProducerRegrowth(world, SIMULATION_CONSTANTS);

    expect(growth).toBeGreaterThanOrEqual(0);
    expect(world.getCell(0, 0).producerBiomass).toBe(before);
  });

  it('summarizes local grazing concentration by tile', () => {
    expect(summarizeGrazingPressure(new Map([[1, 4], [2, 10], [3, 0]]))).toEqual({
      consumedBiomass: 14,
      grazedTileCount: 2,
      averageConsumptionPerGrazedTile: 7,
      maximumTileConsumption: 10,
    });
  });

  it('produces an exact fixed-seed report through tick 150', () => {
    const report = runBiomassDiagnostic(12345);
    const finalSample = report.samples[report.samples.length - 1];

    expect(report.throughTick).toBe(150);
    expect(report.samples.map((sample) => sample.tick)).toEqual([0, 10, 30, 60, 100, 150]);
    expect(finalSample.cumulativeProducerRegrowth).toBeGreaterThan(0);
    expect(finalSample.cumulativeGrazingConsumption).toBeGreaterThan(0);
    expect(finalSample.recentGrazing.consumedBiomass).toBeGreaterThan(0);
    expect(finalSample.recentGrazing.grazedTileCount).toBeGreaterThan(0);
    expect(finalSample.foodAccess.herbivore.firstStarvationTick).not.toBeNull();
  }, 30_000);

  it('replays diagnostic measurements identically', () => {
    const first = runBiomassDiagnostic(54321, 30, [0, 15, 30]);
    expect(runBiomassDiagnostic(54321, 30, [0, 15, 30])).toEqual(first);
  }, 30_000);
});
