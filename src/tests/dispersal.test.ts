import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import {
  dispersalEvaluationPhase,
  DISPERSAL_500_CREATURE_BUDGET_MS,
  findDispersalTarget,
  shouldEvaluateDispersal,
} from '../simulation/dispersal';
import { createEngine, tickEngine } from '../simulation/engine';
import { buildLocalResourcePressureCache } from '../simulation/localResourcePressure';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';

function grazer(x = 5, y = 5, speciesId = 'grazer', energy = 100): Creature {
  return new Creature({
    speciesId,
    lineageId: speciesId,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', speed: 1 },
    x,
    y,
    energy,
    age: 20,
  });
}

function grassWorld(size = 15): World {
  const world = new World(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      world.setCell(x, y, {
        biome: 'grassland', temperature: 0.5, moisture: 0.5, producerBiomass: 0,
      });
    }
  }
  return world;
}

const policy = {
  pressureStart: 0.8,
  evaluationIntervalTicks: 1,
  range: 6,
  pressureRadius: 2,
  minimumPressureImprovement: 0.15,
};

describe('costly deterministic dispersal', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('selects a bounded lower-pressure suitable destination deterministically', () => {
    const world = grassWorld();
    const observer = grazer();
    const crowd = Array.from({ length: 8 }, (_, index) =>
      grazer(5 + index % 2, 5 + index % 3, `crowd-${index}`, 20)
    );
    world.setCell(11, 5, { producerBiomass: 200 });
    const creatures = [observer, ...crowd];
    const index = new CreatureSpatialIndex(creatures);
    const pressure = buildLocalResourcePressureCache(0, creatures, world, 2, index).get(observer.id)!;

    const first = findDispersalTarget(observer, world, index, pressure, policy);
    const replay = findDispersalTarget(observer, world, index, pressure, policy);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({ x: 11, y: 5 });
    expect(first!.pressure).toBeLessThan(pressure.pressure);
    expect(Math.max(Math.abs(first!.x - observer.x), Math.abs(first!.y - observer.y)))
      .toBeLessThanOrEqual(policy.range);
  });

  it('evaluates crowded creatures more often than an abundant-food control', () => {
    const crowded = grazer();
    const abundant = grazer(10, 10, 'abundant');
    const tick = dispersalEvaluationPhase(crowded.id, 10);
    expect(shouldEvaluateDispersal(crowded, tick, 0.95, {
      ...policy, evaluationIntervalTicks: 10,
    })).toBe(true);
    expect(shouldEvaluateDispersal(abundant, tick, 0.2, {
      ...policy, evaluationIntervalTicks: 10,
    })).toBe(false);
  });

  it('moves toward the target, charges energy, and records aggregate evidence', () => {
    const parent = grazer(5, 5, 'grazer', 100);
    const crowd = Array.from({ length: 8 }, (_, index) =>
      grazer(5 + index % 2, 5 + index % 3, `crowd-${index}`, 20)
    );
    const state = createEngine(42, [parent, ...crowd], 15, 15, {
      baseMetabolism: 0,
      feedingEfficiency: 0,
      producerGrowthRate: 0,
      monocultureDominanceThreshold: 1,
      monocultureMortalityPenalty: 0,
      reproductionEnergyThreshold: 10_000,
      dispersalPressureStart: 0.8,
      dispersalEvaluationIntervalTicks: 1,
      dispersalRange: 6,
      dispersalMinimumPressureImprovement: 0.15,
      dispersalEnergyCostPerCell: 2,
      localResourcePressureRadius: 2,
    });
    state.historyInterval = 1;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        state.world.setCell(x, y, {
          biome: 'grassland', temperature: 0.5, moisture: 0.5, producerBiomass: 0,
        });
      }
    }
    state.world.setCell(11, 5, { producerBiomass: 200 });
    const parentId = state.creatures[0].id;

    const next = tickEngine(state);
    const moved = next.creatures.find((creature) => creature.id === parentId)!;

    expect(moved.x).toBe(6);
    expect(moved.y).toBe(5);
    expect(moved.energy).toBe(98);
    expect(moved.dispersalTargetX).toBe(11);
    expect(moved.dispersalMoves).toBe(1);
    expect(next.history[next.history.length - 1].dispersal).toMatchObject({
      moves: expect.any(Number),
      energySpent: expect.any(Number),
      activeCreatures: expect.any(Number),
    });
    expect(next.events).not.toContainEqual(expect.objectContaining({ type: 'intervention' }));
  });

  it('spreads 500-creature evaluation phases and remains replay-safe', () => {
    const animals = Array.from({ length: 500 }, (_, index) =>
      grazer(index % 100, Math.floor(index / 100), `species-${index % 4}`)
    );
    const phases = animals.map((animal) => dispersalEvaluationPhase(animal.id, 10));
    expect(new Set(phases).size).toBe(10);
    expect(Math.max(...Array.from({ length: 10 }, (_, phase) =>
      phases.filter((value) => value === phase).length
    ))).toBeLessThan(75);
    expect(phases).toEqual(animals.map((animal) => dispersalEvaluationPhase(animal.id, 10)));
  });

  it('ticks 500 creatures deterministically within the performance budget', () => {
    const build = () => {
      Creature.resetIdCounter();
      const animals = Array.from({ length: 500 }, (_, index) =>
        grazer(index % 100, Math.floor(index / 100) * 10, `species-${index % 4}`, 100)
      );
      return createEngine(98765, animals, 100, 100, {
        maxGlobalPopulation: 500,
        reproductionEnergyThreshold: 10_000,
        baseMetabolism: 0.1,
        monocultureMortalityPenalty: 0,
      });
    };
    const started = performance.now();
    const first = tickEngine(build());
    const replay = tickEngine(build());
    const elapsed = performance.now() - started;

    expect(replay).toEqual(first);
    expect(first.creatures.filter((creature) => creature.lifecycleState === 'alive'))
      .toHaveLength(500);
    expect(elapsed).toBeLessThan(DISPERSAL_500_CREATURE_BUDGET_MS);
  }, 15_000);
});
