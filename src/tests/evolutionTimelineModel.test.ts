import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { CreatureSnapshot, WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildEvolutionTimeline } from '../ui/evolutionTimelineModel';

function creature(id: string, speciesId: string, lineageId: string): CreatureSnapshot {
  return {
    id, speciesId, lineageId, parentId: null, traits: { ...DEFAULT_TRAITS },
    x: 0, y: 0, energy: 100, age: 1, lifecycleState: 'alive', corpseDecayTicks: 0,
  };
}

function world(creatures: CreatureSnapshot[]): WorldSnapshot {
  return { width: 1, height: 1, cells: [], creatures, events: [] };
}

const history: EcosystemHistorySample[] = [
  {
    tick: 0, population: 3,
    speciesPopulations: [{ speciesId: 'alpha', population: 2 }, { speciesId: 'beta', population: 1 }],
    lineageCount: 2, births: 0, deaths: 0, mutations: 0,
  },
  {
    tick: 10, population: 4,
    speciesPopulations: [{ speciesId: 'alpha', population: 1 }, { speciesId: 'beta', population: 3 }],
    lineageCount: 3, births: 2, deaths: 1, mutations: 1,
  },
];

describe('evolution timeline presentation model', () => {
  it('merges the current unsampled state and detects dominance shifts', () => {
    const current = world([
      creature('b1', 'beta', 'b-root'),
      creature('b2', 'beta', 'b-branch'),
    ]);
    const model = buildEvolutionTimeline(history, current, 15)!;

    expect(model.points.map((point) => point.tick)).toEqual([0, 10, 15]);
    expect(model.points[model.points.length - 1].x).toBe(100);
    expect(model.peakPopulation).toBe(4);
    expect(model.dominanceChanges).toBe(1);
    expect(model.dominanceMoments).toHaveLength(1);
    expect(model.dominanceMoments[0]).toMatchObject({ tick: 10, speciesId: 'beta' });
    expect(model.dominanceMoments[0].x).toBeCloseTo(66.67, 1);
    expect(model.currentDominantName).toBeTruthy();
    expect(model.description).toContain('3 samples through tick 15');
  });

  it('replaces a sampled current tick instead of duplicating it', () => {
    const model = buildEvolutionTimeline(history, world([]), 10)!;
    expect(model.points.map((point) => point.tick)).toEqual([0, 10]);
    expect(model.points[1].population).toBe(0);
  });

  it('handles an extinct world and missing history accessibly', () => {
    const model = buildEvolutionTimeline(undefined, world([]), 0)!;
    expect(model.points).toHaveLength(1);
    expect(model.peakPopulation).toBe(0);
    expect(model.currentDominantName).toBeNull();
    expect(model.description).toContain('No living species currently leads');
    expect(buildEvolutionTimeline([], null, 0)).toBeNull();
  });

  it('uses cumulative history plus recent events for the current point', () => {
    const current = world([creature('a1', 'alpha', 'root')]);
    current.events = [
      { type: 'birth', tick: 9 },
      { type: 'birth', tick: 10 },
      { type: 'death', tick: 11 },
      { type: 'mutation', tick: 12 },
    ];
    const model = buildEvolutionTimeline(history, current, 15)!;
    expect(model.points[model.points.length - 1]).toMatchObject({
      births: 3, deaths: 2, mutations: 2,
    });
  });
});
