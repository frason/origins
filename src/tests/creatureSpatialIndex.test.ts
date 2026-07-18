import { describe, expect, it } from 'vitest';
import { Creature, scanEnvironment } from '../simulation/creature';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import { createEngine, tickEngine } from '../simulation/engine';
import { createRng } from '../simulation/rng';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';

function creature(
  x: number,
  y: number,
  strategy: EnergyStrategy = 'herbivore',
  lifecycleState: 'alive' | 'dead' = 'alive'
): Creature {
  return new Creature({
    speciesId: `${strategy}_species`,
    lineageId: `${strategy}_lineage`,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: strategy },
    x,
    y,
    energy: 100,
    lifecycleState,
    corpseDecayTicks: lifecycleState === 'dead' ? 10 : 0,
  });
}

function scanIds(scan: ReturnType<typeof scanEnvironment>) {
  return {
    threats: scan.threats.map((candidate) => candidate.id),
    foodCreatures: scan.foodCreatures.map((candidate) => candidate.id),
    foodLocations: scan.foodLocations,
  };
}

describe('CreatureSpatialIndex', () => {
  it('matches full scans across bucket boundaries while preserving candidate order', () => {
    Creature.resetIdCounter();
    const observer = creature(7, 7, 'omnivore');
    observer.traits.visionRange = 5;
    const candidates = [
      observer,
      creature(8, 7, 'carnivore'),
      creature(4, 4, 'herbivore'),
      creature(12, 12, 'scavenger', 'dead'),
      creature(13, 13, 'herbivore'),
    ];
    candidates[2].traits.camouflage = 0.4;
    const world = new World(20, 20);
    world.setCell(9, 9, { producerBiomass: 15 });
    const index = new CreatureSpatialIndex(candidates, 8);

    const full = scanEnvironment(observer, world, candidates, createRng(42));
    const indexed = scanEnvironment(observer, world, candidates, createRng(42), index);

    expect(scanIds(indexed)).toEqual(scanIds(full));
    expect(indexed.foodCreatures.map((candidate) => candidate.id)).toEqual(
      candidates.filter((candidate) =>
        full.foodCreatures.some((food) => food.id === candidate.id)
      ).map((candidate) => candidate.id)
    );
    expect(index.querySquare(7, 7, 50)).toEqual(candidates);
    expect(index.at(12, 12)).toEqual([candidates[3]]);
  });

  it('updates buckets after sequential movement without changing original order', () => {
    Creature.resetIdCounter();
    const first = creature(1, 1);
    const second = creature(17, 1);
    const third = creature(2, 1);
    const index = new CreatureSpatialIndex([first, second, third], 8);

    const previousX = second.x;
    const previousY = second.y;
    second.x = 2;
    second.y = 1;
    index.move(second, previousX, previousY);

    expect(index.at(2, 1).map((candidate) => candidate.id)).toEqual([
      second.id,
      third.id,
    ]);
    expect(index.querySquare(1, 1, 2).map((candidate) => candidate.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
  });

  it('reduces sparse 2,000-creature vision candidates and ticks deterministically', () => {
    const build = () => {
      Creature.resetIdCounter();
      const creatures = Array.from({ length: 2_000 }, (_, index) => {
        const candidate = creature(index % 100, Math.floor(index / 100) * 5);
        candidate.traits.visionRange = 5;
        return candidate;
      });
      const spatialIndex = new CreatureSpatialIndex(creatures);
      const indexedCandidateChecks = creatures.reduce(
        (total, candidate) =>
          total + spatialIndex.querySquare(candidate.x, candidate.y, candidate.traits.visionRange).length,
        0
      );
      expect(indexedCandidateChecks).toBeLessThan(creatures.length ** 2 / 10);

      return createEngine(98765, creatures, 100, 100, {
        maxGlobalPopulation: 2_000,
        reproductionEnergyThreshold: 10_000,
        baseMetabolism: 0.1,
        monocultureMortalityPenalty: 0,
      });
    };

    const first = tickEngine(build());
    const replay = tickEngine(build());

    expect(first).toEqual(replay);
    expect(first.creatures.filter((candidate) => candidate.lifecycleState === 'alive'))
      .toHaveLength(2_000);
  }, 15_000);
});
