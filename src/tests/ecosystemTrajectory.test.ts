import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { EventSnapshot, WorldSnapshot } from '../state/store';
import { getEcosystemTrajectories } from '../ui/ecosystemTrajectory';
import { DEFAULT_TRAITS } from '../utils/traits';

const baseline: EcosystemHistorySample = {
  tick: 50,
  population: 10,
  speciesPopulations: [
    { speciesId: 'alpha', population: 8 },
    { speciesId: 'beta', population: 2 },
  ],
  lineageCount: 2,
  births: 4,
  deaths: 2,
  mutations: 1,
};

function world(
  populations: number[],
  events: EventSnapshot[] = [],
  lineages = 1,
  history: EcosystemHistorySample[] | undefined = [baseline]
): WorldSnapshot {
  return {
    width: 1, height: 1, cells: [], events, history,
    creatures: populations.flatMap((count, speciesIndex) =>
      Array.from({ length: count }, (_, creatureIndex) => ({
        id: `${speciesIndex}-${creatureIndex}`,
        speciesId: ['alpha', 'beta', 'gamma'][speciesIndex] ?? `species-${speciesIndex}`,
        lineageId: `lineage-${speciesIndex}-${creatureIndex < lineages ? creatureIndex : 0}`,
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0, y: 0, energy: 100, age: 1,
        lifecycleState: 'alive' as const, corpseDecayTicks: 0,
      }))
    ),
  };
}

describe('ecosystem dynamics trajectories', () => {
  it('handles young or unavailable history honestly', () => {
    expect(getEcosystemTrajectories(world([5, 5]), 20).order)
      .toMatchObject({ direction: 'emerging', label: 'Taking shape' });
    expect(getEcosystemTrajectories(world([5, 5], [], 1, []), 100).order)
      .toMatchObject({ direction: 'emerging', label: 'History forming' });
  });

  it('distinguishes balancing from concentration and contraction', () => {
    expect(getEcosystemTrajectories(world([5, 5, 2]), 100).order)
      .toMatchObject({ direction: 'rising', label: 'Balancing' });
    expect(getEcosystemTrajectories(world([20, 1]), 100).order)
      .toMatchObject({ direction: 'falling', label: 'Concentrating' });
    expect(getEcosystemTrajectories(world([4, 2]), 100).order)
      .toMatchObject({ direction: 'falling', label: 'Contracting' });
  });

  it('describes chaos as intensifying or easing without calling more better', () => {
    const intensifying: EventSnapshot[] = [
      { type: 'birth', tick: 20 },
      ...Array.from({ length: 6 }, (_, index) => ({ type: 'death' as const, tick: 60 + index })),
    ];
    const rising = getEcosystemTrajectories(world([5, 5], intensifying), 100).chaos;
    expect(rising).toMatchObject({ direction: 'rising', label: 'Intensifying' });
    expect(rising.explanation).toContain('not always healthier');

    const easing: EventSnapshot[] = [
      ...Array.from({ length: 6 }, (_, index) => ({ type: 'death' as const, tick: 10 + index })),
      { type: 'birth', tick: 80 },
    ];
    expect(getEcosystemTrajectories(world([5, 5], easing), 100).chaos)
      .toMatchObject({ direction: 'falling', label: 'Easing' });
  });

  it('uses both mutation activity and active lineage change for exploration', () => {
    const branching = getEcosystemTrajectories(
      world([5, 5], [{ type: 'mutation', tick: 90 }], 2),
      100
    ).exploration;
    expect(branching).toMatchObject({ direction: 'rising', label: 'Branching' });

    const priorMutation: EventSnapshot[] = [{ type: 'mutation', tick: 20 }];
    expect(getEcosystemTrajectories(world([5, 5], priorMutation), 100).exploration)
      .toMatchObject({ direction: 'falling', label: 'Quieting' });
  });

  it('is deterministic and ignores history older than its comparison windows', () => {
    const oldEvents: EventSnapshot[] = Array.from({ length: 10_000 }, (_, index) => ({
      type: index % 2 ? 'birth' : 'death', tick: Math.floor(index / 200),
    }));
    const recent: EventSnapshot[] = [{ type: 'mutation', tick: 290 }];
    const laterBaseline = [{ ...baseline, tick: 250 }];
    const compact = getEcosystemTrajectories(world([5, 5], recent, 2, laterBaseline), 300);
    const long = getEcosystemTrajectories(
      world([5, 5], [...oldEvents, ...recent], 2, laterBaseline),
      300
    );
    expect(long).toEqual(compact);
    expect(getEcosystemTrajectories(
      world([5, 5], [...oldEvents, ...recent], 2, laterBaseline),
      300
    ))
      .toEqual(long);
  });
});
