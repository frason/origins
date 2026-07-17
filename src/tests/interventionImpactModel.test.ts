import { describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildInterventionImpact } from '../ui/interventionImpactModel';

function world({ population = 10, events = [] }: { population?: number; events?: WorldSnapshot['events'] }): WorldSnapshot {
  return {
    width: 1,
    height: 1,
    cells: [{
      energy: 10, nutrients: 0, producerBiomass: 120, toxicity: 0,
      elevation: 0, moisture: 0.5, temperature: 0.5, biome: 'grassland',
      producerArchetype: 'ground-cover',
    }],
    creatures: Array.from({ length: population }, (_, index) => ({
      id: `c-${index}`,
      speciesId: index === population - 1 ? 'new-species' : 'founder',
      lineageId: index > 7 ? `branch-${index}` : 'root',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 0, y: 0, energy: 12, age: 1, lifecycleState: 'alive' as const,
      corpseDecayTicks: 0,
    })),
    events,
  };
}

const intervention = {
  type: 'intervention' as const,
  tick: 10,
  constantChanges: [{ constant: 'baseMetabolism' as const, before: 2, after: 1 }],
  ecosystemBefore: {
    population: 8,
    speciesCount: 1,
    lineageCount: 1,
    livingEnergy: 80,
    producerBiomass: 100,
  },
};

describe('intervention impact model', () => {
  it('returns no claim when no checkpoint exists', () => {
    expect(buildInterventionImpact(world({}), 20)).toBeNull();
  });

  it('shows evolutionary variety and post-intervention event counts', () => {
    const state = world({ events: [
      intervention,
      { type: 'birth', tick: 11, speciesId: 'founder' },
      { type: 'mutation', tick: 12, speciesId: 'founder' },
      { type: 'death', tick: 13, speciesId: 'founder' },
    ] });
    const impact = buildInterventionImpact(state, 20);

    expect(impact).toMatchObject({
      summary: 'Evolutionary variety increased',
      populationDelta: 2,
      speciesDelta: 1,
      lineageDelta: 2,
      births: 1,
      deaths: 1,
      mutations: 1,
      settingsChanged: 1,
    });
  });

  it('uses only events following the latest intervention', () => {
    const latest = {
      ...intervention,
      tick: 20,
      ecosystemBefore: {
        ...intervention.ecosystemBefore,
        population: 10,
        speciesCount: 2,
      },
    };
    const state = world({ population: 6, events: [
      intervention,
      { type: 'birth', tick: 15 },
      latest,
      { type: 'death', tick: 21 },
      { type: 'death', tick: 22 },
    ] });
    const impact = buildInterventionImpact(state, 30);

    expect(impact).toMatchObject({ tick: 20, summary: 'Population contracted', births: 0, deaths: 2 });
  });

  it('is identical for identical state and reports early observations cautiously', () => {
    const state = world({ population: 8, events: [intervention] });
    const first = buildInterventionImpact(state, 12);

    expect(first?.summary).toBe('Effects are still emerging');
    expect(buildInterventionImpact(state, 12)).toEqual(first);
  });

  it('counts only the tail after the latest checkpoint in a large history', () => {
    const oldEvents: WorldSnapshot['events'] = Array.from(
      { length: 10_000 },
      (_, tick) => ({ type: tick % 2 ? 'birth' : 'death', tick })
    );
    const latest = { ...intervention, tick: 10_000 };
    const state = world({ events: [
      ...oldEvents,
      latest,
      { type: 'birth', tick: 10_001 },
      { type: 'mutation', tick: 10_002 },
      { type: 'extinction', tick: 10_003 },
    ] });

    expect(buildInterventionImpact(state, 10_010)).toMatchObject({
      tick: 10_000, births: 1, deaths: 0, mutations: 1, extinctions: 1,
    });
  });
});
