import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import {
  applyReproductionPressure,
  getReproductionPressureMultiplier,
} from '../simulation/reproductionPressure';
import { DEFAULT_TRAITS } from '../utils/traits';

function grazer(id: string, x = 3, y = 3): Creature {
  return new Creature({
    speciesId: id,
    lineageId: id,
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
    x,
    y,
    energy: 110,
    age: 8,
  });
}

const policy = { pressureStart: 0.75, maximumMultiplier: 1.25 };

describe('density-aware reproduction restraint', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('leaves low pressure unchanged and bounds severe pressure', () => {
    expect(getReproductionPressureMultiplier(0.5, policy)).toBe(1);
    expect(getReproductionPressureMultiplier(0.75, policy)).toBe(1);
    expect(getReproductionPressureMultiplier(1, policy)).toBe(1.25);
    expect(applyReproductionPressure(100, 1, policy)).toBe(125);
  });

  it('restrains births in crowded depleted habitat without adding deaths or resources', () => {
    const parent = grazer('grazer');
    const competitors = Array.from({ length: 10 }, (_, index) =>
      grazer(`competitor-${index}`, 3 + (index % 2), 3 + (index % 3))
    );
    for (const competitor of competitors) competitor.energy = 20;
    const state = createEngine(42, [parent, ...competitors], 8, 8, {
      baseMetabolism: 0,
      feedingEfficiency: 0,
      producerGrowthRate: 0,
      reproductionEnergyThreshold: 100,
      reproductionEnergyCost: 10,
      reproductionMaturityAgeTicks: 0,
      reproductionCooldownTicks: 0,
      defaultMutationRate: 0,
      monocultureDominanceThreshold: 1,
      monocultureMortalityPenalty: 0,
      reproductionPressureStart: 0.5,
      reproductionPressureMaxMultiplier: 1.25,
    });
    state.historyInterval = 1;
    state.world.setCell(3, 3, { producerBiomass: 5 });
    const biomassBefore = state.world.getCell(3, 3).producerBiomass;
    const parentId = state.creatures[0].id;

    const next = tickEngine(state);
    const persistedParent = next.creatures.find((creature) => creature.id === parentId)!;

    expect(next.events.filter((event) => event.type === 'birth')).toHaveLength(0);
    expect(next.events.filter((event) => event.type === 'death')).toHaveLength(0);
    expect(next.world.getCell(3, 3).producerBiomass).toBe(biomassBefore);
    expect(persistedParent.localResourcePressure).toBeGreaterThan(0.5);
    expect(persistedParent.reproductionPressureMultiplier).toBeGreaterThan(1);
    expect(next.history[next.history.length - 1]?.reproductionPressure?.restrainedCandidates).toBe(1);
  });

  it('does not restrain an uncrowded parent with abundant accessible food', () => {
    const parent = grazer('grazer');
    const state = createEngine(42, [parent], 8, 8, {
      baseMetabolism: 0,
      feedingEfficiency: 0,
      producerGrowthRate: 0,
      reproductionEnergyThreshold: 100,
      reproductionEnergyCost: 10,
      reproductionMaturityAgeTicks: 0,
      reproductionCooldownTicks: 0,
      defaultMutationRate: 0,
      monocultureDominanceThreshold: 1,
      monocultureMortalityPenalty: 0,
      reproductionPressureStart: 0.5,
      reproductionPressureMaxMultiplier: 1.25,
    });
    state.world.setCell(3, 3, { producerBiomass: 100 });
    const parentId = state.creatures[0].id;

    const next = tickEngine(state);
    const persistedParent = next.creatures.find((creature) => creature.id === parentId)!;

    expect(next.events.filter((event) => event.type === 'birth')).toHaveLength(1);
    expect(persistedParent.reproductionPressureMultiplier).toBe(1);
  });

  it('replays pressure, births, and history exactly', () => {
    const run = () => {
      Creature.resetIdCounter();
      const parent = grazer('grazer');
      let state = createEngine(7, [parent], 8, 8, {
        baseMetabolism: 0,
        reproductionEnergyThreshold: 100,
        reproductionMaturityAgeTicks: 0,
        monocultureDominanceThreshold: 1,
        monocultureMortalityPenalty: 0,
      });
      state.world.setCell(3, 3, { producerBiomass: 40 });
      for (let tick = 0; tick < 10; tick++) state = tickEngine(state);
      return JSON.stringify({
        creatures: state.creatures.map((creature) => creature.toJSON()),
        events: state.events,
        history: state.history,
      });
    };
    expect(run()).toBe(run());
  });
});
