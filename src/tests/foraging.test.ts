import { beforeEach, describe, expect, it } from 'vitest';
import { Creature, getSearchTarget } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('consumer foraging', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('lets an omnivore discover biomass that begins outside vision range', () => {
    const omnivore = new Creature({
      speciesId: 'omnivore_species',
      lineageId: 'omnivore_root',
      parentId: null,
      traits: {
        ...DEFAULT_TRAITS,
        energyStrategy: 'omnivore',
        visionRange: 5,
        speed: 2,
      },
      x: 50,
      y: 50,
      energy: 80,
    });
    let engine = createEngine(5700, [omnivore]);

    // Place food along the creature's stable search heading, far enough away
    // that it must roam before normal vision-based movement can take over.
    const target = getSearchTarget(engine.creatures[0], engine.world);
    engine.world.setCell(target.x, target.y, { producerBiomass: 50, energy: 0 });

    for (let tick = 0; tick < 8; tick++) {
      engine = tickEngine(engine, {
        producerGrowthRate: 0,
        baseMetabolism: 0.25,
        reproductionEnergyThreshold: 1000,
        monocultureMortalityPenalty: 0,
        overcrowdingMortalityRate: 0,
      });
    }

    expect(engine.creatures[0].lifecycleState).toBe('alive');
    expect(engine.world.getCell(target.x, target.y).producerBiomass).toBeLessThan(50);
    expect(engine.creatures[0].energy).toBeGreaterThan(80);
  });
});
