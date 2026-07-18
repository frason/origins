import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { buildPopulationHistoryChart } from '../ui/populationHistoryModel';

const samples: EcosystemHistorySample[] = [
  {
    tick: 0, population: 3,
    speciesPopulations: [{ speciesId: 'grazer', population: 2 }, { speciesId: 'hunter', population: 1 }],
    lineagePopulations: [
      { speciesId: 'grazer', lineageId: 'grazer', population: 2 },
      { speciesId: 'hunter', lineageId: 'hunter', population: 1 },
    ],
    lineageCount: 2, births: 0, deaths: 0, mutations: 0,
  },
  {
    tick: 10, population: 2,
    speciesPopulations: [{ speciesId: 'grazer', population: 2 }],
    lineagePopulations: [
      { speciesId: 'grazer', lineageId: 'grazer', population: 1 },
      { speciesId: 'grazer', lineageId: 'grazer-branch', population: 1 },
    ],
    lineageCount: 2, births: 1, deaths: 2, mutations: 1,
  },
];

describe('population history chart model', () => {
  it('keeps extinct species as zero-filled deterministic series through the endpoint', () => {
    const chart = buildPopulationHistoryChart(samples, [], 15, 'species');

    expect(chart.ticks).toEqual([0, 10, 15]);
    expect(chart.series.map((series) => ({ id: series.id, values: series.populations }))).toEqual([
      { id: 'grazer', values: [2, 2, 0] },
      { id: 'hunter', values: [1, 0, 0] },
    ]);
    expect(buildPopulationHistoryChart(samples, [], 15, 'species')).toEqual(chart);
  });

  it('offers lineage series including branches that emerged later', () => {
    const chart = buildPopulationHistoryChart(samples, [], 15, 'lineage');
    expect(chart.series.map((series) => series.id)).toEqual([
      'grazer:grazer',
      'hunter:hunter',
      'grazer:grazer-branch',
    ]);
    expect(chart.series[2].populations).toEqual([0, 1, 0]);
  });
});
