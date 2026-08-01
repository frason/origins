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
    expect(Object.values(first.finalStrategyCounts).reduce(
      (total, population) => total + population, 0
    )).toBe(first.finalPopulation);
    expect(first.starterCarrionConsumptionEvents).toBeGreaterThanOrEqual(0);
    expect(first.generatedCarrionConsumptionEvents).toBeGreaterThanOrEqual(0);
    expect(first.generatedCarrionScavengerAccessEvents).toBeGreaterThanOrEqual(0);
  });

  it('bounds invalid horizons and decline windows', () => {
    const report = measureDefaultOpeningQuality(42, -5, 0);
    expect(report.throughTick).toBe(0);
    expect(report.populations).toHaveLength(1);
    expect(report.finalPopulation).toBeGreaterThan(0);
  });

  it('proves scavengers reach recurring simulation-generated carrion across seeds', () => {
    const reports = [12345, 42, 54321, 99999].map(
      (seed) => measureDefaultOpeningQuality(seed, 100, 10)
    );

    for (const report of reports) {
      expect(
        report.generatedCarrionScavengerAccessEvents,
        `seed ${report.seed} scavenger carrion access`
      ).toBeGreaterThan(0);
    }
  });
});
