import {
  buildPopulationCalibrationReport,
  generatePopulationCalibrationGrid,
  serializePopulationCalibrationReport,
} from '../src/simulation/populationCalibration';

const measureRuntime = process.argv.includes('--measure-runtime');
const candidates = generatePopulationCalibrationGrid({
  baseMetabolism: [1, 2],
  reproductionCooldownTicks: [6],
});
const report = buildPopulationCalibrationReport(candidates, {
  seeds: [42, 12345, 54321, 99999],
  ticks: 100,
  sampleInterval: 10,
  measureRuntime,
});

process.stdout.write(serializePopulationCalibrationReport(report));
