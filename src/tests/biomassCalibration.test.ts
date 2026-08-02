import { describe, expect, it } from 'vitest';
import {
  BIOMASS_CALIBRATION_HORIZONS,
  BIOMASS_CALIBRATION_SEEDS,
  measureAbandonedHabitatRecovery,
  runBiomassCalibration,
} from '../simulation/biomassCalibration';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('multi-seed biomass ecology calibration', () => {
  it('keeps full-size worlds bounded while exposing local scarcity and turnover', () => {
    const startedAt = performance.now();
    const results = BIOMASS_CALIBRATION_SEEDS.map((seed) => runBiomassCalibration(seed));
    const elapsed = performance.now() - startedAt;

    for (const result of results) {
      const evidence = JSON.stringify(result);
      const finalSample = result.samples[result.samples.length - 1];
      expect(result.samples.map((sample) => sample.tick), evidence).toEqual([
        0, ...BIOMASS_CALIBRATION_HORIZONS,
      ]);
      expect(result.samples[1].strategies, evidence).toEqual([
        'carnivore', 'herbivore', 'omnivore', 'scavenger',
      ]);
      expect(finalSample.population, evidence).toBeGreaterThan(0);
      expect(result.maximumPopulation, evidence).toBeLessThanOrEqual(
        SIMULATION_CONSTANTS.maxGlobalPopulation
      );
      expect(finalSample.births, evidence).toBeGreaterThan(0);
      expect(finalSample.deaths, evidence).toBeGreaterThan(0);
      expect(result.starvationDeaths, evidence).toBeGreaterThan(0);
      const occupiedDepletion = result.samples.slice(1).map(
        (sample) => sample.biomass.depletedOccupiedTileShare
      );
      expect(Math.max(...occupiedDepletion), evidence).toBeGreaterThanOrEqual(0.5);
      expect(Math.min(...result.samples.slice(1).map(
        (sample) => sample.biomass.averageOccupiedTileBiomass
      )), evidence).toBeLessThan(result.samples[0].biomass.averageOccupiedTileBiomass);
      expect(result.maximumPopulation, evidence).toBeGreaterThan(result.samples[0].population);
      expect(finalSample.biomass.totalBiomass, evidence).toBeGreaterThan(
        finalSample.biomass.occupiedTileBiomass
      );
    }
    expect(results.some((result) => result.extinctionEvents > 0 || result.starvationDeaths >= 10))
      .toBe(true);
    // Full-suite workers contend for CPU with the 500-creature and replay probes.
    // The isolated probe is far faster; this bound preserves a meaningful
    // regression signal without failing healthy shared CI runners.
    expect(elapsed).toBeLessThan(120_000);
  }, 150_000);

  it('recovers abandoned habitat gradually rather than instantly', () => {
    const recovery = measureAbandonedHabitatRecovery();
    const finalBiomass = recovery[recovery.length - 1];
    expect(recovery[1]).toBeGreaterThan(0);
    expect(recovery[1]).toBeLessThan(20);
    expect(finalBiomass).toBeGreaterThan(recovery[1]);
    expect(finalBiomass).toBeLessThan(100);
  });

  it('replays the same calibration report exactly', () => {
    expect(runBiomassCalibration(42, { ...SIMULATION_CONSTANTS }, [30, 100]))
      .toEqual(runBiomassCalibration(42, { ...SIMULATION_CONSTANTS }, [30, 100]));
  }, 30_000);
});
