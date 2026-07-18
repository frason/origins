import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildEcosystemPoints } from '../ui/ecosystemPoints';

const sample = (tick: number, populations: [string, number][]): EcosystemHistorySample => ({
  tick,
  population: populations.reduce((sum, [, population]) => sum + population, 0),
  speciesPopulations: populations.map(([speciesId, population]) => ({ speciesId, population })),
  lineageCount: populations.length,
  births: 0, deaths: 0, mutations: 0,
});

function world(history: EcosystemHistorySample[], events: WorldSnapshot['events'] = []): WorldSnapshot {
  const last = history[history.length - 1];
  return {
    width: 1, height: 1, cells: [], history, events,
    creatures: (last?.speciesPopulations ?? []).flatMap((species) =>
      Array.from({ length: species.population }, (_, index) => ({
        id: `${species.speciesId}-${index}`, speciesId: species.speciesId,
        lineageId: species.speciesId, parentId: null, traits: DEFAULT_TRAITS,
        x: 0, y: 0, energy: 10, age: 1, lifecycleState: 'alive' as const,
        corpseDecayTicks: 0,
      }))
    ),
  };
}

describe('open-ended ecosystem points', () => {
  it('rewards sustained diverse life more than a same-duration monoculture', () => {
    const diverse = world([sample(0, [['a', 5], ['b', 5]]), sample(100, [['a', 5], ['b', 5]])]);
    const stagnant = world([sample(0, [['a', 10]]), sample(100, [['a', 10]])]);

    expect(buildEcosystemPoints(diverse, 100).breakdown.survival).toBe(10);
    expect(buildEcosystemPoints(diverse, 100).breakdown.biodiversity).toBeGreaterThan(0);
    expect(buildEcosystemPoints(diverse, 100).total).toBeGreaterThan(buildEcosystemPoints(stagnant, 100).total);
  });

  it('awards unique evolution and recovery evidence without duplicate sampling', () => {
    const state = world([
      sample(0, [['a', 10], ['b', 10]]),
      sample(20, [['a', 3], ['b', 3]]),
      sample(40, [['a', 9], ['b', 9]]),
    ], [
      { type: 'mutation', tick: 10, speciesId: 'a', lineageId: 'branch-1' },
      { type: 'mutation', tick: 10, speciesId: 'a', lineageId: 'branch-1' },
    ]);
    const points = buildEcosystemPoints(state, 40);

    expect(points.breakdown.exploration).toBe(20);
    expect(points.breakdown.recovery).toBe(40);
    expect(buildEcosystemPoints(state, 40)).toEqual(points);
  });

  it('rewards interventions only after measured beneficial outcomes', () => {
    const intervention = {
      type: 'intervention' as const, tick: 0,
      ecosystemBefore: { population: 10, speciesCount: 1, lineageCount: 1, livingEnergy: 100, producerBiomass: 100 },
    };
    const improved = world([sample(0, [['a', 10]]), sample(20, [['a', 8], ['b', 5]])], [intervention]);
    const unchanged = world([sample(0, [['a', 10]]), sample(20, [['a', 10]])], [intervention]);

    expect(buildEcosystemPoints(improved, 20).breakdown.stewardship).toBe(25);
    expect(buildEcosystemPoints(unchanged, 20).breakdown.stewardship).toBe(0);
  });

  it('does not subtract points for extinction or allow a perfect-score ceiling', () => {
    const long = world([sample(0, [['a', 5], ['b', 5]]), sample(20_000, [['a', 5]])], [
      { type: 'extinction', tick: 10_000, speciesId: 'b' },
    ]);
    expect(buildEcosystemPoints(long, 20_000).total).toBeGreaterThan(100);
  });
});
