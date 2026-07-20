import {
  buildPopulationCalibrationReport,
  POPULATION_CALIBRATION_SEEDS,
  serializePopulationCalibrationReport,
} from '../src/simulation/populationCalibration';

const measureRuntime = process.argv.includes('--measure-runtime');
const candidates = [
  { id: 'current-default', constants: {} },
  { id: 'without-legacy-monoculture-mortality', constants: { monocultureMortalityPenalty: 0 } },
];
const report = buildPopulationCalibrationReport(candidates, {
  seeds: POPULATION_CALIBRATION_SEEDS,
  ticks: 500,
  sampleInterval: 25,
  measureRuntime,
}, {
  minimumSurvivalShare: 0.5,
  maximumPopulation: 500,
  minimumEvolutionaryActivity: 0.001,
  maximumEvolutionaryActivity: 1,
  minimumTrajectoryVariation: 0.001,
  minimumDistinctTrajectoryShare: 0.5,
  maximumMeanTickTimeMs: 100,
});

process.stdout.write(serializePopulationCalibrationReport(report));
