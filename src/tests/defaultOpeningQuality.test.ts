import { describe, expect, it } from 'vitest';
import { measureDefaultOpeningQuality } from '../simulation/defaultOpeningQuality';

describe('default opening quality diagnostic', () => {
  it('reports identical strategy and decline evidence for identical seeds', () => {
    const first = measureDefaultOpeningQuality(12345, 20, 10);
    const replay = measureDefaultOpeningQuality(12345, 20, 10);

    expect(replay).toEqual(first);
    expect(first.populations).toHaveLength(21);
    expect(first.declineWindowEnd - first.declineWindowStart).toBe(10);
    expect(first.maximumWindowDecline).toBeGreaterThanOrEqual(0);
    expect(first.declineWindowBirths).toBeGreaterThanOrEqual(0);
    expect(first.declineWindowDeaths).toBeGreaterThanOrEqual(0);
  });

  it('bounds invalid horizons and decline windows', () => {
    const report = measureDefaultOpeningQuality(42, -5, 0);
    expect(report.throughTick).toBe(0);
    expect(report.populations).toHaveLength(1);
    expect(report.finalPopulation).toBeGreaterThan(0);
  });
});
