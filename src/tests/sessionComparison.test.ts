import { describe, expect, it } from 'vitest';
import { compareSessionSummaries } from '../ui/sessionComparison';
import type { SessionSummary } from '../ui/sessionSummary';

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    worldName: 'Rainmere',
    seed: 42,
    status: 'living',
    ticksSurvived: 100,
    currentPopulation: 10,
    peakPopulation: 12,
    activeSpecies: 2,
    activeLineages: 2,
    births: 10,
    deaths: 4,
    mutations: 1,
    extinctions: 0,
    interventions: 0,
    speciesObserved: 2,
    remainingBiomass: 1000,
    finalEvents: [],
    recentStories: [],
    story: { heading: 'Test world', paragraphs: ['Recorded evidence.'] },
    ...overrides,
  };
}

describe('session recap comparisons', () => {
  it('reports evolutionary variety before simple population expansion', () => {
    const comparison = compareSessionSummaries(
      summary(),
      summary({
        ticksSurvived: 150, currentPopulation: 15,
        activeSpecies: 3, activeLineages: 4,
        births: 18, deaths: 7, mutations: 3,
      })
    );
    expect(comparison).toMatchObject({
      fromTick: 100, toTick: 150, ticksElapsed: 50,
      tone: 'evolution', summary: 'Evolutionary variety expanded',
      deltas: {
        population: 5, activeSpecies: 1, activeLineages: 2,
        births: 8, deaths: 3, mutations: 2,
      },
    });
  });

  it('distinguishes population expansion without new diversity', () => {
    expect(compareSessionSummaries(
      summary(),
      summary({ ticksSurvived: 125, currentPopulation: 13, births: 13 })
    )).toMatchObject({ tone: 'expansion', summary: 'The living population expanded' });
  });

  it('reports contraction and an interval where animal life ended', () => {
    expect(compareSessionSummaries(
      summary(),
      summary({ ticksSurvived: 125, currentPopulation: 7, activeSpecies: 1, deaths: 7 })
    )).toMatchObject({ tone: 'contraction' });
    expect(compareSessionSummaries(
      summary(),
      summary({
        status: 'ended', ticksSurvived: 130, currentPopulation: 0,
        activeSpecies: 0, activeLineages: 0, deaths: 14, extinctions: 2,
      })
    )).toMatchObject({ tone: 'ended', summary: 'Animal life ended during this interval' });
  });

  it('shows event and biomass deltas for a structurally mixed interval', () => {
    const comparison = compareSessionSummaries(
      summary(),
      summary({
        ticksSurvived: 120, births: 12, deaths: 6,
        interventions: 1, remainingBiomass: 925,
      })
    );
    expect(comparison).toMatchObject({
      tone: 'mixed',
      deltas: {
        biomass: -75, births: 2, deaths: 2,
        mutations: 0, extinctions: 0, interventions: 1,
      },
    });
  });

  it('rejects reversed time and cross-seed comparisons', () => {
    expect(() => compareSessionSummaries(
      summary(), summary({ ticksSurvived: 99 })
    )).toThrow(RangeError);
    expect(() => compareSessionSummaries(
      summary(), summary({ seed: 99, ticksSurvived: 101 })
    )).toThrow('same world seed');
  });

  it('is deterministic and recognizes identical observations', () => {
    const first = summary();
    const second = summary();
    expect(compareSessionSummaries(first, second)).toMatchObject({
      tone: 'steady', ticksElapsed: 0,
    });
    expect(compareSessionSummaries(first, second))
      .toEqual(compareSessionSummaries(first, second));
  });
});
