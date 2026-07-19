import { describe, expect, it } from 'vitest';
import type { EventSnapshot } from '../state/store';
import {
  formatPrematureDeathRate,
  getPrematureDeathMetrics,
} from '../ui/prematureDeathMetrics';

describe('premature death metrics', () => {
  it('reports a safe, explanatory empty state', () => {
    const metrics = getPrematureDeathMetrics([]);
    expect(metrics).toEqual({
      ecosystem: { prematureDeaths: 0, recordedDeaths: 0, rate: null },
      species: [],
    });
    expect(formatPrematureDeathRate(metrics.ecosystem)).toBe('-');
  });

  it('calculates ecosystem and mixed-species rates from durable death evidence', () => {
    const events: EventSnapshot[] = [
      { type: 'death', tick: 1, speciesId: 'lost', prematureDeath: true, offspringCountAtDeath: 0 },
      { type: 'death', tick: 2, speciesId: 'living', prematureDeath: false, offspringCountAtDeath: 2 },
      { type: 'death', tick: 3, speciesId: 'living', prematureDeath: true, offspringCountAtDeath: 0 },
      { type: 'death', tick: 0, speciesId: 'legacy' },
    ];

    const metrics = getPrematureDeathMetrics(events);
    expect(metrics.ecosystem).toEqual({ prematureDeaths: 2, recordedDeaths: 3, rate: 2 / 3 });
    expect(metrics.species).toEqual([
      { speciesId: 'living', prematureDeaths: 1, recordedDeaths: 2, rate: 0.5 },
      { speciesId: 'lost', prematureDeaths: 1, recordedDeaths: 1, rate: 1 },
    ]);
    expect(formatPrematureDeathRate(metrics.ecosystem)).toBe('67% (2/3 deaths)');
  });

  it('remains replay-identical after extinct creatures and corpses are absent', () => {
    const events: EventSnapshot[] = [
      { type: 'death', tick: 4, creatureId: 'gone', speciesId: 'extinct', prematureDeath: true },
      { type: 'extinction', tick: 8, speciesId: 'extinct' },
    ];
    expect(getPrematureDeathMetrics(structuredClone(events))).toEqual(
      getPrematureDeathMetrics(structuredClone(events))
    );
    expect(getPrematureDeathMetrics(events).species[0].speciesId).toBe('extinct');
  });
});
