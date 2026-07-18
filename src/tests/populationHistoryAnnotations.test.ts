import { describe, expect, it } from 'vitest';
import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { buildPopulationHistoryAnnotations } from '../ui/populationHistoryAnnotations';

const history: EcosystemHistorySample[] = [
  { tick: 0, population: 10, speciesPopulations: [{ speciesId: 'grazer', population: 7 }, { speciesId: 'hunter', population: 3 }], lineageCount: 2, births: 0, deaths: 0, mutations: 0 },
  { tick: 10, population: 20, speciesPopulations: [{ speciesId: 'grazer', population: 10 }, { speciesId: 'hunter', population: 10 }], lineageCount: 2, births: 10, deaths: 0, mutations: 0 },
  { tick: 18, population: 8, speciesPopulations: [{ speciesId: 'hunter', population: 8 }], lineageCount: 2, births: 10, deaths: 12, mutations: 1 },
];

describe('population-history annotations', () => {
  it('selects evidence-backed population, extinction, evolution, and intervention moments', () => {
    const annotations = buildPopulationHistoryAnnotations(history, [
      { type: 'intervention', tick: 5, detail: 'God Mode changed producer growth' },
      { type: 'mutation', tick: 12, speciesId: 'hunter', creatureId: 'child' },
      { type: 'extinction', tick: 20, speciesId: 'grazer' },
    ], 20);

    expect(annotations.map((annotation) => annotation.tone)).toEqual(expect.arrayContaining([
      'intervention', 'population', 'evolution', 'extinction',
    ]));
    expect(annotations.find((annotation) => annotation.tone === 'intervention')).toMatchObject({
      tick: 5,
      detail: 'God Mode changed producer growth',
    });
  });

  it('is deterministic, bounded, and separates clustered candidates', () => {
    const events = Array.from({ length: 30 }, (_, tick) => ({
      type: 'mutation' as const,
      tick,
      speciesId: 'grazer',
      creatureId: `child-${tick}`,
    }));
    const first = buildPopulationHistoryAnnotations(history, events, 120, 6);

    expect(first.length).toBeLessThanOrEqual(6);
    expect(first.every((item, index) => index === 0 || item.tick - first[index - 1].tick >= 5)).toBe(true);
    expect(buildPopulationHistoryAnnotations(history, events, 120, 6)).toEqual(first);
  });
});
