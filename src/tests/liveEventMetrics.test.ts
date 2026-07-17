import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { EventSnapshot } from '../state/store';
import { getLiveEventTotals } from '../ui/liveEventMetrics';

const baseline: EcosystemHistorySample = {
  tick: 1000,
  population: 10,
  speciesPopulations: [{ speciesId: 'grazer', population: 10 }],
  lineageCount: 2,
  births: 400,
  deaths: 390,
  mutations: 12,
};

describe('live cumulative event metrics', () => {
  it('combines sampled totals with only the recent unsampled tail', () => {
    const oldEvents: EventSnapshot[] = Array.from({ length: 10_000 }, (_, tick) => ({
      type: tick % 2 ? 'birth' : 'death',
      tick: tick % 1000,
    }));
    const events: EventSnapshot[] = [
      ...oldEvents,
      { type: 'birth', tick: 1000 },
      { type: 'death', tick: 1001 },
      { type: 'mutation', tick: 1002 },
      { type: 'birth', tick: 1003 },
    ];

    expect(getLiveEventTotals([baseline], events)).toEqual({
      births: 402,
      deaths: 391,
      mutations: 13,
    });
  });

  it('counts the complete event log before the first history sample', () => {
    expect(getLiveEventTotals(undefined, [
      { type: 'birth', tick: 0 },
      { type: 'death', tick: 1 },
      { type: 'mutation', tick: 2 },
    ])).toEqual({ births: 1, deaths: 1, mutations: 1 });
  });
});
