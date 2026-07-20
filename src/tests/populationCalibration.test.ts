import { describe, expect, it } from 'vitest';
import {
  buildPopulationCalibrationReport,
  evaluatePopulationCalibrationGates,
  generatePopulationCalibrationGrid,
  generateSeededPopulationCandidates,
  scorePopulationCalibration,
  serializePopulationCalibrationReport,
  type PopulationCalibrationOutcome,
} from '../simulation/populationCalibration';

function outcome(overrides: Partial<PopulationCalibrationOutcome> = {}): PopulationCalibrationOutcome {
  return {
    candidateId: 'candidate', seed: 42, ticksRequested: 10, ticksProcessed: 10,
    populationSeries: [10, 12, 9], speciesSeries: [4, 4, 3], lineageSeries: [4, 5, 5],
    maximumPopulation: 12, extinctionTick: null, mutationCount: 2, speciationCount: 0,
    overcrowdingDeathCount: 0,
    meanDepletedOccupiedTileShare: 0.25, meanTickTimeMs: null,
    ...overrides,
  };
}

describe('population calibration', () => {
  it('generates a stable Cartesian grid', () => {
    expect(generatePopulationCalibrationGrid({
      baseMetabolism: [1, 2],
      feedingEfficiency: [0.8, 0.9],
    })).toEqual([
      { id: 'baseMetabolism=1,feedingEfficiency=0.8', constants: { baseMetabolism: 1, feedingEfficiency: 0.8 } },
      { id: 'baseMetabolism=1,feedingEfficiency=0.9', constants: { baseMetabolism: 1, feedingEfficiency: 0.9 } },
      { id: 'baseMetabolism=2,feedingEfficiency=0.8', constants: { baseMetabolism: 2, feedingEfficiency: 0.8 } },
      { id: 'baseMetabolism=2,feedingEfficiency=0.9', constants: { baseMetabolism: 2, feedingEfficiency: 0.9 } },
    ]);
  });

  it('generates bounded random candidates reproducibly', () => {
    const first = generateSeededPopulationCandidates(7, 3, {
      baseMetabolism: [0.5, 2], feedingEfficiency: [0.5, 1],
    });
    expect(generateSeededPopulationCandidates(7, 3, {
      baseMetabolism: [0.5, 2], feedingEfficiency: [0.5, 1],
    })).toEqual(first);
    expect(first).toHaveLength(3);
    for (const candidate of first) {
      expect(candidate.constants.baseMetabolism).toBeGreaterThanOrEqual(0.5);
      expect(candidate.constants.baseMetabolism).toBeLessThanOrEqual(2);
      expect(candidate.constants.feedingEfficiency).toBeGreaterThanOrEqual(0.5);
      expect(candidate.constants.feedingEfficiency).toBeLessThanOrEqual(1);
    }
  });

  it('keeps objectives separate and rejects stagnation and hard ceilings', () => {
    const objectives = scorePopulationCalibration([
      outcome({ populationSeries: [10, 10, 10], mutationCount: 0 }),
    ], 10);
    expect(objectives.trajectoryVariation).toBe(0);
    expect(objectives.evolutionaryActivity).toBe(0);
    expect(evaluatePopulationCalibrationGates(
      [outcome({ maximumPopulation: 11, mutationCount: 0 })],
      objectives,
      {
        minimumSurvivalShare: 1, maximumPopulation: 10,
        minimumEvolutionaryActivity: 0.01, maximumEvolutionaryActivity: 1,
      }
    )).toEqual(['population-ceiling', 'evolutionary-stagnation']);
  });

  it('rejects stagnant and identical trajectories across seeds', () => {
    const outcomes = [
      outcome({ seed: 42, populationSeries: [10, 10, 10] }),
      outcome({ seed: 99, populationSeries: [10, 10, 10] }),
    ];
    const objectives = scorePopulationCalibration(outcomes, 500);
    expect(evaluatePopulationCalibrationGates(outcomes, objectives, {
      minimumSurvivalShare: 1,
      maximumPopulation: 500,
      minimumEvolutionaryActivity: 0,
      maximumEvolutionaryActivity: 1,
      minimumTrajectoryVariation: 0.001,
      minimumDistinctTrajectoryShare: 1,
    })).toEqual(['trajectory-stagnation', 'cross-seed-uniformity']);
  });

  it('reports observable hard-cap interventions', () => {
    const objectives = scorePopulationCalibration([
      outcome({ maximumPopulation: 10, overcrowdingDeathCount: 3 }),
    ], 10);
    expect(evaluatePopulationCalibrationGates([
      outcome({ maximumPopulation: 10, overcrowdingDeathCount: 3 }),
    ], objectives, {
      minimumSurvivalShare: 1,
      maximumPopulation: 10,
      minimumEvolutionaryActivity: 0,
      maximumEvolutionaryActivity: 1,
    })).not.toContain('population-ceiling');
  });

  it('produces a byte-identical report for identical inputs', () => {
    const candidates = [{
      id: 'tiny',
      constants: { worldWidth: 12, worldHeight: 12, maxGlobalPopulation: 50 },
    }];
    const suite = { seeds: [42], ticks: 8, sampleInterval: 4 };
    const first = serializePopulationCalibrationReport(
      buildPopulationCalibrationReport(candidates, suite)
    );
    const replay = serializePopulationCalibrationReport(
      buildPopulationCalibrationReport(candidates, suite)
    );
    expect(replay).toBe(first);
    expect(JSON.parse(first).outcomes[0]).toMatchObject({
      seed: 42, ticksRequested: 8, meanTickTimeMs: null,
    });
  });

  it('reports a deterministic Pareto frontier without one opaque fitness score', () => {
    const candidates = [
      { id: 'lower-metabolism', constants: { worldWidth: 12, worldHeight: 12, baseMetabolism: 1 } },
      { id: 'defaults', constants: { worldWidth: 12, worldHeight: 12 } },
    ];
    const report = buildPopulationCalibrationReport(candidates, {
      seeds: [42], ticks: 10, sampleInterval: 5,
    });
    expect(report.assessments).toHaveLength(2);
    expect(report.assessments.every((assessment) =>
      !('fitness' in assessment.objectives))).toBe(true);
    expect(report.paretoCandidateIds.length).toBeGreaterThan(0);
    expect(report.assessments.map((assessment) => assessment.rank).sort()).toEqual([1, 2]);
  });

  it('reports opt-in wall-clock tick cost without making it a replay requirement', () => {
    const report = buildPopulationCalibrationReport([
      { id: 'profile', constants: { worldWidth: 8, worldHeight: 8 } },
    ], {
      seeds: [42], ticks: 2, sampleInterval: 1, measureRuntime: true,
    });
    expect(report.outcomes[0].meanTickTimeMs).toEqual(expect.any(Number));
    expect(report.outcomes[0].meanTickTimeMs).toBeGreaterThanOrEqual(0);
  });
});
