import { describe, expect, it } from 'vitest';
import type { EventSnapshot } from '../state/store';
import {
  buildReplacementTrend,
  formatReplacementRatio,
  getReplacementMetrics,
} from '../ui/replacementMetrics';

describe('live replacement metrics', () => {
  it('uses a dash until a death makes replacement calculable', () => {
    const metric = getReplacementMetrics([
      { type: 'birth', tick: 4, speciesId: 'grazer' },
    ], 10).ecosystem;

    expect(metric).toEqual({ births: 1, deaths: 0, ratio: null });
    expect(formatReplacementRatio(metric)).toBe('—');
  });

  it('calculates ecosystem and per-species replacement from the bounded window', () => {
    const events: EventSnapshot[] = [
      { type: 'birth', tick: 1, speciesId: 'old' },
      { type: 'death', tick: 1, speciesId: 'old' },
      { type: 'birth', tick: 55, speciesId: 'grazer' },
      { type: 'birth', tick: 56, speciesId: 'grazer' },
      { type: 'death', tick: 57, speciesId: 'grazer' },
      { type: 'death', tick: 58, speciesId: 'hunter' },
    ];

    const metrics = getReplacementMetrics(events, 60, 10);
    expect(metrics.ecosystem).toEqual({ births: 2, deaths: 2, ratio: 1 });
    expect(metrics.species).toEqual([
      { speciesId: 'grazer', births: 2, deaths: 1, ratio: 2 },
      { speciesId: 'hunter', births: 0, deaths: 1, ratio: 0 },
    ]);
    expect(formatReplacementRatio(metrics.ecosystem, true))
      .toBe('1.00× (2 births / 2 deaths)');
  });

  it('builds deterministic bounded chart segments with a 1.0 reference line', () => {
    const events: EventSnapshot[] = [
      { type: 'death', tick: 10, speciesId: 'grazer' },
      { type: 'birth', tick: 20, speciesId: 'grazer' },
      { type: 'birth', tick: 30, speciesId: 'grazer' },
      { type: 'death', tick: 80, speciesId: 'grazer' },
    ];

    const first = buildReplacementTrend(events, 100, 50, 100, 10);
    const replay = buildReplacementTrend(structuredClone(events), 100, 50, 100, 10);

    expect(replay).toEqual(first);
    expect(first.referenceY).toBe(50);
    expect(first.points[0].tick).toBe(0);
    expect(first.points[first.points.length - 1])
      .toMatchObject({ tick: 100, births: 0, deaths: 1, ratio: 0 });
    expect(first.segments.length).toBeGreaterThan(0);
    expect(first.description).toContain('rolling 50-tick window');
  });
});
